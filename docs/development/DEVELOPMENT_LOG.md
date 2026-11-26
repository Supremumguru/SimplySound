# Entwicklungsprotokoll (Development Log) – SimplySound

Dieses Protokoll dokumentiert chronologisch alle Analysen, Umgebungsänderungen, Branches, Implementierungen und Tests im Projekt.

---

## 2026-11-26 – Initiale Einrichtung, Bestandsaufnahme & Quellcodeanalyse (Phase 1)

### Durchgeführte Schritte
1. **Umgebungsprüfung:**
   - Arbeitsverzeichnis `G:\Meine Ablage\LLM\SimplySoundboard` als vollständig leer verifiziert.
   - Vorhanden: Windows, PowerShell 5.1 + PowerShell 7 (`pwsh`), Git `2.56.0.windows.4`, `winget`, `.NET Core 3.1.10` Runtime.
   - Fehlend: **.NET 10 SDK** (`10.0.100+`) und **Node.js `>= 22.12.0` / npm**.
2. **Repository-Klon & Sicherung des Originalstands:**
   - `https://github.com/js664/SimplySound.git` vollständig inkl. Historie und aller 20 Tags (`v1.0.0`–`v1.1.9`) in den Projektordner geklont.
   - Original-Referenz-Commit verifiziert: `c3aaf471b2452c11c37d326703a5e820b6995fa3` (`origin/main` == `main` == Tag `v1.1.9`, 37 Commits auf `main`, MIT-Lizenz).
   - Lokalen Arbeitsbranch `development` ab `c3aaf471b2452c11c37d326703a5e820b6995fa3` angelegt; `main` bleibt vollständig unverändert.
   - Beobachtung: Auf dem Google-Drive-Laufwerk (`G:\`) meldet `git status` direkt nach dem Klonen 16 Dateien als `modified`, obwohl `git diff` leer ist (Cloud-FS-Zeitstempel/Metadaten).
3. **Vollständige Quellcodeanalyse:**
   - Sämtliche C#-, XAML-, Electron-CJS-, React-JSX-, Test- und GitHub-Actions-Dateien eingelesen und analysiert.
   - Architektur, Audio-Pipeline (`NAudio 2.2.1`, WASAPI Shared, STA-Thread, Zero-Allocation-Renderpfad), Soundbibliothek (SQLite + WAV-Cache), Webserver/Sicherheit und UI-Aufteilung (Electron Settings vs. Web-Soundboard vs. Legacy-WPF) vollständig dokumentiert.
   - **Portabilitäts-Prüfung:** Sowohl im Code als auch auf dem lokalen System verifiziert, dass SimplySound 1.1.9 Portable seine Nutzerdaten in `%LOCALAPPDATA%\SimplySound`, das entpackte Backend in `%LOCALAPPDATA%\SimplySoundRuntime\backend` und Electron-Daten in `%APPDATA%\SimplySound` ablegt.
   - **Prüfung Phase 3 (3 persönliche Sounds):** Verifiziert, dass *Der Zonk*, *Blue Oyster Bar* und *Edward Simoni – Panflöten-Intro* ohne Quellcodeänderung über die normale Upload- und Editor-Funktion eingebunden werden können.
4. **Build- und Testversuch (Phase 2):**
   - `dotnet build VRSoundboard.csproj -c Release` und `dotnet test tests/SimplySound.Tests/SimplySound.Tests.csproj -c Release -r win-x64` ausgeführt → erwartungsgemäß fehlgeschlagen (Exit `-2147450735`), weil kein `.NET 10 SDK` installiert ist.
   - `electron` `npm test` nicht ausführbar, da Node.js/npm nicht installiert sind.
   - Keine Fehler im unveränderten Original-Quellcode festgestellt.
5. **Dokumentation erstellt:**
   - `docs/development/PROJECT_CONTEXT.md`
   - `docs/development/ARCHITECTURE.md`
   - `docs/development/BUILD_GUIDE.md`
   - `docs/development/AUDIO_ARCHITECTURE.md`
   - `docs/development/CODE_REVIEW.md`
   - `docs/development/ROADMAP.md`
   - `docs/development/DEVELOPMENT_LOG.md`
   - `docs/development/HANDOVER.md`

### Veränderte Original-Quelldateien
- **Keine.** Der Original-Quellcode ist zu 100 % unverändert.

### Offene Punkte / Nächste Schritte
- ~~Installation von `.NET 10 SDK` und `Node.js LTS` sowie Verifikation von Build & Tests~~ → **Abgeschlossen (s. u.)**.
- Abstimmung und Umsetzung der Stufe-2-Änderungen (Layout-Breite / Spaltenwahl 6/8 + vertikales Scrollen + weitere gewünschte Anpassungen).

---

## 2026-11-26 (Update) – Stufe 0 abgeschlossen & Layout-Ursachenanalyse

### Durchgeführte Schritte
1. **SDK-Installation per `winget`:**
   - `.NET SDK 10.0.404` (`Microsoft.DotNet.SDK.10`) installiert.
   - `Node.js LTS v26.13.1` / `npm 11.20.0` (`OpenJS.NodeJS.LTS`) installiert.
2. **Google-Drive-Build-Verhalten verifiziert:**
   - Direktes Bauen auf `G:\` scheitert bei `.NET CreateAppHost` (`IOException`) und `npm ci` (`EBADF`/`EPERM`).
   - Lösung etabliert: Synchronisation in lokalen NTFS-Build-Spiegel `%LOCALAPPDATA%\SimplySoundBuild\work` per `robocopy`.
3. **Originalstand (`v1.1.9`, Commit `c3aaf47`) vollständig verifiziert:**
   - `dotnet test`: **99 / 99 Tests bestanden** (1 s).
   - `electron npm test`: **Alle 21 Tests bestanden**.
   - `webui` Vite-Build + self-contained `.NET 10` Publish + `electron-builder --win portable`: **Erfolgreich** (`SimplySound-1.1.9-Windows.exe`, 161 MB).
4. **Ursachenanalyse Nutzer-Feedback (Web-Soundboard-Layout):**
   - Begrenzung auf 5 Spalten: `.app-shell { width: min(1160px, 100%); }` in `webui/src/style.css:408` kombiniert mit `minimumTileWidth = 198` und `Math.min(6, ...)` in `webui/src/main.jsx:223-224`.
   - Fehlende Scrollbarkeit bei 100 % Zoom: `html, body, #root`, `.app-shell` und `.sound-grid` erzwingen `overflow: hidden` und `height: 100dvh` (`webui/src/style.css:406-410`).

---

## 2026-11-26 (Update 2) – Feature `feature/grid-columns-and-scroll`: Spaltenwahl & vertikales Scrollen

### Branch & betroffene Dateien
- **Branch:** `feature/grid-columns-and-scroll` (abgezweigt von `development`, `main` unverändert auf `c3aaf47`)
- **Geänderte Quelldateien:**
  - `webui/src/main.jsx`
  - `webui/src/style.css`

### Umgesetzte Änderungen
1. **Volle Monitorbreite & konfigurierbare Spaltenzahl:**
   - `.app-shell` von `min(1160px, 100%)` auf `width: 100%; max-width: 2400px` erweitert.
   - Bisheriges `On screen`-Menü (das Kacheln per `.slice()` ausblendete) durch eine persistente Spalten-Auswahl (`localStorage`-Key `soundboard.columns`) ersetzt:
     - Desktop (`> 760px`): `Auto`, `5`, `6`, `8`, `10` Spalten pro Zeile (`Auto` nutzt bis zu 10 Spalten je nach Monitorbreite).
     - Tablet (`521–760px`): `Auto`, `3`, `4`, `5` Spalten.
     - Smartphone (`<= 520px`): `Auto`, `2`, `3`, `4` Spalten.
   - Kompaktere Abstände/Typografie (`.is-dense`) ab 8 Spalten.
2. **Echtes vertikales Scrollen bei jeder Zoomstufe (inkl. 100 %):**
   - `overflow: hidden` / `height: 100dvh` auf `html, body, #root`, `.app-shell` und `.sound-grid` aufgehoben; alle Sounds werden ohne Abschneiden gerendert (`sounds.map(...)`, Kacheln mit `aspect-ratio: 1`).
   - Topbar, Spalten-Auswahl und Select/Arrange-Leiste in einem gemeinsamen sticky `.board-header` zusammengefasst, sodass alle Steuerelemente auch beim Scrollen erreichbar bleiben.

### Verifikation
- `webui` Vite-Build: erfolgreich (280 ms)
- `electron npm test`: **21 / 21 bestanden**
- `dotnet test`: **99 / 99 bestanden** (430 ms)
- Portable-EXE (`SimplySound-1.1.9-Windows.exe`) inkl. SimplySound-Icon erfolgreich erstellt.

---

## 2026-11-26 (Update 3) – Abschnitts-Überschriften (Section Headings) umgesetzt

### Betroffene Dateien (weiterhin uncommittet auf `feature/grid-columns-and-scroll`, `main` unverändert)
- `Models.cs` (`Sound.Kind`, `Sound.IsHeading`)
- `SoundLibrary.cs` (`AddHeading`, Validierung in `Update`, Schutz in `HotkeyAssignments` & `DeleteMany`)
- `AppCoordinator.cs` (Schutz gegen Abspielen/Gain-Änderung von Überschriften)
- `WebServerService.cs` (`POST /api/sounds/heading`, `kind` im JSON-View, Guards für Play/Hotkey/Artwork)
- `MainWindow.xaml.cs` (Play-Guard in Legacy-WPF)
- `tests/SimplySound.Tests/SoundLibraryTests.cs` (neuer xUnit-Test für Anlegen, Umbenennen, Umsortieren, Hotkey-Ablehnung und Löschen von Überschriften)
- `webui/src/main.jsx` & `webui/src/style.css` (`+` → *Add heading* mit Top/Bottom-Auswahl, vollbreite `.section-heading-tile` inkl. Sound-Zähler, kompakter Bearbeiten-/Löschen-Dialog, Drag-and-drop & Bulk-Select)

### Verifikation
- `webui` Vite-Build: erfolgreich (236 ms)
- `electron npm test`: **21 / 21 bestanden** (143 ms)
- `dotnet test`: **100 / 100 bestanden** (390 ms, inkl. neuem Überschriften-Test)
- Portable-EXE (`SimplySound-1.1.9-Windows.exe`) inkl. SimplySound-Icon erfolgreich erstellt.

---

## 2026-11-26 (Update 4) – Echter Portable-Modus (`SimplySoundData`) & 1-Klick ZIP-Export/Import

### Betroffene Dateien (noch uncommittet auf `feature/grid-columns-and-scroll`, `main` unverändert)
- **Backend:**
  - `Storage.cs`: Optionaler expliziter Portable-Root (`explicitRootPath`), `IsPortableMode`, atomares `ReplaceAllSounds`, SQLite-Hot-Backup `BackupDatabaseTo`
  - `SoundLibrary.cs`: `FindSourceAudioPath`, automatische WAV-Cache-Wiederherstellung `EnsureCachedWave`, atomares `ReplaceAll`
  - `LibraryBundleService.cs` (neu): Kompakter ZIP-Export (ohne WAV-Cache), validierter ZIP-Import inkl. Magic-Byte-/Pfad-Prüfung, WAV-Cache-Rebuild & Erhalt lokaler Audio-Geräte-IDs, sowie `CopyCurrentDataToPortableAsync`
  - `App.xaml.cs`, `AppCoordinator.cs`, `WebServerService.cs`: CLI-Parameter `--data-dir` / `--portable-target-dir`, automatisches `EnsureCachedWave` vor Play, Loopback-geschützte Endpunkte `/api/storage/info`, `/api/storage/enable-portable`, `/api/library/export`, `/api/library/import`
- **Electron:**
  - `electron/portable-mode.cjs` & `electron/portable-mode.test.cjs` (neu): Automatische Erkennung von `SimplySoundData` neben der EXE (`PORTABLE_EXECUTABLE_DIR`) & Relaunch-Handling (`PORTABLE_EXECUTABLE_FILE`)
  - `electron/main.cjs`, `electron/preload.cjs`, `electron/package.json`: Portable-Startup, IPC-Handler für „Switch to Portable Mode“, „Open folder“, nativen ZIP-Export & ZIP-Import
- **Desktop-UI & Tests:**
  - `webui/src/desktop.jsx`, `webui/src/desktop.css`: Neuer Sidebar-Bereich **Library** (Portable-Status, Ordner öffnen, 1-Klick-Wechsel in den Portable-Modus, 1-Klick ZIP-Export & ZIP-Import) + Schnellzugriff auf der Overview-Seite
  - `tests/SimplySound.Tests/LibraryBundleTests.cs` (neu): 4 neue xUnit-Tests für Portable-Root, Auto-WAV-Cache-Rebuild, ZIP-Roundtrip (inkl. Überschriften, Cover & Ziel-PC-Audiogeräte-Erhalt) und Portable-Kopie
- **Bugfix (Cache-Invalidierung nach App-Updates):**
  - `WebServerService.cs`: `Cache-Control: no-store` für `index.html` in `UseStaticFiles` ergänzt.
  - `electron/main.cjs`: `mainWindow.webContents.session.clearCache()` vor `loadURL` ergänzt, sodass Electron nach Updates/Rebuilds niemals veraltete `index.html`-Bundles aus dem Chromium-Disk-Cache lädt.

---

## 2026-11-26 (Update 5) – Klappbare Überschriften, volle Ultrawide-Breite & bis zu 16 Spalten

### Betroffene Dateien
- `webui/src/main.jsx`:
  - Desktop-Spalten-Presets erweitert auf `Auto`, `6`, `8`, `10`, `12`, `14`, `16` (`maxAutoColumns = 16`, `parseColumnPreference` bis `20`).
  - Überschriften per Klick (oder Tastatur) klappbar; Zustand persistent in `localStorage` (`soundboard.collapsedHeadings`), inkl. „Collapse all / Expand all“-Button im Spalten-Menü und Spiel-Indikatorpunkt auf zugeklappten Abschnitten. Im Arrange-Modus bleiben alle Abschnitte automatisch geöffnet.
- `webui/src/style.css`:
  - `max-width: 2400px` auf `.app-shell` beibehalten, damit beim Rauszoomen im Browser alle Kacheln tatsächlich verkleinert und auf einen Blick sichtbar werden, während bei 100 % Zoom die Monitorbreite genutzt und normal gescrollt werden kann.
  - `.is-ultra-dense` für 12–16 Spalten sowie Styling für klappbare Überschriften (rotierender Chevron, `.is-collapsed`, `.has-playing`).

---

## 2026-11-26 (Update 6) – Upstream-PRs #30–#32 gemergt & Release `SimplySound 1.2.0`

### Ergebnis auf GitHub (`js664/SimplySound`)
Alle drei aus dem Fork `Supremumguru/SimplySound` eingereichten Pull Requests wurden von Jan (`js664`) geprüft und in `main` gemergt:
- **PR #30:** `fix: prevent stale cached web UI bundles after updates` (Merge `b3aa022`)
- **PR #31:** `feat(webui): add configurable grid columns, scrolling and collapsible headings` (Merge `2938d53`)
- **PR #32:** `feat: add portable data mode, WAV cache rebuild and ZIP library backup` (Merge `bcb0a0f`)

Zusätzlich veröffentlichte Jan **SimplySound 1.2.0** (`v1.2.0`, erstes stabiles Release) mit schnellerem Windows-Startup und verbesserter Staging-Lock-Recovery (`5095b3e`).

### Lokale & Fork-Synchronisation
- `main` auf `upstream/main` (`5095b3e` / `v1.2.0`) aktualisiert.
- `development` sauber auf `v1.2.0` neu aufgesetzt (enthält den vollständigen Upstream-Stand + `docs/development/`).
- Gemergte Feature-Branches (`fix/webui-cache-busting`, `feat/grid-columns-and-headings`, `feat/portable-mode-and-zip-backup`) lokal und auf `origin` aufgeräumt.
