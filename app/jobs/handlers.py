# SPDX-License-Identifier: AGPL-3.0-or-later

import time

from app.ai.api import AdapterProposeRequest
from app.ai.proposals_service import propose
from app.host.snapshots import create_snapshot


def handlers(factory, settings, coordinator, index_jobs, ocr, sync, corpus=None, coding=None):
    def index(ctx):
        index_jobs.submit(ctx.row.target_id)
        try:
            while True:
                ctx.check()
                state = index_jobs.status(ctx.row.target_id)
                ctx.progress(state["completed"], state["total"])
                if state["state"] == "completed":
                    return
                if state["state"] in {"failed", "cancelled"}:
                    raise ValueError("INDEX_FAILED")
                time.sleep(.1)
        except Exception:
            index_jobs.cancel(ctx.row.target_id)
            raise

    def recognize(ctx):
        initial = ocr.status(ctx.row.target_id).pending_pages
        while True:
            ctx.check()
            state = ocr.process(ctx.row.target_id, before_page=ctx.check)
            ctx.progress(initial - state.pending_pages, initial)
            if not state.pending_pages:
                return

    def synchronize(ctx):
        result = sync.run(before_step=ctx.check)
        if result is None or result.status not in {"success", "warning"}:
            raise ValueError("SYNC_FAILED_OR_BUSY")

    def backup(ctx):
        ctx.check()
        create_snapshot(coordinator)
        ctx.progress(1, 1)

    def ai(ctx):
        ctx.check()
        propose(factory, settings, AdapterProposeRequest(course_id=ctx.row.target_id, mode=ctx.row.mode), ctx.check)

    def rebuild_corpus(ctx):
        if corpus is None:
            raise ValueError('CORPUS_UNAVAILABLE')
        corpus.repository.enqueue_all(ctx.check)
        corpus.drain(ctx.check, ctx.progress)
        if corpus.repository.status()['failed']:
            raise ValueError('CORPUS_SOURCE_FAILURES')

    def run_coding(ctx):
        if coding is None:
            raise ValueError('CODING_UNAVAILABLE')
        coding.execute(ctx)

    return {"index": index, "ocr": recognize, "sync": synchronize, "backup": backup,
            "ai": ai, "corpus": rebuild_corpus, "coding": run_coding}
