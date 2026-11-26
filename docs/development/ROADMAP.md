# Roadmap & Funktionsbewertung – SimplySound

> **Stand:** 26.11.2026 | **Basisversion:** `v1.1.9` (`c3aaf471b2452c11c37d326703a5e820b6995fa3`)  
> **Hinweis:** Alle Vorschläge in diesem Dokument sind Entscheidungsgrundlagen – umgesetzt wird erst nach gemeinsamer Abstimmung.

## 1. Bestandsaufnahme und Bewertung aller Ideen (Phase 4)

| Funktion | Status in `v1.1.9` | Qualität / Lücken | Nutzen | Aufwand | Risiko | Architektur-Kompatibilität |
|---|---|---|---|---|---|---|
| **Frei konfigurierbare Soundbuttons** | Vorhanden | Name, Button-Titel, Coverbild, Lautstärke, Mode, Trim, Hotkey vorhanden; keine Farben/Icons in WebUI | Hoch | Gering | Gering | Sehr hoch (`Models.cs`, `main.jsx`) |
| **Kategorien und Favoriten** | Fehlt | Nur flache Liste in SQLite | Hoch | Mittel | Gering | Hoch (`Sound` + UI-Tabs/Filter) |
| **Drag-and-drop-Sortierung** | Vorhanden | Gut umgesetzt via Arrange-Modus (Pointer Events) + atomare SQLite-Speicherung | Hoch | – | – | Bereits vorhanden |
| **Individuelle Icons und Vorschaubilder** | Teilweise | Coverbilder (PNG/JPEG/WebP bis 5 MB) top umgesetzt; `Icon` (Emoji) existiert nur in Legacy-WPF | Mittel | Gering | Gering | Sehr hoch |
| **Globale Tastenkombinationen** | Vorhanden | Funktioniert via Electron `globalShortcut`, aber nur `Ctrl+Alt+<Key>`, 3-s-Polling, kein Stop-Hotkey | Hoch | Gering | Gering | Sehr hoch (`Models.cs`, `electron/main.cjs`) |
| **Individuelle Lautstärke pro Sound** | Vorhanden | Sehr gut (Inline-Popover + Editor + 5-ms-Rampe live während Wiedergabe) | Hoch | – | – | Bereits vorhanden |
| **Globale Lautstärkeregelung** | Vorhanden | Im Electron-Audio-Tab vorhanden; fehlt als Schnellzugriff auf dem Web-Soundboard | Hoch | Gering | Gering | Sehr hoch (`PATCH /api/settings`) |
| **Sofortiges Stoppen aller Sounds** | Teilweise | Backend `POST /api/stop` existiert, aber **Button fehlt in WebUI & Electron** (und kein globaler Stop-Hotkey)! | **Sehr hoch** | **Sehr gering** | **Sehr gering** | **Nativ vorhanden** |
| **Gleichzeitige Audiowiedergabe (Polyphonie)** | Fehlt | Bewusst Single-Stream (`SwitchingWaveProvider`); neuer Sound bricht vorherigen ab | Mittel–Hoch | Mittel–Hoch | Mittel | Gut machbar (Mixer statt `SwitchingWaveProvider`) |
| **Audio-Fade-in und Fade-out** | Fehlt | `GainSampleProvider` hat bereits 5-ms-Rampe als perfekte Grundlage | Mittel | Gering–Mittel | Gering | Sehr hoch (`LowLatencyAudio.cs`) |
| **Zuschneiden von Audiodateien** | Vorhanden | Nicht-destruktives Start/End-Trimmen in Sekunden vorhanden; noch ohne visuelle Wellenform | Hoch | Mittel (für Wellenform) | Gering | Sehr hoch |
| **Normalisierung der Lautstärke** | Fehlt | Unterschiedlich laute Clips müssen manuell per `OutputGain` angeglichen werden | Hoch | Mittel | Gering | Hoch (Analyse beim Import in `SoundLibrary.cs`) |
| **Import und Export von Soundbibliotheken** | Fehlt | Kein ZIP-Backup/Export; Umzug auf neuen PC erfordert manuelles Kopieren von `%LOCALAPPDATA%\SimplySound` | **Sehr hoch** | Mittel | Gering | Hoch (`Storage.cs` + REST-Endpunkte) |
| **Echte Daten-Portabilität (Portable-Modus)** | Fehlt | Portable-EXE nutzt trotzdem `%LOCALAPPDATA%` und `%APPDATA%` | **Sehr hoch** | Mittel | Mittel (Firewall-Pfad beachten) | Hoch (`Storage.cs` hat bereits Konstruktor-Param!) |
| **Profile für unterschiedliche Einsatzzwecke** | Fehlt | Z. B. „Büro“ vs. „Gaming“; lässt sich gut über Kategorien oder separate Profile abbilden | Mittel | Mittel–Hoch | Gering | Mittel–Hoch |
| **Such- und Filterfunktionen** | Fehlt | Nur im MyInstants-Marketplace, nicht in der eigenen Bibliothek; zudem blendet `density` Kacheln aus | **Sehr hoch** | **Gering** | **Sehr gering** | Sehr hoch (Client-side in `main.jsx`) |
| **Automatische Sicherung der Einstellungen** | Fehlt | Kein Auto-Backup von `library.db` (nur Early-Beta-Warnhinweis in Release-Notes) | Mittel–Hoch | Gering | Sehr gering | Sehr hoch (`Storage.cs`) |
| **Lokale Websteuerung** | Vorhanden | Sehr gut (PC-Browser + Handy-Web-App mit QR-Code & Tailscale) | Hoch | – | – | Bereits vorhanden |
| **REST-API** | Vorhanden | Vollständig und sauber unter `/api/*`; könnte bei Bedarf dokumentiert/versioniert werden | Hoch | Gering (Doku) | Sehr gering | Bereits vorhanden |
| **WebSocket-Schnittstelle** | Vorhanden | `/ws` für Echtzeit-Events bereits aktiv (derzeit nur Server→Client-Push) | Hoch | Gering (für Bidirektionalität) | Gering | Bereits vorhanden |
| **Stream-Deck-Anbindung** | Fehlt | Über bestehende REST-API (`POST /api/sounds/{id}/play`, `POST /api/stop`) leicht anbindbar (API-Doku oder Plugin) | Mittel | Gering–Mittel | Gering | Sehr hoch (REST-API steht) |
| **Home-Assistant-Anbindung** | Fehlt | Per REST-Command sofort nutzbar, falls API-Token / lokale IP stabil; optional MQTT/Webhook | Niedrig–Mittel | Gering–Mittel | Gering | Hoch |
| **Steuerung über externe Programme** | Teilweise | Über lokale REST-API (`http://127.0.0.1:6769/api/...`) bereits heute möglich (ohne Pairing-Token auf Loopback!) | Mittel | Gering (CLI/Doku) | Sehr gering | Sehr hoch |
| **System-Tray & Minimize-to-Tray (Electron)** | Fehlt | Nur in Legacy-WPF vorhanden; Electron beendet App beim Schließen des Fensters | Hoch (Büro-Alltag!) | Gering | Gering | Sehr hoch (`electron/main.cjs`) |
| **Optimierung der Startzeit** | Verbesserbar | Backend-Extraktion cached via Fingerprint; aber WPF+WinForms-Overhead + 180-ms-Polling | Mittel | Mittel | Mittel | Mittel |
| **Reduzierung des Arbeitsspeicherverbrauchs** | Verbesserbar | Electron (Chromium) + .NET 10 + WPF-Host; moderates Einsparpotenzial ohne Architekturwechsel | Niedrig–Mittel | Hoch | Mittel | Begrenzt durch Electron-Basis |
| **Verbesserte Fehlerbehandlung** | Teilweise | Kern gut, aber `backend.kill()`, ungeschützte `File.Delete`, WPF-`MessageBox` im Headless-Modus | Hoch | Gering | Sehr gering | Sehr hoch |

