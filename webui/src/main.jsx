import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DesktopApp from './desktop.jsx';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './style.css';

const DEFAULT_ART = '/assets/logo.png';
const token = new URLSearchParams(location.search).get('token');
const DESKTOP_COLUMN_OPTIONS = ['auto', 6, 8, 10, 12, 14, 16];
const TABLET_COLUMN_OPTIONS = ['auto', 3, 4, 5, 6];
const MOBILE_COLUMN_OPTIONS = ['auto', 2, 3, 4];

function getColumnOptions(viewWidth) {
  if (viewWidth <= 520) return MOBILE_COLUMN_OPTIONS;
  if (viewWidth <= 760) return TABLET_COLUMN_OPTIONS;
  return DESKTOP_COLUMN_OPTIONS;
}

function parseColumnPreference(raw) {
  if (!raw || raw === 'auto') return 'auto';
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 2 && parsed <= 20 ? parsed : 'auto';
}

function loadCollapsedHeadings() {
  try {
    const raw = JSON.parse(localStorage.getItem('soundboard.collapsedHeadings') || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('X-Pairing-Token', token);
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let detail = await response.text();
    try { const problem = JSON.parse(detail); detail = problem.detail || problem.title || problem.message || detail; } catch {}
    throw new Error(detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  return type.includes('json') ? response.json() : null;
}

function Glyph({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    dots: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    sound: <><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></>,
    music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
    arrange: <><path d="M8 5H4m0 0 2.5-2.5M4 5l2.5 2.5M16 19h4m0 0-2.5-2.5M20 19l-2.5 2.5M4 12h16"/></>,
    chevron: <><path d="m6 9 6 6 6-6"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    play: <><path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/></>,
    pause: <><path d="M8 5h3v14H8zM15 5h3v14h-3z" fill="currentColor" stroke="none"/></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4M5 15v5h14v-5"/></>,
    heading: <><path d="M4 7h16M4 12h10M4 17h16"/></>,
    external: <><path d="M14 4h6v6m0-6-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function App() {
  const [sounds, setSounds] = useState([]);
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;
  const [playback, setPlayback] = useState({ soundId: null, positionSeconds: 0, playing: false });
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [collapsedHeadings, setCollapsedHeadings] = useState(loadCollapsedHeadings);
  const [columnPref, setColumnPref] = useState(() => {
    try { return parseColumnPreference(localStorage.getItem('soundboard.columns')); }
    catch { return 'auto'; }
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [volumeOpenId, setVolumeOpenId] = useState(null);
  const [gridColumns, setGridColumns] = useState(6);
  const [viewportWidth, setViewportWidth] = useState(() => window.visualViewport?.width || window.innerWidth || 1280);
  const [dragState, setDragState] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const dialogRef = useRef(null);
  const imageRef = useRef(null);
  const shellRef = useRef(null);
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const volumeValuesRef = useRef(new Map());
  const volumeTimersRef = useRef(new Map());
  const volumeSavesRef = useRef(new Map());
  const playbackRef = useRef(playback);
  const playRequestRef = useRef(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [form, setForm] = useState({ name: '', buttonLabel: '', outputGain: 0.75, mode: 'toggle', startSeconds: 0, endSeconds: '', hotkey: '' });
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [headingDialogOpen, setHeadingDialogOpen] = useState(false);
  const [headingTitle, setHeadingTitle] = useState('');
  const [headingPosition, setHeadingPosition] = useState('top');
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [marketplaceQuery, setMarketplaceQuery] = useState('');
  const [marketplaceResults, setMarketplaceResults] = useState([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState('');
  const [marketplaceRetry, setMarketplaceRetry] = useState(0);
  const [previewId, setPreviewId] = useState(null);
  const [installingId, setInstallingId] = useState(null);
  const [installedIds, setInstalledIds] = useState(() => new Set());
  const [installErrors, setInstallErrors] = useState({});
  const headingDialogRef = useRef(null);
  const marketplaceDialogRef = useRef(null);
  const addMenuRef = useRef(null);
  const previewAudioRef = useRef(null);

  useEffect(() => {
    if (!marketplaceOpen) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setMarketplaceLoading(true);
      setMarketplaceError('');
      api(`/api/marketplace/search?q=${encodeURIComponent(marketplaceQuery)}`, { signal: controller.signal })
        .then((results) => setMarketplaceResults(Array.isArray(results) ? results : []))
        .catch((error) => { if (error.name !== 'AbortError') { setMarketplaceResults([]); setMarketplaceError(error.message || 'Could not load sounds.'); } })
        .finally(() => { if (!controller.signal.aborted) setMarketplaceLoading(false); });
    }, marketplaceQuery.trim() ? 240 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [marketplaceOpen, marketplaceQuery, marketplaceRetry]);

  useEffect(() => {
    const node = marketplaceDialogRef.current;
    if (marketplaceOpen && node && !node.open) node.showModal();
    if (!marketplaceOpen && node?.open) node.close();
  }, [marketplaceOpen]);

  useEffect(() => () => { previewAudioRef.current?.pause(); }, []);

  useEffect(() => {
    if (!addMenuOpen) return undefined;
    const dismiss = (event) => { if (!addMenuRef.current?.contains(event.target)) setAddMenuOpen(false); };
    const onKeyDown = (event) => { if (event.key === 'Escape') setAddMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', onKeyDown); };
  }, [addMenuOpen]);

  const updatePlayback = useCallback((state) => {
    playbackRef.current = state;
    setPlayback(state);
  }, []);

  const refresh = useCallback(async () => {
    const [library, status] = await Promise.all([api('/api/sounds'), api('/api/status')]);
    setSounds(library);
    updatePlayback(status.playback || { soundId: null, positionSeconds: 0, playing: false });
    setLoading(false);
  }, [updatePlayback]);

  useEffect(() => {
    refresh().catch((error) => { setLoading(false); setToast(`Can't reach the soundboard. ${error.message}`); });
    let socket;
    let retry;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${location.search}`);
      socket.onopen = () => { refresh().catch(() => {}); };
      socket.onclose = () => { if (!stopped) retry = setTimeout(connect, 1200); };
      socket.onerror = () => socket.close();
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'position') updatePlayback(message.data);
        else if (message.type === 'sound-started') {
          const sound = soundsRef.current.find((item) => item.id === message.data?.id);
          updatePlayback({ soundId: message.data?.id, positionSeconds: sound?.startSeconds || 0, playing: true });
        } else if (message.type === 'sound-stopped') {
          if (playbackRef.current.soundId === message.data?.id) updatePlayback({ soundId: null, positionSeconds: 0, playing: false });
        } else if (message.type === 'sound-changed' && message.data?.id) {
          const nextSounds = soundsRef.current.map((sound) => sound.id === message.data.id ? { ...sound, ...message.data } : sound);
          soundsRef.current = nextSounds;
          setSounds(nextSounds);
        } else refresh().catch(() => {});
      };
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); };
  }, [refresh, updatePlayback]);

  const columnOptions = getColumnOptions(viewportWidth);
  const activeColumnOption = columnOptions.includes(columnPref) ? columnPref : 'auto';

  useEffect(() => {
    if (!recordingHotkey) return;
    const capture = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setRecordingHotkey(false); return; }
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key.toUpperCase();
      if (!event.ctrlKey || !event.altKey || !(/^[A-Z0-9]$/.test(key) || /^F(?:[1-9]|1[0-2])$/.test(key))) {
        if (!['Control', 'Alt', 'Shift'].includes(event.key)) { event.preventDefault(); setToast('Use Ctrl + Alt with a letter, number, or F1–F12.'); }
        return;
      }
      event.preventDefault();
      setForm((current) => ({ ...current, hotkey: `Control+Alt+${key}` }));
      setRecordingHotkey(false);
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [recordingHotkey]);

  useEffect(() => {
    const measure = () => {
      const shell = shellRef.current;
      const viewWidth = window.visualViewport?.width || window.innerWidth || 1280;
      setViewportWidth((before) => Math.abs(before - viewWidth) < 1 ? before : viewWidth);
      const options = getColumnOptions(viewWidth);
      const effectivePref = options.includes(columnPref) ? columnPref : 'auto';
      if (effectivePref !== 'auto') {
        setGridColumns((before) => before === effectivePref ? before : effectivePref);
        return;
      }
      if (!shell) return;
      const style = getComputedStyle(shell);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const width = Math.max(0, shell.clientWidth - paddingLeft - paddingRight);
      const gap = viewWidth <= 520 ? 11 : viewWidth <= 760 ? 12 : 16;
      const minimumTileWidth = viewWidth <= 520 ? 140 : viewWidth <= 760 ? 160 : 175;
      const maxAutoColumns = viewWidth <= 520 ? 3 : viewWidth <= 760 ? 6 : 16;
      const autoColumns = Math.max(1, Math.min(maxAutoColumns, Math.floor((width + gap) / (minimumTileWidth + gap))));
      setGridColumns((before) => before === autoColumns ? before : autoColumns);
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.visualViewport?.addEventListener('resize', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    if (shellRef.current) observer.observe(shellRef.current);
    return () => { window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); observer.disconnect(); };
  }, [columnPref]);

  useEffect(() => { try { localStorage.setItem('soundboard.columns', String(columnPref)); } catch {} }, [columnPref]);
  useEffect(() => { try { localStorage.setItem('soundboard.collapsedHeadings', JSON.stringify([...collapsedHeadings])); } catch {} }, [collapsedHeadings]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const node = headingDialogRef.current;
    if (headingDialogOpen && node && !node.open) node.showModal();
    if (!headingDialogOpen && node?.open) node.close();
  }, [headingDialogOpen]);

  useEffect(() => {
    const node = dialogRef.current;
    if (editing && node && !node.open) node.showModal();
    if (!editing && node?.open) node.close();
  }, [editing]);

  useEffect(() => {
    if (!imageFile) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function toggleHeadingCollapsed(id) {
    setCollapsedHeadings((before) => {
      const next = new Set(before);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleItemSelection(id) {
    setSelected((before) => {
      const next = new Set(before);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function play(sound) {
    if (selectionMode) {
      toggleItemSelection(sound.id);
      return;
    }
    if (arrangeMode || sound.kind === 'heading') return;
    await flushVolumeSave(sound.id).catch(() => {});
    const previous = playbackRef.current;
    const shouldToggleOff = previous.soundId === sound.id && sound.mode === 'toggle';
    const requestId = ++playRequestRef.current;
    updatePlayback(shouldToggleOff
      ? { soundId: null, positionSeconds: 0, playing: false }
      : { soundId: sound.id, positionSeconds: sound.startSeconds || 0, playing: true });
    try {
      const state = shouldToggleOff
        ? await api(`/api/sounds/${sound.id}/stop`, { method: 'POST' })
        : await api(`/api/sounds/${sound.id}/play`, { method: 'POST' });
      if (requestId === playRequestRef.current) updatePlayback(state);
    } catch (error) {
      if (requestId === playRequestRef.current) { setToast(error.message); refresh().catch(() => {}); }
    }
  }

  function changeSoundVolume(soundId, value) {
    const volume = Math.max(0, Math.min(1, Number(value)));
    volumeValuesRef.current.set(soundId, volume);
    const nextSounds = soundsRef.current.map((sound) => sound.id === soundId ? { ...sound, outputGain: volume } : sound);
    soundsRef.current = nextSounds;
    setSounds(nextSounds);
    const pendingTimer = volumeTimersRef.current.get(soundId);
    if (pendingTimer) clearTimeout(pendingTimer);
    volumeTimersRef.current.set(soundId, setTimeout(() => { flushVolumeSave(soundId).catch(() => {}); }, 70));
  }

  async function flushVolumeSave(soundId) {
    const timer = volumeTimersRef.current.get(soundId);
    if (timer) { clearTimeout(timer); volumeTimersRef.current.delete(soundId); }
    if (!volumeValuesRef.current.has(soundId)) return volumeSavesRef.current.get(soundId) || Promise.resolve();
    const activeSave = volumeSavesRef.current.get(soundId);
    if (activeSave) await activeSave.catch(() => {});
    if (!volumeValuesRef.current.has(soundId)) return;
    const volume = volumeValuesRef.current.get(soundId);
    volumeValuesRef.current.delete(soundId);
    const request = api(`/api/sounds/${soundId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outputGain: volume }),
    }).catch((error) => {
      if (!volumeValuesRef.current.has(soundId)) volumeValuesRef.current.set(soundId, volume);
      setToast(`Couldn't save this volume. ${error.message}`);
      throw error;
    }).finally(() => {
      if (volumeSavesRef.current.get(soundId) === request) volumeSavesRef.current.delete(soundId);
      if (volumeValuesRef.current.has(soundId) && !volumeTimersRef.current.has(soundId)) {
        volumeTimersRef.current.set(soundId, setTimeout(() => { flushVolumeSave(soundId).catch(() => {}); }, 0));
      }
    });
    volumeSavesRef.current.set(soundId, request);
    return request;
  }

  async function addAudio(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    setSaving(true);
    let added = 0;
    const failures = [];
    try {
      for (const file of files) {
        const body = new FormData(); body.append('file', file);
        try { await api('/api/sounds', { method: 'POST', body }); added += 1; }
        catch (error) { failures.push(`${file.name}: ${error.message}`); }
      }
      if (added) await refresh();
      if (failures.length) setToast(`${added} added · ${failures.length} failed: ${failures[0]}`);
      else setToast(`${added} ${added === 1 ? 'sound' : 'sounds'} added`);
    } catch (error) {
      setToast(added ? `${added} added, but the board could not refresh. ${error.message}` : error.message);
    } finally { setSaving(false); event.target.value = ''; }
  }

  function toggleMarketplacePreview(sound) {
    let audio = previewAudioRef.current;
    if (previewId === sound.id && audio && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
      setPreviewId(null);
      return;
    }
    if (audio) { audio.pause(); audio.currentTime = 0; }
    audio = new Audio(sound.audioUrl);
    audio.volume = 0.75;
    audio.preload = 'none';
    audio.onended = () => setPreviewId(null);
    audio.onerror = () => { setPreviewId(null); setMarketplaceError('This preview could not be played. Try another sound.'); };
    previewAudioRef.current = audio;
    setPreviewId(sound.id);
    audio.play().catch(() => { setPreviewId(null); setMarketplaceError('This preview could not be played. Try another sound.'); });
  }

  async function installMarketplaceSound(sound) {
    setInstallErrors((current) => { const next = { ...current }; delete next[sound.id]; return next; });
    setInstallingId(sound.id);
    try {
      await api(`/api/marketplace/${encodeURIComponent(sound.id)}/install`, { method: 'POST' });
      setInstalledIds((current) => new Set(current).add(sound.id));
      await refresh();
      setToast(`${sound.title} added to your soundboard`);
    } catch (error) { setInstallErrors((current) => ({ ...current, [sound.id]: error.message || 'Could not add this sound.' })); }
    finally { setInstallingId(null); }
  }

  async function createHeading(event) {
    event.preventDefault();
    const name = headingTitle.trim();
    if (!name) return;
    setSaving(true);
    try {
      const existingIds = soundsRef.current.map((item) => item.id);
      const created = await api('/api/sounds/heading', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      if (headingPosition === 'top' && created?.id && existingIds.length > 0) {
        await api('/api/sounds/reorder', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([created.id, ...existingIds]),
        });
      }
      await refresh();
      setHeadingTitle('');
      setHeadingDialogOpen(false);
      setToast(`Heading “${name}” added`);
    } catch (error) { setToast(error.message); }
    finally { setSaving(false); }
  }

  function openEditor(sound) {
    setOptionsOpen(false);
    setEditing(sound);
    setForm({ name: sound.name || '', buttonLabel: sound.buttonLabel || '', outputGain: sound.outputGain ?? 0.75, mode: sound.mode || 'toggle', startSeconds: sound.startSeconds || 0, endSeconds: sound.endSeconds ?? '', hotkey: sound.hotkey || '' });
    setRecordingHotkey(false);
    setImageFile(null);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.kind === 'heading') {
        await api(`/api/sounds/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name }),
        });
      } else {
        await api(`/api/sounds/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, outputGain: Number(form.outputGain), startSeconds: Number(form.startSeconds), endSeconds: form.endSeconds === '' ? null : Number(form.endSeconds) }),
        });
        if (imageFile) { const body = new FormData(); body.append('file', imageFile); await api(`/api/sounds/${editing.id}/image`, { method: 'POST', body }); }
      }
      await refresh(); setEditing(null); setImageFile(null);
    } catch (error) { setToast(error.message); }
    finally { setSaving(false); }
  }

  async function resetArtwork() {
    if (!editing) return;
    try { await api(`/api/sounds/${editing.id}/image`, { method: 'DELETE' }); await refresh(); setEditing((sound) => ({ ...sound, imageUrl: DEFAULT_ART })); setImageFile(null); }
    catch (error) { setToast(error.message); }
  }

  async function deleteOne() {
    if (!editing) return;
    if (!window.confirm(`Delete “${editing.name}”?`)) return;
    try { await api(`/api/sounds/${editing.id}`, { method: 'DELETE' }); setEditing(null); await refresh(); }
    catch (error) { setToast(error.message); }
  }

  async function bulkDelete() {
    if (!selected.size) { setSelectionMode(false); return; }
    const ids = [...selected];
    if (!window.confirm(`Delete ${ids.length} selected ${ids.length === 1 ? 'sound' : 'sounds'}?`)) return;
    setSaving(true);
    try {
      await api('/api/sounds/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) });
      setSelected(new Set()); setSelectionMode(false); await refresh();
    } catch (error) { setToast(error.message); }
    finally { setSaving(false); }
  }

  function toggleSelection() {
    setSelectionMode((enabled) => !enabled);
    setArrangeMode(false);
    setVolumeOpenId(null);
    setSelected(new Set());
  }

  function reorderSounds(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const before = soundsRef.current;
    const from = before.findIndex((sound) => sound.id === sourceId);
    const to = before.findIndex((sound) => sound.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...before];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    soundsRef.current = next;
    setSounds(next);
    api('/api/sounds/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next.map((sound) => sound.id)) })
      .catch((error) => { setToast(error.message); refresh().catch(() => {}); });
  }

  function beginArrange(event, sound) {
    if (!arrangeMode || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: sound.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragging: false, over: sound.id };
  }
  function moveArrange(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7) drag.dragging = true;
    if (!drag.dragging) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-sound-id]');
    if (target) drag.over = target.dataset.soundId;
    setDragState({ id: drag.id, over: drag.over });
  }
  function endArrange(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.dragging) reorderSounds(drag.id, drag.over);
    dragRef.current = null;
    setDragState(null);
  }

  const sectionCounts = new Map();
  const headingIds = [];
  const itemSectionMap = new Map();
  let currentHeadingId = null;
  for (const item of sounds) {
    if (item.kind === 'heading') {
      currentHeadingId = item.id;
      headingIds.push(item.id);
      sectionCounts.set(item.id, 0);
    } else if (currentHeadingId) {
      sectionCounts.set(currentHeadingId, (sectionCounts.get(currentHeadingId) || 0) + 1);
      itemSectionMap.set(item.id, currentHeadingId);
    }
  }
  const allHeadingsCollapsed = headingIds.length > 0 && headingIds.every((id) => collapsedHeadings.has(id));
  const toggleAllHeadings = () => {
    setCollapsedHeadings(allHeadingsCollapsed ? new Set() : new Set(headingIds));
  };
  const playingSectionId = playback.soundId ? itemSectionMap.get(playback.soundId) : null;
  const gridDensityClass = gridColumns >= 12 ? 'is-dense is-ultra-dense' : gridColumns >= 8 ? 'is-dense' : '';

  return <main className="app-shell" ref={shellRef} onPointerDown={(event) => { if (!event.target.closest('.sound-volume, .volume-trigger')) setVolumeOpenId(null); }}>
    <div className="board-header">
      <header className="topbar">
        <div className="top-actions">
          <button className="select-button arrange-button icon-action" type="button" aria-label={arrangeMode ? 'Finish arranging sounds' : 'Arrange sounds'} title={arrangeMode ? 'Finish arranging' : 'Arrange sounds'} aria-pressed={arrangeMode} onClick={() => { setArrangeMode((value) => !value); setSelectionMode(false); setSelected(new Set()); setVolumeOpenId(null); }}>
            <Glyph name="arrange" size={19}/><span>{arrangeMode ? 'Done' : 'Arrange'}</span>
          </button>
          <button className="select-button icon-action" type="button" aria-label={selectionMode ? 'Finish selecting sounds' : 'Select sounds'} title={selectionMode ? 'Finish selecting' : 'Select sounds'} aria-pressed={selectionMode} onClick={toggleSelection}>
            {selectionMode ? <><Glyph name="close" size={17}/><span>Done</span></> : <><Glyph name="check" size={17}/><span>Select</span></>}
          </button>
          <button className="select-button density-toggle icon-action" type="button" aria-label={`${gridColumns} columns per row; change grid columns`} title="Columns per row" aria-expanded={columnsOpen} aria-controls="density-panel" onClick={() => setColumnsOpen((open) => !open)}>
            <span className="density-toggle-count">{gridColumns}</span><span className="density-toggle-label">Columns</span><Glyph name="chevron" size={15}/>
          </button>
          <div className="add-menu-wrap" ref={addMenuRef}>
            <button className="add-button" type="button" aria-label="Add sounds or headings" aria-expanded={addMenuOpen} aria-controls="add-sound-menu" title="Add sounds or headings" disabled={saving} onClick={() => setAddMenuOpen((open) => !open)}>
              <Glyph name="plus" size={22}/>
            </button>
            {addMenuOpen && <div className="add-sound-menu" id="add-sound-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); fileRef.current?.click(); }}><span className="menu-action-icon"><Glyph name="upload" size={18}/></span><span><strong>Upload locally</strong><small>Choose audio from this device</small></span></button>
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); setHeadingTitle(''); setHeadingDialogOpen(true); }}><span className="menu-action-icon"><Glyph name="heading" size={18}/></span><span><strong>Add heading</strong><small>Group sounds under a section title</small></span></button>
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); setMarketplaceQuery(''); setMarketplaceOpen(true); }}><span className="menu-action-icon"><Glyph name="globe" size={18}/></span><span><strong>Browse marketplace</strong><small>Discover sounds from MyInstants</small></span></button>
            </div>}
          </div>
          <input ref={fileRef} className="visually-hidden" type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.wma" onChange={addAudio} />
        </div>
      </header>

      <div id="density-panel" className={`density-disclosure ${columnsOpen ? 'is-open' : ''}`} aria-hidden={!columnsOpen} inert={!columnsOpen}>
        <section className="density-control" aria-label="Grid columns">
          <div className="density-heading">
            <span>Columns</span>
            <span className="density-readout">{activeColumnOption === 'auto' ? `Auto · ${gridColumns}` : gridColumns} <small>per row</small></span>
            {headingIds.length > 0 && <button type="button" className="collapse-all-button" onClick={toggleAllHeadings}>{allHeadingsCollapsed ? 'Expand all' : 'Collapse all'}</button>}
          </div>
          <div className="density-segments" role="group" aria-label="Choose how many sound columns to show per row" style={{ '--segment-index': Math.max(0, columnOptions.indexOf(activeColumnOption)), '--segment-count': columnOptions.length }}>
            <span className="density-thumb" />
            {columnOptions.map((option) => <button key={option} type="button" className={activeColumnOption === option ? 'active' : ''} aria-pressed={activeColumnOption === option} onClick={() => setColumnPref(option)}><span>{option === 'auto' ? 'Auto' : option}</span></button>)}
          </div>
        </section>
      </div>

      {(selectionMode || arrangeMode) && <div className="selection-bar" aria-live="polite">
        {arrangeMode ? <span>Press and drag a sound or heading to move it</span> : <span>{selected.size ? `${selected.size} selected` : 'Tap sounds to select'}</span>}
        {selectionMode && <button className="bulk-delete" type="button" disabled={!selected.size || saving} onClick={bulkDelete}>
          <Glyph name="trash" size={16}/><span>Delete{selected.size ? ` ${selected.size}` : ''}</span>
        </button>}
      </div>}
    </div>

    {loading ? <div ref={gridRef} className={`loading-grid ${gridDensityClass}`} role="status" aria-label="Loading sounds" aria-busy="true" style={{ '--grid-columns': gridColumns }}>{Array.from({ length: gridColumns * 2 }, (_, i) => <div key={i} className="skeleton-tile" style={{ '--tile-index': i }}><span className="skeleton-ripple"/><Glyph name="music" size={28}/><span className="skeleton-wave"><i/><i/><i/><i/><i/></span></div>)}</div>
      : sounds.length === 0 ? <section className="empty-state">
        <img src={DEFAULT_ART} alt="" />
        <h1>Your soundboard is empty</h1>
        <p>Use + above to add your first clip.</p>
      </section>
      : <section ref={gridRef} className={`sound-grid ${arrangeMode ? 'arrange-mode' : ''} ${gridDensityClass}`} aria-label="Soundboard" style={{ '--grid-columns': gridColumns }}>
        {sounds.map((sound, index) => {
          const checked = selected.has(sound.id);
          if (sound.kind === 'heading') {
            const collapsed = !arrangeMode && collapsedHeadings.has(sound.id);
            const hasPlaying = collapsed && playingSectionId === sound.id;
            const handleHeadingClick = () => {
              if (selectionMode) toggleItemSelection(sound.id);
              else if (!arrangeMode) toggleHeadingCollapsed(sound.id);
            };
            return <div
              key={sound.id}
              data-sound-id={sound.id}
              role={!arrangeMode ? 'button' : undefined}
              tabIndex={!arrangeMode ? 0 : undefined}
              aria-expanded={!arrangeMode && !selectionMode ? !collapsed : undefined}
              className={`section-heading-tile ${index === 0 ? 'is-first' : ''} ${!arrangeMode ? 'is-collapsible' : ''} ${collapsed ? 'is-collapsed' : ''} ${hasPlaying ? 'has-playing' : ''} ${checked ? 'is-selected' : ''} ${dragState?.id === sound.id ? 'is-dragging' : ''} ${dragState?.over === sound.id && dragState.id !== sound.id ? 'drop-target' : ''}`}
              onClick={handleHeadingClick}
              onKeyDown={(event) => { if (!arrangeMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); handleHeadingClick(); } }}
              onPointerDown={(event) => beginArrange(event, sound)}
              onPointerMove={moveArrange}
              onPointerUp={endArrange}
              onPointerCancel={endArrange}
            >
              {selectionMode && <span className={`heading-select-mark ${checked ? 'checked' : ''}`}><Glyph name="check" size={15}/></span>}
              {arrangeMode && <span className="heading-drag-grip" aria-hidden="true"><Glyph name="arrange" size={16}/></span>}
              {!arrangeMode && !selectionMode && <span className={`heading-chevron ${collapsed ? 'is-collapsed' : ''}`} aria-hidden="true"><Glyph name="chevron" size={16}/></span>}
              <h2 className="section-heading-title">{sound.name}</h2>
              <span className="section-heading-count">{sectionCounts.get(sound.id) || 0}</span>
              {hasPlaying && <span className="heading-playing-dot" aria-label="Sound playing in this section" />}
              <span className="section-heading-line" aria-hidden="true" />
              {!selectionMode && !arrangeMode && <button className="heading-edit-trigger" type="button" aria-label={`Edit heading ${sound.name}`} onClick={(event) => { event.stopPropagation(); openEditor(sound); }}><Glyph name="dots" size={18}/></button>}
            </div>;
          }
          const ownerHeadingId = itemSectionMap.get(sound.id);
          if (!arrangeMode && ownerHeadingId && collapsedHeadings.has(ownerHeadingId)) return null;
          const active = playback.soundId === sound.id;
          const progress = active && sound.duration > 0 ? Math.max(0, Math.min(1, (playback.positionSeconds - sound.startSeconds) / sound.duration)) : 0;
          return <article key={sound.id} data-sound-id={sound.id} className={`sound-card ${active ? 'is-playing' : ''} ${checked ? 'is-selected' : ''} ${dragState?.id === sound.id ? 'is-dragging' : ''} ${dragState?.over === sound.id && dragState.id !== sound.id ? 'drop-target' : ''}`} style={{ '--tile-index': index }} onPointerDown={(event) => beginArrange(event, sound)} onPointerMove={moveArrange} onPointerUp={endArrange} onPointerCancel={endArrange}>
            <button className="sound-trigger" type="button" aria-label={`${selectionMode ? (checked ? 'Deselect' : 'Select') : active ? 'Stop' : 'Play'} ${sound.buttonLabel || sound.name}`} aria-pressed={selectionMode ? checked : active} onClick={() => play(sound)}>
              <img className="sound-art" src={sound.imageUrl || DEFAULT_ART} alt="" loading={index < 6 ? 'eager' : 'lazy'} />
              <span className="tile-shade" />
              {selectionMode && <span className={`selection-mark ${checked ? 'checked' : ''}`}><Glyph name="check" size={16}/></span>}
              <span className="sound-title">{sound.buttonLabel || sound.name}</span>
              {active && <span className="playing-indicator" aria-label="Playing"><i/><i/><i/><i/></span>}
              <span className="sound-progress" style={{ transform: `scaleX(${progress})` }} />
            </button>
            {!selectionMode && !arrangeMode && <>
              <button className={`volume-trigger ${volumeOpenId === sound.id ? 'is-open' : ''}`} type="button" aria-label={`Volume ${sound.buttonLabel || sound.name}`} aria-expanded={volumeOpenId === sound.id} aria-controls={`volume-${sound.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setVolumeOpenId((current) => current === sound.id ? null : sound.id); }}><Glyph name="volume" size={18}/></button>
              <div id={`volume-${sound.id}`} className={`sound-volume ${volumeOpenId === sound.id ? 'is-open' : ''}`} aria-hidden={volumeOpenId !== sound.id} inert={volumeOpenId !== sound.id} onPointerDown={(event) => event.stopPropagation()}>
                <div className="sound-volume-heading"><output>{Math.round((sound.outputGain ?? 0.75) * 100)}<small>%</small></output></div>
                <input className="sound-volume-slider" style={{ '--volume-progress': `${Math.round((sound.outputGain ?? 0.75) * 100)}%` }} type="range" min="0" max="1" step="0.01" value={sound.outputGain ?? 0.75} aria-label={`${sound.buttonLabel || sound.name} volume`} onChange={(event) => changeSoundVolume(sound.id, event.target.value)} onPointerUp={() => flushVolumeSave(sound.id).catch(() => {})} onKeyUp={() => flushVolumeSave(sound.id).catch(() => {})} onBlur={() => flushVolumeSave(sound.id).catch(() => {})}/>
              </div>
            </>}
            {!selectionMode && !arrangeMode && <button className="edit-trigger" type="button" aria-label={`Edit ${sound.name}`} onClick={() => openEditor(sound)}><Glyph name="dots" size={20}/></button>}
          </article>;
        })}
      </section>}

    {toast && <div className="toast" role="alert">{toast}</div>}

    <dialog ref={headingDialogRef} className="edit-dialog heading-dialog" onClose={() => { setHeadingDialogOpen(false); setHeadingTitle(''); }} onClick={(event) => { if (event.target === headingDialogRef.current) headingDialogRef.current.close(); }}>
      {headingDialogOpen && <form onSubmit={createHeading}>
        <div className="dialog-head"><div><h2>Add heading</h2><p>Create a section title to group sounds (drag items in Arrange mode).</p></div><button className="dialog-close" type="button" aria-label="Close heading dialog" onClick={() => headingDialogRef.current?.close()}><Glyph name="close"/></button></div>
        <div className="form-fields">
          <label className="field">Heading title<input autoFocus value={headingTitle} maxLength={100} required placeholder="e.g. Star Wars, Werner, Alltag" onChange={(event) => setHeadingTitle(event.target.value)}/></label>
          <div className="field"><span>Insert position</span><div className="behavior-switch" role="group" aria-label="Insert position"><button type="button" className={headingPosition === 'top' ? 'active' : ''} aria-pressed={headingPosition === 'top'} onClick={() => setHeadingPosition('top')}>Top</button><button type="button" className={headingPosition === 'bottom' ? 'active' : ''} aria-pressed={headingPosition === 'bottom'} onClick={() => setHeadingPosition('bottom')}>Bottom</button></div></div>
        </div>
        <div className="dialog-actions"><button className="remove-art" type="button" onClick={() => headingDialogRef.current?.close()}>Cancel</button><button className="save-button" type="submit" disabled={saving || !headingTitle.trim()}>{saving ? 'Adding…' : 'Add heading'}</button></div>
      </form>}
    </dialog>

    <dialog ref={dialogRef} className="edit-dialog" onClose={() => { setEditing(null); setImageFile(null); setRecordingHotkey(false); }} onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      {editing && (editing.kind === 'heading' ? <form onSubmit={saveEdit}>
        <div className="dialog-head"><div><h2>Edit heading</h2><p>Rename or remove this section title.</p></div><button className="dialog-close" type="button" aria-label="Close editor" onClick={() => dialogRef.current?.close()}><Glyph name="close"/></button></div>
        <div className="form-fields">
          <label className="field">Heading title<input autoFocus value={form.name} maxLength={100} required onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
        </div>
        <div className="dialog-actions"><button className="delete-one" type="button" onClick={deleteOne}>Delete</button><button className="save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </form> : <form onSubmit={saveEdit}>
        <div className="dialog-head"><div><h2>Edit sound</h2><p>Make this button yours.{editing.sourceUrl && <> <a className="sound-source-link" href={editing.sourceUrl} target="_blank" rel="noreferrer">From MyInstants <Glyph name="external" size={12}/></a></>}</p></div><button className="dialog-close" type="button" aria-label="Close editor" onClick={() => dialogRef.current?.close()}><Glyph name="close"/></button></div>
        <label className="artwork-picker">
          <img src={preview || editing.imageUrl || DEFAULT_ART} alt="Sound artwork preview" />
          <span className="artwork-action"><Glyph name="image" size={17}/><span>Change image</span></span>
          <input ref={imageRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
        </label>
        <div className="form-fields">
          <label className="field">Name<input value={form.name} maxLength={100} required onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
          <label className="field">Button title<input value={form.buttonLabel} maxLength={100} placeholder="Use sound name" onChange={(event) => setForm({ ...form, buttonLabel: event.target.value })}/></label>
          <div className="field hotkey-field"><span>Keyboard shortcut</span><small>Works globally while SimplySound is running.</small><div className="hotkey-control"><kbd>{form.hotkey?.replaceAll('Control', 'Ctrl').replaceAll('+', ' + ') || 'Not set'}</kbd><button type="button" className={recordingHotkey ? 'is-recording' : ''} onClick={() => setRecordingHotkey(true)}>{recordingHotkey ? 'Press Ctrl + Alt + key…' : 'Record'}</button>{form.hotkey && <button type="button" className="hotkey-clear" aria-label="Clear keyboard shortcut" onClick={() => { setForm({ ...form, hotkey: '' }); setRecordingHotkey(false); }}>Clear</button>}</div></div>
          <div className={`playback-options ${optionsOpen ? 'is-open' : ''}`}>
            <button className="options-toggle" type="button" aria-expanded={optionsOpen} onClick={() => setOptionsOpen((value) => !value)}><span><strong>Playback options</strong><small>Behavior, volume and trim</small></span><Glyph name="chevron" size={18}/></button>
            {optionsOpen && <div className="option-grid">
              <div className="field"><span>Behavior</span><div className="behavior-switch" role="group" aria-label="Playback behavior"><button type="button" className={form.mode === 'toggle' ? 'active' : ''} aria-pressed={form.mode === 'toggle'} onClick={() => setForm({ ...form, mode: 'toggle' })}>Toggle</button><button type="button" className={form.mode === 'retrigger' ? 'active' : ''} aria-pressed={form.mode === 'retrigger'} onClick={() => setForm({ ...form, mode: 'retrigger' })}>Retrigger</button></div></div>
              <label className="field">Output level <output>{Math.round(Number(form.outputGain) * 100)}%</output><input type="range" min="0" max="1" step="0.01" value={form.outputGain} onChange={(event) => setForm({ ...form, outputGain: event.target.value })}/></label>
              <label className="field">Start (seconds)<input type="number" min="0" step="0.01" value={form.startSeconds} onChange={(event) => setForm({ ...form, startSeconds: event.target.value })}/></label>
              <label className="field">End (seconds)<input type="number" min="0" step="0.01" placeholder="Full length" value={form.endSeconds} onChange={(event) => setForm({ ...form, endSeconds: event.target.value })}/></label>
            </div>}
          </div>
        </div>
        <div className="dialog-actions"><button className="remove-art" type="button" onClick={resetArtwork}>Use default image</button><button className="delete-one" type="button" onClick={deleteOne}>Delete</button><button className="save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </form>)}
    </dialog>

    <dialog ref={marketplaceDialogRef} className="marketplace-dialog" aria-labelledby="marketplace-title" onClose={() => { setMarketplaceOpen(false); previewAudioRef.current?.pause(); setPreviewId(null); }} onClick={(event) => { if (event.target === marketplaceDialogRef.current) marketplaceDialogRef.current.close(); }}>
      <section className="marketplace-shell">
        <header className="marketplace-header">
          <div className="marketplace-heading"><span className="marketplace-mark"><Glyph name="sound" size={19}/></span><div><h2 id="marketplace-title">Sound marketplace</h2><p>Find a sound. Preview it. Add it to your board.</p></div></div>
          <button className="dialog-close" type="button" aria-label="Close marketplace" onClick={() => marketplaceDialogRef.current?.close()}><Glyph name="close"/></button>
        </header>
        <label className="marketplace-search"><Glyph name="search" size={19}/><input type="search" value={marketplaceQuery} maxLength={80} placeholder="Search sounds…" aria-label="Search marketplace sounds" onChange={(event) => setMarketplaceQuery(event.target.value)}/>{marketplaceQuery && <button type="button" aria-label="Clear search" onClick={() => setMarketplaceQuery('')}><Glyph name="close" size={16}/></button>}</label>
        <div className="marketplace-results-heading"><strong>{marketplaceQuery.trim() ? 'Search results' : 'Recently added'}</strong><span>{marketplaceLoading ? 'Searching…' : marketplaceResults.length ? `${marketplaceResults.length} sounds` : ''}</span></div>
        <div className="marketplace-results" aria-live="polite" aria-busy={marketplaceLoading}>
          {marketplaceLoading && marketplaceResults.length === 0 && <div className="marketplace-state"><span className="marketplace-spinner"/><strong>Finding good sounds</strong><small>Checking the MyInstants catalog</small></div>}
          {!marketplaceLoading && marketplaceError && <div className="marketplace-state"><span className="marketplace-state-icon"><Glyph name="sound"/></span><strong>Marketplace unavailable</strong><small>{marketplaceError}</small><button type="button" onClick={() => setMarketplaceRetry((retry) => retry + 1)}>Try again</button></div>}
          {!marketplaceLoading && !marketplaceError && marketplaceResults.length === 0 && <div className="marketplace-state"><span className="marketplace-state-icon"><Glyph name="search"/></span><strong>No sounds found</strong><small>Try a shorter or different search.</small></div>}
          {marketplaceResults.map((sound, index) => {
            const installed = installedIds.has(sound.id) || sounds.some((item) => item.sourceUrl === sound.pageUrl);
            const previewing = previewId === sound.id;
            return <article className={`marketplace-result ${previewing ? 'is-previewing' : ''}`} style={{ '--result-index': index }} key={sound.id}>
              <div className="marketplace-art"><img src={DEFAULT_ART} alt=""/><span><Glyph name="sound" size={19}/></span></div>
              <div className="marketplace-sound-info"><strong title={sound.title}>{sound.title}</strong><a href={sound.pageUrl} target="_blank" rel="noreferrer">View on MyInstants <Glyph name="external" size={12}/></a></div>
              <button className={`marketplace-preview ${previewing ? 'is-playing' : ''}`} type="button" aria-label={`${previewing ? 'Stop preview of' : 'Preview'} ${sound.title}`} onClick={() => toggleMarketplacePreview(sound)}><Glyph name={previewing ? 'pause' : 'play'} size={17}/></button>
              <button className={`marketplace-install ${installed ? 'is-added' : ''}`} type="button" aria-label={`${installed ? 'Added' : installingId === sound.id ? 'Adding' : 'Add'} ${sound.title}`} disabled={installed || installingId !== null} onClick={() => installMarketplaceSound(sound)}>{installed ? <Glyph name="check" size={17}/> : installingId === sound.id ? <span className="button-spinner"/> : <Glyph name="plus" size={18}/>}<span>{installed ? 'Added' : installingId === sound.id ? 'Adding' : 'Add'}</span></button>
              {installErrors[sound.id] && <div className="marketplace-install-error" role="status" aria-live="polite">{installErrors[sound.id]}</div>}
            </article>;
          })}
        </div>
        <footer className="marketplace-footer"><span>Catalog by <a href="https://github.com/abdipr/myinstants-api" target="_blank" rel="noreferrer">abdipr / myinstants-api</a> · sounds hosted by <a href="https://www.myinstants.com/" target="_blank" rel="noreferrer">MyInstants</a></span><small>Sounds may be copyrighted. Review each source page and <a href="https://www.myinstants.com/en/terms_of_use.html" target="_blank" rel="noreferrer">MyInstants’ terms</a> before installing, using or sharing them.</small></footer>
      </section>
    </dialog>
  </main>;
}

const root = createRoot(document.getElementById('root'));
root.render(new URLSearchParams(location.search).get('desktop') === '1'
  ? <React.StrictMode><DesktopApp /></React.StrictMode>
  : <React.StrictMode><App /></React.StrictMode>);
