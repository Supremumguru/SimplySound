# Projektkontext – SimplySound

> **Stand:** 26.11.2026  
> **Ursprünglicher Analyse-Stand (`v1.1.9`):** `c3aaf471b2452c11c37d326703a5e820b6995fa3`  
> **Aktueller Upstream-Stand (`main` / `v1.2.0`):** `5095b3e390e12920564a10976ba90fd8f55ac262`

## 1. Projektübersicht und verifizierte Metadaten

| Eigenschaft | Verifizierter Stand im Repository |
|---|---|
| **Projektname** | SimplySound (frühere interne Namen: `VRSoundboard`, `Soundboardify`) |
| **Ursprünglicher Entwickler** | Jan (GitHub: `js664`), mit KI-Unterstützung laut `CREDITS.md` (OpenAI Codex) |
| **Original-Repository** | https://github.com/js664/SimplySound |
| **Releases** | https://github.com/js664/SimplySound/releases |
| **Lizenz** | MIT License (`Copyright (c) 2026 SimplySound contributors`, Datei: `LICENSE`) |
| **Hauptbranch** | `main` |
| **Anzahl Commits auf `main`** | 37 Commits (Zeitraum: 25.09.2026 – 26.09.2026) |
| **Tags** | 20 Tags: `v1.0.0` bis `v1.1.9` |
| **Zuordnung `v1.1.9` ↔ `main`** | Identisch – sowohl `origin/main` als auch Tag `v1.1.9` zeigen auf `c3aaf471b2452c11c37d326703a5e820b6995fa3` („Fix desktop soundboard launch and setup colors“, 26.09.2026) |
| **Version in `electron/package.json`** | `1.1.9` |
| **Zielplattform** | Windows 10 / 11 (`win-x64`) |
| **Distributionen** | NSIS-Installer (`SimplySound-1.1.9-Setup.exe`) und Portable-EXE (`SimplySound-1.1.9-Windows.exe`) |
| **Aktuell genutzte Version** | SimplySound 1.1.9 Portable (Early Beta) |

## 2. Historie und Ursprung der Namensgebung

### 2.1 Produktentwicklung im Quellcode
Die Git-Historie und Legacy-Migrationspfade im Code zeigen eine klare, schrittweise Entwicklung:
1. **`VRSoundboard` (Ursprungsphase):** Ursprünglich als WPF-Desktop-Soundboard für Steam Link / VRChat konzipiert (`VRSoundboard.csproj`, Assembly-Name `VRSoundboard`, Namespace `VRSoundboard`, `MainWindow.xaml` mit Untertitel „Steam Link soundboard control“, `SteamMicDiagnostic.cs`).
2. **`Soundboardify` (Vorbereitung öffentlicher Release, Commit `6843d38`, 25.09.2026):** Einführung der Electron-Desktop-Shell und modernen React-Web-UI; in `Storage.cs:19` und `electron/main.cjs:19` noch über automatische Datenmigration sichtbar.
3. **`SimplySound` (Rebranding ab Commit `185a8da`, 26.09.2026):** Öffentlicher Release als allgemeines, selbst gehostetes Windows-Soundboard mit Handy-Fernsteuerung. Laut `PRODUCT.md` sind VRChat und Steam Link heute nur noch optionale Anwendungsfälle und keine Produktvoraussetzung mehr.

### 2.2 Wiederherstellung des Repositorys
Das Repository war zwischenzeitlich mehrere Wochen privat gestellt (HTTP 404), weil der Entwickler es während einer Bewerbungsphase im IT-Bereich nicht öffentlich zeigen wollte. Auf eine freundliche E-Mail-Anfrage vom 25.11.2026 antwortete Jan am 26.11.2026 positiv, stellte das Repository wieder öffentlich zur Verfügung und signalisierte ausdrückliche Offenheit für Funktionswünsche.

## 3. Projektziele und Rahmenbedingungen

### 3.1 Entwicklungsziele
- **Weiterentwicklung statt Neubau:** Das bestehende, zuverlässig genutzte Projekt wird gezielt verbessert und erweitert – kein unnötiger Architektur-Umbau.
- **Erhalt bestehender Funktionen & Designs:** Alle laufenden Funktionen (Desktop-Steuerung, Web-Soundboard, Handy-Fernbedienung via LAN/Tailscale, Hotkeys, WASAPI-Audio) bleiben intakt.
- **Erhalt und Stärkung der Portabilität:** Da die Portable-Version im Alltag (u. a. im Büro) eingesetzt wird, hat echte bzw. verlässliche Portabilität hohe Priorität.
- **Upstream-Fähigkeit:** Allgemeine, allgemein nützliche Verbesserungen sollen so sauber und klein geschnitten umgesetzt werden, dass sie später optional per Pull Request an `js664/SimplySound` zurückgegeben werden können.

### 3.2 Persönliche Sound-Erweiterungen (Phase 3)
Folgende drei Sounds sollen zunächst persönlich verfügbar gemacht werden (keine Upstream-Feature-Requests, keine Eincheckung geschützter Audiodateien ins Git-Repository):
1. **Der Zonk** (aus „Geh aufs Ganze!“, kurzer humorvoller Soundeffekt)
2. **Blue Oyster Bar** (Musikstück „El Bimbo“ in der aus Police Academy bekannten Fassung)
3. **Edward Simoni – Panflöten-Intro** (charakteristisches Panflöten-Intro; genauer Ausschnitt noch festzulegen)

> **Ergebnis der Analyse:** Für alle drei Sounds sind **keine Quellcodeänderungen** erforderlich. Sie können direkt über die eingebaute Upload-Funktion (`+` → *Upload locally*) importiert und im integrierten Editor zugeschnitten, benannt, mit Coverbildern versehen und mit Hotkeys verknüpft werden. Details siehe `AUDIO_ARCHITECTURE.md` und `ROADMAP.md`.

## 4. Git- und Datenschutz-Regeln

- **`main` bleibt unverändert:** Zeigt stets exakt auf den ursprünglichen Upstream-Stand (`c3aaf471b2452c11c37d326703a5e820b6995fa3`).
- **Entwicklung auf separaten Branches:** Eigene Arbeiten erfolgen auf `development` bzw. dedizierten Feature-Branches (`feature/...`, `fix/...`).
- **Kein ungefragtes Pushen / Forken / PR-Erstellen:** Änderungen bleiben lokal, bis ausdrücklich etwas anderes vereinbart wird.
- **Keine privaten Daten im Repository:** Keine persönlichen Audiodateien, keine Pairing-Tokens, keine Logs, keine lokalen IP-Adressen oder Build-Artefakte committen.
- **Lizenz-Compliance:** MIT-Lizenz (`LICENSE`) und Copyright-Hinweise (`CREDITS.md`) bleiben unangetastet.

## 5. Besonderheit des Arbeitsverzeichnisses (Google Drive)

Das Projekt liegt unter `G:\Meine Ablage\LLM\SimplySoundboard` (Google Drive für Desktop). Bereits direkt nach dem Klonen meldete `git status` 16 Dateien als `modified`, obwohl `git diff` vollständig leer war – ein bekanntes Verhalten virtueller Cloud-Dateisysteme bei asynchronen Metadaten-/Zeitstempel-Updates. Für intensive Builds (`node_modules/`, `bin/`, `obj/`, `dist-electron/`) ist langfristig ein lokaler NTFS-Pfad (z. B. `C:\Dev\SimplySound`) oder der Ausschluss von Build-Ordnern empfehlenswert (siehe `BUILD_GUIDE.md`).
