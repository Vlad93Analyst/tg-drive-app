// Отрисовка одного файла (строка, плитка галереи, карточка карусели) и плитки папки.
import { fileTypeOf, trashDaysLeft } from './drive.js';
import { fileSheet, trashSheet } from './actions.js';
import { folderSheet } from './folder-actions.js';
import { go } from './nav.js';
import { attachPreview } from './preview.js';
import { startSelection, toggleSelected } from './selection.js';
import { nowSeconds, state } from './state.js';
import { haptic } from './tg.js';
import { el, formatDay, formatSize, TYPE_GLYPH } from './ui.js';

const LONG_PRESS_MS = 500;
const FOLDER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';

/**
 * Цветная иконка по типу; поверх неё лениво грузится превью через <img src> (теги CORS не требуют, fetch — требует).
 * Нет превью или загрузка упала — остаётся иконка.
 */
export function typeIcon(file) {
  const type = fileTypeOf(file);
  const box = el('div', `ticon t-${type}`, TYPE_GLYPH[type]);
  attachPreview(box, file);
  if (state.selecting) box.append(el('span', 'check', state.selected.has(file.id) ? '✓' : ''));
  return box;
}

export const subline = (file, trashed = false) => trashed
  ? `Удалится через ${trashDaysLeft(file, nowSeconds())} дн. · ${formatSize(file.size)}`
  : `${file.starred ? '★ ' : ''}Добавлен ${formatDay(file.created_at)} · ${formatSize(file.size)}`;

function menuButton(onClick) {
  const b = el('button', 'icon-btn menu', '⋮'); b.setAttribute('aria-label', 'Действия');
  b.onclick = (e) => { e.stopPropagation(); onClick(); };
  return b;
}

/** Нажатие открывает «Сведения», долгое — режим выбора; в режиме выбора нажатие переключает. */
function wireTap(node, file) {
  let timer; let longPressed = false;
  node.onpointerdown = () => { longPressed = false; timer = setTimeout(() => { longPressed = true; startSelection(file.id); }, LONG_PRESS_MS); };
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'pointermove']) node.addEventListener(type, () => clearTimeout(timer));
  node.onclick = () => {
    if (longPressed) return;
    if (state.selecting) return toggleSelected(file.id);
    haptic.impact('light'); go('card', file);
  };
}

/** mode: 'list' (строка), 'grid' (плитка), 'trash' (строка корзины), 'recent' (карточка карусели). */
export function renderFile(file, mode = 'list') {
  const trashed = mode === 'trash';
  const node = el('div', `item item-${mode}${state.selected.has(file.id) ? ' selected' : ''}`);
  const text = el('div', 'text');
  text.append(el('div', 'title', file.file_name));
  if (mode !== 'recent') text.append(el('small', '', subline(file, trashed)));
  node.append(typeIcon(file), text);
  if (mode === 'list' || mode === 'trash') if (!state.selecting) node.append(menuButton(() => (trashed ? trashSheet(file) : fileSheet(file))));
  if (mode === 'grid' && !state.selecting) node.append(menuButton(() => fileSheet(file)));
  wireTap(node, file);
  return node;
}

export function renderFolderTile(folder, onOpen) {
  const node = el('div', `tile fc-${folder.color ?? 'gray'}`);
  const icon = el('div', 'folder-icon'); icon.innerHTML = FOLDER_SVG; // константа, не пользовательские данные
  const text = el('div', 'text');
  text.append(el('div', 'title', folder.name), el('small', '', `${folder.count} файл.`));
  node.append(icon, text, menuButton(() => folderSheet(folder)));
  node.onclick = () => { haptic.impact('light'); onOpen(folder.path); };
  return node;
}
