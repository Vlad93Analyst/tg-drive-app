// Мультиселект: выбор файлов и массовые операции. Каждая операция — ОДНА запись индекса на всю пачку.
import { deleteEntries, listFolders, moveEntries, tagEntries } from './core.js';
import { refreshChrome } from './nav.js';
import { commit, state } from './state.js';
import { confirmDialog, haptic } from './tg.js';
import { $, ask, button, pickFolder, toast } from './ui.js';

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

async function applyBulk(change, doneText) {
  const ids = [...state.selected];
  await commit((idx) => change(idx, ids));
  haptic.success(); toast(`${doneText}: ${ids.length}`);
  cancelSelection();
}

export function renderSelectionBar(visibleIds) {
  const bar = $('select-bar'); bar.hidden = !state.selecting;
  if (!state.selecting) return;
  const all = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
  bar.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: `Выбрано: ${state.selected.size}` }),
    button(all ? 'Снять всё' : 'Выбрать все', 'secondary', () => { state.selected = new Set(all ? [] : visibleIds); rerender(); }),
    button('Переместить', '', async () => {
      const folder = await pickFolder(listFolders(state.index).map((f) => f.folder));
      if (folder) await applyBulk((idx, ids) => moveEntries(idx, ids, folder), 'Перемещено');
    }),
    button('Тег', 'secondary', async () => {
      const tag = ask('Тег для выбранных');
      if (tag) await applyBulk((idx, ids) => tagEntries(idx, ids, tag), 'Тег добавлен');
    }),
    button('Удалить', 'danger', async () => {
      const ok = await confirmDialog(`Удалить из драйва: ${state.selected.size}? Файлы останутся в Telegram, исчезнут только из индекса.`, { okText: 'Удалить', destructive: true });
      if (ok) await applyBulk(deleteEntries, 'Удалено');
    }),
  );
}
