# SPDX-License-Identifier: AGPL-3.0-or-later

from sqlalchemy import select

from app.db.models import BackgroundJob, Course, Resource, ResourceVersion, utc_now


class JobRepository:
    def __init__(self, factory):
        self.factory = factory

    def list(self):
        with self.factory() as session:
            return session.scalars(select(BackgroundJob).order_by(BackgroundJob.created_at.desc()).limit(100)).all()

    def get(self, identifier):
        with self.factory() as session:
            return session.get(BackgroundJob, identifier)

    def insert(self, row, check):
        with self.factory() as session:
            session.add(row)
            check()
            session.commit()

    def update(self, identifier, check, **values):
        with self.factory() as session:
            row = session.get(BackgroundJob, identifier)
            if row is None:
                raise LookupError("Auftrag fehlt")
            for key, value in values.items():
                setattr(row, key, value)
            row.updated_at = utc_now()
            check()
            session.commit()

    def interrupt(self, check):
        with self.factory() as session:
            for row in session.scalars(select(BackgroundJob).where(BackgroundJob.state.in_(["queued", "running", "cancelling"]))):
                row.state, row.error_code = "interrupted", "PROCESS_RESTARTED"
            check()
            session.commit()

    def targets(self, kind, query):
        with self.factory() as session:
            if kind == "ai":
                statement = select(Course.id, Course.name).where(Course.is_active.is_(True))
                if query:
                    statement = statement.where(Course.name.contains(query, autoescape=True))
                return [{"id": row.id, "label": row.name} for row in session.execute(statement.order_by(Course.name).limit(100))]
            if kind == "index":
                statement = select(Resource.id, Resource.name).where(Resource.group_category != "other_group", Resource.removed_upstream.is_(False))
                if query:
                    statement = statement.where(Resource.name.contains(query, autoescape=True))
                return [{"id": row.id, "label": row.name} for row in session.execute(statement.order_by(Resource.name).limit(100))]
            if kind == "ocr":
                statement = select(ResourceVersion.id, Resource.name, ResourceVersion.version).join(Resource, Resource.id == ResourceVersion.resource_id).where(
                    Resource.group_category != "other_group", ResourceVersion.mime_type == "application/pdf")
                if query:
                    statement = statement.where(Resource.name.contains(query, autoescape=True))
                return [{"id": row.id, "label": f"{row.name} · v{row.version}"} for row in session.execute(statement.order_by(Resource.name, ResourceVersion.version.desc()).limit(100))]
            return []
