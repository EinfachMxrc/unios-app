# SPDX-License-Identifier: AGPL-3.0-or-later

import logging
import random
from collections.abc import Callable
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from app.ai.outbox import process_outbox
from app.config import Settings
from app.db.models import ConnectorHealth
from app.digest.service import send_weekly_digest
from app.host.actions import ActionJournal
from app.host.lease import HostCoordinator
from app.notify.links import dashboard_link_or_notice
from app.portals.mycampus import CampusSyncBusy, campus_ready, run_campus_sync
from app.portals.public_periods import configured_urls, run_public_periods
from app.rules.service import evaluate_enabled
from app.sync.continuity import sync_continuity
from app.timeutil import as_utc

log = logging.getLogger(__name__)


class SyncScheduler:
    def __init__(self, engine, settings: Settings, coordinator: HostCoordinator,
                 mail_service=None, timetable_service=None, forwarding_service=None):
        self.engine = engine
        self.settings = settings
        self.coordinator = coordinator
        self.scheduler = BackgroundScheduler(timezone=settings.timezone)
        self._started_once = False
        # Jobs owned by other services; re-registered on every start, because a restart
        # after stop() builds a fresh BackgroundScheduler that would otherwise lose them.
        self._recurring: dict[str, tuple[Callable[[], object], int]] = {}
        self.mail_service = mail_service
        self.timetable_service = timetable_service
        self.forwarding_service = forwarding_service

    def add_recurring(self, job: Callable[[], object], *, job_id: str, minutes: int) -> None:
        self._recurring[job_id] = (job, minutes)
        if self.scheduler.running:
            self._register_recurring(job_id)

    def _register_recurring(self, job_id: str) -> None:
        job, minutes = self._recurring[job_id]
        self.scheduler.add_job(job, IntervalTrigger(minutes=minutes, timezone=self.settings.timezone),
                               id=job_id, replace_existing=True, max_instances=1, coalesce=True)

    def start(self) -> None:
        if self.scheduler.running:
            return
        if self._started_once:
            self.scheduler = BackgroundScheduler(timezone=self.settings.timezone)
        self._started_once = True
        self.scheduler.start()
        for job_id in self._recurring:
            self._register_recurring(job_id)
        self.scheduler.add_job(self._run_forwarded_mail,
                               IntervalTrigger(minutes=5, timezone=self.settings.timezone),
                               next_run_time=datetime.now(self.settings.timezone) + timedelta(seconds=20),
                               id="forwarded_mail", replace_existing=True, max_instances=1,
                               misfire_grace_time=None, coalesce=True)
        self.scheduler.add_job(self._run_personal_sources,
                               IntervalTrigger(minutes=self.settings.sync_interval_minutes, timezone=self.settings.timezone),
                               next_run_time=datetime.now(self.settings.timezone) + timedelta(seconds=15),
                               id="personal_sources", replace_existing=True, max_instances=1,
                               misfire_grace_time=None, coalesce=True)
        # Catch-up: beim Start sofort, außer während konfigurierter Ruhezeiten.
        if getattr(self.engine, "connectors", True) or campus_ready(self.settings) or configured_urls(self.settings):
            self._schedule_at(self._outside_quiet_hours(datetime.now(self.settings.timezone)))
        self.scheduler.add_job(self._warn_stale_sync, IntervalTrigger(hours=1, timezone=self.settings.timezone),
                               next_run_time=datetime.now(self.settings.timezone) + timedelta(minutes=15),
                               id="stale_sync", replace_existing=True, max_instances=1,
                               misfire_grace_time=None, coalesce=True)
        self.scheduler.add_job(self._warn_deadlines, IntervalTrigger(hours=1, timezone=self.settings.timezone),
                               next_run_time=datetime.now(self.settings.timezone) + timedelta(minutes=5),
                               id="deadline_warnings", replace_existing=True, max_instances=1,
                               misfire_grace_time=None, coalesce=True)
        self.scheduler.add_job(self._send_digest,
                               CronTrigger(day_of_week="sun", hour=19, minute=0, timezone=self.settings.timezone),
                               id="weekly_digest", replace_existing=True, max_instances=1,
                               misfire_grace_time=3600, coalesce=True)
        self.scheduler.add_job(self._process_ai_outbox,
                               IntervalTrigger(minutes=5, timezone=self.settings.timezone),
                               next_run_time=datetime.now(self.settings.timezone) + timedelta(seconds=30),
                               id="ai_outbox", replace_existing=True, max_instances=1,
                               misfire_grace_time=None, coalesce=True)
        self.scheduler.add_job(self._run_study_rules,
                               IntervalTrigger(minutes=10, timezone=self.settings.timezone),
                               next_run_time=datetime.now(self.settings.timezone) + timedelta(minutes=2),
                               id="study_rules", replace_existing=True, max_instances=1,
                               misfire_grace_time=None, coalesce=True)
        # The built-in backup checks hourly and runs once the newest copy is a day old,
        # so a laptop that sleeps at night still gets its daily backup.
        self.scheduler.add_job(self._run_builtin_backup,
                               IntervalTrigger(hours=1, timezone=self.settings.timezone),
                               next_run_time=datetime.now(self.settings.timezone) + timedelta(minutes=5),
                               id="builtin_backup", replace_existing=True, max_instances=1,
                               misfire_grace_time=None, coalesce=True)
        if self.settings.restic_repository and self.settings.restic_password:
            from app.health.backup import main as backup_main
            self.scheduler.add_job(backup_main, CronTrigger(hour=3, minute=30, timezone=self.settings.timezone),
                                   kwargs={"coordinator": self.coordinator},
                                   id="daily_backup", replace_existing=True, max_instances=1)

    def stop(self) -> None:
        self.scheduler.shutdown(wait=True)

    def refresh_runtime_schedule(self) -> None:
        if not self.scheduler.running or self.scheduler.get_job("next_sync") is None:
            return
        now = datetime.now(self.settings.timezone)
        target = now + timedelta(minutes=self.settings.sync_interval_minutes)
        self._schedule_at(self._outside_quiet_hours(target))

    def _outside_quiet_hours(self, moment: datetime) -> datetime:
        start = self.settings.quiet_hours_start
        end = self.settings.quiet_hours_end
        if start is None or end is None or start == end:
            return moment
        hour = moment.hour
        inside = start <= hour < end if start < end else hour >= start or hour < end
        if not inside:
            return moment
        target = moment.replace(hour=end, minute=0, second=0, microsecond=0)
        if target <= moment:
            target += timedelta(days=1)
        return target

    def _schedule_at(self, moment: datetime) -> None:
        self.scheduler.add_job(self._run_and_reschedule, DateTrigger(run_date=moment), id="next_sync",
                               replace_existing=True, max_instances=1, misfire_grace_time=None)

    def _warn_stale_sync(self) -> None:
        self.coordinator.assert_writer()
        with self.engine.factory() as session:
            continuity = sync_continuity(session, self.settings.stale_sync_hours)
            if continuity.state != "overdue":
                return
            with ActionJournal(self.settings).tracked_operation(self.coordinator, "stale-sync-warning"):
                today = datetime.now(self.settings.timezone).date()
                self.engine.notifier.enqueue(session, f"stale-sync:{today}", "Uni-Sync ist überfällig",
                                             f"Die Uni-Verbindung sollte geprüft werden. {dashboard_link_or_notice(self.settings, '/system')}")
                session.commit()
                self.engine.notifier.deliver_pending(self.engine.factory)

    def _warn_deadlines(self) -> None:
        self.coordinator.assert_writer()
        with ActionJournal(self.settings).tracked_operation(self.coordinator, "deadline-warnings"):
            with self.engine.factory() as session:
                self.engine.enqueue_deadline_notifications(session)
                session.commit()
            self.engine.notifier.deliver_pending(self.engine.factory)

    def _send_digest(self) -> None:
        with ActionJournal(self.settings).tracked_operation(self.coordinator, "weekly-digest"):
            send_weekly_digest(self.engine.factory, self.settings, self.coordinator, self.engine.notifier)

    def _process_ai_outbox(self) -> None:
        try:
            process_outbox(self.settings, self.engine.factory, self.coordinator)
        except Exception as exc:  # noqa: BLE001 - never log private AI output
            log.warning("KI-Outbox konnte nicht verarbeitet werden: %s", type(exc).__name__)

    def _run_builtin_backup(self) -> None:
        from app.backups.api import _app_version
        from app.backups.run import due_for_daily_backup, run_backup
        from app.backups.store import BackupError

        if not self.coordinator.is_writer or not due_for_daily_backup(self.settings):
            return
        try:
            run_backup(self.settings, self.coordinator, _app_version())
        except BackupError as exc:
            log.warning("Tägliche Sicherung fehlgeschlagen: %s", exc)

    def _run_study_rules(self) -> None:
        try:
            evaluate_enabled(self.engine.factory, self.settings, self.coordinator, self.engine.notifier)
        except Exception as exc:  # noqa: BLE001 - rule data must not enter logs
            log.warning("Studienregeln konnten nicht geprüft werden: %s", type(exc).__name__)

    def _run_campus(self) -> None:
        if not campus_ready(self.settings):
            return
        self.coordinator.assert_writer()
        with ActionJournal(self.settings).tracked_operation(self.coordinator, "mycampus-sync"):
            try:
                report = run_campus_sync(self.settings, self.engine.factory, self.coordinator)
            except CampusSyncBusy:
                return
            except Exception as exc:  # noqa: BLE001 - only a neutral type reaches the log or push
                log.warning("mycampus-Abgleich fehlgeschlagen: %s", type(exc).__name__)
                with self.engine.factory() as session:
                    self.engine.notifier.enqueue(
                        session, f"connector:mycampus:{datetime.now(self.settings.timezone):%Y-%m-%d}",
                        "Uni-Verbindung prüfen", "mycampus braucht deine Aufmerksamkeit.",
                    )
                    session.commit()
                self.engine.notifier.deliver_pending(self.engine.factory)
                return
            if report.skipped:
                log.warning("mycampus-Abgleich: %s Zeilen blieben unklar", report.skipped)

    def _run_forwarded_mail(self) -> None:
        if not self.coordinator.is_writer or self.forwarding_service is None:
            return
        try:
            if self.forwarding_service.status()["connected"]:
                with ActionJournal(self.settings).tracked_operation(self.coordinator, "mail-sync"):
                    self.forwarding_service.sync()
        except Exception as exc:  # noqa: BLE001 - no mail content or addresses in logs
            log.warning("Weiterleitungsimport unterbrochen: %s", type(exc).__name__)

    def _run_personal_sources(self) -> None:
        now = datetime.now(self.settings.timezone)
        if not self.coordinator.is_writer or self._outside_quiet_hours(now) > now:
            return
        for operation, service, flag in (("mail-sync", self.mail_service, "connected"),
                                        ("timetable-sync", self.timetable_service, "subscribed")):
            if service is None:
                continue
            try:
                if service.status()[flag]:
                    with ActionJournal(self.settings).tracked_operation(
                            self.coordinator, "mail-sync" if flag == "connected" else "timetable-sync"):
                        service.sync()
            except Exception as exc:  # noqa: BLE001 - no message contents, URLs or tokens in logs
                log.warning("Persönlicher Quellenabruf (%s) unterbrochen: %s", operation, type(exc).__name__)

    def _run_public_periods(self) -> None:
        if not configured_urls(self.settings):
            return
        self.coordinator.assert_writer()
        today = datetime.now(self.settings.timezone).date()
        with self.engine.factory() as session:
            health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "public-semester"))
            if health and health.last_attempt_at:
                last = health.last_attempt_at
                last = as_utc(last)
                if last.astimezone(self.settings.timezone).date() == today:
                    return
        with ActionJournal(self.settings).tracked_operation(self.coordinator, "public-periods-sync"):
            try:
                run_public_periods(self.settings, self.engine.factory, self.coordinator)
            except Exception as exc:  # noqa: BLE001 - no public URL or page content enters the log
                log.warning("Öffentliche Semesterzeiten konnten nicht gelesen werden: %s", type(exc).__name__)
                with self.engine.factory() as session:
                    self.engine.notifier.enqueue(session, f"connector:public-semester:{today}",
                                                 "Uni-Verbindung prüfen", "Öffentliche Semesterzeiten prüfen.")
                    session.commit()
                self.engine.notifier.deliver_pending(self.engine.factory)

    def _run_and_reschedule(self) -> None:
        now = datetime.now(self.settings.timezone)
        allowed = self._outside_quiet_hours(now)
        if allowed > now:
            self._schedule_at(allowed)
            return
        try:
            self.engine.run()
        except Exception:
            log.exception("Scheduler-Sync fehlgeschlagen")
        try:
            self._run_campus()
        except Exception as exc:  # noqa: BLE001 - portal details must not enter logs
            log.warning("mycampus-Hintergrundlauf unterbrochen: %s", type(exc).__name__)
        try:
            self._run_public_periods()
        except Exception as exc:  # noqa: BLE001 - no public URL or page content enters the log
            log.warning("Öffentlicher Semesterabgleich unterbrochen: %s", type(exc).__name__)
        finally:
            minutes = self.settings.sync_interval_minutes + random.uniform(-self.settings.sync_jitter_minutes, self.settings.sync_jitter_minutes)
            next_run = datetime.now(self.settings.timezone) + timedelta(minutes=max(1, minutes))
            self._schedule_at(self._outside_quiet_hours(next_run))
