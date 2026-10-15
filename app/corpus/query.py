# SPDX-License-Identifier: AGPL-3.0-or-later
"""Lexical question normalization and existing structured search operators."""

import re

from fastapi import HTTPException

from app.extract.search import QUESTION_STOPWORDS, search_expression
from app.search.query import parse

INTENT_WORDS = QUESTION_STOPWORDS | {'erkläre', 'erklaere', 'erklärt', 'erklaert', 'erklären',
                                    'explain', 'find', 'definition', 'gibt', 'es', 'wo', 'was', 'wie'}

# Small transparent lexical vocabulary, not semantic inference or embeddings.
# Expand individual domain terms inside the existing AND/OR groups. Do not
# rewrite an entire benchmark question or change scope/ACL/ranking predicates.
LEXICAL_GROUPS = (
    ('Rekursion', 'recursion', 'rekursiv', 'rekursive', 'rekursiven', 'recursive',
     'recursively', 'selbstaufrufend', 'selbstaufrufende', 'selbstaufrufenden'),
    ('Basisfall', 'Basisfälle', 'Basisfaelle', 'Abbruchbedingung', 'Abbruchbedingungen',
     'Abbruchfall', 'Stoppregel', 'Stoppregeln', 'basecase', 'stoppingcondition'),
    ('Binärbaum', 'Binaerbaum', 'binarytree'),
    ('Kinder', 'child', 'children', 'Nachfolger', 'Nachfolgern', 'Kindknoten'),
)
TERM_ALIASES = {term.casefold(): group for group in LEXICAL_GROUPS for term in group}


def _expanded_term(match):
    original = match.group(1)
    aliases = TERM_ALIASES.get(original.casefold())
    if aliases is None:
        return match.group(0)
    terms = dict.fromkeys([original, *aliases])
    return '(' + ' OR '.join('"' + term + '"' for term in terms) + ')'


def expression(query):
    words = [word for word in re.findall(r'\w+', query) if word.casefold() not in INTENT_WORDS]
    lexical = search_expression(' '.join(words))
    return re.sub(r'"(\w+)"', _expanded_term, lexical)


def normalize(request):
    if not re.search(r'\b(?:course|semester|type|has|before):', request.query):
        return request
    try:
        parsed = parse(request.query)
        scope = request.scope.model_dump()
        for key in ('course', 'semester', 'before'):
            value = getattr(parsed, key)
            if value is not None:
                if scope[key] is not None and str(scope[key]) != str(value):
                    raise ValueError('Widersprüchlicher Suchfilter: ' + key)
                scope[key] = str(value)
        aliases = {'document': 'resource', 'material': 'resource', 'annotation': 'question', 'course_note': 'note'}
        kind = aliases.get(parsed.kind, parsed.kind)
        types = request.types
        if kind:
            if types and kind not in types:
                raise ValueError('Widersprüchlicher Inhaltstyp')
            types = [kind]
        if parsed.questions:
            types = ['question']
        return type(request).model_validate({**request.model_dump(), 'query': parsed.text, 'scope': scope, 'types': types})
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