---

## 2. Priorisierte Entwicklungs-Roadmap (Empfehlung)

### Stufe 0 – Entwicklungsumgebung & Verifikation (Voraussetzung)
1. **.NET 10 SDK** (`10.0.100+`) und **Node.js `>= 22.12.0`** lokal installieren.
2. Unveränderten Originalstand (`main`) vollständig bauen (`npm run dist` in `electron/`) und alle Tests (`dotnet test` + `npm test`) grün laufen lassen.
3. Optional: Lokalen NTFS-Build-Pfad außerhalb von Google Drive prüfen, falls Builds auf `G:\` zu langsam oder durch Sync blockiert sind.

### Stufe 1 – Persönliche Sound-Erweiterungen (Phase 3, ohne Codeänderung)
- Deine drei Wunsch-Sounds direkt in SimplySound 1.1.9 importieren und konfigurieren:
  1. **Der Zonk**
  2. **Blue Oyster Bar** (*El Bimbo*, optional getrimmt, Modus `Toggle`)
  3. **Edward Simoni – Panflöten-Intro** (genauen Ausschnitt per Start/End-Trim festlegen)
- Hinweis: Keine geschützten Audiodateien ins Git-Repository aufnehmen.

### Stufe 2 – Schnelle, hochwirksame Verbesserungen („Quick Wins“, auch sehr PR-fähig für Upstream!)
1. **Sofortiger „Stop All“-Button in Web-Soundboard & Electron + globaler Stop-Hotkey:** Schließt die größte Bedienlücke (insb. bei längeren Clips wie *Blue Oyster Bar* oder im `Retrigger`-Modus).
2. **Suche im eigenen Soundboard + Behebung des `density`-Abschneidens:** Live-Suchfeld in `main.jsx` + Scrollbarkeit/Zugriff auf alle Sounds auch bei kleinen Bildschirmen.
3. **Graceful Backend-Shutdown & Robustheits-Fixes:**
   - Sauberes Herunterfahren von `VRSoundboard.exe` vor `backend.kill()` (statt hartem Abbruch).
   - Keine blockierende WPF-`MessageBox` im `--electron-backend`-Modus.
   - Sicheres `TryDeleteAsset` auch bei Coverbildern und Import-Fehlern.
   - Automatische Cache-Regenerierung aus `sounds/<id>.<ext>`, falls `cache/<id>.wav` fehlt.

### Stufe 3 – Portabilität, Datensicherheit & Büro-Komfort
1. **Echter Portable-Datenmodus (Opt-in):**
   - Wenn neben der Portable-EXE (`PORTABLE_EXECUTABLE_DIR`) ein Ordner `SimplySoundData/` (oder Marker `portable.txt`) existiert, werden Datenbank, Sounds, Bilder, Logs und Electron-Einstellungen vollständig dort gespeichert (über CLI-Argument `--data-dir=...` an `Storage`).
   - Bestehende Installationen ohne Marker behalten 100 % abwärtskompatibel `%LOCALAPPDATA%\SimplySound`.
2. **Import/Export & automatisches Backup der Bibliothek:**
   - Ein-Klick-Export/Import als `.zip`-Archiv (SQLite + `sounds/` + `images/`, ohne redundanten WAV-Cache) sowie automatisches Rolling-Backup von `library.db`.
3. **System-Tray / „Minimize to Tray“ in Electron:**
   - Ideal für den Büro-Alltag: Soundboard läuft unauffällig im Infobereich weiter, Hotkeys und Handy-Steuerung bleiben aktiv.

### Stufe 4 – Erweiterte Soundboard- & Audio-Funktionen (nach Bedarf)
1. **Kategorien / Tabs & Favoriten** (z. B. *Büro*, *Effekte*, *Musik*, *Favoriten*).
2. **Audio-Komfort:** Fade-in / Fade-out (inkl. sanftem Ausblenden beim Stoppen), automatische Lautstärke-Normalisierung beim Import, optionales Looping.
3. **Optional Polyphonie (Audio-Mixing):** Umschaltbar (Single-Sound vs. Multi-Sound-Overlay), damit das bisherige Verhalten auf Wunsch 1:1 erhalten bleibt.
4. **Erweiterte Steuerung:** Flexiblere Hotkeys, WebSocket-Push für Hotkey-Updates statt 3-s-Polling, dokumentierte lokale REST-API für Stream Deck / externe Skripte.

## 3. Potenzielle Upstream-Beiträge an `js664/SimplySound`

Da Jan offen für Verbesserungen ist, eignen sich besonders kleine, abgeschlossene, rückwärtskompatible PRs:
- „Stop All“-Button im Web-Soundboard + globaler Stop-Hotkey
- Graceful Backend-Shutdown + Verhindern der WPF-`MessageBox` im `--electron-backend`-Modus
- Suchfeld im Soundboard & Fix für abgeschnittene Sounds bei `density < sounds.length`
- Automatische WAV-Cache-Wiederherstellung + Export/Import-Backup
- Opt-in Portable-Datenmodus
