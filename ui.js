// Мелкие UI-хелперы без знания о предметной области.
import { haptic } from './tg.js';

export const $ = (id) => document.getElementById(id);

/** Snackbar; с `action` — кнопка («Отменить») и 6 секунд вместо 2.5. */
export function toast(text, action) {
  const el = $('toast'); $('toast-text').textContent = text; el.hidden = false;
  const btn = $('toast-action'); btn.hidden = !action;
  if (action) { btn.textContent = action.label; btn.onclick = () => { el.hidden = true; action.onClick(); }; }
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2500);
}
export const guard = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) { haptic.error(); toast(`Ошибка: ${e.message}`); }
};

const SCREENS = ['denied', 'lock-view', 'token-view', 'list-view', 'card-view', 'settings-view'];
export const show = (id) => { for (const s of SCREENS) $(s).hidden = s !== id; window.scrollTo(0, 0); };

export const formatSize = (b) => b == null ? '—' : b < 1024 ** 2 ? `${Math.ceil(b / 1024)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;
export const formatDate = (s) => (s ? new Date(s * 1000).toLocaleString() : '—');
export const formatDay = (s) => new Date(s * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const TYPE_GLYPH = { pdf: 'PDF', doc: '≡', sheet: '▦', slides: '▶', image: '▲', video: '▶', audio: '♪', archive: '▤', other: '•' };

export const FOLDER_COLORS = [['gray', 'Серая'], ['red', 'Красная'], ['orange', 'Оранжевая'], ['yellow', 'Жёлтая'], ['green', 'Зелёная'], ['teal', 'Бирюзовая'], ['blue', 'Синяя'], ['purple', 'Фиолетовая'], ['pink', 'Розовая']];

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

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Нативных полей ввода в Telegram нет — используем window.prompt; trim, пустое = отмена. */
export const ask = (label, value = '') => window.prompt(label, value)?.trim() || null;
