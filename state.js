// Общее состояние Mini App и запись индекса. Остальные модули меняют state только через эти функции/поля.
import { mutateIndex } from './core.js';
import { guardClosing } from './tg.js';

export const state = {
  // фильтры списка
  folder: '', tag: '', kind: '', q: '', order: 'desc',
  // выбор и экран
  selecting: false, selected: new Set(), screen: 'list', current: null,
  // данные и клиент
  index: null, client: null, transport: null, chatId: null, prefs: null, thumbs: null,
};

/** Запись по протоколу rev; null из change = «не найдено», индекс не пишется. Одна запись индекса на вызов (в т.ч. на пачку). */
export async function commit(change) {
  guardClosing(true);
  try {
    const { index, changed } = await mutateIndex(state.transport, change);
    state.index = index;
    if (!changed) throw new Error('не найдено или без изменений');
    state.current = index.files.find((f) => f.id === state.current?.id) ?? null;
  } finally {
    guardClosing(false);
  }
}
