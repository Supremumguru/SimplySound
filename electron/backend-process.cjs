const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');

const transientRenameErrors = new Set(['EACCES', 'EBUSY', 'EPERM']);

async function installBackendRuntime(source, runtime, manifest, { rename = fs.rename, pause = wait } = {}) {
  const staged = `${runtime}.new-${process.pid}`;
  const removeOptions = { recursive: true, force: true, maxRetries: 6, retryDelay: 150 };
  await fs.mkdir(path.dirname(runtime), { recursive: true });
  await fs.rm(staged, removeOptions);
  try {
    await fs.cp(source, staged, { recursive: true });
    await fs.rm(runtime, removeOptions);
    let promoted = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await rename(staged, runtime);
        promoted = true;
        break;
      } catch (error) {
        if (!transientRenameErrors.has(error.code)) throw error;
        if (attempt < 6) await pause(100 * attempt);
      }
    }
    if (!promoted) {
      // Windows can hold a file in the staging folder open for scanning. Copying
      // avoids renaming that open file. Never overwrite a runtime created elsewhere.
      await fs.cp(staged, runtime, { recursive: true, errorOnExist: true, force: false });
    }
    // Publish the fingerprint only after the complete runtime is in place.
    await fs.writeFile(path.join(runtime, '.SimplySound-backend.json'), JSON.stringify(manifest));
  } finally {
    await fs.rm(staged, removeOptions).catch(() => {});
  }
}

function monitorBackendProcess(child) {
  let spawnError;
  child.on('error', error => { spawnError = error; });

  return () => {
    if (spawnError) {
      const code = spawnError.code || 'unknown error';
      return new Error(`The soundboard audio service could not start (${code}). Reinstall SimplySound and try again.`);
    }
    if (child.exitCode !== null && child.exitCode !== undefined)
      return new Error(`The soundboard audio service exited with code ${child.exitCode}.`);
    if (child.signalCode)
      return new Error(`The soundboard audio service stopped during startup (${child.signalCode}).`);
    return null;
  };
}

module.exports = { installBackendRuntime, monitorBackendProcess };
