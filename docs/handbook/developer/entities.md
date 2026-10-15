<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Entitäten und Beziehungen

Schemaversion: 2. Quelle: `app/entities/schema.py`.

REST: `/api/schema`, `/api/schema/{kind}`, `/api/entities/{kind}` und
`/api/entities/{kind}/{id}`. Listen akzeptieren `q`, `offset` und `limit`.
CLI: `unios schema`, `unios describe`, `unios entity`.
MCP: `get_entity_schema` gibt nur den Vertrag zurück, keine Studiendaten.

## Kurs (`course`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `name` | `string` | True | False | False | — | Anzeigename |
| `short_name` | `string` | False | True | False | — | Kurzname |
| `semester_id` | `integer` | False | True | False | — | Semester |
| `is_active` | `boolean` | True | False | True | — | Aktiver Kurs |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `course.set_activity` | `courses.write` | True | False |
| `assessment.create` | `assessment.propose` | False | True |
| `assessment.source_context` | `assessment.read` | False | True |
| `assessment.progress` | `assessment.read` | False | True |
| `coding.create_practice` | `coding.propose` | False | True |
| `coding.next_practice` | `coding.propose` | False | True |
| `coding.progress` | `coding.read` | False | True |

Eingabeschema: `GET /api/schema/course`.

## Material (`resource`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `name` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `kind` | `string` | True | False | False | — | Art |
| `group_category` | `enum` | True | False | False | general, own_group, other_group, unassigned | Kursgruppe |
| `removed_upstream` | `boolean` | True | False | False | — | Nicht mehr in der Quelle |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `resource.reextract` | `materials.index` | True | False |
| `resource.index_status` | `materials.read` | False | True |
| `resource.cancel_indexing` | `materials.index` | True | False |

Eingabeschema: `GET /api/schema/resource`.

## Schnellerfassung (`jot`)

Kennung: `uuid`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `string` | True | False | False | — | Stabile Kennung |
| `body` | `long_text` | True | False | True | — | Anzeigename |
| `course_id` | `entity_ref` | False | True | False | course | Kurs |
| `kind` | `string` | True | False | False | — | Art |

## Notiz (`note`)

Kennung: `uuid`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `string` | True | False | False | — | Stabile Kennung |
| `title` | `string` | True | False | True | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `current_revision` | `integer` | True | False | False | — | Version |
| `updated_at` | `datetime` | True | False | False | — | Letzte Änderung |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `note.blocks` | `notes.read` | False | True |
| `note.edit_block` | `notes.write` | True | False |

Eingabeschema: `GET /api/schema/note`.

## Projekt (`project`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `name` | `string` | True | False | True | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `deadline_at` | `datetime` | False | True | False | — | Frist |
| `members` | `list` | True | False | True | object | Projektmitglieder |
| `links` | `list` | True | False | True | object | Projektlinks |
| `todos` | `list` | True | False | True | object | Projektaufgaben |

## Lernthema (`topic`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `name` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `slug` | `string` | True | False | False | — | Kurzform |

## Aufgabe (`assignment`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `title` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `due_at` | `datetime` | False | True | False | — | Frist |
| `description` | `long_text` | True | False | False | — | Aufgabenbeschreibung |
| `delivery` | `enum` | True | False | False | unknown, in_person, online | Abgabeart |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `assignment.submission_status` | `submissions.read` | False | True |

Eingabeschema: `GET /api/schema/assignment`.

## Prüfung (`exam`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `title` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | False | True | False | course | Kurs |
| `exam_at` | `datetime` | False | True | False | — | Termin |

## Übung (`exercise`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `question` | `long_text` | True | False | False | — | Anzeigename |
| `topic_id` | `entity_ref` | True | False | False | topic | Lernthema |
| `solution` | `long_text` | True | False | False | — | Lösung |
| `difficulty` | `enum` | False | True | False | easy, medium, hard | Schwierigkeit |

## Lernaufgabe (`assessment_task`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `title` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `topic_id` | `entity_ref` | False | True | False | topic | Lernthema |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `assessment.describe` | `assessment.read` | False | True |

Eingabeschema: `GET /api/schema/assessment_task`.

## Lernantwort (`assessment_attempt`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `title` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `assessment.feedback_context` | `assessment.read` | False | True |
| `assessment.submit_review` | `assessment.propose` | False | True |

Eingabeschema: `GET /api/schema/assessment_attempt`.

## Coding-Aufgabe (`coding_task`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `title` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `topic_id` | `entity_ref` | False | True | False | topic | Lernthema |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `coding.describe` | `coding.read` | False | True |

Eingabeschema: `GET /api/schema/coding_task`.

## Coding-Versuch (`coding_attempt`)

Kennung: `integer`. Fähigkeiten: read, list, search, relate, unlink.

| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `integer` | True | False | False | — | Stabile Kennung |
| `title` | `string` | True | False | False | — | Anzeigename |
| `course_id` | `entity_ref` | True | False | False | course | Kurs |
| `task_id` | `entity_ref` | True | False | False | coding_task | Coding-Aufgabe |

### Aktionen

| ID | Fähigkeit | Bestätigung | MCP |
| --- | --- | --- | --- |
| `coding.feedback_context` | `coding.read` | False | True |
| `coding.submit_review` | `coding.propose` | False | True |

Eingabeschema: `GET /api/schema/coding_attempt`.

## Beziehungen

| Typ | Hinweg | Rückweg |
| --- | --- | --- |
| `related` | verknüpft mit | verknüpft mit |
| `prerequisite` | Voraussetzung für | setzt voraus |
| `explains` | erklärt | wird erklärt durch |
| `exercise_for` | ist Übung zu | hat Übung |
| `part_of` | ist Teil von | enthält |
| `duplicate` | ist Duplikat von | ist Duplikat von |
| `prepares_for` | bereitet vor auf | wird vorbereitet durch |

Beziehungen sind gerichtet, außer `related` und `duplicate`. Eingehende Kanten 
erscheinen automatisch als Rückverweise. `unios relate` und `unios unlink` 
verlangen `--yes`; `--dry-run` prüft nur die beabsichtigte Änderung.
