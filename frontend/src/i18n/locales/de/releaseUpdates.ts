// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
  title: 'UniOS aktualisieren',
  intro: 'Wähle, welche geprüften Veröffentlichungen du erhalten möchtest. Es wird nichts automatisch installiert.',
  channel: 'Updatekanal',
  stable: 'Stabil',
  beta: 'Beta',
  nightly: 'Nightly',
  stableHelp: 'Für den täglichen Einsatz. Nur freigegebene stabile Versionen.',
  betaHelp: 'Vorabversionen für Tests. Erstelle zusätzlich eine vollständige Sicherung.',
  nightlyHelp: 'Experimentelle Entwicklungsstände. Nutze einen getrennten Testbestand.',
  check: 'Nach Update suchen',
  install: 'Sichern und Update installieren',
  checking: 'Version und Kompatibilität werden geprüft …',
  available: 'Version {{version}} ist verfügbar.',
  current: 'Keine neuere kompatible Version gefunden.',
  unavailable: 'Dieser Kanal ist derzeit nicht verfügbar oder der Build unterstützt keine signierten Updates.',
  incompatible:
    'Dieses Update passt nicht zur App-Version oder zum Server-Schema. Aktualisiere zuerst den unterstützten Serverstand.',
  failed: 'Das Update wurde nicht installiert. Prüfe Verbindung und Sicherung, dann suche erneut nach Updates.',
  preparing: 'Sicherung wird erstellt und geprüft. Danach startet das signierte Update.',
  schema: 'Dieses Paket erwartet einen anderen Schema-Stand. Ein Schema-Downgrade wird nicht automatisch durchgeführt.',
  policy:
    'Vor jeder Installation wird eine neue Sicherung geprüft. Signatur und signierte Paketversion werden kontrolliert; experimentelle Kanäle erlauben keinen automatischen Rückschritt.',
  notes: 'Änderungen',
} as const
