SPDX-License-Identifier: AGPL-3.0-or-later

UniOS – PC-Übergabe für den Server
Stand: 14.10.2026, 0.1.23, bf978b23267ab9e2e5ed1d480a343b8bae45c2f1

Das ZIP auf den PC kopieren und in einen neuen Ordner entpacken.
Python 3.10 oder neuer: im entpackten Ordner ausführen:
  python verify-package.py
Optional die geprüften Quellen in einen neuen Unterordner entpacken:
  python verify-package.py --extract source
Unter Windows gegebenenfalls „py -3“ statt „python“ benutzen.

PC-AUFTRAG.txt im Codex-Chat auf dem PC einfügen und diesen Paketordner
angeben. Darin stehen die noch notwendigen Bau-, Prüf- und Aktivierungsschritte.
Der PC braucht seinen bestehenden SSH-Zugang. Keine Passwörter oder Schlüssel
in den Chat kopieren. Bei fehlendem bekannten Hostschlüssel zuerst den echten
Fingerabdruck prüfen; niemals StrictHostKeyChecking abschalten.

Enthalten: versionierte Server-/Frontendquellen, Lockfiles, Lizenzdateien,
Prüfsumme und PC-Auftrag. Keine persönlichen Daten oder Zugangsdaten.
Das Paket installiert nichts automatisch. Der laufende Server ist unverändert.
Die Mac-App enthält bereits Vorlesungsseiten, Notizauswahl und Rechenraster.
Wirklich leere Notiztexte und exakte GPT-Seitenabrufe benötigen dieses Serverupdate.
Spätere Änderungen nach bf978b2 sind nicht Bestandteil dieses fest geprüften Pakets.

Prüfung auf dem Mac: Prüfsumme, alle Archivpfade, frisches Entpacken und
Python-Syntax bestanden. Windows-Ausführung und Docker-/Serverlauf stehen aus.
