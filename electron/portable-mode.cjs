'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PORTABLE_FOLDER_NAME = 'SimplySoundData';

function getAppBaseDir({ isPackaged, portableExecutableDir, execPath, devRoot }) {
  if (typeof portableExecutableDir === 'string' && portableExecutableDir.trim()) {
    return path.resolve(portableExecutableDir.trim());
  }
  if (isPackaged && typeof execPath === 'string' && execPath.trim()) {
    return path.dirname(path.resolve(execPath.trim()));
  }
  return path.resolve(devRoot);
}

function resolvePortablePaths({ isPackaged, portableExecutableDir, execPath, devRoot, appDataDir, existsSync = fs.existsSync }) {
  const baseDir = getAppBaseDir({ isPackaged, portableExecutableDir, execPath, devRoot });
  const portableDataDir = path.join(baseDir, PORTABLE_FOLDER_NAME);
  const portableActive = Boolean(existsSync(portableDataDir));
  const userDataDir = portableActive
    ? path.join(portableDataDir, 'electron-data')
    : path.join(appDataDir, 'SimplySound');
  return {
    baseDir,
    portableDataDir,
    portableActive,
    userDataDir,
  };
}

function getRelaunchOptions({ portableExecutableFile, execPath, argv }) {
  if (typeof portableExecutableFile === 'string' && portableExecutableFile.trim()) {
    return { execPath: portableExecutableFile.trim(), args: [] };
  }
  return { execPath, args: Array.isArray(argv) ? argv.slice(1) : [] };
}

module.exports = {
  PORTABLE_FOLDER_NAME,
  getAppBaseDir,
  resolvePortablePaths,
  getRelaunchOptions,
};
