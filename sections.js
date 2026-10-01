// Содержимое вкладок: Главная, Помеченные, Файлы, Корзина. Каждая функция возвращает узлы для #content.
import { filterFiles } from './core.js';
import {
  breadcrumbs, childFolders, filesInFolder, recentFiles, SORT_FIELDS, sortFiles, suggestedFiles,
} from './drive.js';
import { emptyTrashAction } from './actions.js';
import { renderFile, renderFolderTile } from './file-row.js';
import { openSheet } from './sheet.js';
import { savePref } from './prefs.js';
import { state } from './state.js';
import { button, el, guard } from './ui.js';

const isGrid = () => state.prefs.view === 'grid';
const listOf = (files, mode = 'list') => {
  const box = el('div', isGrid() && mode === 'list' ? 'grid' : 'list');
  box.append(...files.map((f) => renderFile(f, isGrid() && mode === 'list' ? 'grid' : mode)));
  return box;
};

/** Заголовок секции; `withSort` добавляет кнопку сортировки (sheet) со стрелкой направления. */
function sectionHeader(title, { withSort = false, rerender } = {}) {
  const row = el('div', 'section-head');
  row.append(el('h3', 'group', title));
  if (withSort) {
    const { sortBy, sortDir } = state.prefs;
    const label = SORT_FIELDS.find(([key]) => key === sortBy)?.[1] ?? '';
    row.append(button(`${label} ${sortDir === 'asc' ? '↑' : '↓'}`, 'text-btn', async () => openSortSheet(rerender)));
  }
  return row;
}

/** Выбор поля и направления: повторный выбор того же поля меняет направление. Запоминается в prefs. */
function openSortSheet(rerender) {
  const { sortBy, sortDir } = state.prefs;
  openSheet('Сортировка', SORT_FIELDS.map(([key, label]) => ({
    icon: key === sortBy ? (sortDir === 'asc' ? '↑' : '↓') : '', label, active: key === sortBy,
    onClick: async () => {
      const dir = key === sortBy ? (sortDir === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc';
      await savePref(state.prefs, 'sortBy', key); await savePref(state.prefs, 'sortDir', dir); rerender();
    },
  })));
}

const emptyBlock = (text) => el('div', 'empty', text);
const sorted = (files) => sortFiles(files, state.prefs.sortBy, state.prefs.sortDir);

export function homeSection() {
  const recent = recentFiles(state.index, 10);
  const suggested = suggestedFiles(state.index, 20, recent.map((f) => f.id));
  const carousel = el('div', 'carousel');
  carousel.append(...recent.map((f) => renderFile(f, 'recent')));
  return [sectionHeader('Недавние'), carousel, ...(suggested.length ? [sectionHeader('Предложения'), listOf(suggested)] : [])];
}

export function starredSection(rerender) {
  const files = sorted(filterFiles(state.index, { starred: true }));
  return [sectionHeader('Помеченные', { withSort: true, rerender }), files.length ? listOf(files) : emptyBlock('Нет помеченных файлов. Откройте меню ⋮ у файла и выберите «Пометить».')];
}

export function filesSection(rerender, openPath) {
  const crumbs = el('div', 'crumbs');
  breadcrumbs(state.path).forEach((c, i, all) => {
    const last = i === all.length - 1;
    crumbs.append(button(c.name, `crumb${last ? ' current' : ''}`, async () => openPath(c.path)));
    if (!last) crumbs.append(el('span', 'crumb-sep', '›'));
  });
  const folders = childFolders(state.index, state.path);
  const files = sorted(filesInFolder(state.index, state.path));
  const out = [crumbs];
  if (folders.length) {
    const tiles = el('div', 'tiles'); tiles.append(...folders.map((f) => renderFolderTile(f, openPath)));
    out.push(sectionHeader('Папки'), tiles);
  }
  if (files.length) out.push(sectionHeader('Файлы', { withSort: true, rerender }), listOf(files));
  if (!folders.length && !files.length) out.push(emptyBlock('Папка пуста. Добавьте файлы кнопкой ＋ или переместите их сюда.'));
  return out;
}

export function trashSection() {
  const files = sorted(filterFiles(state.index, { trashed: true }));
  const banner = el('div', 'banner', 'Файлы в корзине удаляются из драйва через 30 дней. Из Telegram они не удаляются.');
  if (files.length) banner.append(button('Очистить корзину', 'text-btn', guard(emptyTrashAction)));
  return [banner, files.length ? listOf(files, 'trash') : emptyBlock('Корзина пуста')];
}

/** Результат поиска — плоский список по всем живым файлам (в Корзине — по корзине, в Помеченных — по помеченным). */
export function searchSection() {
  const scope = state.tab === 'trash' ? { trashed: true } : state.tab === 'starred' ? { starred: true } : {};
  const files = sorted(filterFiles(state.index, { ...scope, q: state.q }));
  return [files.length ? listOf(files, state.tab === 'trash' ? 'trash' : 'list') : emptyBlock('Ничего не найдено')];
}
