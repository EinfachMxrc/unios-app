<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Lokale Texterkennung für gescannte PDFs

UniOS zeigt im PDF-Reader **„Text für Suche erkennen“**, wenn eine Seite keine auslesbare Textebene hat. Die Erkennung startet nur nach diesem Klick oder mit `unios ocr <versions-id>`. Der normale Hochschulabgleich wartet daher nicht auf OCR.

PyMuPDF nutzt dafür lokal Tesseract und dessen Sprachdateien. Auf dem Gerät müssen Tesseract und mindestens `deu.traineddata` oder `eng.traineddata` eingerichtet sein. Sind beide vorhanden, verwendet UniOS Deutsch und Englisch. Die [PyMuPDF-Anleitung](https://pymupdf.readthedocs.io/en/latest/recipes-ocr.html) erklärt die Voraussetzungen und die [Sprachpakete](https://pymupdf.readthedocs.io/en/latest/ocr/tesseract-language-packs.html). Eine externe OCR-API wird nicht aufgerufen.

Die Original-PDF bleibt unverändert. Erkannter Text wird pro Seite im lokalen Suchindex gespeichert; er ist anschließend in der globalen Suche auffindbar. Das Original erhält dadurch keine neue PDF-Textebene, und die Reader-Suche im Original kann weiterhin nichts finden. Leere Seiten werden als versucht markiert, damit ein erneuter Klick keine Endlosschleife auslöst. Pro Anfrage werden höchstens fünf Seiten verarbeitet, während die Oberfläche die restlichen Anfragen nacheinander stellt.

Vor Migration `fa25d6e7f809` an einer persönlichen Datenbank zuerst den geprüften Snapshot erstellen und den Host anhalten.
