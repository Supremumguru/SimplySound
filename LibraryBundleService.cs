using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using NAudio.Wave;
using Serilog;

namespace VRSoundboard;

public sealed record LibraryImportResult(int Sounds, int Images);

public sealed class LibraryBundleService(AppCoordinator coordinator)
{
    private const int CurrentFormatVersion = 1;
    private const long MaxSingleFileBytes = 200L * 1024 * 1024;
    private const long MaxTotalImportBytes = 1024L * 1024 * 1024;
    private const long MaxManifestBytes = 16L * 1024 * 1024;
    private static readonly HashSet<string> AllowedAudioExtensions = new(StringComparer.OrdinalIgnoreCase) { ".mp3", ".wav", ".m4a", ".aac", ".wma" };
    private static readonly HashSet<string> AllowedImageExtensions = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".webp" };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _portableTargetDir;

    public string? PortableTargetDirectory => _portableTargetDir;

    public void ConfigurePortableTargetDirectory(string? directory)
    {
        if (string.IsNullOrWhiteSpace(directory)) return;
        _portableTargetDir = Path.GetFullPath(directory);
    }

    public async Task ExportZipAsync(Stream destination, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var sounds = coordinator.Library.All;
            var settings = coordinator.Settings;
            var manifest = new LibraryBundleManifest(
                Format: "simplysound-library",
                Version: CurrentFormatVersion,
                ExportedUtc: DateTime.UtcNow,
                Sounds: sounds,
                Settings: PortableSettingsSnapshot.From(settings));

            using var archive = new ZipArchive(destination, ZipArchiveMode.Create, leaveOpen: true);
            var manifestEntry = archive.CreateEntry("manifest.json", CompressionLevel.Optimal);
            await using (var manifestStream = manifestEntry.Open())
                await JsonSerializer.SerializeAsync(manifestStream, manifest, JsonOptions, cancellationToken);

            var addedEntries = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var sound in sounds)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (sound.IsHeading) continue;

                var sourcePath = coordinator.Library.FindSourceAudioPath(sound);
                if (sourcePath is null && !string.IsNullOrWhiteSpace(sound.StoredFilename))
                {
                    var fallbackCache = Path.Combine(coordinator.Storage.CachePath, sound.StoredFilename);
                    if (File.Exists(fallbackCache)) sourcePath = fallbackCache;
                }
                if (sourcePath is null) throw new InvalidDataException($"Audio file for “{sound.Name}” is missing.");
                if (addedEntries.Add("sounds/" + Path.GetFileName(sourcePath)))
                {
                    var entryName = "sounds/" + Path.GetFileName(sourcePath);
                    var entry = archive.CreateEntry(entryName, CompressionLevel.NoCompression);
                    await using var input = File.OpenRead(sourcePath);
                    await using var output = entry.Open();
                    await input.CopyToAsync(output, cancellationToken);
                }

                if (!string.IsNullOrWhiteSpace(sound.ImageFilename))
                {
                    var imagePath = Path.Combine(coordinator.Storage.ImagesPath, sound.ImageFilename);
                    if (File.Exists(imagePath))
                    {
                        var entryName = "images/" + sound.ImageFilename;
                        if (addedEntries.Add(entryName))
                        {
                            var entry = archive.CreateEntry(entryName, CompressionLevel.NoCompression);
                            await using var input = File.OpenRead(imagePath);
                            await using var output = entry.Open();
                            await input.CopyToAsync(output, cancellationToken);
                        }
                    }
                }
            }
        }
        finally { _gate.Release(); }
    }

    public async Task<LibraryImportResult> ImportZipAsync(Stream zipStream, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        var stagingRoot = Path.Combine(coordinator.Storage.Root, ".import-" + Guid.NewGuid().ToString("N"));
        var placedFiles = new List<string>();
        var libraryReplaced = false;
        try
        {
            Directory.CreateDirectory(stagingRoot);
            var stagedZip = Path.Combine(stagingRoot, "bundle.zip");
            await using (var zipFile = new FileStream(stagedZip, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                await zipStream.CopyToAsync(zipFile, cancellationToken);

            var stagedSoundsDir = Path.Combine(stagingRoot, "sounds");
            var stagedCacheDir = Path.Combine(stagingRoot, "cache");
            var stagedImagesDir = Path.Combine(stagingRoot, "images");
            Directory.CreateDirectory(stagedSoundsDir);
            Directory.CreateDirectory(stagedCacheDir);
            Directory.CreateDirectory(stagedImagesDir);

            LibraryBundleManifest manifest;
            var extractedAudioById = new Dictionary<Guid, string>();
            var extractedImages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            using (var archive = ZipFile.OpenRead(stagedZip))
            {
                var manifestEntry = archive.GetEntry("manifest.json")
                    ?? throw new InvalidDataException("Invalid SimplySound backup: manifest.json is missing.");
                var manifestPath = Path.Combine(stagingRoot, "manifest.json");
                await ExtractEntryBoundedAsync(manifestEntry, manifestPath, MaxManifestBytes, MaxManifestBytes, cancellationToken);
                await using (var manifestStream = File.OpenRead(manifestPath))
                    manifest = await JsonSerializer.DeserializeAsync<LibraryBundleManifest>(manifestStream, JsonOptions, cancellationToken)
                        ?? throw new InvalidDataException("Invalid SimplySound backup: manifest.json is empty.");

                if (!string.Equals(manifest.Format, "simplysound-library", StringComparison.Ordinal) || manifest.Version != CurrentFormatVersion || manifest.Sounds is null)
                    throw new InvalidDataException("Unsupported SimplySound backup format.");

                long totalBytes = 0;
                foreach (var entry in archive.Entries)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var normalizedPath = entry.FullName.Replace('\\', '/');
                    if (string.IsNullOrEmpty(entry.Name) || normalizedPath.Equals("manifest.json", StringComparison.OrdinalIgnoreCase)) continue;
                    if (normalizedPath.Contains("..", StringComparison.Ordinal) || normalizedPath.StartsWith('/'))
                        throw new InvalidDataException("Backup contains an invalid file path.");

                    var parts = normalizedPath.Split('/');
                    if (parts.Length != 2) continue;
                    var folder = parts[0];
                    var fileName = parts[1];
                    if (!IsSafeFileName(fileName)) throw new InvalidDataException($"Backup contains an unsafe filename: {fileName}");
                    if (entry.Length > MaxSingleFileBytes) throw new InvalidDataException($"File in backup is too large: {fileName}");

                    if (folder.Equals("sounds", StringComparison.OrdinalIgnoreCase))
                    {
                        var ext = Path.GetExtension(fileName).ToLowerInvariant();
                        if (!AllowedAudioExtensions.Contains(ext)) continue;
                        var stem = Path.GetFileNameWithoutExtension(fileName);
                        if (!Guid.TryParse(stem, out var soundId)) continue;
                        var targetPath = Path.Combine(stagedSoundsDir, soundId + ext);
                        totalBytes += await ExtractEntryBoundedAsync(entry, targetPath, MaxSingleFileBytes, MaxTotalImportBytes - totalBytes, cancellationToken);
                        extractedAudioById[soundId] = targetPath;
                    }
                    else if (folder.Equals("images", StringComparison.OrdinalIgnoreCase))
                    {
                        var ext = Path.GetExtension(fileName).ToLowerInvariant();
                        if (!AllowedImageExtensions.Contains(ext)) continue;
                        var targetPath = Path.Combine(stagedImagesDir, fileName);
                        totalBytes += await ExtractEntryBoundedAsync(entry, targetPath, 5L * 1024 * 1024, MaxTotalImportBytes - totalBytes, cancellationToken);
                        if (!HasValidImageHeader(targetPath, ext))
                        {
                            File.Delete(targetPath);
                            throw new InvalidDataException($"Backup image is corrupted or unsupported: {fileName}");
                        }
                        extractedImages.Add(fileName);
                    }
                }
            }

            var incoming = new List<Sound>(manifest.Sounds.Count);
            var seenIds = new HashSet<Guid>();
            var usedHotkeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var stagedAssets = new List<(string Source, string Destination)>();
            var imageNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var importedSoundCount = 0;
            var importedImageCount = 0;

            foreach (var raw in manifest.Sounds)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (raw is null || raw.Id == Guid.Empty || !seenIds.Add(raw.Id))
                    throw new InvalidDataException("Backup contains missing or duplicate library IDs.");
                var name = Regex.Replace(raw.Name ?? string.Empty, @"[\p{C}]", "").Trim();
                if (name.Length == 0) name = "Sound";
                if (name.Length > 100) name = name[..100];
                var id = Guid.NewGuid();
                if (raw.IsHeading)
                {
                    incoming.Add(new Sound { Id = id, Name = name, Kind = "heading" });
                    continue;
                }

                if (!extractedAudioById.TryGetValue(raw.Id, out var stagedAudioPath))
                    throw new InvalidDataException($"Audio file for “{name}” is missing from the backup.");

                var audioExtension = Path.GetExtension(stagedAudioPath);
                var cacheFilename = id + ".wav";
                var stagedCachePath = Path.Combine(stagedCacheDir, cacheFilename);
                double duration = 0;
                await Task.Run(() =>
                {
                    using var reader = new AudioFileReader(stagedAudioPath);
                    duration = reader.TotalTime.TotalSeconds;
                    if (duration <= 0 || duration > 3600) throw new InvalidDataException($"Invalid audio duration for “{name}”.");
                    WaveFileWriter.CreateWaveFile16(stagedCachePath, reader);
                }, cancellationToken);
                stagedAssets.Add((stagedAudioPath, Path.Combine(coordinator.Storage.SoundsPath, id + audioExtension)));
                stagedAssets.Add((stagedCachePath, Path.Combine(coordinator.Storage.CachePath, cacheFilename)));

                string? hotkey = null;
                if (!string.IsNullOrWhiteSpace(raw.Hotkey))
                {
                    try
                    {
                        var normalizedHotkey = SoundHotkey.Normalize(raw.Hotkey);
                        if (normalizedHotkey is not null && usedHotkeys.Add(normalizedHotkey)) hotkey = normalizedHotkey;
                    }
                    catch (ArgumentException) { }
                }

                string? imageFilename = null;
                if (!string.IsNullOrWhiteSpace(raw.ImageFilename) && extractedImages.Contains(raw.ImageFilename))
                {
                    if (!imageNames.TryGetValue(raw.ImageFilename, out imageFilename))
                    {
                        imageFilename = id + "-cover" + Path.GetExtension(raw.ImageFilename).ToLowerInvariant();
                        imageNames.Add(raw.ImageFilename, imageFilename);
                        stagedAssets.Add((Path.Combine(stagedImagesDir, raw.ImageFilename), Path.Combine(coordinator.Storage.ImagesPath, imageFilename)));
                    }
                    importedImageCount++;
                }

                var minimumSegment = Math.Min(.01, Math.Max(0, duration));
                var start = Math.Clamp(raw.StartSeconds, 0, Math.Max(0, duration - minimumSegment));
                double? end = raw.EndSeconds is double endValue
                    ? Math.Clamp(endValue, Math.Min(duration, start + minimumSegment), duration)
                    : null;

                incoming.Add(new Sound
                {
                    Id = id,
                    Name = name,
                    SourceFilename = string.IsNullOrWhiteSpace(raw.SourceFilename) ? name + audioExtension : Path.ChangeExtension(Path.GetFileName(raw.SourceFilename), audioExtension),
                    SourceProvider = raw.SourceUrl is { } sourceUrl && MarketplaceService.IsAllowedPageUrl(sourceUrl) ? raw.SourceProvider : null,
                    SourceUrl = raw.SourceUrl is { } url && MarketplaceService.IsAllowedPageUrl(url) ? url : null,
                    StoredFilename = cacheFilename,
                    SortOrder = incoming.Count,
                    Volume = Math.Clamp(raw.Volume, 0, 1),
                    OutputGain = Math.Clamp(raw.OutputGain, 0, 1),
                    StartSeconds = start,
                    EndSeconds = end,
                    SourceDurationSeconds = duration,
                    Mode = raw.Mode is "retrigger" ? "retrigger" : "toggle",
                    Hotkey = hotkey,
                    CreatedUtc = raw.CreatedUtc == default ? DateTime.UtcNow : raw.CreatedUtc,
                    Icon = raw.Icon,
                    ButtonLabel = string.IsNullOrWhiteSpace(raw.ButtonLabel) ? null : raw.ButtonLabel.Trim(),
                    ImageFilename = imageFilename,
                });
                importedSoundCount++;
            }

            // Stop active playback so old cache files are released before swapping.
            coordinator.Stop();

            Directory.CreateDirectory(coordinator.Storage.SoundsPath);
            Directory.CreateDirectory(coordinator.Storage.CachePath);
            Directory.CreateDirectory(coordinator.Storage.ImagesPath);

            foreach (var (source, destination) in stagedAssets)
            {
                cancellationToken.ThrowIfCancellationRequested();
                File.Move(source, destination);
                placedFiles.Add(destination);
            }

            var previousSounds = coordinator.Library.ReplaceAll(incoming);
            libraryReplaced = true;

            if (manifest.Settings is { } importedSettings)
            {
                coordinator.UpdateSettings(s =>
                {
                    s.MasterVolume = Math.Clamp(importedSettings.MasterVolume, 0, 1);
                    s.MicOutputGain = Math.Clamp(importedSettings.MicOutputGain, 0, 0.25f);
                    s.UseVirtualMicHeadroom = importedSettings.UseVirtualMicHeadroom;
                    s.MonitorLocally = importedSettings.MonitorLocally;
                    s.ReconnectAudio = importedSettings.ReconnectAudio;
                    if (importedSettings.ButtonDensity is 6 or 9 or 12 or 15 or 20) s.ButtonDensity = importedSettings.ButtonDensity;
                    if (importedSettings.MaxUploadBytes is >= 1024 * 1024 and <= 200L * 1024 * 1024) s.MaxUploadBytes = importedSettings.MaxUploadBytes;
                    // Deliberately keep this PC's audio endpoints and network/pairing settings intact.
                });
            }

            foreach (var old in previousSounds)
            {
                if (old.IsHeading) continue;
                if (coordinator.Library.FindSourceAudioPath(old) is { } oldSource) TryDelete(oldSource);
                if (!string.IsNullOrWhiteSpace(old.StoredFilename))
                    TryDelete(Path.Combine(coordinator.Storage.CachePath, old.StoredFilename));
                if (!string.IsNullOrWhiteSpace(old.ImageFilename))
                    TryDelete(Path.Combine(coordinator.Storage.ImagesPath, old.ImageFilename));
            }

            Log.Information("Library backup imported: {Sounds} sounds, {Images} images", importedSoundCount, importedImageCount);
            return new LibraryImportResult(importedSoundCount, importedImageCount);
        }
        finally
        {
            if (!libraryReplaced)
                foreach (var file in placedFiles) TryDelete(file);
            try { if (Directory.Exists(stagingRoot)) Directory.Delete(stagingRoot, recursive: true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
            _gate.Release();
        }
    }

    public async Task<string> CopyCurrentDataToPortableAsync(CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_portableTargetDir))
            throw new InvalidOperationException("Portable target folder is not configured.");
        if (coordinator.Storage.IsPortableMode)
            return coordinator.Storage.Root;

        await _gate.WaitAsync(cancellationToken);
        var targetDir = _portableTargetDir;
        var stagingDir = targetDir + ".staging-" + Environment.ProcessId + "-" + Guid.NewGuid().ToString("N")[..8];
        try
        {
            await Task.Run(() =>
            {
                Directory.CreateDirectory(stagingDir);
                coordinator.Storage.BackupDatabaseTo(Path.Combine(stagingDir, "database", "library.db"));
                CopyDirectoryIfExists(coordinator.Storage.SoundsPath, Path.Combine(stagingDir, "sounds"), cancellationToken);
                CopyDirectoryIfExists(coordinator.Storage.ImagesPath, Path.Combine(stagingDir, "images"), cancellationToken);
                CopyDirectoryIfExists(coordinator.Storage.CachePath, Path.Combine(stagingDir, "cache"), cancellationToken);
                Directory.CreateDirectory(Path.Combine(stagingDir, "logs"));

                if (Directory.Exists(targetDir)) Directory.Delete(targetDir, recursive: false);
                Directory.Move(stagingDir, targetDir);
            }, cancellationToken);

            Log.Information("Copied soundboard library into portable folder {PortableDir}", targetDir);
            return targetDir;
        }
        catch
        {
            try { if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, recursive: true); }
            catch { }
            throw;
        }
        finally { _gate.Release(); }
    }

    private static void CopyDirectoryIfExists(string sourceDir, string destDir, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(destDir);
        if (!Directory.Exists(sourceDir)) return;
        foreach (var file in Directory.EnumerateFiles(sourceDir))
        {
            cancellationToken.ThrowIfCancellationRequested();
            File.Copy(file, Path.Combine(destDir, Path.GetFileName(file)), overwrite: true);
        }
    }

    private static async Task<long> ExtractEntryBoundedAsync(ZipArchiveEntry entry, string destinationPath, long maxFileBytes, long remainingTotalBytes, CancellationToken cancellationToken)
    {
        var limit = Math.Min(maxFileBytes, remainingTotalBytes);
        if (limit <= 0) throw new InvalidDataException("Backup exceeds the maximum allowed import size.");
        await using var source = entry.Open();
        await using var target = new FileStream(destinationPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        var buffer = new byte[64 * 1024];
        long written = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            written += read;
            if (written > limit) throw new InvalidDataException("Backup file exceeds the maximum allowed size.");
            await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        return written;
    }

    private static bool IsSafeFileName(string name)
        => !string.IsNullOrWhiteSpace(name)
           && name.Length <= 200
           && !name.Contains('/')
           && !name.Contains('\\')
           && !name.Contains("..", StringComparison.Ordinal)
           && name.IndexOfAny(Path.GetInvalidFileNameChars()) < 0;

    private static bool HasValidImageHeader(string path, string ext)
    {
        var head = new byte[12];
        using var stream = File.OpenRead(path);
        var read = stream.Read(head, 0, head.Length);
        return ext switch
        {
            ".png" => read >= 8 && head.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            ".jpg" => read >= 3 && head[0] == 0xff && head[1] == 0xd8 && head[2] == 0xff,
            ".webp" => read >= 12 && head.AsSpan(0, 4).SequenceEqual("RIFF"u8) && head.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            _ => false
        };
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch (IOException ex) { Log.Warning(ex, "Could not remove old asset {AssetPath}", path); }
        catch (UnauthorizedAccessException ex) { Log.Warning(ex, "Could not remove old asset {AssetPath}", path); }
    }
}

internal sealed record LibraryBundleManifest(
    string Format,
    int Version,
    DateTime ExportedUtc,
    IReadOnlyList<Sound> Sounds,
    PortableSettingsSnapshot? Settings);

internal sealed record PortableSettingsSnapshot(
    float MasterVolume,
    float MicOutputGain,
    bool UseVirtualMicHeadroom,
    bool MonitorLocally,
    bool ReconnectAudio,
    int ButtonDensity,
    long MaxUploadBytes)
{
    public static PortableSettingsSnapshot From(AppSettings settings) => new(
        settings.MasterVolume,
        settings.MicOutputGain,
        settings.UseVirtualMicHeadroom,
        settings.MonitorLocally,
        settings.ReconnectAudio,
        settings.ButtonDensity,
        settings.MaxUploadBytes);
}
