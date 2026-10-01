// Мультиселект: контекстная верхняя панель «N выбрано» + действия. Каждая операция — ОДНА запись индекса на пачку.
import { refreshChrome } from './nav.js';
import { state } from './state.js';
import { haptic } from './tg.js';
import { button, el, guard, $ } from './ui.js';
import { addTagTo, moveFilesTo, purgeFiles, restoreFiles, setStar, trashFiles } from './actions.js';
import { openSheet } from './sheet.js';

let rerender = () => {};
export const bindRerender = (fn) => { rerender = fn; };

export function startSelection(id) {
  state.selecting = true; state.selected = new Set(id == null ? [] : [id]);
  haptic.impact('medium'); refreshChrome(); rerender();
}
export function cancelSelection() {
  state.selecting = false; state.selected = new Set(); refreshChrome(); rerender();
}
export function toggleSelected(id) {
  if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
  haptic.select();
  if (!state.selected.size) return cancelSelection();
  rerender();
}

const iconButton = (glyph, label, onClick) => {
  const b = button(glyph, 'icon-btn', onClick); b.setAttribute('aria-label', label); return b;
};

/** Выполняет действие над выбранным и выходит из режима выбора. */
const bulk = (fn) => async () => { const ids = [...state.selected]; await fn(ids); cancelSelection(); };

export function renderSelectionBar(visibleIds) {
  const bar = $('select-bar'); bar.hidden = !state.selecting;
  $('top-bar').hidden = state.selecting;
  if (!state.selecting) return;
  const all = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
  const selectAll = () => { state.selected = new Set(all ? [] : visibleIds); rerender(); };
  const actions = state.tab === 'trash'
    ? [iconButton('↩', 'Восстановить', bulk(restoreFiles)), iconButton('✕', 'Удалить навсегда', bulk(purgeFiles))]
    : [
      iconButton('☆', 'Пометить', bulk((ids) => setStar(ids, true))),
      iconButton('📁', 'Переместить', bulk(moveFilesTo)),
      iconButton('🗑', 'В корзину', bulk(trashFiles)),
      iconButton('⋮', 'Ещё', () => openSheet('', [
        { icon: '☑', label: all ? 'Снять выделение' : 'Выбрать все', onClick: selectAll },
        { icon: '#', label: 'Добавить тег', onClick: bulk(addTagTo) },
        { icon: '★', label: 'Снять пометку', onClick: bulk((ids) => setStar(ids, false)) },
      ])),
    ];
  bar.replaceChildren(
    iconButton('✕', 'Выйти из выбора', cancelSelection),
    el('span', 'select-count', `${state.selected.size} выбрано`),
    ...actions,
  );
}
