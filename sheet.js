// Bottom sheet в стиле Material: список действий, выбор из вариантов, выбор папки.
import { el, $, guard } from './ui.js';
import { ask } from './ui.js';

let closeHandler = null;

export function closeSheet() {
  $('sheet').hidden = true; $('sheet-backdrop').hidden = true;
  const done = closeHandler; closeHandler = null; done?.();
}

/** items: [{ icon, label, danger?, active?, onClick }]; onClick выполняется после закрытия. */
export function openSheet(title, items, onDismiss) {
  closeSheet();
  closeHandler = onDismiss ?? null;
  $('sheet-title').textContent = title; $('sheet-title').hidden = !title;
  $('sheet-body').replaceChildren(...items.map((item) => {
    const row = el('button', `sheet-item${item.danger ? ' danger-text' : ''}${item.active ? ' active' : ''}`);
    row.append(el('span', 'si-icon', item.icon ?? ''), el('span', 'si-label', item.label));
    row.onclick = guard(async () => { closeHandler = null; closeSheet(); await item.onClick(); });
    return row;
  }));
  $('sheet').hidden = false; $('sheet-backdrop').hidden = false;
}

export function initSheet() { $('sheet-backdrop').onclick = closeSheet; }

/** Выбор из вариантов [{value, label, icon?}]; Promise<value | undefined> (undefined = закрыли). */
export function pickOption(title, options, current) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    openSheet(title, options.map((o) => ({ icon: o.icon, label: o.label, active: o.value === current, onClick: () => finish(o.value) })), () => finish(undefined));
  });
}

/** Папка из списка путей; `root` добавляет «Корень»; «Новая папка…» спрашивает путь. Промис: путь | '' (корень) | null (отмена). */
export async function pickFolder(paths, { current, root = false, title = 'Куда переместить' } = {}) {
  const options = [
    ...(root ? [{ value: '', label: 'Корень («Файлы»)', icon: '📁' }] : []),
    ...paths.map((p) => ({ value: p, label: p, icon: '📁' })),
    { value: '\u0000new', label: 'Новая папка…', icon: '＋' },
  ];
  const picked = await pickOption(title, options, current);
  if (picked === undefined) return null;
  if (picked === '\u0000new') return ask('Путь новой папки (a/b/c)');
  return picked;
}
