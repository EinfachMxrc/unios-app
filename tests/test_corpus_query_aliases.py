# SPDX-License-Identifier: AGPL-3.0-or-later
"""General lexical expansion, without query-specific answers or weaker ACLs."""

import sqlite3

import pytest

from app.corpus.contracts import Search
from app.corpus.query import expression, normalize
from app.corpus.repository import CorpusRepository
from app.corpus.service import AgentDataPlane
from app.corpus.worker import CorpusWorker
from app.db.models import AiAccess, Course, Resource, ResourceText, ResourceVersion


@pytest.mark.parametrize("query,text", [
    ("selbstaufrufenden Algorithmus", "Ein rekursiver Algorithmus behandelt Rekursion."),
    ("recursive", "Die Rekursion benötigt einen Basisfall."),
    ("Stoppregel", "Die Abbruchbedingung beendet eine Schleife."),
    ("Basisfaelle", "Basisfälle müssen alle kleinsten Eingaben behandeln."),
    ("children", "Ein Knoten hat zwei Kinder."),
    ("Nachfolger", "Ein Binärbaum hat zwei Kinder."),
    ("binarytree", "Der Binärbaum ist eine Datenstruktur."),
])
def test_general_terms_match_german_english_and_inflected_vocabulary(query, text):
    with sqlite3.connect(":memory:") as connection:
        connection.execute("CREATE VIRTUAL TABLE content USING fts5(body)")
        connection.execute("INSERT INTO content VALUES (?)", (text,))
        assert connection.execute("SELECT count(*) FROM content WHERE content MATCH ?", (expression(query),)).fetchone()[0] == 1


def test_short_queries_keep_conjunction_and_non_domain_queries_unchanged():
    value = expression("rekursion mutex")
    assert ') AND "mutex"' in value
    assert expression("Mutex Semaphore") == '"Mutex" AND "Semaphore"'
    assert expression("WHERE DROP TABLE OR ../") == '"WHERE" OR "DROP" OR "TABLE"'
    assert expression("erkläre wo und") == ""
    assert len(expression("selbstaufrufend " * 1000)) < 3000


def test_structured_scope_survives_alias_expansion():
    normalized = normalize(Search(query='semester:WS26 course:42 type:material recursive'))
    assert normalized.scope.course == "42" and normalized.scope.semester == "WS26"
    assert normalized.types == ["resource"]
    assert "recursion" in expression(normalized.query)


def test_alias_hits_keep_scope_latest_version_hashes_and_denied_course_filter(factory, settings, coordinator):
    expected = None
    with factory() as session:
        allowed = Course(source="synthetic", source_id="alias-allowed", name="Erfundener freier Kurs")
        denied = Course(source="synthetic", source_id="alias-denied", name="Erfundener gesperrter Kurs")
        session.add_all([allowed, denied])
        session.flush()
        allowed_id = allowed.id
        session.add(AiAccess(key=f"course:{denied.id}", allowed=False))
        for index, course in enumerate((allowed, denied)):
            resource = Resource(source="synthetic", source_key=f"alias-{index}", course_id=course.id,
                                kind="pdf", name="Fiktive Rekursion", url="https://example.invalid/lexical",
                                group_category="general")
            session.add(resource)
            session.flush()
            for version_number in (1, 2):
                version = ResourceVersion(resource_id=resource.id, version=version_number,
                                          sha256=str(version_number) * 64, relative_path="not-created.pdf", size=200,
                                          mime_type="application/pdf")
                session.add(version)
                session.flush()
                session.add(ResourceText(version_id=version.id, page_number=1,
                                         text="Ein Basisfall beendet die Rekursion.", markdown=None))
            if course is allowed:
                expected = f"resource:{resource.id}"
        session.commit()
    CorpusWorker(CorpusRepository(factory, settings), coordinator).drain()
    service = AgentDataPlane(factory, settings)
    hits = service.search(Search(query="Stoppregel recursive", scope={"course": allowed_id}))["results"]
    assert hits and {hit["entity_ref"] for hit in hits} == {expected}
    assert all(hit["version"] == "2" and hit["source_hash"] == "2" * 64 for hit in hits)
    unscoped = service.search(Search(query="selbstaufrufend"))["results"]
    assert unscoped and {hit["course_id"] for hit in unscoped} == {allowed_id}
