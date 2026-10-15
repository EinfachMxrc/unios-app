# SPDX-License-Identifier: AGPL-3.0-or-later
"""Small polynomial grammar built with SymPy objects, never eval/sympify/parse_expr.

Arithmetic is deliberately bounded: one variable, degree <= 6, rational coefficients.
Unknown functions or general symbolic proofs need a separate checker, not a guessed grade.
"""
import ast
from fractions import Fraction

import sympy as sp

X = sp.Symbol('x')


def polynomial(raw: str):
    if not raw.strip() or len(raw) > 128:
        raise ValueError('MATH_SYNTAX')
    tree = ast.parse(raw.replace('^', '**').strip(), mode='eval')
    if len(list(ast.walk(tree))) > 60:
        raise ValueError('MATH_LIMIT')

    def visit(node, depth=0):
        if depth > 12:
            raise ValueError('MATH_LIMIT')
        if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
            value = Fraction(str(node.value))
            if abs(value) > 10000 or value.denominator > 1000000:
                raise ValueError('MATH_LIMIT')
            return sp.Rational(value.numerator, value.denominator)
        if isinstance(node, ast.Name) and node.id == 'x':
            return X
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            child = visit(node.operand, depth + 1)
            return -child if isinstance(node.op, ast.USub) else child
        if isinstance(node, ast.BinOp):
            left = visit(node.left, depth + 1)
            right = visit(node.right, depth + 1)
            if isinstance(node.op, ast.Add):
                result = left + right
            elif isinstance(node.op, ast.Sub):
                result = left - right
            elif isinstance(node.op, ast.Mult):
                result = left * right
            elif isinstance(node.op, ast.Div) and right.is_Rational and right != 0:
                result = left / right
            elif isinstance(node.op, ast.Pow) and right.is_Integer and 0 <= right <= 6:
                result = left ** int(right)
            else:
                raise ValueError('MATH_SYNTAX')
            poly = sp.Poly(result, X)
            if poly.degree() > 6 or any(abs(coefficient) > 10 ** 12 for coefficient in poly.all_coeffs()):
                raise ValueError('MATH_LIMIT')
            return poly.as_expr()
        raise ValueError('MATH_SYNTAX')

    return sp.Poly(visit(tree.body), X)


def equation(raw: str):
    sides = raw.split('=')
    if len(sides) != 2:
        raise ValueError('MATH_EQUATION')
    return polynomial(sides[0]) - polynomial(sides[1])


def grade(expression, operation, answer, steps):
    source = polynomial(expression)
    expected = source.diff() if operation == 'derivative' else source
    checked_steps = []
    try:
        if operation == 'roots':
            if source.degree() < 1 or source.degree() > 2:
                raise ValueError('MATH_DEGREE')
            actual = {polynomial(piece).as_expr() for piece in answer.split(',')}
            if any(value.has(X) for value in actual):
                raise ValueError('MATH_CONSTANT')
            correct = actual == set(sp.solve(source.as_expr(), X))
            for step in steps:
                try:
                    value = equation(step)
                    valid = not value.is_zero and value.monic() == source.monic()
                except (ValueError, SyntaxError, sp.PolynomialError):
                    valid = None
                checked_steps.append({'equivalent': valid})
        else:
            correct = polynomial(answer) == expected
            for step in steps:
                try:
                    value = polynomial(step)
                    valid = value == expected if operation == 'derivative' else value == source
                except (ValueError, SyntaxError, sp.PolynomialError):
                    valid = None
                checked_steps.append({'equivalent': valid})
    except (ValueError, SyntaxError, sp.PolynomialError):
        return {'correct': False, 'errors': ['math_format'], 'steps': checked_steps, 'checker': 'sympy-polynomial-v1'}
    errors = [] if correct else ['math_result']
    if any(step['equivalent'] is False for step in checked_steps):
        errors.append('math_transformation')
    return {'correct': bool(correct), 'errors': errors, 'steps': checked_steps,
            'steps_complete': bool(steps) and all(step['equivalent'] is True for step in checked_steps),
            'checker': 'sympy-polynomial-v1', 'rules_checked': False}
