const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installBackendRuntime, monitorBackendProcess } = require('./backend-process.cjs');

test('installs the audio service when Windows blocks renaming the staged directory', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'simplysound-runtime-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'bundled');
  const runtime = path.join(root, 'installed', 'backend');
  const manifest = { version: '1.2.0', fingerprint: 'updated' };
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'VRSoundboard.exe'), 'new runtime');
  await fs.mkdir(runtime, { recursive: true });
  await fs.writeFile(path.join(runtime, '.SimplySound-backend.json'), '{"fingerprint":"old"}');
  let attempts = 0;
  await installBackendRuntime(source, runtime, manifest, {
    rename: async () => {
      attempts++;
      throw Object.assign(new Error('access denied'), { code: 'EPERM' });
    },
    pause: async () => {},
  });
  assert.ok(attempts > 1);
  assert.equal(await fs.readFile(path.join(runtime, 'VRSoundboard.exe'), 'utf8'), 'new runtime');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(runtime, '.SimplySound-backend.json'), 'utf8')), manifest);
});

function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

test('reports child process spawn errors without leaving them unhandled', () => {
  const child = fakeChild();
  const getFailure = monitorBackendProcess(child);

  child.emit('error', Object.assign(new Error('access denied'), { code: 'EACCES' }));

  assert.match(getFailure().message, /could not start \(EACCES\)/);
});

test('reports an audio service that exits during startup', () => {
  const child = fakeChild();
  const getFailure = monitorBackendProcess(child);
  child.exitCode = 3;

  assert.match(getFailure().message, /exited with code 3/);
});

test('reports a service stopped by a signal during startup', () => {
  const child = fakeChild();
  const getFailure = monitorBackendProcess(child);
  child.signalCode = 'SIGTERM';

  assert.match(getFailure().message, /stopped during startup \(SIGTERM\)/);
});

test('keeps a running audio service in the ready-to-start state', () => {
  assert.equal(monitorBackendProcess(fakeChild())(), null);
});
