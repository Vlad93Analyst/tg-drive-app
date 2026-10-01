// Мелкие UI-хелперы без знания о предметной области.
import { haptic } from './tg.js';

export const $ = (id) => document.getElementById(id);

export function toast(text) {
  const el = $('toast'); el.textContent = text; el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 2500);
}
export const guard = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) { haptic.error(); toast(`Ошибка: ${e.message}`); }
};

const SCREENS = ['denied', 'lock-view', 'token-view', 'list-view', 'card-view', 'settings-view'];
export const show = (id) => { for (const s of SCREENS) $(s).hidden = s !== id; window.scrollTo(0, 0); };

export const formatSize = (b) => b == null ? '—' : b < 1024 ** 2 ? `${Math.ceil(b / 1024)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;
export const formatDate = (s) => new Date(s * 1000).toLocaleString();

export const KIND_ICON = { document: '📄', photo: '🖼️', video: '🎬', audio: '🎵', voice: '🎤', animation: '🎞️', video_note: '⭕' };
export const KIND_LABEL = { document: 'Документы', photo: 'Фото', video: 'Видео', audio: 'Аудио', voice: 'Голосовые', animation: 'GIF', video_note: 'Кружки' };

export function chip(text, active, onClick) {
  const b = document.createElement('button');
  b.className = `chip${active ? ' active' : ''}`; b.textContent = text; b.onclick = guard(onClick);
  return b;
}

export function button(text, className, onClick) {
  const b = document.createElement('button');
  b.textContent = text; if (className) b.className = className; b.onclick = guard(onClick);
  return b;
}

/** Нативных полей ввода в Telegram нет — используем window.prompt; trim, пустое = отмена. */
export const ask = (label, value = '') => window.prompt(label, value)?.trim() || null;

/** Выбор папки: чипы существующих + «новая…». Возвращает имя или null. */
export function pickFolder(folderNames, current = '') {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    const done = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    const title = document.createElement('h3'); title.textContent = 'Куда переместить';
    const list = document.createElement('div'); list.className = 'chips wrap';
    for (const name of folderNames) list.append(chip(name, name === current, () => done(name)));
    list.append(chip('＋ Новая папка…', false, () => { const name = ask('Имя новой папки'); if (name) done(name); }));
    dialog.append(title, list, button('Отмена', 'secondary', () => done(null)));
    dialog.addEventListener('cancel', () => done(null));
    document.body.append(dialog); dialog.showModal();
  });
}
