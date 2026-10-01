// Чистая логика «Google Drive»: типы, дерево папок, корзина, звёзды, сортировка, статистика, undo, «Недавние».
// Как и core.js — без импортов (общая копия в webapp/, npm run sync-webapp). Время — только параметром `now` (unix-секунды).

const isLive = (f) => !f.trashed_at;
const changed = (index, files) => ({ ...index, files });

// ---------- тип файла для иконки ----------

const EXT_TYPE = {
  pdf: 'pdf', doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', txt: 'doc', md: 'doc', pages: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet', numbers: 'sheet',
  ppt: 'slides', pptx: 'slides', key: 'slides',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', tgz: 'archive',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', heic: 'image', svg: 'image',
  mp4: 'video', mov: 'video', mkv: 'video', avi: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio', opus: 'audio',
};
const MIME_TYPE = [
  [/^application\/pdf$/, 'pdf'], [/spreadsheet|ms-excel|csv/, 'sheet'], [/presentation|ms-powerpoint/, 'slides'],
  [/wordprocessing|msword|opendocument\.text|rtf|^text\//, 'doc'], [/zip|rar|7z|tar|gzip/, 'archive'],
  [/^image\//, 'image'], [/^video\//, 'video'], [/^audio\//, 'audio'],
];
export const TYPE_LABEL = {
  pdf: 'PDF', doc: 'Документ', sheet: 'Таблица', slides: 'Презентация', image: 'Изображение',
  video: 'Видео', audio: 'Аудио', archive: 'Архив', other: 'Файл',
};

/** Тип для иконки: сначала mime, затем расширение, затем kind сообщения Telegram (photo/video/audio/voice...). */
export function fileTypeOf(file) {
  const mime = (file.mime ?? '').toLowerCase();
  const hit = MIME_TYPE.find(([re]) => re.test(mime));
  if (hit) return hit[1];
  const ext = /\.([^./]+)$/.exec(file.file_name ?? '')?.[1]?.toLowerCase();
  if (EXT_TYPE[ext]) return EXT_TYPE[ext];
  if (file.kind === 'photo' || file.kind === 'animation') return 'image';
  if (file.kind === 'video' || file.kind === 'video_note') return 'video';
  if (file.kind === 'audio' || file.kind === 'voice') return 'audio';
  return 'other';
}

// ---------- папки: путь `a/b/c` в поле folder ----------

/** Чистит путь: сегменты без пустых и пробелов по краям, не длиннее 60 знаков каждый. */
export const normalizePath = (path) => String(path ?? '').split('/').map((s) => s.trim().slice(0, 60)).filter(Boolean).join('/');
export const parentPath = (path) => path.split('/').slice(0, -1).join('/');
export const baseName = (path) => path.split('/').at(-1);
const joinPath = (parent, name) => (parent ? `${parent}/${name}` : name);
const isInside = (path, ancestor) => path === ancestor || path.startsWith(`${ancestor}/`);

/** Хлебные крошки: [{name:'Файлы', path:''}, {name:'a', path:'a'}, {name:'b', path:'a/b'}]. */
export function breadcrumbs(path, rootName = 'Файлы') {
  const parts = normalizePath(path).split('/').filter(Boolean);
  return [{ name: rootName, path: '' }, ...parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))];
}

/** Все известные пути: папки файлов, словарь `folders` и их предки (неявные родители тоже папки). */
function allFolderPaths(index) {
  const paths = new Set();
  const add = (p) => { const parts = normalizePath(p).split('/').filter(Boolean); parts.forEach((_, i) => paths.add(parts.slice(0, i + 1).join('/'))); };
  index.files.filter(isLive).forEach((f) => add(f.folder));
  Object.keys(index.folders ?? {}).forEach(add);
  return paths;
}

