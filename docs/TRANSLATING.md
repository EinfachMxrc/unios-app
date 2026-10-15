<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS übersetzen / Translating UniOS

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

UniOS unterstützt beliebig viele Oberflächensprachen. Eine neue Sprache hinzuzufügen bedeutet: einen Ordner unter `frontend/src/i18n/locales/<code>/` anlegen, übersetzen, fertig — kein anderer Code im Frontend muss dafür angefasst werden. Deutsch (`de`) ist die Quellsprache: Jeder Namensraum (jede der 47 `*.ts`-Dateien pro Sprache) ist für Deutsch vollständig, und Deutsch definiert die verbindliche Menge an Schlüsseln.

### Schritt für Schritt eine Sprache hinzufügen

1. Gerüst erzeugen (im Ordner `frontend/`):
   ```sh
   npm run i18n:new -- <code> --name "<Name in der eigenen Sprache>" [--english-name "<Englischer Name>"] [--rtl]
   ```
   Beispiel: `npm run i18n:new -- fr --name "Français" --english-name "French"`.
   `<code>` ist ein BCP-47-Sprachtag (z. B. `fr`, `pt-BR`, `zh-Hans`). Das Kommando legt `frontend/src/i18n/locales/<code>/locale.json` sowie eine Kopie jeder englischen Namensraum-Datei als Startpunkt an. `--rtl` setzt die Textrichtung auf rechts-nach-links (siehe [RTL-Hinweise](#rtl-hinweise-1) unten).
2. Jede Datei unter `frontend/src/i18n/locales/<code>/*.ts` Wert für Wert übersetzen. Die Dateien enthalten flache bzw. maximal einfach verschachtelte Objekte; Schlüssel selbst nie verändern oder übersetzen, nur die Werte. Platzhalter wie `{{count}}` oder `{{name}}` unverändert übernehmen (siehe [Interpolation](#pluralisierung--interpolation)).
3. Prüfen:
   ```sh
   npm run i18n:check -- <code>
   ```
   Meldet fehlende Schlüssel, überzählige Schlüssel, wörtlich vom Englischen übernommene (vermutlich unübersetzte) Werte, fehlende Pluralformen und falsche Interpolationsvariablen. Details siehe [Prüfregeln](#die-cli-scripts).
4. Lokal ausprobieren: `npm run dev`, dann in den Einstellungen die neue Sprache auswählen (sie erscheint automatisch im Sprachumschalter, sortiert nach ihrem eigenen Namen).
5. Pull Request öffnen (siehe [Checkliste](#pr-checkliste)).

### Die CLI-Scripts

- **`npm run i18n:new -- <code> --name "…" [--english-name "…"] [--rtl]`** — legt den Sprachordner an. Bricht ab, wenn der Ordner schon existiert oder `<code>` kein gültiger BCP-47-Tag ist.
- **`npm run i18n:check [-- <code>]`** — prüft eine einzelne oder (ohne Argument) alle Sprachen außer Deutsch gegen Deutsch. Schweregrade:
  - **Fehler** (Exit-Code ≠ 0): ein Schlüssel, den es in Deutsch nicht gibt; eine Interpolationsvariable, die nicht zur deutschen Version passt; eine ungültige `locale.json`; bei **Englisch** zusätzlich jeder fehlende Schlüssel (Englisch muss vollständig sein).
  - **Warnung** (ändert den Exit-Code nicht): ein fehlender Schlüssel (außer bei Englisch), ein Wert, der wortgleich mit seiner Vorlage ist (vermutlich vergessen zu übersetzen), oder eine fehlende Pluralform, die die Grammatik der Sprache eigentlich verlangt.
  - Die "vermutlich unübersetzt"-Prüfung vergleicht eine neue Sprache gegen **Englisch** (weil `i18n:new` von dort kopiert) und Englisch gegen **Deutsch**.

### Fallback-Kette

Fehlt ein Schlüssel in einer Sprache, sucht UniOS in dieser Reihenfolge: **eigene Sprache → Englisch → Deutsch**. Für Englisch selbst: **Englisch → Deutsch**. Deutsch hat keine weitere Fallback-Stufe — es ist selbst die letzte Stufe für alle anderen Sprachen. Eine neue Sprache muss deshalb nicht sofort vollständig sein: unübersetzte Werte zeigen automatisch die englische (und notfalls deutsche) Fassung, ohne dass die App abstürzt oder leere Texte anzeigt.

Diese Kette gilt für **Übersetzungstexte**. Die Zahlen-/Datumsformatierung (`Intl.DateTimeFormat`/`Intl.NumberFormat`) verwendet den BCP-47-Tag der aktiven Sprache selbst (bzw. `locale.json`s optionales `intlLocale`-Feld, falls gesetzt — siehe `frontend/src/api.ts`s `activeIntlLocale()`).

### Pluralisierung & Interpolation

- **Pluralformen**: i18next erwartet Schlüssel mit CLDR-Suffixen (`_one`, `_few`, `_many`, `_other`, …). Deutsch verwendet diese Suffixe nur dort, wo es grammatikalisch nötig ist (z. B. `courses.ts`s `count` bleibt unsuffigiert, weil im Deutschen dieselbe Form für Singular und Plural passt); Sprachen mit reicherer Pluralgrammatik (z. B. Polnisch, Arabisch) brauchen entsprechend mehr Formen. `npm run i18n:check` ermittelt über `Intl.PluralRules(<Sprache>).resolvedOptions().pluralCategories` genau, welche Kategorien eine Sprache braucht, sobald sie für einen Schlüssel überhaupt zu pluralisieren beginnt — eine Sprache darf einen Schlüssel unsuffigiert lassen (wie Deutsch es bei `count` tut), das ist kein Fehler.
- **Interpolation**: `{{variable}}`-Platzhalter müssen exakt mit der deutschen Version übereinstimmen (gleicher Name, gleiche Anzahl). Ein fehlender oder zusätzlicher Platzhalter ist ein harter Fehler, weil die App sonst zur Laufzeit `{{variable}}` unersetzt anzeigen oder einen benötigten Wert verlieren würde.

### RTL-Hinweise

`locale.json`s `dir: 'rtl'` setzt `<html dir="rtl">` korrekt (siehe `frontend/src/i18n/useLanguageSync.ts`), sodass Textrichtung und native Formularsteuerung des Browsers sich korrekt umkehren. **Ehrlicher Stand**: Die Komponenten-Stylesheets selbst wurden nicht auf logische CSS-Eigenschaften (`margin-inline-start` statt `margin-left` usw.) umgestellt — rund 15 CSS-Dateien verwenden noch physische `left`/`right`-Eigenschaften. Eine rechts-nach-links-Sprache bekommt also korrekte Textrichtung, aber einzelne Abstände, Ausrichtungen oder Icon-Positionen können bis zu einem gezielten CSS-Audit falsch (gespiegelt) aussehen. Aktuell wird ausschließlich über Tests (nicht im Betrieb) eine RTL-Sprache durchgespielt — es gibt keine echte dritte Sprache im ausgelieferten Build.

Ein weiterer bekannter Kompromiss: Die Sortierung des Sprachumschalters (nach nativem Namen) nutzt `Intl.Collator('en', …)` mit fest eingestelltem `en`-Gebietsschema für eine deterministische Reihenfolge unabhängig von der aktiven UI-Sprache. Das ergibt keine "echte" alphabetische Sortierung für nicht-lateinische Schriften (z. B. Arabisch), sondern eine stabile, aber schrift-naive Reihenfolge.

### Bekannte Grenzen

- **Backend-Meldungen**, **Push-Benachrichtigungen** und **iCal-Titel/-Beschreibungen** sind weiterhin ausschließlich Deutsch — sie laufen nicht über das hier beschriebene Frontend-i18n-System.
- Die PWA-Manifest-Beschreibung (`frontend/vite.config.ts`) bleibt bewusst statisch Englisch/Deutsch gemischt (siehe Kommentar dort) und folgt nicht dem Sprachumschalter.
- Neue Sprachdateien werden automatisch als eigene, code-gesplittete Chunks gebaut und vom PWA-Precaching erfasst (das Workbox-`globPattern` in `vite.config.ts` schließt jede `.js`-Datei im Build ein) — hier ist nichts manuell zu pflegen.

### PR-Checkliste

- [ ] `npm run i18n:check -- <code>` läuft ohne Fehler (Warnungen sind für eine neue, noch unvollständige Sprache normal).
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` sind grün.
- [ ] Die neue Sprache im Sprachumschalter (`npm run dev` → Einstellungen) ausprobiert.
- [ ] `locale.json`s `nativeName`/`englishName`/`dir` stimmen.
- [ ] Keine echten Namen, Zugangsdaten oder persönlichen Daten in Beispieltexten.

---

## English

UniOS supports any number of UI languages. Adding a new one means: create a folder under `frontend/src/i18n/locales/<code>/`, translate, done — no other frontend code needs to change. German (`de`) is the source language: every namespace (each of the 47 `*.ts` files per language) is complete for German, and German defines the authoritative key set.

### Adding a language, step by step

1. Scaffold it (from the `frontend/` folder):
   ```sh
   npm run i18n:new -- <code> --name "<name in that language>" [--english-name "<English name>"] [--rtl]
   ```
   Example: `npm run i18n:new -- fr --name "Français" --english-name "French"`.
   `<code>` is a BCP-47 language tag (e.g. `fr`, `pt-BR`, `zh-Hans`). This creates `frontend/src/i18n/locales/<code>/locale.json` plus a copy of every English namespace file as a starting point. `--rtl` sets the text direction to right-to-left (see [RTL notes](#rtl-notes) below).
2. Translate every value in `frontend/src/i18n/locales/<code>/*.ts`. Files are flat or at most one level nested; never rename or translate the keys themselves, only the values. Leave placeholders like `{{count}}` or `{{name}}` untouched (see [interpolation](#pluralization--interpolation)).
3. Check your work:
   ```sh
   npm run i18n:check -- <code>
   ```
   Reports missing keys, extra keys, values copied verbatim from English (likely forgotten translations), missing plural forms, and mismatched interpolation variables. See [the CLI scripts](#the-cli-scripts) for exact severity rules.
4. Try it locally: `npm run dev`, then pick the new language in Settings (it appears in the switcher automatically, sorted by its own native name).
5. Open a pull request (see [checklist](#pr-checklist)).

### The CLI scripts

- **`npm run i18n:new -- <code> --name "…" [--english-name "…"] [--rtl]`** — scaffolds the language folder. Refuses to run if the folder already exists or `<code>` is not a valid BCP-47 tag.
- **`npm run i18n:check [-- <code>]`** — checks one language, or (with no argument) every language except German, against German. Severity:
  - **Error** (non-zero exit): a key that doesn't exist in German; an interpolation variable that doesn't match German; an invalid `locale.json`; and, for **English** specifically, any missing key at all (English must stay complete).
  - **Warning** (does not affect the exit code): a missing key (for any language other than English), a value identical to its source copy (likely forgotten), or a missing plural form the language's own grammar actually requires.
  - The "possibly untranslated" check compares a new language against **English** (since `i18n:new` copies from it) and compares English against **German**.

### Fallback chain

When a key is missing in a language, UniOS looks it up in this order: **that language → English → German**. For English itself: **English → German**. German has no further fallback — it is the last resort for every other language. A new language therefore never needs to be complete from day one: untranslated values automatically show the English (or, failing that, German) text instead of crashing or rendering blank.

This chain is for **translated text**. Number/date formatting (`Intl.DateTimeFormat`/`Intl.NumberFormat`) uses the active language's own BCP-47 tag (or `locale.json`'s optional `intlLocale` override, when set — see `activeIntlLocale()` in `frontend/src/api.ts`).

### Pluralization & interpolation

- **Plural forms**: i18next expects CLDR-suffixed keys (`_one`, `_few`, `_many`, `_other`, …). German only uses these suffixes where its own grammar actually needs them (e.g. `courses.ts`'s `count` stays unsuffixed because German uses the same form for singular and plural); a language with richer plural grammar (Polish, Arabic, …) needs correspondingly more forms. `npm run i18n:check` determines exactly which categories a language needs via `Intl.PluralRules(<language>).resolvedOptions().pluralCategories`, once that language has started pluralizing a given key at all — a language is allowed to leave a key unsuffixed (as German does for `count`); that's not an error.
- **Interpolation**: `{{variable}}` placeholders must exactly match German's (same name, same count). A missing or extra placeholder is a hard error, because at runtime the app would otherwise either show a literal `{{variable}}` or silently drop a value it needed.

### RTL notes

Setting `dir: 'rtl'` in `locale.json` correctly sets `<html dir="rtl">` (see `frontend/src/i18n/useLanguageSync.ts`), so text direction and the browser's own form controls flip correctly. **Honest status**: the component stylesheets themselves have not been converted to logical CSS properties (`margin-inline-start` instead of `margin-left`, etc.) — roughly 15 CSS files still use physical `left`/`right` properties. A right-to-left language therefore gets correct text direction, but individual paddings, alignment, or icon placement may look wrong (mirrored) until a dedicated CSS audit happens. Right now an RTL language is only exercised in tests (a fixture locale, not shipped in `src/`) — there is no real third language in the shipped build yet.

Another known trade-off: the language switcher sorts by native name using `Intl.Collator('en', …)` with a fixed `en` locale, for a deterministic order independent of the active UI language. This does not produce "true" alphabetical order for non-Latin scripts (e.g. Arabic) — it's a stable but script-naive ordering.

### Known limitations

- **Backend messages**, **push notifications**, and **iCal titles/descriptions** remain German-only — they do not go through the frontend i18n system described here.
- The PWA manifest description (`frontend/vite.config.ts`) is deliberately static (a fixed English/German mix — see the comment there) and does not follow the language switcher.
- New language files are automatically built as their own code-split chunks and picked up by PWA precaching (the Workbox `globPattern` in `vite.config.ts` matches every built `.js` file) — nothing needs manual upkeep there.

### PR checklist

- [ ] `npm run i18n:check -- <code>` runs with no errors (warnings are normal for a new, not-yet-complete language).
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` are all green.
- [ ] Tried the new language in the switcher (`npm run dev` → Settings).
- [ ] `locale.json`'s `nativeName`/`englishName`/`dir` are correct.
- [ ] No real names, credentials, or personal data in example text.
