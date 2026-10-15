# SPDX-License-Identifier: AGPL-3.0-or-later
"""Goals for independent agents, plus an immutable executable suite allowlist."""

from app.release_lab.contracts import Mission, Persona

PERSONAS = [
    Persona(id="first-semester", platform="windows", experience="beginner",
            description="Erstsemester ohne technische Vorkenntnisse; möchte eine nächste Abgabe finden."),
    Persona(id="returning-student", platform="macos", experience="experienced",
            description="Mehrere Semester, Notizen und Materialien; sucht gezielt eine historische Quelle."),
    Persona(id="power-user", platform="linux", experience="experienced",
            description="Nutzt Work und Erweiterungen; erwartet nachvollziehbare Freigaben."),
    Persona(id="chaos-user", platform="any", experience="chaotic",
            description="Unterbricht Abläufe und Verbindungen; möchte danach sicher weiterarbeiten."),
]

# Arguments cannot be supplied by missions, models, imported observations or callers.
# Trusted source tests only; this is process/environment isolation, not an OS sandbox.
SUITES: dict[str, tuple[str, ...]] = {
    "retrieval-contract": ("tests/test_agent_corpus.py",),
    "learning": ("tests/test_assessment_engine.py", "tests/test_coding_tutor.py"),
    "recovery": ("tests/test_host_recovery.py", "tests/test_host_snapshots.py", "tests/test_host_handoff.py"),
    "migration": ("tests/test_server_migration.py",),
    "addon-isolation": ("tests/test_wasm_addons.py",),
    "pdf": ("tests/test_material.py",),
}

MISSIONS = [
    Mission(id="first-ten-minutes", persona="first-semester", gate="manual-installer",
            goal="Installiere UniOS auf einem frischen Gerät, probiere das Demo-Semester aus und finde die nächste Abgabe.",
            requires_real_device=True),
    Mission(id="find-source", persona="returning-student", gate="retrieval-contract",
            goal="Finde die Erklärung zur Rekursion und benenne die überprüfbare Quelle und ihren Versionsstand."),
    Mission(id="practice", persona="first-semester", gate="learning",
            goal="Finde eine passende Übung, bearbeite sie und erkenne den Unterschied zwischen Bewertung und Tutor-Feedback."),
    Mission(id="recovery", persona="chaos-user", gate="recovery",
            goal="Verstehe den Fehler einer unterbrochenen Verbindung und finde einen sicheren Weg zurück zu deinen Daten."),
    Mission(id="permissions", persona="power-user", gate="retrieval-contract",
            goal="Gib Work genau einen Kurs frei und prüfe unabhängig, dass gesperrte Quellen nicht zugänglich sind."),
    Mission(id="pdf-reading", persona="returning-student", gate="pdf",
            goal="Finde eine bestimmte PDF-Seite und eine eigene Markierung; prüfe, ob sie nach erneutem Öffnen erhalten bleiben."),
    Mission(id="work-next-lecture", persona="first-semester", gate="retrieval-contract",
            goal="Bereite mich auf meine nächste Programmieren-Vorlesung vor: finde Kurs, aktuelle Unterlagen, bisherige Themen und offene Aufgaben; lade Quellen gezielt und belege den kurzen Brief."),
    Mission(id="work-week-review", persona="returning-student", gate="retrieval-contract",
            goal="Finde heraus, was ich diese Woche verpasst habe; verwende nur freigegebene Änderungen, Termine und Quellen und kennzeichne fehlende Informationen."),
    Mission(id="work-exam-weaknesses", persona="power-user", gate="learning",
            goal="Finde meine belegbaren Schwächen vor der Klausur aus vorhandenen Antworten, Fehlern und Hilfe-Nutzung; unterscheide gemessene Lernstände von Vermutungen."),
    Mission(id="work-chapter-practice", persona="power-user", gate="learning",
            goal="Erstelle überprüfbare Übungsvorschläge ausschließlich aus Kapitel 5 der freigegebenen synthetischen Quelle; pinne Version und Abschnitte und verwende keine Inhalte anderer Kapitel."),
    Mission(id="chaos-monkey", persona="chaos-user", gate="recovery", budget_seconds=1800, budget_actions=300,
            goal="Benutze die lokale synthetische App bis zu 30 Minuten frei, unterbrich erlaubte Fake-Verbindungen und Abläufe und suche nach Abstürzen, verlorenen Änderungen, falschen Zuständen oder Sackgassen; erfasse Belege und sichere Wiederherstellung."),
]

MANUAL_GATES = [
    "Frischer Windows-Installer einschließlich SmartScreen und Defender",
    "macOS ARM/Intel: Installation, Notarisierung, Schlüsselbund, Sleep/Wake",
    "Linux-Pakete auf frischen Geräten",
    "Native Screenreader, Touch-Gesten und reale Netzwerkwechsel",
    "Hochschul-MFA/CAPTCHA ausschließlich durch den Nutzer",
    "Echte externe Tester und subjektive Bedienbarkeit",
]
