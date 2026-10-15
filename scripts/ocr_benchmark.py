# SPDX-License-Identifier: AGPL-3.0-or-later
"""Measure a real raster-only PDF through local OCR, with entirely fake data."""
import argparse
import json
import platform
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pymupdf
from sqlalchemy import select

from app.corpus.incremental_schema import install as install_incremental
from app.corpus.schema_v1 import install
from app.db.models import Base, Course, Resource, ResourceText, ResourceVersion
from app.db.session import make_engine, make_session_factory
from app.extract.isolated import parse_path
from app.extract.ocr_repository import OCRRepository
from app.extract.ocr_service import OCRService, local_tessdata
from app.release_lab.worker import SyntheticSettings


def benchmark():
    language = local_tessdata()
    result = {'_spdx': 'AGPL-3.0-or-later', 'fixture_only': True,
              'os': platform.system(), 'python': platform.python_version(),
              'available': language is not None, 'state': 'unavailable',
              'limits': 'One generated raster-only page; no real scans, accounts or native-device acceptance.'}
    if language is None:
        result['reason'] = 'No local German or English Tesseract language data.'
        return result
    with TemporaryDirectory(prefix='unios-ocr-fixture-') as folder:
        root = Path(folder)
        settings = SyntheticSettings(data_dir=root / 'shared', local_dir=root / 'private',
                                     mcp_token='invented-ocr-identity', moodle_enabled=False)
        settings.data_dir.mkdir()
        engine = make_engine(settings)
        try:
            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                install(connection)
                install_incremental(connection)
            source = settings.data_dir / 'invented-scan.pdf'
            with pymupdf.open() as original, pymupdf.open() as scanned:
                page = original.new_page()
                page.insert_text((60, 100), 'Rekursion endet mit einem Basisfall.', fontsize=20)
                image = page.get_pixmap(matrix=pymupdf.Matrix(2, 2)).tobytes('png')
                scanned.new_page().insert_image(page.rect, stream=image)
                scanned.save(source)
            parsed = parse_path(source, source.name, 'application/pdf')
            if len(parsed) != 1 or parsed[0].text.strip():
                raise RuntimeError('Fixture must contain only a raster image')
            factory = make_session_factory(engine)
            with factory() as session:
                course = Course(source='fixture', source_id='ocr', name='Erfundener Kurs')
                session.add(course)
                session.flush()
                resource = Resource(source='fixture', source_key='ocr', course_id=course.id,
                                    name='Erfundener Scan', kind='file', url='')
                session.add(resource)
                session.flush()
                version = ResourceVersion(resource_id=resource.id, version=1, sha256='a' * 64,
                                          relative_path=source.name, size=source.stat().st_size, mime_type='application/pdf')
                session.add(version)
                session.flush()
                version_id = version.id
                session.add(ResourceText(version_id=version_id, page_number=1, text='', no_text_layer=True))
                session.commit()
            service = OCRService(OCRRepository(factory), settings)
            started = perf_counter()
            state = service.process(version_id)
            result.update(state='completed', seconds=perf_counter() - started,
                          language=language[1], recognized_pages=state.recognized_pages)
            with factory() as session:
                value = session.scalar(select(ResourceText.text).where(ResourceText.version_id == version_id))
                result['expected_words_found'] = all(word in value.casefold() for word in ('rekursion', 'basisfall'))
            return result
        finally:
            engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = benchmark()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
