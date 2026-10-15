<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Gescannte PDFs

Ein Scan enthält oft nur Bilder. Die normale Textsuche kann darin erst nach einer lokalen Texterkennung zuverlässig suchen.

## Texterkennung starten

UniOS nutzt für diesen Fall Tesseract auf dem eigenen Gerät. Ist Tesseract nicht installiert, bleibt das PDF lesbar, aber Bildtext lässt sich nicht als Volltext finden. Die genaue Installation und die Grenzen des Verfahrens stehen in der [OCR-Anleitung](https://github.com/EinfachMxrc/unios-app/blob/main/docs/OCR.md).

## Ergebnis kontrollieren

Texterkennung kann Formeln, Tabellen und schlechte Scans falsch lesen. Vergleiche wichtige Treffer mit der sichtbaren PDF-Seite. Prüfungen auf eigenen Geräten und eigenen Scans stehen in der [manuellen Testliste](https://github.com/EinfachMxrc/unios-app/blob/main/docs/MANUELL_TESTEN.md).
