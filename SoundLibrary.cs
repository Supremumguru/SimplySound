using NAudio.Wave;
using Serilog;
using System.IO;
using System.Text.RegularExpressions;

namespace VRSoundboard;

public sealed class SoundLibrary(Storage storage)
{
    private readonly object _gate = new();
    private readonly List<Sound> _sounds = storage.LoadSounds();
    private IReadOnlyList<SoundHotkeyAssignment>? _hotkeyAssignments;
    public event Action<string, object?>? Changed;
    public IReadOnlyList<Sound> All { get { lock (_gate) return _sounds.OrderBy(s => s.SortOrder).Select(Clone).ToList(); } }
    public IReadOnlyList<SoundHotkeyAssignment> HotkeyAssignments
    {
        get
        {
            lock (_gate)
                return _hotkeyAssignments ??= Array.AsReadOnly(_sounds
                    .Where(sound => !sound.IsHeading && !string.IsNullOrWhiteSpace(sound.Hotkey))
                    .Select(sound => new SoundHotkeyAssignment(sound.Id, sound.Name, sound.Hotkey!))
                    .ToArray());
        }
    }
    public Sound? Get(Guid id) { lock (_gate) return _sounds.Where(s => s.Id == id).Select(Clone).FirstOrDefault(); }
    private static Sound Clone(Sound s) => s.Copy();

