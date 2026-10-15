# SPDX-License-Identifier: AGPL-3.0-or-later
"""Versioned task families: trusted oracles, varied cases and oracle mutation checks.

No generated tests or code are executed in the UniOS process. Learner code runs
only on the execution backend. Expected values never enter its sandbox payload.
"""

import hashlib
import math
import random
from collections.abc import Callable
from dataclasses import dataclass
from itertools import pairwise

from app.coding.contracts import Language, TemplateId

VERSION = 'arrays-v1'
ENTRIES = {
    'sum': ('Summe berechnen', 'Variablen und Schleifen', 'Gib die Summe aller Zahlen als Array mit einem Element zurück. Für eine leere Eingabe ist das Ergebnis [0].'),
    'maximum': ('Maximum finden', 'Arrays und Randfälle', 'Gib das größte Element als Array mit einem Element zurück. Bei einer leeren Eingabe gib [] zurück.'),
    'reverse': ('Array umdrehen', 'Arrays und Indizes', 'Gib alle Elemente in umgekehrter Reihenfolge zurück. Auch eine leere Eingabe ist gültig.'),
    'sort': ('Zahlen sortieren', 'Sortierung und Eigenschaften', 'Gib die Zahlen aufsteigend sortiert zurück. Anzahl und Häufigkeit aller Werte müssen erhalten bleiben.'),
    'unique': ('Duplikate entfernen', 'Arrays und Mengen', 'Gib jeden Wert nur einmal zurück, in der Reihenfolge seines ersten Auftretens.'),
    'count_zero': ('Nullen zählen', 'Bedingungen und Schleifen', 'Gib die Anzahl der Nullen als Array mit einem Element zurück. Für eine leere Eingabe ist das Ergebnis [0].'),
    'factorial': ('Fakultät berechnen', 'Methoden und Rekursion', 'Die Eingabe enthält genau eine Zahl n von 0 bis 12. Gib n! als Array mit einem Element zurück. 0! ist 1.'),
}


@dataclass(frozen=True)
class Case:
    name: str
    category: str
    values: list[int]
    expected: list[int]
    public: bool = False
    performance: bool = False


def oracle(template: TemplateId, values: list[int]) -> list[int]:
    if template == 'sum':
        return [sum(values)]
    if template == 'maximum':
        return [max(values)] if values else []
    if template == 'reverse':
        return values[::-1]
    if template == 'sort':
        return sorted(values)
    if template == 'unique':
        return list(dict.fromkeys(values))
    if template == 'count_zero':
        return [values.count(0)]
    return [math.factorial(values[0])]


def cases(template: TemplateId, seed: str, difficulty: str = 'easy') -> list[Case]:
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest(), 16))
    inputs = [[3, 1, 2], [], [5], [-4, -1, -9], [2, 2, 0, 2, 0], [0, -1, 0, 1]]
    if template == 'factorial':
        inputs = [[5], [0], [1], [2], [8], [12]]
    else:
        inputs += [[rng.randint(-20, 20) for _ in range(rng.randint(2, 30))] for _ in range(3)]
        inputs.append([rng.randint(-100, 100) for _ in range({'easy': 600, 'medium': 2000, 'hard': 5000}[difficulty])])
    categories = ['normal', 'empty_input' if template != 'factorial' else 'boundary', 'single_item', 'negative_values', 'duplicates', 'boundary']
    return [Case(f'case-{index + 1}', categories[index] if index < len(categories) else 'performance' if index == len(inputs) - 1 else 'property',
                 values, oracle(template, values), index < 2, index == len(inputs) - 1 and template != 'factorial')
            for index, values in enumerate(inputs)]


def mutation_check(template: TemplateId, suite: list[Case]) -> dict:
    # Three concrete trusted mutations: constant result, dropped input, wrong value.
    # This checks oracle/case discrimination, not learner coverage or compiled mutants.
    variants: tuple[Callable[[list[int]], list[int]], ...] = (
        lambda values: [],
        lambda values: oracle(template, values[:-1]) if template != 'factorial' and values else [0],
        lambda values: [v + 1 for v in oracle(template, values)],
    )
    killed = sum(any(candidate(case.values) != case.expected for case in suite) for candidate in variants)
    return {'kind': 'trusted_oracle_mutations', 'killed': killed, 'total': len(variants), 'compiled_mutants': False}


def property_check(template: TemplateId, values: list[int], output: list[int]) -> bool:
    if template == 'sort':
        return len(output) == len(values) and sorted(output) == sorted(values) and all(a <= b for a, b in pairwise(output))
    if template == 'reverse':
        return len(output) == len(values) and output[::-1] == values
    if template == 'unique':
        return len(output) == len(set(values)) and set(output) == set(values) and len(output) == len(set(output))
    return output == oracle(template, values)


