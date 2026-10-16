# SPDX-License-Identifier: AGPL-3.0-or-later
"""Background indexing of immutable saved commits; never execute repository code."""

import ast
import io
from pathlib import PurePosixPath
from zipfile import ZipFile

from app.projects.repo_content import archive_snapshot


def code_pages(settings, snapshot, guard):
    archive = archive_snapshot(settings, snapshot.project_id, snapshot.head)
    pages, outline, total = [], [], 0
    with ZipFile(io.BytesIO(archive)) as bundle:
        for member in sorted(bundle.infolist(), key=lambda item: item.filename):
            guard()
            path = PurePosixPath(member.filename)
            if len(pages) >= 10000 or total >= 20_000_000:
                raise ValueError('CODE_INDEX_LIMIT')
            if (member.is_dir() or member.file_size > 1_000_000 or '..' in path.parts
                    or any(part.startswith('.') or part in {'node_modules', 'vendor', 'data', 'local'} for part in path.parts)
                    or path.suffix.lower() not in {'.py', '.ts', '.tsx', '.js', '.jsx', '.rs', '.go', '.java', '.c', '.h', '.cpp'}):
                continue
            raw = bundle.read(member)
            total += len(raw)
            try:
                source = raw.decode('utf-8')
            except UnicodeError:
                continue
            if '\0' in source:
                continue
            # Python symbols are parsed structurally; other languages retain a file
            # index explicitly marked as text, without claiming symbol precision.
            name = str(path.relative_to('projekt'))
            page = len(pages) + 1
            if path.suffix == '.py':
                try:
                    tree = ast.parse(source)
                except (SyntaxError, RecursionError):
                    tree = None
                if tree is not None:
                    lines = source.splitlines()
                    imports = [ast.unparse(n) for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))]
                    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
                    def qualified_name(node, parents=parents):
                        names = [node.name]
                        parent = parents.get(node)
                        while parent is not None:
                            if isinstance(parent, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                                names.append(parent.name)
                            parent = parents.get(parent)
                        return '.'.join(reversed(names))
                    pages.append((page, f'# {name}\n' + '\n'.join(imports)))
                    outline.append({'title': name, 'level': 1, 'page': page, 'origin': 'python_imports', 'file': name,
                                    'imports': imports[:100]})
                    for node in ast.walk(tree):
                        if not isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                            continue
                        page = len(pages) + 1
                        body = '\n'.join(lines[node.lineno - 1:node.end_lineno])
                        references = sorted({n.id for n in ast.walk(node) if isinstance(n, ast.Name)})
                        calls = sorted({ast.unparse(n.func)[:200] for n in ast.walk(node) if isinstance(n, ast.Call)})
                        pages.append((page, (f'# {node.name}\nFile: {name}\nLines: {node.lineno}-{node.end_lineno}\n'
                                      f'Kind: {type(node).__name__}\nReferences: {", ".join(references)}\n{body}')))
                        outline.append({'title': node.name, 'level': 1, 'page': page, 'origin': 'python_ast',
                                        'file': name, 'start_line': node.lineno, 'end_line': node.end_lineno,
                                        'symbol_kind': type(node).__name__, 'references': references[:100],
                                        'qualified_name': qualified_name(node), 'calls': calls[:100],
                                        'is_test': node.name.startswith('test_') or path.name.startswith('test_')
                                                   or 'tests' in path.parts})
                    continue
            pages.append((page, f'# {name}\nIndex: file_text\n{source}'))
            outline.append({'title': name, 'level': 1, 'page': page, 'origin': 'file_text', 'file': name})
    if sum(len(body.encode()) for _, body in pages) > 64 * 1024 * 1024:
        raise ValueError('CODE_INDEX_TEXT_LIMIT')
    # Syntactic candidates, never claim runtime resolution of dynamic calls.
    by_name = {}
    for entry in outline:
        if entry.get('qualified_name'):
            by_name.setdefault(entry['title'], []).append(entry)
    for entry in outline:
        candidates = []
        for called in entry.get('calls', []):
            # A bare symbol can be associated only if the snapshot has one
            # definition. Qualified/dynamic calls remain in `calls` verbatim.
            matches = by_name.get(called, [])
            if len(matches) == 1:
                candidates.append(matches[0])
        for target in candidates:
            target.setdefault('caller_candidates', [])
            if len(target['caller_candidates']) < 50:
                target['caller_candidates'].append({'file': entry['file'], 'symbol': entry['qualified_name'],
                                                     'start_line': entry['start_line'], 'is_test': entry['is_test']})
    return pages, outline
