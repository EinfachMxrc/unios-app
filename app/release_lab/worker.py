# SPDX-License-Identifier: AGPL-3.0-or-later
"""Real Corpus benchmark in a newly created, entirely synthetic university."""

import hashlib
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)
from sqlalchemy import create_engine

from app.config import Settings
from app.corpus.contracts import Fetch, Search
from app.corpus.evaluation import evaluate
from app.corpus.incremental_schema import install as install_incremental
from app.corpus.repository import CorpusRepository
from app.corpus.schema_v1 import install
from app.corpus.service import AgentDataPlane
from app.corpus.worker import CorpusWorker
from app.db.models import (
    AiAccess,
    Base,
    Course,
    Resource,
    ResourceText,
    ResourceVersion,
    Semester,
)
from app.db.session import make_session_factory
from app.host.lease import HostCoordinator
from app.release_lab.contracts import FixtureBudget
from app.release_lab.service import RETRIEVAL_BASELINE


class SyntheticSettings(Settings):
    # Pydantic builds source objects before calling settings_customise_sources.
    # Disable dotenv at construction too; merely ignoring its values is insufficient.
    model_config = SettingsConfigDict(env_file=None, env_file_encoding="utf-8", extra="ignore")

    @classmethod
    def settings_customise_sources(cls, settings_cls: type[BaseSettings],
                                   init_settings: PydanticBaseSettingsSource,
                                   env_settings: PydanticBaseSettingsSource,
                                   dotenv_settings: PydanticBaseSettingsSource,
                                   file_secret_settings: PydanticBaseSettingsSource) -> tuple[PydanticBaseSettingsSource, ...]:
        # Even a direct caller cannot inherit a real .env or environment credential.
        return (init_settings,)


def fixture_documents(budget: FixtureBudget, source: Path) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    fixture = json.loads(source.read_text(encoding="utf-8"))
    documents = list(fixture["documents"])
    for index in range(len(documents), budget.documents):
        documents.append({"key": f"synthetic-{index}", "title": f"Erfundenes Material {index}",
                          "text": f"Fiktiver Kursinhalt {index}: Eine lokal erzeugte neutrale Beschreibung."})
    size = sum(len(json.dumps(item, ensure_ascii=False).encode()) * budget.pages_per_document for item in documents)
    if size > budget.max_bytes:
        raise ValueError("Synthetic text budget exceeded before import")
    return documents, fixture["cases"]


