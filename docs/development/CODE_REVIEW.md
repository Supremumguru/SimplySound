# Technisches Code-Review – SimplySound (`v1.1.9`)

> **Bewertungsgrundlage:** Vollständige Durchsicht aller C#-, Electron-, React-, Test- und Workflow-Dateien auf Commit `c3aaf471b2452c11c37d326703a5e820b6995fa3` (26.11.2026).  
> **Grundsatz:** Sachliche, konstruktive Bewertung einer bereits gut funktionierenden Anwendung – keine pauschale Rewrite-Empfehlung.

## 1. Gesamtbewertung

SimplySound weist für ein junges Open-Source-Early-Beta-Projekt eine **überraschend hohe technische Reife in den kritischen Kernbereichen** auf – insbesondere in der Echtzeit-Audiopipeline, bei der Netzwerksicherheit und bei atomaren Datenbankoperationen. Gleichzeitig finden sich typische Übergangsspuren aus dem schnellen Wandel von einer WPF-/Steam-Link-App (`VRSoundboard`) hin zu einer modernen Electron-/React-App (`SimplySound`) sowie konkrete UX- und Portabilitätslücken.

### Positive Stärken
1. **Saubere Echtzeit-Audioarchitektur (`AudioExecutionContext.cs`, `AudioServices.cs`, `LowLatencyAudio.cs`):**
   - Dedizierter STA-Thread serialisiert alle COM-/WASAPI-Aufrufe.
   - Zero-Allocation-Renderpfad mittels `ArrayPool<float>.Shared` (durch GC-Allokationstests in `AudioPipelineTests.cs:300-335` abgesichert).
   - Auslagerung der Stream-Bereinigung vom WASAPI-Callback auf den `ThreadPool` (`AudioServices.cs:524-530`).
   - Klickfreie 5-ms-Lautstärkerampe (`GainSampleProvider`), sauberer Mehrkanal-Downmix ohne LFE mit weichem `tanh`-Peak-Limiter.
