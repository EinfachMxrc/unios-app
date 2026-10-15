# SPDX-License-Identifier: AGPL-3.0-or-later

"""Exact, explicitly labelled ECTS and grade calculations."""

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from app.db.models import AcademicModule

HUNDRED = Decimal(100)


def decimal_value(hundredths: int) -> Decimal:
    return Decimal(hundredths) / HUNDRED


def decimal_text(hundredths: int) -> str:
    return f"{decimal_value(hundredths):.2f}"


def hundredths(value: Decimal) -> int:
    return int((value * HUNDRED).to_integral_exact())


def _text(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):.2f}"


def calculate(modules: list[AcademicModule], hypothetical: dict[int, Decimal] | None = None) -> dict:
    hypothetical = hypothetical or {}
    semesters: dict[int | None, dict[str, Decimal]] = defaultdict(
        lambda: {"planned": Decimal(0), "earned": Decimal(0), "simulated": Decimal(0)})
    included: list[tuple[Decimal, Decimal, Decimal | None]] = []
    actual_included: list[tuple[Decimal, Decimal, Decimal | None]] = []
    for module in modules:
        ects = decimal_value(module.ects_hundredths)
        values = semesters[module.semester_id]
        values["planned"] += ects
        if module.status == "passed":
            values["earned"] += ects
            if module.grade_hundredths is not None:
                grade = decimal_value(module.grade_hundredths)
                entry = (grade, ects, decimal_value(module.weight_hundredths)
                         if module.weight_hundredths is not None else None)
                actual_included.append(entry)
                included.append(entry)
        elif module.status == "open" and module.id in hypothetical:
            values["simulated"] += ects
            included.append((hypothetical[module.id], ects,
                             decimal_value(module.weight_hundredths)
                             if module.weight_hundredths is not None else None))

    def average(entries: list[tuple[Decimal, Decimal, Decimal | None]]) -> tuple[str | None, str, bool]:
        if not entries:
            return None, "no_grades", False
        custom = all(weight is not None for _, _, weight in entries)
        divisor = sum((weight if custom and weight is not None else ects
                       for _, ects, weight in entries), Decimal(0))
        if divisor <= 0:
            return None, "no_grades", False
        total = sum((grade * (weight if custom and weight is not None else ects)
                     for grade, ects, weight in entries), Decimal(0))
        return _text(total / divisor), "entered_weight" if custom else "ects", custom

    current, current_basis, current_complete = average(actual_included)
    projected, projected_basis, projected_complete = average(included)
    rows = [{"semester_id": semester_id,
             "planned_ects": _text(values["planned"]),
             "earned_ects": _text(values["earned"]),
             "hypothetical_ects": _text(values["simulated"])}
            for semester_id, values in semesters.items()]
    overall = {key: _text(sum((value[key] for value in semesters.values()), Decimal(0)))
               for key in ("planned", "earned", "simulated")}
    return {
        "semesters": rows,
        "overall": {"planned_ects": overall["planned"], "earned_ects": overall["earned"],
                    "hypothetical_ects": overall["simulated"]},
        "average": current, "average_basis": current_basis,
        "weighting_complete": current_complete,
        "scenario_average": projected if hypothetical else None,
        "scenario_basis": projected_basis if hypothetical else None,
        "scenario_weighting_complete": projected_complete if hypothetical else None,
    }