def benchmark(budget: FixtureBudget, source: Path) -> dict[str, Any]:
    documents, cases = fixture_documents(budget, source)
    with tempfile.TemporaryDirectory(prefix="unios-corpus-fixture-") as temporary:
        root = Path(temporary)
        settings = SyntheticSettings(data_dir=root / "shared", local_dir=root / "private",
                                     moodle_enabled=False, public_periods_enabled=False, mcp_enabled=False,
                                     mcp_token="synthetic-benchmark-identity", api_auth_required=False)
        host = HostCoordinator(settings)
        engine = None
        try:
            host.acquire_initial()
            if not host.start(background=False):
                raise RuntimeError("Synthetic writer could not start")
            engine = create_engine(settings.database_url)
            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                install(connection)
                install_incremental(connection)
                from app.assessment.index_schema import install as install_assessment
                from app.coding.index_schema import install as install_coding
                install_coding(connection)
                install_assessment(connection)
            factory = make_session_factory(engine)
            expected, forbidden, source_hashes = {}, [], {}
            with factory() as session:
                semesters = [Semester(name=f"Synthetic Semester {index + 1}") for index in range(budget.semesters)]
                session.add_all(semesters)
                session.flush()
                courses = [Course(source="release-lab", source_id=str(index), name=f"Erfundener Kurs {index + 1}",
                                  semester_id=semesters[index % len(semesters)].id) for index in range(budget.courses)]
                private = Course(source="release-lab", source_id="private", name="Gesperrter erfundener Kurs",
                                 semester_id=semesters[0].id)
                session.add_all([*courses, private])
                session.flush()
                session.add(AiAccess(key=f"course:{private.id}", allowed=False))
                private_id = private.id
                for index, document in enumerate(documents):
                    resource = Resource(source="release-lab", source_key=str(index), course_id=courses[index % len(courses)].id,
                                        kind="pdf", name=document["title"], url="https://example.invalid/synthetic",
                                        group_category="general")
                    session.add(resource)
                    session.flush()
                    expected[document["key"]] = f"resource:{resource.id}"
                    versions = [ResourceVersion(resource_id=resource.id, version=version,
                                               sha256=hashlib.sha256(f"{index}:{version}".encode()).hexdigest(),
                                               relative_path=f"synthetic/{index}-v{version}.pdf", size=500,
                                               mime_type="application/pdf") for version in (1, 2)]
                    session.add_all(versions)
                    session.flush()
                    source_hashes[f"resource:{resource.id}"] = versions[1].sha256
                    session.add(ResourceText(version_id=versions[0].id, page_number=1,
                                             text="Veraltete Quelle " + document["text"], markdown=None))
                    for page in range(1, budget.pages_per_document + 1):
                        session.add(ResourceText(version_id=versions[1].id, page_number=page,
                                                 text=document["text"], markdown="# " + document["title"] + "\n" + document["text"]))
                    if index < 20:
                        denied = Resource(source="release-lab", source_key=f"denied-{index}", course_id=private.id,
                                          kind="pdf", name=document["title"], url="https://example.invalid/private",
                                          group_category="general")
                        session.add(denied)
                        session.flush()
                        forbidden.append(f"resource:{denied.id}")
                        denied_version = ResourceVersion(resource_id=denied.id, version=2,
                                                         sha256=hashlib.sha256(f"private:{index}".encode()).hexdigest(),
                                                         relative_path="synthetic/private.pdf", size=500, mime_type="application/pdf")
                        session.add(denied_version)
                        session.flush()
                        session.add(ResourceText(version_id=denied_version.id, page_number=1,
                                                 text=document["text"], markdown=None))
                session.commit()
            repository = CorpusRepository(factory, settings)
            CorpusWorker(repository, host).drain()
            service = AgentDataPlane(factory, settings)
            result = evaluate(service, [
                {**case, "expected": [expected[case["expected_key"]]], "version": "2",
                 "forbidden": forbidden, "forbidden_courses": [private_id]} for case in cases])
            source_mismatches, citation_mismatches = 0, 0
            for case in cases:
                hits = service.search(Search(query=case["query"], top_k=20, budget=64000))["results"]
                source_mismatches += sum(hit["source_hash"] != source_hashes.get(hit["entity_ref"]) for hit in hits)
                if hits:
                    hit = hits[0]
                    fetched = service.fetch(Fetch(refs=[hit["ref"]]))["results"][0]
                    citation_mismatches += int(fetched["content_hash"] != hit["content_hash"]
                                               or hashlib.sha256(fetched["text"].encode()).hexdigest() != hit["content_hash"])
            result["source_hash_mismatches"] = source_mismatches
            result["citation_hash_mismatches"] = citation_mismatches
            result["baseline_comparison"] = {
                "reference": "docs/PROGRESS.md: Agent Gateway v2 0.1.17, same 100-query seed; load differs",
                "metrics": RETRIEVAL_BASELINE,
                "deltas": {key: result[key] - value for key, value in RETRIEVAL_BASELINE.items()},
                "regression": any(result[key] < value for key, value in RETRIEVAL_BASELINE.items()),
                "absolute_target_met": result["recall_at_20"] >= .99,
                "latency_comparison": "not_comparable_across_hardware_and_corpus_load",
            }
            result["fixture"] = {"synthetic": True, "semesters": budget.semesters, "courses": budget.courses,
                                 "documents": budget.documents, "historical_versions": budget.documents,
                                 "pages_per_document": budget.pages_per_document, "denied_documents": 20,
                                 "source_files_created": False, "source_format": "generated indexed text, not real PDFs"}
            result["thresholds"] = {"recall_at_5": .95, "recall_at_20": .99, "mrr": .90,
                                    "forbidden_sources": 0, "stale_versions": 0}
            result["index"] = repository.status()
            return result
        finally:
            if engine is not None:
                engine.dispose()
            host.close()


def main() -> None:
    destination = Path(sys.argv[1])
    if any(part in ("data", "local", ".env", ".ssh") for part in destination.resolve().parts):
        raise ValueError("Worker destination cannot be private application storage")
    if destination.exists() or destination.parent.name.startswith("unios-release-lab-") is False:
        raise ValueError("Worker needs a fresh release-lab temporary destination")
    budget = FixtureBudget.model_validate_json(sys.argv[2])
    source = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "agent" / "retrieval.json"
    result = benchmark(budget, source)
    with destination.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    print("Synthetic retrieval benchmark completed; no original PDF or personal storage was read.")


if __name__ == "__main__":
    main()
