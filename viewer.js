// Полноэкранный просмотр фото (свайп по фото папки) и видео (<video controls playsinline>), файлы ≤20 МБ.
import { photoQueue } from './core.js';
import { mediaUrl } from './media-url.js';
import { state } from './state.js';
import { $, toast } from './ui.js';

const SWIPE_MIN_PX = 50;
let queue = { list: [], position: 0 };

function showCurrent() {
  const file = queue.list[queue.position];
  const stage = $('viewer-stage');
  stage.replaceChildren();
  $('viewer-title').textContent = `${file.file_name}${queue.list.length > 1 ? ` · ${queue.position + 1}/${queue.list.length}` : ''}`;
  const media = document.createElement(file.kind === 'video' ? 'video' : 'img');
  if (file.kind === 'video') Object.assign(media, { controls: true, playsInline: true });
  media.alt = file.file_name;
  media.onerror = () => toast('Не удалось загрузить файл');
  stage.append(media);
  mediaUrl(file.file_id).then((url) => { media.src = url; }, (e) => toast(`Ошибка: ${e.message}`));
}

export function step(delta) {
  const next = queue.position + delta;
  if (next < 0 || next >= queue.list.length) return;
  queue.position = next; showCurrent();
}

export function closeViewer() { $('viewer').hidden = true; $('viewer-stage').replaceChildren(); }

export function openViewer(file) {
  queue = file.kind === 'photo' ? photoQueue(state.index.files, file) : { list: [file], position: 0 };
  $('viewer').hidden = false; showCurrent();
}

export function initViewer() {
  $('viewer-close').onclick = closeViewer;
  let startX = null;
  const stage = $('viewer-stage');
  stage.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX; startX = null;
    if (Math.abs(dx) >= SWIPE_MIN_PX) step(dx < 0 ? 1 : -1);
  });
  document.addEventListener('keydown', (e) => {
    if ($('viewer').hidden) return;
    if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'Escape') closeViewer();
  });
}