2. **Durchdachte Netzwerksicherheit für LAN-Betrieb (`WebServerService.cs`, `MarketplaceService.cs`, `electron/main.cjs`):**
   - Schutz vor DNS-Rebinding (`IsRequestHostAllowed`) und Cross-Origin-Zugriffen (`IsSameOrigin`).
   - Klare Trennung zwischen Loopback, privatem LAN (RFC 1918) und optionalem Tailscale (`100.64.0.0/10`); kein öffentliches Routing.
   - Pairing-Geheimnis wird über `AppSettingsView` strikt aus `GET /api/settings` herausgehalten.
   - Strenge URL-Allowlists und Magic-Byte-Prüfungen bei Bild-Uploads (`DetectImageExtension`) und MyInstants-MP3-Downloads (`LooksLikeMpegAudio`, `allowedAudioUrl`).
   - Electron-Fenster läuft mit `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; IPC prüft `event.sender === mainWindow.webContents`.
3. **Atomare SQLite-Transaktionen (`Storage.cs`, `SoundLibrary.cs`):**
   - Umsortieren (`SaveSoundsOrder`) und Bulk-Löschen (`DeleteSoundsAndSaveOrder`) erfolgen atomar; Dateisystem-Löschungen passieren erst nach erfolgreichem Commit.
   - Günstige In-Memory-Snapshots via `MemberwiseClone` (`Sound.Copy()`, `AppSettings.Copy()`).
4. **Gute Testbasis für kritische Logik:**
   - 5 xUnit-Testdateien (`tests/SimplySound.Tests/`) + 5 Node-Testdateien (`electron/*.test.cjs`), inkl. Tests für GC-Allokationen, Race-Conditions bei Stream-Disposal, Rollbacks, Security-Boundaries und Update-Versionsvergleich.
   - `TreatWarningsAsErrors=true` in `VRSoundboard.csproj`.

---

## 2. Erkannte Schwachstellen, Risiken und technische Schulden

### Priorität Hoch (Praktische Auswirkungen im Alltag)

#### 2.1 Portable-Version ist nicht datenportabel
- **Fundstellen:** `Storage.cs:14-27`, `electron/main.cjs:18-24, 47-88`
- **Befund:** Die Portable-EXE (`SimplySound-1.1.9-Windows.exe`) speichert Soundbibliothek, SQLite-DB, Coverbilder und Logs fest in `%LOCALAPPDATA%\SimplySound`, entpackt das komplette .NET-Backend nach `%LOCALAPPDATA%\SimplySoundRuntime\backend` und legt Electron-Daten in `%APPDATA%\SimplySound` ab.
- **Auswirkung:** Beim Mitnehmen der Portable-EXE auf einen anderen Windows-PC (oder USB-Stick) fehlen alle Sounds und Einstellungen. Zudem wird bei jedem ersten Start auf einem neuen PC über 100 MB in `%LOCALAPPDATA%` entpackt.
- **Einordnung:** Technisch nachvollziehbar (stabiler Pfad für Windows-Firewall-Regeln), aber für echte Portabilität sollte ein optionaler portabler Datenmodus (z. B. `data/` neben der EXE via `PORTABLE_EXECUTABLE_DIR`) ergänzt werden.

#### 2.2 Kein „Stop All“-Button in der Web-UI; Retrigger-Sounds nicht stoppbar
- **Fundstellen:** `webui/src/main.jsx:289-297`, `webui/src/main.jsx:484-506`
- **Befund:** Das Backend bietet `POST /api/stop` an (`WebServerService.cs:276`), aber weder die Web-Soundboard-UI (`main.jsx`) noch die Electron-Desktop-UI (`desktop.jsx`) haben einen sichtbaren Stop-All-Button (dieser existiert nur in der ungenutzten WPF-UI `MainWindow.xaml:63`). Zudem startet ein zweites Tippen auf einen Sound im Modus `retrigger` diesen immer neu (`shouldToggleOff` greift nur bei `mode === 'toggle'`), sodass ein langer Retrigger-Clip in der UI nicht abgebrochen werden kann.

#### 2.3 „On screen“-Dichte blendet überschüssige Sounds komplett aus
- **Fundstellen:** `webui/src/main.jsx:182-191, 234-237, 532`
- **Befund:** `{sounds.slice(0, density || sounds.length).map(...)}` schneidet die angezeigte Sound-Liste hart auf `density` ab, und `densityOptions` werden auf `fitLimit` (maximale Kacheln ohne Scrollen auf dem aktuellen Viewport) gedeckelt.
- **Auswirkung:** Bei größeren Bibliotheken auf kleineren Bildschirmen oder Smartphones können Sounds jenseits von `fitLimit` unsichtbar/unerreichbar sein (kein Scrollen oder Blättern/Pagination). *(Hinweis: Verhalten im Live-Browser noch praktisch gegenzuprüfen, Code-Inspektion zeigt klares `.slice(0, density)`.)*

#### 2.4 Hartes Beenden des Backends beim Schließen von Electron
- **Fundstelle:** `electron/main.cjs:304`
- **Befund:** `if (backend && !backend.killed) backend.kill();` beendet `VRSoundboard.exe` unter Windows abrupt (`TerminateProcess`), sodass `App.OnExit` (`App.xaml.cs:66-70`) mit `_web.StopAsync()`, `AppCoordinator.Shutdown()`, `AudioEngine.Dispose()` und `Log.CloseAndFlush()` im regulären Electron-Betrieb nicht sauber durchläuft.
- **Risiko:** Potenziell unvollständige Log-Zeilen, unsauber geschlossene Audio-/SQLite-Handles oder offene Kestrel-Sockets bei schnellem Neustart. Ein lokaler `POST /api/shutdown` (nur Loopback) mit kurzem Grace-Timeout vor `backend.kill()` wäre deutlich sauberer.

---

### Priorität Mittel (Robustheit, Wartbarkeit, Sicherheit)

#### 2.5 Unbehandelte `File.Delete`-Aufrufe bei Bild-Upload/-Löschung und Import-Rollback
- **Fundstellen:** `WebServerService.cs:241-242, 252`, `SoundLibrary.cs:53`
- **Befund:** Während `SoundLibrary.DeleteMany` korrekt `TryDeleteAsset` mit `IOException`/`UnauthorizedAccessException`-Handling nutzt (`SoundLibrary.cs:114-119`), rufen die Bild-Endpunkte und der Import-`catch`-Block direkt `File.Delete(...)` auf. Eine gesperrte Datei (z. B. durch Virenscanner oder gleichzeitigen HTTP-Abruf) kann zu einem 500-Fehler führen oder die ursprüngliche Import-Exception verdecken.

#### 2.6 Pairing-Token in Query-Strings und nicht-konstanter String-Vergleich
- **Fundstellen:** `AppCoordinator.cs:97`, `WebServerService.cs:338, 369`
- **Befund:**
  - `imageUrl` hängt `&token=...` als Query-Parameter an (`WebServerService.cs:369`), wodurch das Secret in Browser-Caches, DOM und potenziellen Proxies/Logs landet (bei `<img>`-Tags allerdings übliche pragmatische Lösung ohne Cookies).
  - `IsPairingAuthorized` vergleicht das Token mit `string.Equals` statt `CryptographicOperations.FixedTimeEquals`. Im privaten LAN geringes praktisches Risiko, aber einfach zu härten.
  - Nach einem `PATCH /api/settings` zum Aktivieren/Rotieren des Tokens laufen bereits geöffnete WebSocket-Verbindungen weiter, bis sie getrennt werden.

#### 2.7 Fehlende automatische Cache-Wiederherstellung
- **Fundstellen:** `SoundLibrary.cs:34-46`, `AudioServices.cs:259-262`
- **Befund:** Beim Import wird eine 16-Bit-WAV-Kopie in `cache/<id>.wav` erstellt und die Originaldatei in `sounds/<id>.<ext>` aufbewahrt. Beim Abspielen wird ausschließlich `cache/<id>.wav` geöffnet. Fehlt die Cache-Datei (z. B. nach manuellem Bereinigen oder schlankem Backup), schlägt die Wiedergabe fehl, obwohl die Originaldatei noch da ist. Zudem belegt unkomprimiertes PCM-WAV ~10 MB pro Minute (relevant bei längeren Musikstücken).

#### 2.8 Hotkey-Polling statt WebSocket-Push & starrer Modifier-Zwang
- **Fundstellen:** `electron/main.cjs:118-157, 318`, `Models.cs:34-47`
- **Befund:** Electron fragt `GET /api/hotkeys` alle 3 Sekunden per HTTP-Polling ab (unnötige Last + bis zu 3 s Verzögerung nach Änderungen). Außerdem erlaubt `SoundHotkey` ausschließlich `Control+Alt+<A-Z|0-9|F1-F12>` (z. B. kein `Ctrl+Shift`, kein Numpad, kein Media-Key, kein globaler Stop-Hotkey).

#### 2.9 Legacy-WPF-Altlasten und ungenutzte Einstellungsfelder
- **Fundstellen:** `VRSoundboard.csproj:5-6, 11`, `MainWindow.xaml(.cs)`, `SoundEditor.xaml(.cs)`, `Models.cs:66-69`, `App.xaml.cs:64`
- **Befund:**
  - `VRSoundboard.exe` bindet weiterhin vollständig `UseWPF` und `UseWindowsForms` ein und startet intern eine WPF-`Application` (`App.xaml.cs:18`), obwohl im Electron-Betrieb kein WPF-Fenster angezeigt wird. Das erhöht Binary-Größe, RAM-Bedarf und Startzeit.
  - Die Einstellungen `StartWithWindows`, `StartMinimized`, `MinimizeToTray`, `Theme` und `Sound.Icon` existieren in `Models.cs` und `MainWindow.xaml.cs`, sind aber in Electron/React weder nutzbar noch wirksam.
  - Fehlermeldungen in `App.xaml.cs:64` zeigen im Fehlerfall eine WPF-`MessageBox` mit dem alten Titel `"VRSoundboard startup failed"` (im `--electron-backend`-Modus problematisch, da ein versteckter Hintergrundprozess eine modale Dialogbox blockierend öffnen könnte!).

#### 2.10 Monolithische UI-Komponenten und fehlende Frontend-Tests
- **Fundstellen:** `webui/src/main.jsx` (618 Zeilen), `webui/src/desktop.jsx` (562 Zeilen)
- **Befund:** Beide Oberflächen stecken jeweils in einer einzigen React-Komponente mit vielen `useState`/`useRef`/`useEffect`-Hooks. Für die aktuelle Größe noch überschaubar, aber bei künftigen Features (Suche, Kategorien, Audio-Extras) sollten neue Bereiche sauber in Teilkomponenten ausgelagert werden. Für `webui/` existieren bislang keine automatisierten Unit-/Komponententests.

---

### Priorität Niedrig (Feinschliff & Hygiene)

1. **`App.xaml.cs:20, 68`:** `async void OnStartup` ist in WPF üblich, aber `OnExit` blockiert mit `_web?.StopAsync().GetAwaiter().GetResult()`, was bei WPF-SynchronizationContext theoretisch deadlock-anfällig sein kann.
2. **`WebSocketHub.cs:26, 39`:** Pro WebSocket-Verbindung erstellter `SemaphoreSlim` wird beim Disconnect nicht explizit `Dispose()`d (geringe Auswirkung, da kein OS-WaitHandle allokiert wird).
3. **`AudioServices.cs:427`:** Playback-Ende wird per `Stopwatch`-Wandzeit im 50-ms-Timer (`Tick()`) statt per EOF-Signal aus `SwitchingWaveProvider` erkannt – leichte Abweichungen (~10–50 ms) bei sehr kurzen Clips oder Systemlast möglich.
4. **`PRODUCT.md` & `site/index.html` veraltet:** `PRODUCT.md:7` nennt noch `.NET 8`, `site/index.html:95` zeigt noch `Current release 1.0.2`.
5. **Offene Dependabot-Branches auf `origin`:** 11 Dependabot-Branches vorhanden (u. a. `NAudio 3.2.0`, `Electron 45.3.3`, `Serilog.Sinks.File 7.0.0`, `Microsoft.Data.Sqlite 10.0.13`, `QRCoder 1.8.1`, `Vite 8.3.8`, `React 19.3.1`). **Empfehlung:** Nicht pauschal aktualisieren – erst nach etabliertem lokalem Build/Test gezielt und schrittweise prüfen (insbesondere Major-Updates wie `NAudio 2.x → 3.x`!).
6. **Kompakte Einzeiler-Formatierung im C#-Code:** Viele Methoden in `App.xaml.cs`, `Storage.cs`, `WebServerService.cs` und `MainWindow.xaml.cs` packen mehrere Anweisungen in eine Zeile, was Code-Diffs und Debugging im Stacktrace erschwert. Bestehende Dateien nur bei tatsächlichem Bedarf behutsam anpassen.
