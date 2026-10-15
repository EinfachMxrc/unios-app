// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  programHeading: 'Was studierst du?',
  programIntro:
    'Wähle deinen Studiengang und Abschluss, damit UniOS die passenden Unterlagen und Informationen für dich einliest.',
  programSelected: 'Dein Studiengang: {{name}}',
  programLoginHint:
    'Die Hochschule stellt ihren Studiengangkatalog in myCampus bereit. Melde dich zuerst dort an und wähle anschließend deinen Studiengang aus der Liste.',
  programSignIn: 'Für die Studiengangwahl bei myCampus anmelden',
  programLoginAgain: 'myCampus-Anmeldung erneuern',
  programNameLabel: 'Studiengang und Abschluss',
  programPlaceholder: 'Zum Beispiel Bachelor Betriebswirtschaft',
  programManualHint:
    'Für diese Hochschule ist noch kein Studiengangkatalog verbunden. Trage deinen Studiengang mit Abschluss ein; es gibt keine Vorauswahl.',
  programSave: 'Studiengang bestätigen',
  primussImportHint:
    'Lesbare PRIMUSS-Seiten und Dokumente werden lokal als Unterlagen gespeichert. Anmeldungen und Formulare werden ausgelassen.',
  primussImportButton: 'PRIMUSS-Unterlagen einlesen',
  reconnectMoodle: 'Moodle erneut anmelden',
  primussPartial: 'PRIMUSS wurde nur teilweise gelesen. Weitere Bereiche können fehlen.',
  primussReadProgress: '{{count}} PRIMUSS-Seiten erfasst …',
  primussLoginNeeded: 'Bitte im PRIMUSS-Fenster anmelden und danach erneut einlesen.',
  primussImportBusy: 'PRIMUSS wird gelesen …',
  primussImportResult:
    '{{pages}} Seiten und {{documents}} Dokumente gelesen · {{stored}} neue Dateiversionen gespeichert',
  welcomeEyebrow: 'Dein erster Start',
  welcomeTitle: 'Willkommen zur UniOS Alpha',
  welcomeIntro:
    'Diese Version ist noch in Entwicklung. Wir möchten herausfinden, ob UniOS im echten Studienalltag hilft.',
  welcomeNote1: 'Bitte benutze es möglichst normal.',
  welcomeNote2: 'Du musst nicht gezielt nach Fehlern suchen.',
  welcomeContinueButton: 'Weiter zur Einrichtung',
  eyebrow: 'UniOS einrichten',
  titleContinue: 'Verbindungen einrichten',
  titleStart: 'Dein Studium an einem Ort',
  passwordHint:
    'Dieses Gerät speichert deine UniOS-Daten. Wähle deine Hochschule und verbinde die verfügbaren Dienste.', // pragma: allowlist secret -- UI copy, no credential
  stepFailed: 'Dieser Schritt hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es erneut.',
  backToConnections: '← Zurück zu Verbindungen',
  step1Heading: 'Welche Hochschule besuchst du?',
  institutionSearchLabel: 'Hochschule suchen',
  institutionSearchPlaceholder: 'Name deiner Hochschule',
  institutionGroupLabel: 'Hochschule auswählen',
  plannedInProfile: 'Verfügbare Dienste: {{names}}',
  ownProfile: 'Eigenes Profil · Verbindungen ergänzen',
  showConnectionsAfterSelection: 'Verbindungen nach Auswahl anzeigen',
  selected: 'Ausgewählt',
  select: 'Auswählen',
  noInstitutionFound: 'Keine Hochschule gefunden. Probiere einen anderen Namen.',
  profileSavedRestartHint: 'Profil gespeichert. Starte UniOS neu, damit die Auswahl aktiv wird.',
  confirmInstitution: 'Hochschule bestätigen',
  saveSelection: 'Auswahl speichern',
  moodleConnectHeading: 'Moodle verbinden',
  institutionSelectedHeading: 'Hochschule ausgewählt',
  moodleIntro:
    'Liest Kurse, Unterlagen, Aufgaben und Termine. Dein Passwort gibst du nur auf der offiziellen Hochschulseite ein.',
  moodleNotSetUpForProfile:
    'Für dieses Profil ist Moodle nicht eingerichtet. Du kannst später einen passenden Verbindung ergänzen.',
  moodleLoginIntro: 'Melde dich auf der offiziellen Moodle-Seite an. Passwort und Handy-Code gibst du nur dort ein.',
  prepareMoodleLogin: 'Moodle verbinden',
  openMoodleLogin: 'Offizielle Moodle-Anmeldung im Browser öffnen →',
  openMoodleLoginWindow: 'Anmeldefenster erneut öffnen',
  loginWindowHint:
    'Die offizielle Moodle-Seite ist in einem eigenen UniOS-Fenster geöffnet. Nach der Anmeldung schließt es sich und die Verbindung wird automatisch geprüft.',
  loginWindowFailed: 'Das Anmeldefenster konnte nicht geöffnet werden. Nutze stattdessen den Browser-Link.',
  moodleLoginOpening: 'Anmeldefenster wird geöffnet …',
  moodleLoginChecking:
    'Moodle-Verbindung wird geprüft. Falls macOS eine Schlüsselbund-Freigabe anzeigt, bestätige sie dort. UniOS wartet im Hintergrund.',
  moodleLoginExpired: 'Diese Moodle-Anmeldung ist abgelaufen. Starte die Verbindung erneut.',
  moodleLoginKeychainFailed:
    'Die Moodle-Anmeldung konnte nicht im Schlüsselbund gespeichert werden. Erlaube „uniosd“ den Zugriff und versuche es erneut.',
  moodleLoginServiceFailed:
    'Der lokale UniOS-Dienst antwortet nicht mehr. Starte UniOS neu und versuche die Verbindung erneut.',
  moodleLoginFailed:
    'Die Moodle-Anmeldung konnte nicht übernommen werden. Starte die Verbindung erneut oder prüfe deinen Moodle-Mobile-Token.',
  openInBrowserInstead: 'Stattdessen im Browser öffnen',
  portalsHeading: 'Weitere Dienste deiner Hochschule',
  portalsIntro:
    'Melde dich hier bei den übrigen Diensten an, damit UniOS sie später für dich lesen kann. Passwort und Handy-Code gibst du nur auf der Seite der Hochschule ein; UniOS merkt sich nur die Anmeldung im sicheren Windows-Schlüsselbund.',
  portalsDesktopOnly: 'Die Anmeldung bei diesen Diensten ist nur in der UniOS-Desktop-App möglich.',
  portalsDataPending:
    'Stundenplan, Prüfungen und Noten liest UniOS erst, wenn die Seitenstruktur deiner Hochschule eingerichtet ist. Für Coburg ist das noch in Arbeit; die Anmeldung wird bis dahin nur vorbereitet.',
  portalMycampus: 'myCampus (Stundenplan, Veranstaltungen, News)',
  portalPrimuss: 'PRIMUSS (Prüfungen, Noten, Rückmeldung)',
  portalMycampusHint:
    'Melde dich im geöffneten Fenster an, bis du „Meine Dienste“ siehst, und klicke dann hier auf „Anmeldung übernehmen“.',
  portalPrimussHint:
    'Melde dich im geöffneten Fenster bei PRIMUSS an, bis das PRIMUSS-Menü mit deinen Studiendaten zu sehen ist, und klicke dann hier auf „Anmeldung übernehmen“.',
  portalSignIn: 'Anmeldefenster öffnen',
  portalSignInAgain: 'Erneut anmelden',
  portalTakeOver: 'Anmeldung übernehmen',
  portalConnected: 'Verbunden – die Anmeldung ist im Schlüsselbund gespeichert.',
  portalTakeOverFailed:
    'Die Anmeldung wurde noch nicht erkannt. Schließe sie im geöffneten Fenster ab und versuche es erneut.',
  portalOpenFailed: 'Das Anmeldefenster konnte nicht geöffnet werden.',
  crawlIntro:
    'UniOS kann die Seiten selbst durchgehen: Bleib angemeldet und lass das Fenster offen. UniOS öffnet nur Lese-Seiten des Portals (nie Abmelden, Anmelden, Speichern oder Löschen), merkt sie sich anonymisiert und speichert alles in einer Datei, die du prüfen kannst.',
  crawlStart: 'Automatisch erfassen',
  captureCurrentIntro:
    'UniOS erfasst die aktuell geöffnete Portalseite und speichert sie anonymisiert. Öffne weitere Seiten selbst im Anmeldefenster. Du kannst jede direkt erfassen oder mehrere Seiten unten sammeln und gemeinsam speichern.',
  captureCurrentStart: 'Geöffnete Seite erfassen',
  crawlCancel: 'Abbrechen',
  crawlProgress: '{{captured}} Seiten erfasst, {{visited}} geöffnet. Aktuell: {{label}}',
  crawlNothing: 'Es konnte keine Seite erfasst werden. Bist du angemeldet und steht das Fenster auf einer Portalseite?',
  crawlSaved:
    '{{pages}} Seiten anonymisiert gespeichert ({{files}} Datei(en)) im Ordner „{{folder}}“ in deinen Dokumenten. Prüfe sie und sag Bescheid.',
  crawlFailed:
    'Das automatische Erfassen wurde unterbrochen. Prüfe, ob das Anmeldefenster noch offen ist, und versuche es erneut.',
  sampleSummary: 'Beispielseiten für den Datenabruf erstellen',
  sampleIntro:
    'Öffne im Anmeldefenster nacheinander die Seiten, aus denen UniOS Daten lesen soll (zum Beispiel Blog, News, Stundenplan oder Noten), wähle die Seitenart und klicke jedes Mal auf „Aktuelle Seite merken“. Beim Speichern werden alle Texte, Namen, Noten, Adressen und Formulare entfernt; nur der Seitenaufbau bleibt. Die Datei kannst du vor dem Teilen selbst prüfen.',
  sampleKindLabel: 'Seitenart',
  sampleKindStart: 'Startseite',
  sampleKindBlog: 'Blog-Beitrag',
  sampleKindNews: 'News-Liste',
  sampleKindTimetable: 'Stundenplan',
  sampleKindEvents: 'Veranstaltungen',
  sampleKindExams: 'Prüfungen',
  sampleKindGrades: 'Noten',
  sampleKindEnrollment: 'Rückmeldung',
  sampleKindStudy: 'Studium',
  sampleKindOther: 'Sonstiges',
  sampleAddPage: 'Aktuelle Seite merken',
  sampleSave: 'Anonymisiert speichern',
  sampleCount: '{{done}} von {{max}} Seiten gemerkt.',
  sampleSaved:
    '{{pages}} Seiten anonymisiert gespeichert: Ordner „{{folder}}“ in deinen Dokumenten, Datei {{file}}. Prüfe sie und gib sie dann weiter.',
  sampleCaptureFailed: 'Die geöffnete Seite konnte nicht gelesen werden. Ist das Anmeldefenster noch offen?',
  sampleSaveFailed: 'Die Beispielseiten konnten nicht gespeichert werden.',
  afterLoginHint:
    'Nach dem Login darf der Browser den lokalen Login-Link öffnen. Die Verbindung wird danach automatisch geprüft.',
  returnFailedSummary: 'Die Rückkehr zur App hat nicht funktioniert',
  callbackLabel: 'Weiterleitungsadresse',
  callbackHint: 'Füge die Rücksprungadresse aus dem Login nur hier ein.',
  checkConnection: 'Verbindung prüfen',
  alreadyHaveTokenSummary: 'Ich habe bereits einen Moodle-Mobile-Token',
  tokenLabel: 'Token',
  checkToken: 'Token prüfen',
  initialSyncHeading: 'Deine Studieninhalte',
  initialSyncLoading: 'Kurse und Unterlagen werden geladen. Das kann beim ersten Mal etwas dauern.',
  initialSyncResult: '{{courses}} Kurse · {{resources}} Unterlagen · {{changes}} Änderungen gefunden.',
  initialSyncFailed: 'Der erste Abgleich hat nicht geklappt. Du kannst ihn später unter „System“ erneut starten.',
  initialSyncErrorHint: 'Eine Verbindung braucht deine Aufmerksamkeit. Die Details findest du später unter „System“.',
  step3Heading: 'Hinweise auf dem Handy',
  notificationsIntro:
    'Für Hinweise auf dem Handy abonniere diese private Adresse in der ntfy-App. Prüfe den Testhinweis, bevor du fortfährst.',
  sendTestNotification: 'Testhinweis senden',
  startWithoutNotifications: 'Ohne Handy-Hinweise starten',
  notificationsTested: 'Testhinweis wurde an ntfy gesendet. Prüfe den Empfang auf deinem Handy.',
  notificationsOff: 'Handy-Hinweise sind ausgeschaltet.',
  openUniOS: 'UniOS öffnen',
}
