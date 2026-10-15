# SPDX-License-Identifier: AGPL-3.0-or-later

import threading
import time

from fastapi import HTTPException

from app.db.models import BackgroundJob
from app.jobs.repository import JobRepository
from app.jobs.schema import JobRequest
from app.jobs.service import BackgroundJobs


def await_state(jobs, identifier, state):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        row = jobs.repository.get(identifier)
        if row.state == state:
            return row
        time.sleep(.02)
    raise AssertionError(jobs.list())


def test_durable_jobs_cancel_between_steps_retry_and_restart(factory, coordinator):
    repository = JobRepository(factory)
    started, release = threading.Event(), threading.Event()
    commits = []

    def work(ctx):
        started.set()
        assert release.wait(3)
        ctx.check()
        commits.append(ctx.row.id)
        ctx.progress(1, 1)

    jobs = BackgroundJobs(repository, coordinator, {"backup": work})
    try:
        first = jobs.submit(JobRequest(kind="backup", confirmed=True))
        assert started.wait(3)
        assert jobs.submit(JobRequest(kind="backup", confirmed=True))["id"] == first["id"]
        jobs.change(first["id"], "cancel")
        release.set()
        await_state(jobs, first["id"], "cancelled")
        assert commits == []
        second = jobs.change(first["id"], "retry")
        row = await_state(jobs, second["id"], "completed")
        assert row.retry_of == first["id"] and row.completed == row.total == 1
        assert commits == [second["id"]]
    finally:
        release.set()
        jobs.close()
    with factory() as session:
        session.add(BackgroundJob(id="crashed", kind="backup", state="running", generation=0))
        session.commit()
    resumed = BackgroundJobs(repository, coordinator, {"backup": work})
    try:
        resumed.start()
        assert repository.get("crashed").state == "interrupted"
        assert len(commits) == 1
    finally:
        resumed.close()


def test_lost_generation_never_runs_handler(factory, coordinator, monkeypatch):
    jobs = BackgroundJobs(JobRepository(factory), coordinator, {"backup": lambda ctx: ctx.check()})
    jobs.start()
    original = coordinator.assert_writer
    calls = 0

    def fail():
        nonlocal calls
        calls += 1
        if calls > 2:
            raise HTTPException(423, "lost host")
        original()

    try:
        monkeypatch.setattr(coordinator, "assert_writer", fail)
        jobs.submit(JobRequest(kind="backup", confirmed=True))
        time.sleep(.2)
        assert jobs.list()[0]["state"] != "completed"
    finally:
        jobs.close()