    public string? FindSourceAudioPath(Sound sound)
    {
        var ext = Path.GetExtension(sound.SourceFilename).ToLowerInvariant();
        if (!string.IsNullOrEmpty(ext))
        {
            var direct = Path.Combine(storage.SoundsPath, sound.Id + ext);
            if (File.Exists(direct)) return direct;
        }
        foreach (var candidateExt in new[] { ".mp3", ".wav", ".m4a", ".aac", ".wma" })
        {
            var candidate = Path.Combine(storage.SoundsPath, sound.Id + candidateExt);
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    public void EnsureCachedWave(Sound sound)
    {
        if (string.IsNullOrWhiteSpace(sound.StoredFilename)) return;
        var cachePath = Path.Combine(storage.CachePath, sound.StoredFilename);
        if (File.Exists(cachePath)) return;
        var sourcePath = FindSourceAudioPath(sound);
        if (sourcePath is null) return;
        Directory.CreateDirectory(storage.CachePath);
        var tempPath = cachePath + ".rebuild-" + Guid.NewGuid().ToString("N");
        try
        {
            using (var reader = new AudioFileReader(sourcePath))
                WaveFileWriter.CreateWaveFile16(tempPath, reader);
            File.Move(tempPath, cachePath, overwrite: true);
            Log.Information("Rebuilt missing WAV cache for sound {SoundId}", sound.Id);
        }
        catch
        {
            TryDeleteAsset(tempPath);
            throw;
        }
    }

    internal IReadOnlyList<Sound> ReplaceAll(IReadOnlyList<Sound> sounds)
    {
        List<Sound> previous;
        List<Sound> normalized;
        lock (_gate)
        {
            previous = _sounds.Select(Clone).ToList();
            normalized = new List<Sound>(sounds.Count);
            for (var i = 0; i < sounds.Count; i++)
            {
                var copy = Clone(sounds[i]);
                copy.SortOrder = i;
                normalized.Add(copy);
            }
            storage.ReplaceAllSounds(normalized);
            _sounds.Clear();
            _sounds.AddRange(normalized);
            _hotkeyAssignments = null;
        }
        Changed?.Invoke("library-imported", new { count = normalized.Count });
        return previous;
    }

    public async Task<Sound> ImportAsync(Stream stream, string filename, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(filename).ToLowerInvariant();
        if (ext is not (".mp3" or ".wav" or ".m4a" or ".aac" or ".wma")) throw new InvalidDataException("Supported formats: MP3, WAV, M4A, AAC and WMA.");
        var id = Guid.NewGuid();
        var sourcePath = Path.Combine(storage.SoundsPath, id + ext);
        var cachePath = Path.Combine(storage.CachePath, id + ".wav");
        try
        {
            await using (var file = new FileStream(sourcePath, FileMode.CreateNew, FileAccess.Write, FileShare.None)) await stream.CopyToAsync(file, ct);
            double duration = 0;
            await Task.Run(() =>
            {
                using var reader = new AudioFileReader(sourcePath);
                duration = reader.TotalTime.TotalSeconds;
                if (duration <= 0 || duration > 3600) throw new InvalidDataException("Audio duration must be between 0 and 3600 seconds.");
                WaveFileWriter.CreateWaveFile16(cachePath, reader);
            }, ct);
            var name = Regex.Replace(Path.GetFileNameWithoutExtension(filename), @"[\p{C}]", "").Trim();
            var sound = new Sound { Id = id, Name = string.IsNullOrWhiteSpace(name) ? "Sound" : name[..Math.Min(name.Length, 100)], SourceFilename = Path.GetFileName(filename), StoredFilename = id + ".wav", SourceDurationSeconds = duration };
            lock (_gate) { sound.SortOrder = _sounds.Count; storage.Save(sound); _sounds.Add(sound); _hotkeyAssignments = null; }
            Changed?.Invoke("sound-added", sound);
            return Clone(sound);
        }
        catch { File.Delete(sourcePath); File.Delete(cachePath); throw; }
    }

    public Sound AddHeading(string name)
    {
        var cleaned = Regex.Replace(name ?? string.Empty, @"[\p{C}]", "").Trim();
        if (cleaned.Length is < 1 or > 100) throw new ArgumentException("Heading name must contain 1 to 100 characters.");
        var heading = new Sound
        {
            Id = Guid.NewGuid(),
            Kind = "heading",
            Name = cleaned,
            SourceFilename = "",
            StoredFilename = "",
            SourceDurationSeconds = 0,
            OutputGain = 0.75f,
            Mode = "toggle",
        };
        lock (_gate)
        {
            heading.SortOrder = _sounds.Count;
            storage.Save(heading);
            _sounds.Add(heading);
            _hotkeyAssignments = null;
        }
        var snapshot = Clone(heading);
        Changed?.Invoke("sound-added", snapshot);
        return snapshot;
    }

    public Sound Update(Guid id, Action<Sound> change)
    {
        Sound result;
        lock (_gate)
        {
            var index = _sounds.FindIndex(x => x.Id == id);
            if (index < 0) throw new KeyNotFoundException("Sound not found.");
            var s = Clone(_sounds[index]);
            var wasHeading = s.IsHeading;
            change(s);
            s.Kind = wasHeading ? "heading" : "sound";
            s.Name = Regex.Replace(s.Name ?? string.Empty, @"[\p{C}]", "").Trim();
            if (s.Name.Length is < 1 or > 100) throw new ArgumentException("Name must contain 1 to 100 characters.");
            if (s.IsHeading)
            {
                if (!string.IsNullOrWhiteSpace(s.Hotkey)) throw new ArgumentException("Headings cannot have a keyboard shortcut.");
                s.Hotkey = null;
                s.ButtonLabel = null;
                s.ImageFilename = null;
                s.StartSeconds = 0;
                s.EndSeconds = null;
                s.Mode = "toggle";
            }
            else
            {
                s.Hotkey = SoundHotkey.Normalize(s.Hotkey);
                if (s.Hotkey is not null && _sounds.Where((_, soundIndex) => soundIndex != index).Any(sound => string.Equals(sound.Hotkey, s.Hotkey, StringComparison.OrdinalIgnoreCase)))
                    throw new ArgumentException("That hotkey is already assigned to another sound.");
                s.Volume = Math.Clamp(s.Volume, 0, 1);
                s.OutputGain = Math.Clamp(s.OutputGain, 0, 1);
                var minimumSegment = Math.Min(.01, Math.Max(0, s.SourceDurationSeconds));
                s.StartSeconds = Math.Clamp(s.StartSeconds, 0, Math.Max(0, s.SourceDurationSeconds - minimumSegment));
                if (s.EndSeconds is not null)
                {
                    var minimumEnd = Math.Min(s.SourceDurationSeconds, s.StartSeconds + minimumSegment);
                    s.EndSeconds = Math.Clamp(s.EndSeconds.Value, minimumEnd, s.SourceDurationSeconds);
                }
                if (s.Mode is not ("toggle" or "retrigger")) throw new ArgumentException("Invalid playback mode.");
            }
            storage.Save(s); _sounds[index] = s; _hotkeyAssignments = null; result = Clone(s);
        }
        Changed?.Invoke("sound-changed", result);
        return result;
    }
    public void Delete(Guid id)
    {
        DeleteMany([id]);
    }
    public void DeleteMany(IReadOnlyCollection<Guid> ids)
    {
        if (ids.Count == 0) return;
        List<Sound> removed;
        lock (_gate)
        {
            var idSet = ids.ToHashSet();
            var existingIds = _sounds.Select(sound => sound.Id).ToHashSet();
            if (idSet.Count != ids.Count || idSet.Any(id => !existingIds.Contains(id))) throw new KeyNotFoundException("One or more sounds were not found.");
            removed = _sounds.Where(sound => idSet.Contains(sound.Id)).ToList();
            var remaining = _sounds.Where(sound => !idSet.Contains(sound.Id)).Select(Clone).ToList();
            for (var i = 0; i < remaining.Count; i++) remaining[i].SortOrder = i;
            storage.DeleteSoundsAndSaveOrder(ids, remaining);
            _sounds.Clear(); _sounds.AddRange(remaining);
            _hotkeyAssignments = null;
        }
        foreach (var sound in removed)
        {
            if (sound.IsHeading) continue;
            if (!string.IsNullOrWhiteSpace(sound.SourceFilename))
                TryDeleteAsset(Path.Combine(storage.SoundsPath, sound.Id + Path.GetExtension(sound.SourceFilename).ToLowerInvariant()));
            if (!string.IsNullOrWhiteSpace(sound.StoredFilename))
                TryDeleteAsset(Path.Combine(storage.CachePath, sound.StoredFilename));
            if (sound.ImageFilename is not null) TryDeleteAsset(Path.Combine(storage.ImagesPath, sound.ImageFilename));
        }
        if (removed.Count == 1) Changed?.Invoke("sound-deleted", new { id = removed[0].Id });
        else Changed?.Invoke("sounds-deleted", new { ids = removed.Select(sound => sound.Id).ToArray() });
    }
    private static void TryDeleteAsset(string path)
    {
        try { File.Delete(path); }
        catch (IOException ex) { Log.Warning(ex, "Could not remove sound asset {AssetPath}", path); }
        catch (UnauthorizedAccessException ex) { Log.Warning(ex, "Could not remove sound asset {AssetPath}", path); }
    }
    public void Reorder(IReadOnlyList<Guid> ids)
    {
        lock (_gate)
        {
            var byId = _sounds.ToDictionary(sound => sound.Id);
            if (ids.Count != byId.Count || ids.Distinct().Count() != ids.Count || ids.Any(id => !byId.ContainsKey(id))) throw new ArgumentException("Order must contain every sound once.");
            if (_sounds.OrderBy(sound => sound.SortOrder).Select(sound => sound.Id).SequenceEqual(ids)) return;

            var reordered = new List<Sound>(ids.Count);
            for (var i = 0; i < ids.Count; i++)
            {
                var sound = Clone(byId[ids[i]]);
                sound.SortOrder = i;
                reordered.Add(sound);
            }
            storage.SaveSoundsOrder(reordered);
            _sounds.Clear();
            _sounds.AddRange(reordered);
            _hotkeyAssignments = null;
        }
        Changed?.Invoke("order-changed", ids);
    }
}
