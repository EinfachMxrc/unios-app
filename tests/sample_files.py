# SPDX-License-Identifier: AGPL-3.0-or-later

"""Small, invented documents for connector and browser tests."""

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document


def sample_files() -> dict[str, bytes]:
    document = Document()
    document.add_paragraph("Erfundene Übung für den Dateityp-Test")
    docx = BytesIO()
    document.save(docx)

    spreadsheet = BytesIO()
    with ZipFile(spreadsheet, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>''')
        archive.writestr("_rels/.rels", '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''')
        archive.writestr("xl/workbook.xml", '''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Tabelle1" sheetId="1" r:id="rId1"/></sheets>
</workbook>''')
        archive.writestr("xl/_rels/workbook.xml.rels", '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>''')
        archive.writestr("xl/worksheets/sheet1.xml", '''<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Erfundene Tabelle</t></is></c></row></sheetData>
</worksheet>''')

    zip_data = BytesIO()
    with ZipFile(zip_data, "w", ZIP_DEFLATED) as archive:
        archive.writestr("README.txt", "Erfundenes ZIP-Archiv für den Dateityp-Test\n")

    # A valid 1 x 1 transparent PNG, generated without an imaging dependency.
    image = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000b49444154789c636000020000050001a5f645400000000049454e44ae426082"
    )
    return {
        "Beispiel.docx": docx.getvalue(),
        "Beispiel.xlsx": spreadsheet.getvalue(),
        "Beispiel.zip": zip_data.getvalue(),
        "Beispiel.py": b"print('Erfundene Quelle')\n",
        "Beispiel.png": image,
    }
