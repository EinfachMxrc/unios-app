# SPDX-License-Identifier: AGPL-3.0-or-later
"""A late failure from old credentials cannot invalidate a newer sign-in."""

from app.portals.campus_job_service import CampusImportJob


def test_old_worker_login_failure_after_new_capture_is_obsolete():
    job = CampusImportJob()
    job.begin()
    job.login_saved()
    assert job.snapshot().state == "running"
    job.fail("Expired old session", login_required=True)
    assert job.snapshot().state == "idle"
    job.begin()
    job.fail("Expired new session", login_required=True)
    assert job.snapshot().state == "error" and job.snapshot().login_required


def test_import_failure_and_completed_report_survive_new_sign_in():
    job = CampusImportJob()
    job.begin()
    job.login_saved()
    job.fail("Storage failure")
    assert job.snapshot().state == "error"
    job.complete({"warnings": ["A restricted page"]})
    job.login_saved()
    assert job.snapshot().state == "done"
    assert job.snapshot().report == {"warnings": ["A restricted page"]}
