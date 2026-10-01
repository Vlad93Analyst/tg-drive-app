// Аудиоплеер: мини-плеер над табами (живёт поверх экранов) + полноэкранный режим. Один <audio>, очередь — аудио текущей папки.
// ПРЕДЕЛ: Mini App живёт в WebView Telegram; при свёрнутом Telegram (или заблокированном экране) фоновое
// воспроизведение платформа не гарантирует — mediaSession лишь просит об этом. Апгрейд — нативный плеер/бот шлёт аудио в чат.
import { nextSpeed, stepIndex, trackQueue } from './core.js';
import { mediaUrl } from './media-url.js';
import { loadPosition, savePosition } from './prefs.js';
import { state } from './state.js';
import { $, guard } from './ui.js';

const SEEK_STEP_S = 15;
const SAVE_EVERY_S = 5;
const audio = new Audio(); // без crossOrigin: /file/ не отдаёт CORS, обычный тег его не требует
audio.preload = 'metadata';
let queue = { list: [], position: 0 };
let lastSaved = 0;
const current = () => queue.list[queue.position];
const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

function paint() {
  const file = current();
  if (!file) return;
  const playing = !audio.paused;
  $('mp-title').textContent = file.file_name; $('fp-title').textContent = file.file_name;
  for (const id of ['mp-play', 'fp-play']) $(id).textContent = playing ? '⏸' : '▶';
  $('fp-seek').max = String(Math.floor(audio.duration || 0)); $('fp-seek').value = String(Math.floor(audio.currentTime));
  $('fp-time').textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  $('mp-bar').style.width = audio.duration ? `${(audio.currentTime / audio.duration) * 100}%` : '0';
  $('fp-speed').textContent = `${audio.playbackRate}×`;
  $('fp-prev').disabled = stepIndex(queue.position, queue.list.length, -1) === null;
  $('fp-next').disabled = stepIndex(queue.position, queue.list.length, 1) === null;
}

function setMediaSession(file) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: file.file_name, artist: 'Drive' });
  const handlers = {
    play: () => audio.play(), pause: () => audio.pause(),
    previoustrack: () => move(-1), nexttrack: () => move(1),
    seekbackward: () => seekBy(-SEEK_STEP_S), seekforward: () => seekBy(SEEK_STEP_S),
    seekto: (d) => { audio.currentTime = d.seekTime; },
  };
  for (const [action, fn] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* действие не поддержано клиентом */ } }
}

const seekBy = (delta) => { audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + delta)); };
const persist = () => { const f = current(); if (f && !audio.ended && audio.currentTime > 0) savePosition(f.file_unique_id ?? f.id, audio.currentTime); };

async function load(position) {
  persist();
  queue.position = position;
  const file = current();
  audio.src = await mediaUrl(file.file_id);
  const resume = await loadPosition(file.file_unique_id ?? file.id);
  if (resume > 1) audio.addEventListener('loadedmetadata', () => { if (resume < audio.duration - 0.5) audio.currentTime = resume; }, { once: true });
  $('mini-player').hidden = false; document.body.classList.add('has-player');
  setMediaSession(file);
  await audio.play().catch(() => {}); // автоплей может быть запрещён — тогда ждём тап по ▶
  paint();
}

async function move(delta) {
  const next = stepIndex(queue.position, queue.list.length, delta);
  if (next !== null) await load(next);
}

export function playFile(file) {
  queue = trackQueue(state.index.files, file);
  return load(queue.position);
}

const toggle = () => (audio.paused ? audio.play() : audio.pause());

export function initPlayer() {
  audio.addEventListener('timeupdate', () => { paint(); if (Math.abs(audio.currentTime - lastSaved) >= SAVE_EVERY_S) { lastSaved = audio.currentTime; persist(); } });
  for (const type of ['play', 'pause', 'loadedmetadata', 'ratechange']) audio.addEventListener(type, paint);
  for (const type of ['pause', 'seeked']) audio.addEventListener(type, persist);
  audio.addEventListener('ended', guard(async () => { await savePosition(current().file_unique_id ?? current().id, 0); await move(1); }));
  audio.addEventListener('error', () => { $('mp-title').textContent = 'Не удалось загрузить аудио'; });
  $('mp-play').onclick = (e) => { e.stopPropagation(); toggle(); };
  $('mini-player').onclick = () => { $('full-player').hidden = false; paint(); };
  $('fp-close').onclick = () => { $('full-player').hidden = true; };
  $('fp-play').onclick = toggle;
  $('fp-back').onclick = () => seekBy(-SEEK_STEP_S);
  $('fp-fwd').onclick = () => seekBy(SEEK_STEP_S);
  $('fp-prev').onclick = guard(() => move(-1));
  $('fp-next').onclick = guard(() => move(1));
  $('fp-speed').onclick = () => { audio.playbackRate = nextSpeed(audio.playbackRate); };
  $('fp-seek').oninput = (e) => { audio.currentTime = Number(e.target.value); };
  window.__audio = audio; // для dev/harness.html: проверка currentTime
}
