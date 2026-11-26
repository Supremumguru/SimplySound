'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { getAppBaseDir, getRelaunchOptions, resolvePortablePaths } = require('./portable-mode.cjs');

test('prefers PORTABLE_EXECUTABLE_DIR when launched as a portable Windows EXE', () => {
  const baseDir = getAppBaseDir({
    isPackaged: true,
    portableExecutableDir: 'E:\\USB\\SimplySound',
    execPath: 'C:\\Temp\\nsis-123\\SimplySound.exe',
    devRoot: 'C:\\Repo',
  });
  assert.equal(baseDir, path.resolve('E:\\USB\\SimplySound'));
});

test('activates portable data mode automatically when SimplySoundData exists next to the EXE', () => {
  const portableDir = path.join(path.resolve('E:\\USB\\SimplySound'), 'SimplySoundData');
  const resolved = resolvePortablePaths({
    isPackaged: true,
    portableExecutableDir: 'E:\\USB\\SimplySound',
    execPath: 'C:\\Temp\\nsis-123\\SimplySound.exe',
    devRoot: 'C:\\Repo',
    appDataDir: 'C:\\Users\\Test\\AppData\\Roaming',
    existsSync: target => target === portableDir,
  });

  assert.equal(resolved.portableActive, true);
  assert.equal(resolved.portableDataDir, portableDir);
  assert.equal(resolved.userDataDir, path.join(portableDir, 'electron-data'));
});

test('uses standard AppData paths when SimplySoundData does not exist yet', () => {
  const resolved = resolvePortablePaths({
    isPackaged: true,
    portableExecutableDir: 'E:\\USB\\SimplySound',
    execPath: 'C:\\Temp\\nsis-123\\SimplySound.exe',
    devRoot: 'C:\\Repo',
    appDataDir: 'C:\\Users\\Test\\AppData\\Roaming',
    existsSync: () => false,
  });

  assert.equal(resolved.portableActive, false);
  assert.equal(resolved.userDataDir, path.join('C:\\Users\\Test\\AppData\\Roaming', 'SimplySound'));
});

test('relaunches the outer portable executable rather than the temporary extracted binary', () => {
  const options = getRelaunchOptions({
    portableExecutableFile: 'E:\\USB\\SimplySound\\SimplySound-1.1.9-Windows.exe',
    execPath: 'C:\\Temp\\nsis-123\\SimplySound.exe',
    argv: ['SimplySound.exe', '--foo'],
  });
  assert.deepEqual(options, {
    execPath: 'E:\\USB\\SimplySound\\SimplySound-1.1.9-Windows.exe',
    args: [],
  });
});
