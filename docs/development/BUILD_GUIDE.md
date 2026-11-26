# Build- und Testanleitung – SimplySound

> **Stand:** 26.11.2026 | **Referenz-Commit:** `c3aaf471b2452c11c37d326703a5e820b6995fa3` (`v1.1.9`)

## 1. Benötigte Werkzeuge und Versionen

Alle Anforderungen sind direkt aus `global.json`, `VRSoundboard.csproj`, `webui/package.json`, `electron/package.json` und `.github/workflows/windows-build.yml` verifiziert:

| Komponente | Erforderliche Version | Quelle | Lokaler Status (26.11.2026) |
|---|---|---|---|
| **Betriebssystem** | Windows 10 oder 11 (x64) | `VRSoundboard.csproj` (`net10.0-windows`) | Vorhanden (Windows) |
| **Git** | aktuell | CLI | Vorhanden (`2.56.0.windows.4`) |
| **PowerShell** | 5.1+ / 7+ | `README.md`, Workflows | Vorhanden (`5.1` + `pwsh` 7.7.0) |
| **.NET SDK** | **10.0.100** (`rollForward: latestFeature`) | `global.json`, `windows-build.yml` (`10.0.x`) | **Installiert (`10.0.404`)** |
| **Node.js & npm** | **Node.js `>= 22.12.0`** (CI: `22.12.0`) | `README.md`, `webui/package.json`, `windows-build.yml` | **Installiert (`v26.13.1` / `npm 11.20.0`)** |

### Installation der fehlenden SDKs (Windows / winget)

Sobald der Build lokal ausgeführt werden soll, lassen sich beide Voraussetzungen sauber per `winget` installieren:

```powershell
winget install --id Microsoft.DotNet.SDK.10 -e
winget install --id OpenJS.NodeJS.LTS -e
```

Nach der Installation eine neue Shell öffnen und prüfen:

```powershell
dotnet --info
node -v
npm -v
```

## 2. Abhängigkeiten im Überblick

### 2.1 NuGet-Pakete (`VRSoundboard.csproj` & `tests/SimplySound.Tests/SimplySound.Tests.csproj`)
Quelle laut `NuGet.Config`: ausschließlich `https://api.nuget.org/v3/index.json`.

- **App-Backend (`VRSoundboard.csproj`, `TreatWarningsAsErrors=true`):**
  - `NAudio` `2.2.1`
  - `Microsoft.Data.Sqlite` `10.0.12`
  - `QRCoder` `1.6.0`
  - `Serilog.AspNetCore` `8.0.3`
  - `Serilog.Sinks.File` `6.0.0`
- **Tests (`SimplySound.Tests.csproj`):**
  - `Microsoft.NET.Test.Sdk` `17.12.0`
  - `xunit` `2.9.2`
  - `xunit.runner.visualstudio` `2.8.2`

### 2.2 npm-Pakete (`electron/package.json` & `webui/package.json`)
- **Electron (`electron/`):**
  - `electron` `^44.4.5`
  - `electron-builder` `^26.0.12`
  - `png-to-ico` `^3.0.2`
  - `pngjs` `^7.0.0`
- **Web-UI (`webui/`):**
  - `react` `^19.3.0`, `react-dom` `^19.3.0`
  - `@fontsource/dm-sans` `^5.3.0`
  - `vite` `^8.3.1`, `@vitejs/plugin-react` `^6.1.1`

Lockfiles (`electron/package-lock.json`, `webui/package-lock.json`) sind im Repository vorhanden → immer `npm ci` statt `npm install` für reproduzierbare Builds verwenden.

## 3. Vollständiger Build- und Packaging-Prozess

Die gesamte Build-Pipeline ist in `electron/package.json` orchestriert und spiegelt 1:1 `.github/workflows/windows-build.yml` wider:

### Schritt 1: Abhängigkeiten wiederherstellen
```powershell
cd electron
npm ci
```
*(Hinweis: `npm run build:ui` führt intern automatisch `npm --prefix ../webui ci` aus.)*

### Schritt 2: Automatisierte Tests ausführen
```powershell
# 1. Electron-Unit-Tests (Node built-in test runner, 5 Testdateien)
cd electron
npm test

# 2. .NET-Backend- & Audio-Tests (xUnit, 5 Testdateien)
cd ..
dotnet test tests/SimplySound.Tests/SimplySound.Tests.csproj -c Release -r win-x64
```

### Schritt 3: Kompletten Build inkl. Installer & Portable-EXE erzeugen
```powershell
cd electron
npm run dist
```

