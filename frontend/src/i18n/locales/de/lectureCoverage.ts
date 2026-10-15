// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
  title: 'Heute bearbeitet',
  description: 'Halte Datum und PDF-Seiten dieser Vorlesung fest. Eigener Mitschrifttext ist dafür nicht nötig.',
  source: 'Quelle für diese Vorlesung',
  chooseSource: 'PDF wählen',
  noSources: 'Öffne ein Kurs-PDF, um die bearbeiteten Seiten neben der Mitschrift festzuhalten.',
  sourcesPartial:
    'Hier sind die geladenen Kursdateien sichtbar. Weitere Quellen kannst du direkt im Kurs-PDF mit einer Mitschrift bearbeiten.',
  version: 'Version {{version}}',
  date: 'Vorlesungsdatum',
  pages: 'Bearbeitete PDF-Seiten',
  pagesHint:
    'PDF-Seitennummern im Dokument, nicht gedruckte Foliennummern. Beispiel: 5-12, 18. Seiten im PDF: {{count}}.',
  record: 'Seiten festhalten',
  copy: 'Auftrag für GPT kopieren',
  recorded:
    'Seitenangaben in die Mitschrift übernommen. Speichere eine neue Mitschrift, damit sie dauerhaft verfügbar sind.',
  copied: 'Seitenangaben übernommen und Auftrag kopiert. Du kannst ihn mit freigegebenen Quellen in GPT verwenden.',
  copyFailed: 'Die Seitenangaben bleiben erhalten. Der Auftrag konnte nicht in die Zwischenablage kopiert werden.',
  error_date: 'Bitte ein gültiges Vorlesungsdatum wählen.',
  error_pages: 'Bitte Seiten angeben, zum Beispiel 5-12, 18.',
  error_range: 'Die Seiten müssen im geöffneten PDF liegen; der Bereich muss aufsteigend sein.',
  error_limit: 'Bitte höchstens 200 PDF-Seiten je Vorlesung festhalten.',
  error_document: 'Die Seitenangaben passen nicht mehr in diese Mitschrift oder die Quelle ist unvollständig.',
} as const
