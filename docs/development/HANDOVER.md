# Technische Übergabe (Agent Handover) – SimplySound

> **Zweck:** Kompaktes Briefing für zukünftige KI-Entwicklungsagenten zur sofortigen Einarbeitung ohne erneutes Voll-Scanning.  
> **Stand:** 26.11.2026

## 1. Kernfakten auf einen Blick

- **Repo / Upstream:** `https://github.com/js664/SimplySound.git` (MIT-Lizenz, Entwickler: Jan / `js664`)
- **Fork (`origin`):** `https://github.com/Supremumguru/SimplySound.git`
- **Aktueller Upstream-Stand (`main` / `v1.2.0`):** `5095b3e390e12920564a10976ba90fd8f55ac262` (erste stabile Version `1.2.0`, inkl. unserer gemergten PRs `#30`, `#31`, `#32`)
- **Aktiver Arbeitsbranch:** `development` (`main` folgt exakt `upstream/main`!)
- **Sprache:** Nutzerkommunikation & `docs/development/` auf **Deutsch**; Code, Bezeichner und Commit-Messages orientieren sich am englischen Originalprojekt.
- **Original-Quellcode-Status:** Unverändert (Phase 1 abgeschlossen).

## 2. Architektur in 30 Sekunden

1. **Electron (`electron/main.cjs`):** Desktop-Hülle (NSIS + Portable). Extrahiert/cached das .NET-Backend nach `%LOCALAPPDATA%\SimplySoundRuntime\backend`, startet `VRSoundboard.exe --electron-backend ...`, registriert globale Hotkeys (`Ctrl+Alt+<Key>` per 3-s-Polling von `/api/hotkeys`), stellt IPC für Firewall/Updates/Browser-Launch bereit und betreibt eine lokale Download-Bridge (`marketplace-bridge.cjs`) für MyInstants.
2. **.NET 10 Backend (`VRSoundboard.csproj`):** Selbstenthaltene `WinExe` (`net10.0-windows`, `TreatWarningsAsErrors=true`). Enthält:
   - **ASP.NET Core Kestrel (`WebServerService.cs`):** Port `6769` (Fallback `6669`), REST `/api/*`, WebSocket `/ws`, statische React-Dateien aus `Web/`, Host/Origin/LAN/Tailscale/Pairing-Schutz.
   - **Audio-Engine (`AudioExecutionContext.cs`, `AudioServices.cs`, `LowLatencyAudio.cs`):** `NAudio 2.2.1`, WASAPI Shared Mode (10 ms), eigener STA-Thread, Zero-Allocation-Renderpfad (`ArrayPool<float>`), Single-Active-Sound (`SwitchingWaveProvider`), optionaler zweiter Monitor-Stream, 5-ms-Gain-Rampe, Multichannel-Downmix ohne LFE.
   - **Persistenz (`Storage.cs`, `SoundLibrary.cs`):** SQLite `database/library.db` + `sounds/` + 16-Bit-WAV-`cache/` + `images/` + `logs/` unter `%LOCALAPPDATA%\SimplySound`.
   - **Legacy-WPF (`MainWindow.xaml`, `SoundEditor.xaml`):** Nur aktiv ohne `--electron-backend`.
3. **Web-UI (`webui/` → Output `Web/`):** React 19 + Vite 8.
   - `/?desktop=1` → `webui/src/desktop.jsx` (Electron-Einstellungsfenster).
   - `/` → `webui/src/main.jsx` (eigentliches Soundboard im PC-Browser & auf dem Handy).

## 3. Wichtige Fallstricke & Besonderheiten

1. **Fehlende lokale SDKs (Stand 26.11.2026):** Lokal sind weder `.NET 10 SDK` (`global.json`: `10.0.100`) noch `Node.js >= 22.12.0` installiert. Vor dem ersten lokalen Build/Test müssen beide installiert werden (`BUILD_GUIDE.md`).
2. **Google-Drive-Arbeitsverzeichnis (`G:\Meine Ablage\LLM\SimplySoundboard`):** `git status` zeigt aufgrund von Cloud-FS-Metadaten falsche `M`-Flags bei leerem `git diff`. Niemals blind `git add -A` oder `git checkout .` ausführen – immer explizit Dateien prüfen (`git diff`) und selektiv stagen!
3. **Portabilitäts-Realität:** `SimplySound-1.1.9-Windows.exe` ist nur installationsportabel; Daten liegen aktuell fest in `%LOCALAPPDATA%\SimplySound` (und Electron-State in `%APPDATA%\SimplySound`). `Storage` hat bereits `Storage(string? localAppDataPath = null)` – ideal für künftigen Opt-in-Portable-Modus.
4. **Audio-Regel (auch laut `CONTRIBUTING.md`):** Alle COM-/WASAPI-Operationen gehören auf `AudioExecutionContext`, und im WASAPI-Render-Callback (`SwitchingWaveProvider.Read` / `LowLatencyAudio`) dürfen keine blockierenden I/O-Operationen oder GC-Allokationen eingeführt werden!
5. **Sicherheits-Regeln (`CONTRIBUTING.md` & `SECURITY.md`):** Netzwerkzugriff bleibt standardmäßig privat (LAN/Tailscale), Pairing-Tokens niemals loggen oder in `AppSettingsView` ausgeben.
6. **Keine geschützten Audiodateien, Logs oder Build-Artefakte committen.** Kein Push, kein Fork, kein PR ohne ausdrückliche Zustimmung des Nutzers.

## 4. Relevante Dokumente unter `docs/development/`

- `PROJECT_CONTEXT.md` – Geschichte, verifizierte Repo-Metadaten, Ziele & Rahmenbedingungen
- `ARCHITECTURE.md` – Komponenten, Mermaid-Diagramme, REST/WS-API, IPC, Portabilität
- `AUDIO_ARCHITECTURE.md` – NAudio/WASAPI-Pipeline, SoundLibrary, Anleitung für die 3 Wunsch-Sounds
- `BUILD_GUIDE.md` – SDK-Anforderungen, Abhängigkeiten, Build-/Test-/Packaging-Befehle
- `CODE_REVIEW.md` – Stärken, konkrete Schwachstellen mit Datei-/Zeilenbelegen
- `ROADMAP.md` – Bewertungsmatrix aller Ideen & priorisierte Entwicklungsstufen
- `DEVELOPMENT_LOG.md` – Chronologisches Änderungsprotokoll (bei jeder Änderung aktuell halten!)