Was `npm run dist` exakt ausführt:
1. **`npm run build:icon` (`node make-icon.cjs`):** Erzeugt quadratisches Windows-Icon `electron/SimplySound.ico` aus `assets/logo.png`.
2. **`npm run build:ui`:** Führt `npm --prefix ../webui ci && npm --prefix ../webui run build` aus. Vite baut die React-App direkt nach `../Web/` (`webui/vite.config.js`).
3. **`npm run build:backend`:**
   - Leert das Staging-Verzeichnis `obj/electron-backend` (`clean-backend-stage.cjs`).
   - Führt `dotnet publish ../VRSoundboard.csproj -c Release -r win-x64 --self-contained true -o ../obj/electron-backend` aus (bindet `Web/**/*` über `VRSoundboard.csproj` ein).
   - Erzeugt `obj/electron-backend/backend-manifest.json` mit Version und SHA-256-Gesamt-Fingerprint (`write-backend-manifest.cjs`).
4. **`electron-builder --win nsis portable`:** Verpackt Electron-Quellen (ASAR) + `extraResources` (`backend/`, `app-icon.ico`, `firewall-setup.ps1`) nach `dist-electron/`:
   - **Installer:** `dist-electron/SimplySound-1.1.9-Setup.exe` (NSIS, nicht One-Click, Per-User, frei wählbares Installationsverzeichnis, Desktop- & Startmenü-Verknüpfung)
   - **Portable:** `dist-electron/SimplySound-1.1.9-Windows.exe` (einzelne selbstextrahierende Portable-EXE)

### Nur Portable-Build erzeugen (schneller für lokale Tests)
```powershell
cd electron
npm run build
npx electron-builder --win portable
```

### Entwicklungsstart ohne Packaging
Nach einmaligem `npm run build` (bzw. `build:ui` + `build:backend`) kann Electron direkt gestartet werden:
```powershell
cd electron
npm start
```
Für reine Frontend-Entwicklung gegen ein laufendes Backend auf Port `6769` bietet `webui/` einen Vite-Dev-Server mit Proxy für `/api` und `/ws`:
```powershell
cd webui
npm run dev
```

## 4. CI/CD und Release-Prozess (GitHub Actions)

1. **`.github/workflows/windows-build.yml`** (Trigger: Push auf `main`, Tags `v*`, Pull Requests, manuell):
   - Läuft auf `windows-2022` mit `.NET 10.0.x` und `Node.js 22.12.0`.
   - Prüft bei `v*`-Tags, ob `electron/package.json` (`version`) exakt zum Tag passt.
   - Führt `npm ci`, `npm test`, `npm audit --audit-level=high` (für `electron` und `webui`), `dotnet test` und `npm run dist` aus.
   - Lädt `SimplySound-*-Setup.exe` und `SimplySound-*-Windows.exe` als Workflow-Artifact `SimplySound-Windows-x64` hoch (14 Tage Aufbewahrung).
2. **`.github/workflows/early-beta-releases.yml`** (Trigger: veröffentlichtes GitHub-Release):
   - Ergänzt automatisch „(Early Beta)“ im Titel, einen Early-Beta-Hinweis im Release-Text und setzt das Prerelease-Flag.

## 5. Verifizierter Build- und Teststand (26.11.2026)

| Schritt | Umgebung | Ergebnis |
|---|---|---|
| `dotnet test tests/SimplySound.Tests/SimplySound.Tests.csproj -c Release -r win-x64` | Lokaler NTFS-Spiegel (`%LOCALAPPDATA%\SimplySoundBuild\work`) | **Bestanden:** 99 / 99 Tests in 1 s |
| `npm ci` + `npm test` (`electron/`) | Lokaler NTFS-Spiegel | **Bestanden:** alle 21 Electron-Node-Tests grün |
| `npm run build` (`icon` + `webui` Vite + self-contained `.NET 10` publish) | Lokaler NTFS-Spiegel | **Bestanden** (Vite in 296 ms) |
| `npx electron-builder --win portable` | Lokaler NTFS-Spiegel | **Bestanden:** `SimplySound-1.1.9-Windows.exe` (161.267.872 Bytes) erzeugt |

## 6. Wichtiger Hinweis: Lokaler NTFS-Build-Spiegel statt Build auf Google Drive

Auf dem Google-Drive-Laufwerk (`G:\Meine Ablage\LLM\SimplySoundboard`) schlagen sowohl `.NET CreateAppHost` (`System.IO.IOException` wegen gesperrter/memory-mapped Dateien) als auch `npm ci` (`TAR_ENTRY_ERROR / EBADF / EPERM`) fehl.  
**Bewährter Workflow:** Quellcode im Git-Workspace auf `G:\` bearbeiten und per `robocopy` in den lokalen NTFS-Spiegel synchronisieren, dann dort testen und bauen:

```powershell
$work = Join-Path $env:LOCALAPPDATA "SimplySoundBuild\work"
robocopy "G:\Meine Ablage\LLM\SimplySoundboard" $work /MIR /XD .git node_modules bin obj dist-electron Web /XF SimplySound.ico /NFL /NDL /NJH /NJS /NP
```

So bleibt der Google-Drive-Ordner frei von `node_modules/`, `bin/`, `obj/` und `dist-electron/`, während alle Tests und Builds auf voller SSD-Geschwindigkeit durchlaufen.
