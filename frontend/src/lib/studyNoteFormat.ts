// SPDX-License-Identifier: AGPL-3.0-or-later

/** Plain Markdown instructions that external GPTs can use without HTML or custom scripts. */
export const studyNoteFormat = `Gestalte den Entwurf wie ein gut lesbares Lernbuch, ohne Folieninhalte wegzukürzen:
- Gliedere den Stoff nach Themen und bearbeiteten Seiten; erhalte Formeln, Bedingungen, Tabellen und wesentliche Herleitungen.
- Nutze sparsam UniOS-Lernkästen im portablen Markdown-Format, jeweils auf eigenen Zeilen:
:::callout {kind="memory" label="Kurzer eigener Titel"}

Inhalt mit **Schlüsselbegriffen**, Formeln und konkretem Seitenbeleg.

:::
- Arten: definition = präziser Begriff; memory = kurzer Merksatz; example = schrittweise Beispielrechnung; tip = Lernhilfe; pitfall = typischer Fehler; warning = wichtige Voraussetzung; question = offene Frage; summary = Zusammenfassung; note = ergänzende Info.
- Keine verschachtelten Kästen und nicht jeden Absatz hervorheben. Titel kurz halten. Formeln als $...$ oder $$ auf separaten Zeilen schreiben, nicht als HTML.
- Hebe nur wenige Schlüsselwörter mit ==Text== hervor. Farben optional: =={green}Text==, =={blue}Text==, =={pink}Text==; Gelb ist Standard. Code und Formeln unverändert lassen.
- Längere ergänzende Herleitungen oder Antworten auf Selbsttestfragen können in einen einklappbaren Abschnitt: :::fold {label="Herleitung Schritt für Schritt"}, Leerzeile, normaler Markdown-Inhalt, Leerzeile, :::. Jeder Begrenzungsmarker steht auf einer eigenen Zeile. Die wesentlichen Aussagen bleiben außerhalb sichtbar.
- Kennzeichne ergänzte Beispiele und Merkhilfen ausdrücklich als eigene Erklärung; behaupte keine Prüfungsrelevanz, die aus den Quellen nicht hervorgeht.
- Verlinke konkrete Folienseiten bei jeder Definition, Herleitung und inhaltlichen Zusammenfassung. Unlesbare Bilder, fehlende Seiten und ungeklärte Fragen sichtbar benennen.
- Ende mit einer knappen Zusammenfassung und wenigen Selbsttestfragen ohne sofort vorweggenommene Antworten.`
