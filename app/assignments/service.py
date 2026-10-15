# SPDX-License-Identifier: AGPL-3.0-or-later
from datetime import UTC


class AssignmentService:
    def __init__(self, repository, coordinator):
        self.repository = repository
        self.coordinator = coordinator

    def confirm(self, assignment_id, payload):
        self.coordinator.assert_writer()
        if payload.due_at.tzinfo is None:
            raise ValueError("Der Termin muss eine Zeitzone enthalten.")
        expected = payload.expected_due_at
        if expected is not None and expected.tzinfo is None:
            raise ValueError("Der bisherige Termin muss eine Zeitzone enthalten.")
        self.repository.confirm(assignment_id, payload.due_at.astimezone(UTC),
                                expected.astimezone(UTC) if expected else None,
                                payload.delivery, self.coordinator)
