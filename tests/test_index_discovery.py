# SPDX-License-Identifier: AGPL-3.0-or-later
"""Discovery must not queue the same unindexable version over and over."""

from sqlalchemy import select

from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.extract.jobs import IndexJob, IndexJobs
from app.extract.limits import MAX_OTHER_BYTES, MAX_PDF_BYTES, input_limit


def seed_unindexed(factory, settings, count=1, *, suffix=".txt", mime="text/plain", content=b"Inhalt"):
    folder = settings.data_dir / "uni"
    folder.mkdir(parents=True, exist_ok=True)
    ids = []
    with factory() as session:
        course = Course(source="fixture", source_id="discovery", name="Fictional course")
        session.add(course)
        session.flush()
        for number in range(count):
            path = folder / f"file-{number}{suffix}"
            path.write_bytes(content)
            resource = Resource(source="fixture", source_key=f"r{number}", name=f"R{number}",
                                course_id=course.id, kind="file", url="")
            session.add(resource)
            session.flush()
            version = ResourceVersion(resource_id=resource.id, version=1, sha256=str(number).zfill(64),
                                      relative_path=f"uni/file-{number}{suffix}", size=len(content), mime_type=mime)
            session.add(version)
            session.flush()
            ids.append((resource.id, version.id))
        session.commit()
    return ids


def test_limits_agree_between_queue_and_parser():
    assert input_limit(".pdf", None) == MAX_PDF_BYTES
    assert input_limit(".bin", "application/pdf") == MAX_PDF_BYTES
    assert input_limit(".docx", None) == MAX_OTHER_BYTES
    assert MAX_OTHER_BYTES == 64 * 1024 * 1024


def test_failed_jobs_survive_job_table_rotation_without_requeue(settings, factory, coordinator):
    ids = seed_unindexed(factory, settings, count=3)
    jobs = IndexJobs(factory, settings, coordinator)
    jobs.start = lambda **_: None  # type: ignore[method-assign]  # keep the queue observable
    for _, version_id in ids:
        jobs.jobs[version_id] = IndexJob(version_id, state="failed", error_code="INDEX_FAILED")
    # Fill the table so the next submit() rotates finished entries out.
    for filler in range(1000, 1000 + 256):
        jobs.jobs[filler] = IndexJob(filler, state="completed")
    jobs.submit(ids[0][0])  # explicit retry re-queues and removes it from the settled set
    assert {version_id for _, version_id in ids[1:]} <= jobs.settled
    jobs._discover()
    with jobs.lock:
        queued = [jobs.queue.get_nowait() for _ in range(jobs.queue.qsize())]
    assert queued == [ids[0][1]]


def test_empty_documents_are_indexed_once(settings, factory, coordinator, monkeypatch):
    ((resource_id, version_id),) = seed_unindexed(factory, settings)
    monkeypatch.setattr("app.extract.jobs.parse_path", lambda *args, **kwargs: [])
    jobs = IndexJobs(factory, settings, coordinator)
    job = IndexJob(version_id, generation=coordinator.current().generation)
    jobs.jobs[version_id] = job
    jobs._index(job)
    assert job.state == "completed"
    with factory() as session:
        assert session.scalars(select(ResourceText).where(ResourceText.version_id == version_id)).all() == []
    del jobs.jobs[version_id]  # as if rotated out of the table
    jobs._discover()
    assert jobs.queue.qsize() == 0
    assert version_id in jobs.settled


def test_oversized_files_are_not_rechecked_forever(settings, factory, coordinator, monkeypatch):
    ((resource_id, version_id),) = seed_unindexed(factory, settings, suffix=".docx",
                                                  mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    monkeypatch.setattr("app.extract.jobs.input_limit", lambda suffix, mime: 1)
    jobs = IndexJobs(factory, settings, coordinator)
    calls = []
    original = jobs.submit
    monkeypatch.setattr(jobs, "submit", lambda value: (calls.append(value), original(value))[1])
    jobs._discover()
    jobs._discover()
    assert calls == [resource_id]
    assert version_id in jobs.settled
