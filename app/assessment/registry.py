# SPDX-License-Identifier: AGPL-3.0-or-later
"""One registry for renderers, validators, graders and tutor capabilities."""
import json
from dataclasses import dataclass
from fractions import Fraction

from app.assessment import math


@dataclass(frozen=True)
class ExerciseType:
    id: str
    renderer: str
    grader: str
    objective: bool
    capabilities: tuple[str, ...]


TYPES = {item.id: item for item in [
    ExerciseType('multiple_choice', 'choices', 'exact-choice', True, ('hints', 'confidence')),
    ExerciseType('free_recall', 'text', 'tutor-review', False, ('hints', 'confidence', 'followup')),
    ExerciseType('symbolic_math', 'math', 'sympy-polynomial-v1', True, ('hints', 'confidence', 'steps')),
    ExerciseType('parsons', 'ordering', 'approved-order', True, ('hints', 'confidence')),
    ExerciseType('ordering', 'ordering', 'approved-order', True, ('hints', 'confidence')),
    ExerciseType('oral', 'oral', 'tutor-review', False, ('confidence', 'transcription', 'followup')),
    ExerciseType('matching', 'matching', 'approved-pairs', True, ('hints', 'confidence')),
    ExerciseType('numeric', 'text', 'rational-equality', True, ('hints', 'confidence')),
    ExerciseType('coding', 'monaco', 'judge0+trusted-oracle', True, ('hints', 'files', 'limits', 'diff')),
]}


def validate(task):
    kind = task.type
    if any(not choice.strip() for choice in task.choices):
        raise ValueError('EMPTY_CHOICE')
    if kind == 'symbolic_math':
        polynomial = math.polynomial(task.expression)
        if task.math_operation == 'roots' and not 1 <= polynomial.degree() <= 2:
            raise ValueError('MATH_DEGREE')
    if kind == 'multiple_choice' and (len(task.choices) < 2 or task.expected not in task.choices):
        raise ValueError('CHOICE_EXPECTED')
    if kind in {'ordering', 'parsons', 'matching'}:
        result = json.loads(task.expected)
        if not isinstance(result, list) or not 2 <= len(result) <= 12 or len(task.choices) != len(result):
            raise ValueError('ORDER_EXPECTED')
        if kind != 'matching' and (any(type(item) is not int for item in result) or sorted(result) != list(range(len(task.choices)))):
            raise ValueError('ORDER_EXPECTED')
        if kind == 'matching' and (any(not isinstance(item, str) or len(item) > 200 for item in result)):
            raise ValueError('MATCH_EXPECTED')
    if kind == 'numeric':
        rational(task.expected)


def rational(value):
    if len(value) > 100:
        raise ValueError('NUMBER_LIMIT')
    number = Fraction(value.strip())
    if abs(number.numerator) > 10 ** 12 or number.denominator > 10 ** 9:
        raise ValueError('NUMBER_LIMIT')
    return number


def grade(task, answer):
    spec = TYPES[task['type']]
    if not spec.objective:
        return {'correct': None, 'errors': [], 'checker': spec.grader, 'needs_tutor': True,
                'pronunciation_checked': False, 'grammar_checked': False}
    if task['type'] == 'symbolic_math':
        return math.grade(task['expression'], task['math_operation'], answer.text, answer.steps)
    try:
        if task['type'] == 'numeric':
            correct = rational(answer.text) == rational(task['expected'])
        elif task['type'] in {'ordering', 'parsons', 'matching'}:
            actual, expected = json.loads(answer.text), json.loads(task['expected'])
            correct = (type(actual) is list and actual == expected and
                       (task['type'] == 'matching' or all(type(item) is int for item in actual)))
        else:
            correct = answer.text == task['expected']
    except (ValueError, ZeroDivisionError, TypeError):
        correct = False
    return {'correct': correct, 'errors': [] if correct else [task['type'] + '_result'], 'checker': spec.grader}