/** Прямые подпапки `parent` (плитки): имя, путь, цвет, число файлов внутри (включая вложенные). По имени. */
export function childFolders(index, parent = '') {
  const live = index.files.filter(isLive);
  return [...allFolderPaths(index)]
    .filter((p) => parentPath(p) === parent)
    .map((path) => ({
      path, name: baseName(path), color: index.folders?.[path]?.color ?? null,
      count: live.filter((f) => isInside(f.folder, path)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Файлы, лежащие прямо в папке (без вложенных). */
export const filesInFolder = (index, path) => index.files.filter((f) => isLive(f) && f.folder === path);

/** Создать (в т.ч. пустую) папку. null — пустое имя или уже есть. */
export function createFolder(index, path) {
  const p = normalizePath(path);
  if (!p || allFolderPaths(index).has(p)) return null;
  return { ...index, folders: { ...index.folders, [p]: { color: null } } };
}

export function setFolderColor(index, path, color) {
  const p = normalizePath(path);
  return p ? { ...index, folders: { ...index.folders, [p]: { ...index.folders?.[p], color } } } : null;
}

/** Меняет префикс `from` -> `to` у всех файлов (и в корзине тоже) и у ключей словаря folders. null — нечего менять/запрещено. */
export function moveFolderPath(index, from, to) {
  const src = normalizePath(from), dst = normalizePath(to);
  if (!src || !dst || src === dst || isInside(dst, src)) return null; // внутрь самого себя нельзя
  const swap = (p) => (isInside(p, src) ? dst + p.slice(src.length) : p);
  const folders = Object.fromEntries(Object.entries(index.folders ?? {}).map(([p, v]) => [swap(p), v]));
  if (!allFolderPaths(index).has(src) && !index.files.some((f) => isInside(f.folder, src))) return null;
  return { ...index, folders, files: index.files.map((f) => (isInside(f.folder, src) ? { ...f, folder: swap(f.folder) } : f)) };
}

/** Переименование = смена последнего сегмента; `/` в новом имени заменяется пробелом. */
export function renameFolder(index, path, newName) {
  const name = normalizePath(String(newName ?? '').replaceAll('/', ' '));
  return name ? moveFolderPath(index, path, joinPath(parentPath(path), name)) : null;
}

/** Перемещение папки целиком в другую (`parent` '' = корень). */
export const moveFolderInto = (index, path, parent) => moveFolderPath(index, path, joinPath(normalizePath(parent), baseName(path)));

/** Куда можно перенести: все папки, кроме самой и её потомков. */
export const folderTargets = (index, path = null) => [...allFolderPaths(index)].filter((p) => !path || !isInside(p, path)).sort((a, b) => a.localeCompare(b));

// ---------- звёзды ----------

export function starEntries(index, ids, starred) {
  const set = new Set(ids);
  const hit = index.files.some((f) => set.has(f.id) && Boolean(f.starred) !== starred);
  return hit ? changed(index, index.files.map((f) => (set.has(f.id) ? { ...f, starred } : f))) : null;
}

// ---------- корзина (мягкое удаление; в Telegram файл остаётся) ----------

export const TRASH_RETENTION_DAYS = 30;

export function trashEntries(index, ids, now) {
  const set = new Set(ids);
  const hit = index.files.some((f) => set.has(f.id) && isLive(f));
  return hit ? changed(index, index.files.map((f) => (set.has(f.id) && isLive(f) ? { ...f, trashed_at: now } : f))) : null;
}

export function restoreEntries(index, ids) {
  const set = new Set(ids);
  const hit = index.files.some((f) => set.has(f.id) && !isLive(f));
  return hit ? changed(index, index.files.map((f) => (set.has(f.id) && !isLive(f) ? { ...f, trashed_at: null } : f))) : null;
}

/** Навсегда — только из индекса и только то, что уже в корзине (живой файл так не удалить). */
export function purgeEntries(index, ids) {
  const set = new Set(ids);
  const hit = index.files.some((f) => set.has(f.id) && !isLive(f));
  return hit ? changed(index, index.files.filter((f) => !(set.has(f.id) && !isLive(f)))) : null;
}

/** Файлы из корзины, которые purgeEntries уберёт: нужны вызывающему, чтобы взять их chat_messages ДО удаления из индекса. */
export const purgeTargets = (index, ids) => index.files.filter((f) => ids.includes(f.id) && !isLive(f));

export const emptyTrash = (index) => purgeEntries(index, index.files.filter((f) => !isLive(f)).map((f) => f.id));

/**
 * Автоочистка: старше 30 дней в корзине -> из индекса. Вызывается на каждой записи индекса из Mini App
 * (state.commit), отдельного таймера нет. ПОТОЛОК: если индекс не пишут, корзина не чистится; при записи
 * из одного бота (приём файлов) тоже. Апгрейд: звать и из бота.
 */
export function purgeExpired(index, now, days = TRASH_RETENTION_DAYS) {
  const limit = now - days * 86400;
  const expired = index.files.filter((f) => f.trashed_at && f.trashed_at <= limit).map((f) => f.id);
  return expired.length ? purgeEntries(index, expired) : index;
}

export const trashDaysLeft = (file, now, days = TRASH_RETENTION_DAYS) => Math.max(0, Math.ceil((file.trashed_at + days * 86400 - now) / 86400));

// ---------- undo: обратные мутации ----------

/** Снимок папок перед перемещением: {id: folder}; undo = setFolders(index, snapshot). */
export const snapshotFolders = (index, ids) => Object.fromEntries(index.files.filter((f) => ids.includes(f.id)).map((f) => [f.id, f.folder]));

export function setFolders(index, snapshot) {
  const hit = index.files.some((f) => f.id in snapshot && snapshot[f.id] !== f.folder);
  return hit ? changed(index, index.files.map((f) => (f.id in snapshot ? { ...f, folder: snapshot[f.id] } : f))) : null;
}

export function moveFiles(index, ids, folder) {
  const target = normalizePath(folder);
  const set = new Set(ids);
  return target && index.files.some((f) => set.has(f.id) && f.folder !== target)
    ? changed(index, index.files.map((f) => (set.has(f.id) ? { ...f, folder: target } : f))) : null;
}
// Undo «В корзину» — restoreEntries(ids), undo «Переместить» — setFolders(snapshot).

// ---------- «Недавние» ----------

export const OPENED_COALESCE_SECONDS = 60;

/**
 * Пометка открытия. Не чаще раза в `gap` секунд на файл: «Открыть» — частое действие, а каждая запись индекса
 * — три вызова Bot API. ПОТОЛОК: повторное открытие в окне не сдвигает порядок «Недавних».
 */
export function touchOpened(index, id, now, gap = OPENED_COALESCE_SECONDS) {
  const file = index.files.find((f) => f.id === id);
  if (!file || (file.opened_at && now - file.opened_at < gap)) return null;
  return changed(index, index.files.map((f) => (f.id === id ? { ...f, opened_at: now } : f)));
}

/** «Открыть в чате»: бот прислал копию `messageId`. Одна мутация с opened_at; прежнюю копию (если её удалили в чате) убираем из chat_messages. */
export function recordSent(index, id, messageId, now, { removedPrevious = false } = {}) {
  const file = index.files.find((f) => f.id === id);
  if (!file) return null;
  const prev = file.sent_message_id ?? null;
  const kept = (file.chat_messages ?? []).filter((m) => !(removedPrevious && m === prev) && m !== messageId);
  const next = { ...file, opened_at: now, sent_message_id: messageId ?? prev, chat_messages: messageId == null ? file.chat_messages ?? [] : [...kept, messageId] };
  return changed(index, index.files.map((f) => (f.id === id ? next : f)));
}

const lastTouched = (f) => Math.max(f.opened_at ?? 0, f.created_at ?? 0);

/** Быстрый доступ: по последнему открытию или добавлению. */
export const recentFiles = (index, limit = 10) => index.files.filter(isLive).sort((a, b) => lastTouched(b) - lastTouched(a) || b.id - a.id).slice(0, limit);

/** Предложения: последние добавленные, без тех, что уже в карусели. */
export function suggestedFiles(index, limit = 20, skipIds = []) {
  return index.files.filter((f) => isLive(f) && !skipIds.includes(f.id)).sort((a, b) => b.created_at - a.created_at || b.id - a.id).slice(0, limit);
}

// ---------- сортировка и статистика ----------

export const SORT_FIELDS = [['name', 'Название'], ['created', 'Дата добавления'], ['opened', 'Дата открытия'], ['size', 'Размер']];
const SORT_KEY = {
  name: (f) => f.file_name.toLowerCase(), created: (f) => f.created_at ?? 0,
  opened: (f) => f.opened_at ?? 0, size: (f) => f.size ?? 0,
};

/** Новый массив; при равенстве — по id, чтобы порядок был стабильным. dir: 'asc' | 'desc'. */
export function sortFiles(files, by = 'created', dir = 'desc') {
  const key = SORT_KEY[by] ?? SORT_KEY.created;
  const sign = dir === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return sign * (ka < kb ? -1 : ka > kb ? 1 : 0) || sign * (a.id - b.id);
  });
}

/** Объём файлов в Telegram (не лимит): по типам, по убыванию размера. Корзина считается отдельно. */
export function storageStats(index) {
  const byType = new Map();
  const total = { count: 0, bytes: 0 };
  const trash = { count: 0, bytes: 0 };
  for (const f of index.files) {
    const bucket = isLive(f) ? total : trash;
    bucket.count++; bucket.bytes += f.size ?? 0;
    if (!isLive(f)) continue;
    const type = fileTypeOf(f);
    const row = byType.get(type) ?? { type, count: 0, bytes: 0 };
    row.count++; row.bytes += f.size ?? 0; byType.set(type, row);
  }
  return { total, trash, byType: [...byType.values()].sort((a, b) => b.bytes - a.bytes || b.count - a.count) };
}
