# SPDX-License-Identifier: AGPL-3.0-or-later

"""Serialize existing approved content without creating topics or exercises on reads."""

from app.ai.exercises import ExerciseProposal
from app.learning.practice_repository import PracticeRepository
from app.learning.practice_schema import PracticeAttemptView, PracticeItem


class PracticeService:
    def __init__(self, repository: PracticeRepository):
        self._repository = repository

    def available(self, course_id: int | None) -> list[PracticeItem]:
        result = []
        for row in self._repository.available(course_id):
            content = ExerciseProposal.model_validate_json(row.proposal.payload)
            result.append(PracticeItem(
                id=row.proposal.id, exercise_id=row.exercise.id if row.exercise else None,
                course_id=row.course.id, course_name=row.course.name,
                resource_id=row.resource.id, resource_name=row.resource.name,
                question=content.question, topic=content.topic, difficulty=content.difficulty,
                sample_solution=content.sample_solution, solution_steps=content.solution_steps,
                source_page=content.source_page, choices=content.choices, correct_choice=content.correct_choice,
                attempt_count=row.attempt_count, last_correct=row.last_correct,
            ))
        return result

    def history(self, course_id: int | None) -> list[PracticeAttemptView]:
        result = []
        for row in self._repository.history(course_id):
            attempt, exercise, topic, course = row.attempt, row.exercise, row.topic, row.course
            assert exercise.proposal_id is not None
            result.append(PracticeAttemptView(
                id=attempt.id, exercise_id=exercise.id, proposal_id=exercise.proposal_id,
                course_id=course.id, course_name=course.name, topic=attempt.topic_name or topic.name,
                question=exercise.question, answer=attempt.answer, correct=attempt.correct,
                error_kind=attempt.error_kind, difficulty=attempt.difficulty,
                solution_steps=attempt.solution_steps, duration_seconds=attempt.duration_seconds,
                attempted_at=attempt.attempted_at,
            ))
        return result