def starter(language: Language) -> dict[str, str]:
    if language == 'java':
        return {'Solution.java': 'public class Solution {\n    public static int[] solve(int[] values) {\n        return new int[0];\n    }\n}\n'}
    if language == 'javascript':
        return {'Solution.js': 'function solve(values) {\n  return [];\n}\n\nmodule.exports = { solve };\n'}
    return {'Solution.py': 'def solve(values):\n    return []\n'}


SOLUTIONS = {
    'python': {
        'sum': 'return [sum(values)]', 'maximum': 'return [max(values)] if values else []',
        'reverse': 'return values[::-1]', 'sort': 'return sorted(values)',
        'unique': 'return list(dict.fromkeys(values))', 'count_zero': 'return [values.count(0)]',
        'factorial': 'n = values[0]\n    return [1 if n == 0 else n * solve([n - 1])[0]]',
    },
    'javascript': {
        'sum': 'return [values.reduce((sum, value) => sum + value, 0)];',
        'maximum': 'return values.length ? [Math.max(...values)] : [];',
        'reverse': 'return [...values].reverse();', 'sort': 'return [...values].sort((a, b) => a - b);',
        'unique': 'return [...new Set(values)];', 'count_zero': 'return [values.filter(value => value === 0).length];',
        'factorial': 'const n = values[0];\n  return [n === 0 ? 1 : n * solve([n - 1])[0]];',
    },
    'java': {
        'sum': 'int sum = 0;\n        for (int value : values) sum += value;\n        return new int[]{sum};',
        'maximum': 'if (values.length == 0) return new int[0];\n        int max = values[0];\n        for (int value : values) if (value > max) max = value;\n        return new int[]{max};',
        'reverse': 'int[] result = new int[values.length];\n        for (int i = 0; i < values.length; i++) result[i] = values[values.length - 1 - i];\n        return result;',
        'sort': 'int[] result = values.clone();\n        java.util.Arrays.sort(result);\n        return result;',
        'unique': 'java.util.LinkedHashSet<Integer> seen = new java.util.LinkedHashSet<>();\n        for (int value : values) seen.add(value);\n        return seen.stream().mapToInt(Integer::intValue).toArray();',
        'count_zero': 'int count = 0;\n        for (int value : values) if (value == 0) count++;\n        return new int[]{count};',
        'factorial': 'int n = values[0];\n        return new int[]{n == 0 ? 1 : n * solve(new int[]{n - 1})[0]};',
    },
}


def solution(language: Language, template: TemplateId) -> str:
    code = SOLUTIONS[language][template]
    if language == 'python':
        return 'def solve(values):\n    ' + code + '\n'
    if language == 'javascript':
        return 'function solve(values) {\n  ' + code + '\n}\nmodule.exports = { solve };\n'
    return 'public class Solution {\n    public static int[] solve(int[] values) {\n        ' + code + '\n    }\n}\n'


def hints(template: TemplateId) -> list[str]:
    return {
        'sum': ['Was soll bei keiner Zahl herauskommen?', 'Starte mit Summe 0 und verarbeite jedes Element.', 'Aktualisiere die Summe im Schleifenrumpf und gib danach ein Array mit der Summe zurück.'],
        'maximum': ['Betrachte auch leere Eingaben und ausschließlich negative Zahlen.', 'Ein Startwert 0 eignet sich nicht als Maximum negativer Zahlen.', 'Prüfe zuerst die Länge. Verwende dann das erste Element als bisherigen größten Wert.'],
        'reverse': ['Welches Element soll als erstes im Ergebnis stehen?', 'Der letzte gültige Index ist Länge minus eins.', 'Für Ergebnisindex i liegt die Quelle bei Länge minus eins minus i.'],
        'sort': ['Reihenfolge und Häufigkeit der Werte sind zwei getrennte Bedingungen.', 'Vergleiche benachbarte Werte oder nutze die Sortierfunktion deiner Sprache.', 'In JavaScript braucht die Sortierung eine numerische Vergleichsfunktion; negative Werte sind gültig.'],
        'unique': ['Die erste Fundstelle eines Wertes bestimmt seine Position.', 'Merke dir bereits gesehene Werte und eine geordnete Ergebnisliste.', 'Füge einen Wert nur beim ersten Auftreten hinzu; eine ungeordnete Menge allein reicht nicht.'],
        'count_zero': ['Nicht jeder Wert erhöht den Zähler.', 'Prüfe jedes Element auf Gleichheit mit 0.', 'Beginne bei 0; erhöhe den Zähler ausschließlich im passenden Zweig.'],
        'factorial': ['Was ist der kleinste erlaubte Wert?', 'Die Fakultät hat einen Basisfall und einen Rekursionsschritt.', 'Behandle n = 0 mit 1 und reduziere n bei jedem rekursiven Aufruf.'],
    }[template]
