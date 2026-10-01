// Общее состояние Mini App и запись индекса. Остальные модули меняют state только через эти функции/поля.
import { mutateIndex } from './core.js';
import { purgeExpired } from './drive.js';
import { guardClosing } from './tg.js';

export const state = {
  // экран «список»: вкладка home|starred|files|trash, путь открытой папки, поиск
  tab: 'home', path: '', q: '',
  // выбор и экран
  selecting: false, selected: new Set(), screen: 'list', current: null,
  // данные и клиент
  pullHidden: false, // ВРЕМЕННО: кнопка «Забрать из чата» скрыта после ошибки вебхука
  index: null, client: null, transport: null, chatId: null, prefs: null, thumbs: null,
  onChange: () => {}, // list-view подставляет перерисовку
};

/** Вкладка «Файлы» внутри папки: BackButton поднимается на уровень выше. */
export const isInsideFolder = () => state.tab === 'files' && Boolean(state.path) && !state.q;

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Запись по протоколу rev; null из change = «не найдено», индекс не пишется. Одна запись индекса на вызов (в т.ч. на пачку).
 * Автоочистка корзины (30 дней) едет на каждой записи: отдельного таймера у Mini App нет.
 * `quiet` — фоновая запись (opened_at): «без изменений» не ошибка и перерисовки нет.
 */
export async function commit(change, { quiet = false } = {}) {
  guardClosing(true);
  try {
    const { index, changed } = await mutateIndex(state.transport, (idx) => {
      const next = change(idx);
      return next && purgeExpired(next, nowSeconds());
    });
    state.index = index;
    if (!changed) { if (quiet) return false; throw new Error('не найдено или без изменений'); }
    state.current = index.files.find((f) => f.id === state.current?.id) ?? null;
    if (!quiet) state.onChange();
    return true;
  } finally {
    guardClosing(false);
  }
}
