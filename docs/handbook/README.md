<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS-Handbuch bearbeiten

Die kurzen Quellseiten liegen in `user/` und `developer/`. Ihre Reihenfolge und Titel stehen in `navigation.json`. Die statischen HTML-Dateien unter `docs/site/user/` und `docs/site/developer/` sind generierte Ausgabe und werden mit eingecheckt, damit das Handbuch ohne Server-Build geöffnet werden kann.

Nach einer Änderung im Repository-Stamm ausführen:

```sh
python3 scripts/build_docs.py
python3 scripts/build_docs.py --check
```

Der Generator nutzt nur die Python-Standardbibliothek. Der Markdown-Umfang ist absichtlich klein: Überschriften, Absätze, Listen, Codeblöcke, Inline-Code, fettgedruckter Text und HTTPS-Links. Für neue Themen erst eine konkrete Nutzerfrage oder Entwickleraufgabe wählen und den aktuellen Ist-Stand im Repository prüfen. Unbestätigte echte Hochschul- und Geräteabläufe als manuelle Prüfung markieren.

Für eine lokale Vorschau aus dem Repository-Stamm: `python3 -m http.server 8767 --bind 127.0.0.1 --directory docs/site`, danach `http://127.0.0.1:8767/docs.html` öffnen. Die generierten Seiten funktionieren auch direkt als lokale HTML-Dateien.

Die API-Gruppen werden aus `frontend/openapi.json` erzeugt. Nach einer API-Änderung erst das OpenAPI-Schema aktualisieren, dann das Handbuch bauen. Die Gruppierung dient der Navigation; Details zu Parametern und Antworten bleiben im Schema.
