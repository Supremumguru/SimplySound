using System.IO;
using System.IO.Compression;
using Microsoft.Data.Sqlite;
using NAudio.Wave;
using VRSoundboard;
using Xunit;

namespace SimplySound.Tests;

public sealed class LibraryBundleTests
{
    private static readonly byte[] MinimalPngHeader = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];

    [Fact]
    public void ExplicitPortableStorageRootUsesExactDirectoryWithoutLegacyMigration()
    {
        var root = CreateTempDir("portable-root");
        try
        {
            var storage = new Storage(explicitRootPath: root);
            storage.Initialize();

            Assert.True(storage.IsPortableMode);
            Assert.Equal(Path.GetFullPath(root), storage.Root);
            Assert.True(Directory.Exists(storage.SoundsPath));
            Assert.True(Directory.Exists(storage.CachePath));
            Assert.True(Directory.Exists(storage.ImagesPath));
            Assert.True(File.Exists(Path.Combine(root, "database", "library.db")));
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            CleanupDir(root);
        }
    }

    [Fact]
    public async Task EnsureCachedWaveRebuildsDeletedCacheFromOriginalSource()
    {
        var root = CreateTempDir("cache-rebuild");
        var wavPath = Path.Combine(root, "sample.wav");
        try
        {
            Directory.CreateDirectory(root);
            CreateToneWav(wavPath);
            var storage = new Storage(explicitRootPath: Path.Combine(root, "data"));
            storage.Initialize();
            var library = new SoundLibrary(storage);
            Sound sound;
            await using (var stream = File.OpenRead(wavPath)) sound = await library.ImportAsync(stream, "sample.wav");

            var cachePath = Path.Combine(storage.CachePath, sound.StoredFilename);
            Assert.True(File.Exists(cachePath));
            File.Delete(cachePath);
            Assert.False(File.Exists(cachePath));

            library.EnsureCachedWave(sound);

            Assert.True(File.Exists(cachePath));
            Assert.True(new FileInfo(cachePath).Length > 44);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            CleanupDir(root);
        }
    }

    [Fact]
    public async Task ZipExportAndImportRoundTripsSoundsHeadingsImagesAndPreservesTargetEndpoints()
    {
        var sourceDir = CreateTempDir("bundle-src");
        var targetDir = CreateTempDir("bundle-dst");
        var wavPath = Path.Combine(sourceDir, "zonk.wav");
        using var audioContext = new AudioExecutionContext();
        using var devices = new AudioDeviceService(audioContext);
        try
        {
            Directory.CreateDirectory(sourceDir);
            CreateToneWav(wavPath);

            var srcStorage = new Storage(explicitRootPath: Path.Combine(sourceDir, "data"));
            srcStorage.Initialize();
            var srcLibrary = new SoundLibrary(srcStorage);
            using var srcAudio = new AudioEngine(devices, srcStorage, audioContext);
            var srcCoordinator = new AppCoordinator(srcStorage, srcLibrary, srcAudio, devices);
            srcCoordinator.UpdateSettings(s =>
            {
                s.MasterVolume = 0.65f;
                s.EndpointId = "home-speaker-guid";
                s.MonitorEndpointId = "home-monitor-guid";
            });

            Sound sound;
            await using (var stream = File.OpenRead(wavPath)) sound = await srcLibrary.ImportAsync(stream, "zonk.wav");
            var coverName = sound.Id + "-cover.png";
            await File.WriteAllBytesAsync(Path.Combine(srcStorage.ImagesPath, coverName), MinimalPngHeader);
            srcLibrary.Update(sound.Id, item =>
            {
                item.Name = "Der Zonk";
                item.ButtonLabel = "ZONK";
                item.OutputGain = 0.55f;
                item.Mode = "retrigger";
                item.Hotkey = "Control+Alt+Z";
                item.ImageFilename = coverName;
            });

            var srcBundles = new LibraryBundleService(srcCoordinator);
            using var zipMemory = new MemoryStream();
            await srcBundles.ExportZipAsync(zipMemory);
            zipMemory.Position = 0;

            // Verify WAV cache is NOT bloated into the ZIP archive.
            using (var checkArchive = new ZipArchive(zipMemory, ZipArchiveMode.Read, leaveOpen: true))
            {
                Assert.NotNull(checkArchive.GetEntry("manifest.json"));
                Assert.DoesNotContain(checkArchive.Entries, entry => entry.FullName.StartsWith("cache/", StringComparison.OrdinalIgnoreCase));
            }
            zipMemory.Position = 0;

            var dstStorage = new Storage(explicitRootPath: Path.Combine(targetDir, "data"));
            dstStorage.Initialize();
            var dstLibrary = new SoundLibrary(dstStorage);
            using var dstAudio = new AudioEngine(devices, dstStorage, audioContext);
            var dstCoordinator = new AppCoordinator(dstStorage, dstLibrary, dstAudio, devices);
            dstCoordinator.UpdateSettings(s =>
            {
                s.EndpointId = "work-speaker-guid";
                s.MonitorEndpointId = "work-monitor-guid";
            });

            var dstBundles = new LibraryBundleService(dstCoordinator);
            var imported = await dstBundles.ImportZipAsync(zipMemory);

            Assert.Equal(1, imported.Sounds);
            Assert.Equal(1, imported.Images);

            var items = dstLibrary.All;
            Assert.Single(items);
            Assert.Equal("Der Zonk", items[0].Name);
            Assert.Equal("ZONK", items[0].ButtonLabel);
            Assert.Equal("Control+Alt+Z", items[0].Hotkey);
            Assert.Equal("retrigger", items[0].Mode);
            Assert.Equal(0.55f, items[0].OutputGain, 3);
            Assert.Equal(coverName, items[0].ImageFilename);

            Assert.True(File.Exists(Path.Combine(dstStorage.CachePath, items[0].StoredFilename)));
            Assert.True(File.Exists(Path.Combine(dstStorage.ImagesPath, coverName)));
            Assert.Equal(0.65f, dstCoordinator.Settings.MasterVolume, 3);
            Assert.Equal("work-speaker-guid", dstCoordinator.Settings.EndpointId);
            Assert.Equal("work-monitor-guid", dstCoordinator.Settings.MonitorEndpointId);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            CleanupDir(sourceDir);
            CleanupDir(targetDir);
        }
    }

    [Fact]
    public async Task CopyCurrentDataToPortableCreatesSelfContainedDataFolder()
    {
        var workDir = CreateTempDir("portable-copy");
        var wavPath = Path.Combine(workDir, "clip.wav");
        using var audioContext = new AudioExecutionContext();
        using var devices = new AudioDeviceService(audioContext);
        try
        {
            Directory.CreateDirectory(workDir);
            CreateToneWav(wavPath);
            var appDataRoot = Path.Combine(workDir, "appdata");
            var portableTarget = Path.Combine(workDir, "usb", "SimplySoundData");

            var storage = new Storage(localAppDataPath: appDataRoot);
            storage.Initialize();
            var library = new SoundLibrary(storage);
            using var audio = new AudioEngine(devices, storage, audioContext);
            var coordinator = new AppCoordinator(storage, library, audio, devices);

            Sound sound;
            await using (var stream = File.OpenRead(wavPath)) sound = await library.ImportAsync(stream, "clip.wav");

            var bundles = new LibraryBundleService(coordinator);
            bundles.ConfigurePortableTargetDirectory(portableTarget);

            var createdPath = await bundles.CopyCurrentDataToPortableAsync();

            Assert.Equal(Path.GetFullPath(portableTarget), createdPath);
            var portableStorage = new Storage(explicitRootPath: createdPath);
            var loaded = portableStorage.LoadSounds();
            Assert.Single(loaded);
            Assert.Equal(sound.Id, loaded[0].Id);
            Assert.True(File.Exists(Path.Combine(portableStorage.SoundsPath, sound.Id + ".wav")));
            Assert.True(File.Exists(Path.Combine(portableStorage.CachePath, sound.StoredFilename)));
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            CleanupDir(workDir);
        }
    }

    private static string CreateTempDir(string prefix) => Path.Combine(Path.GetTempPath(), $"SimplySound-{prefix}-{Guid.NewGuid():N}");

    private static void CreateToneWav(string path)
    {
        using var writer = new WaveFileWriter(path, new WaveFormat(44100, 16, 1));
        var samples = new short[4410];
        for (var i = 0; i < samples.Length; i++) samples[i] = (short)(Math.Sin(2 * Math.PI * 440 * i / 44100) * 4000);
        writer.WriteSamples(samples, 0, samples.Length);
    }

    private static void CleanupDir(string path)
    {
        if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
    }
}
