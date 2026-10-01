// Чистая логика без импортов и зависимостей: её используют и handlers Serverless
// (import 'lib/core'), и Mini App (копия webapp/core.js, npm run sync-webapp).
// Не добавлять сюда import: в Serverless импорт идёт по bare-имени, в браузере — по относительному пути.

export const FILE_KINDS = ['document', 'photo', 'video', 'audio', 'voice', 'animation', 'video_note'];
export const DEFAULT_FOLDER = 'Inbox';
export const INDEX_FILE_NAME = 'index.json';

export const isAllowed = (userId, allowedIds) => Number.isInteger(userId) && allowedIds.includes(userId);

// ---------- разбор Telegram-сообщения ----------

const DEFAULT_EXT = { document: 'bin', photo: 'jpg', video: 'mp4', audio: 'mp3', voice: 'ogg', animation: 'mp4', video_note: 'mp4' };
const pad = (n) => String(n).padStart(2, '0');

function generatedName(kind, unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
  return `${kind}_${stamp}.${DEFAULT_EXT[kind]}`;
}

function sourceOf(origin) {
  if (!origin) return null;
  const user = origin.sender_user;
  return origin.sender_chat?.title ?? origin.chat?.title ?? origin.sender_user_name ?? user?.username ?? user?.first_name ?? null;
}

const smallestPhoto = (sizes) => sizes.reduce((a, b) => (b.width * b.height < a.width * a.height ? b : a));

function pickMedia(msg) {
  if (msg.document) return { kind: 'document', media: msg.document, name: msg.document.file_name };
  if (msg.photo?.length) {
    // Самый большой — по площади: порядок массива Telegram не гарантирует.
    const biggest = msg.photo.reduce((a, b) => (b.width * b.height >= a.width * a.height ? b : a));
    return { kind: 'photo', media: biggest, thumbId: smallestPhoto(msg.photo).file_id };
  }
  if (msg.video) return { kind: 'video', media: msg.video, name: msg.video.file_name };
  if (msg.audio) {
    const { title, performer, file_name } = msg.audio;
    return { kind: 'audio', media: msg.audio, name: file_name ?? (title ? `${performer ? performer + ' - ' : ''}${title}.mp3` : undefined) };
  }
  if (msg.voice) return { kind: 'voice', media: msg.voice };
  if (msg.animation) return { kind: 'animation', media: msg.animation, name: msg.animation.file_name };
  if (msg.video_note) return { kind: 'video_note', media: msg.video_note };
  return null;
}

/** Запись индекса (без id) из сообщения; null, если поддерживаемого медиа нет. */
export function extractFile(msg) {
  const picked = pickMedia(msg);
  if (!picked) return null;
  const { kind, media, name, thumbId } = picked;
  return {
    file_id: media.file_id,
    file_unique_id: media.file_unique_id,
    kind,
    file_name: name || generatedName(kind, msg.date),
    mime: media.mime_type ?? (kind === 'photo' ? 'image/jpeg' : null),
    size: media.file_size ?? null,
    // Превью для Mini App: у фото — самый мелкий размер, у остальных — thumbnail сообщения (нет у voice).
    thumb_file_id: thumbId ?? media.thumbnail?.file_id ?? media.thumb?.file_id ?? null,
    note: msg.caption ?? '',
    folder: DEFAULT_FOLDER,
    tags: [],
    source: sourceOf(msg.forward_origin),
    created_at: msg.date,
  };
}

// ---------- операции над индексом (чистые: возвращают новый индекс, rev не трогают) ----------

export const emptyIndex = () => ({ version: 1, rev: 0, updated_at: null, files: [] });

/** Dedup по file_unique_id. */
export function addEntry(index, entry) {
  const existing = index.files.find((f) => f.file_unique_id === entry.file_unique_id);
  if (existing) return { index, created: false, entry: existing };
  const id = index.files.reduce((max, f) => Math.max(max, f.id), 0) + 1;
  const added = { id, ...entry };
  return { index: { ...index, files: [...index.files, added] }, created: true, entry: added };
}

function mapEntry(index, id, change) {
  if (!index.files.some((f) => f.id === id)) return null;
  return { ...index, files: index.files.map((f) => (f.id === id ? change(f) : f)) };
}

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : undefined);

/** Меняет имя/папку/заметку; пустые имя и папка игнорируются. null — файла нет. */
export function updateEntry(index, id, patch) {
  const next = {
    file_name: clean(patch.file_name, 200) || undefined,
    folder: clean(patch.folder, 60) || undefined,
    note: clean(patch.note, 2000),
  };
  return mapEntry(index, id, (f) => ({ ...f, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) }));
}

export function addTag(index, id, tag) {
  const t = clean(tag, 40)?.replaceAll(',', ' ');
  if (!t) return null;
  return mapEntry(index, id, (f) => (f.tags.includes(t) ? f : { ...f, tags: [...f.tags, t] }));
}

export const removeTag = (index, id, tag) => mapEntry(index, id, (f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));

export const deleteEntry = (index, id) =>
  index.files.some((f) => f.id === id) ? { ...index, files: index.files.filter((f) => f.id !== id) } : null;

export function filterFiles(index, { folder, tag, kind, q, order = 'desc', limit } = {}) {
  const needle = q?.trim().toLowerCase();
  const matches = index.files.filter((f) =>
    (!folder || f.folder === folder) &&
    (!tag || f.tags.includes(tag)) &&
    (!kind || f.kind === kind) &&
    (!needle || [f.file_name, f.note, f.source ?? '', ...f.tags].some((s) => s.toLowerCase().includes(needle))));
  const sign = order === 'asc' ? 1 : -1;
  matches.sort((a, b) => sign * (a.created_at - b.created_at || a.id - b.id));
  return limit ? matches.slice(0, limit) : matches;
}

/** `id:<n>` — точный запрос одного файла (inline-хендлер и «Отправить в чат» из Mini App). */
export const ID_QUERY_PREFIX = 'id:';
export const idQuery = (id) => `${ID_QUERY_PREFIX}${id}`;
export function parseIdQuery(q) {
  const m = /^\s*id:(\d+)\s*$/i.exec(q ?? '');
  return m ? Number(m[1]) : null;
}

/** Поиск для inline/бота: `id:<n>` -> один файл, иначе обычная фильтрация по тексту. */
export function searchFiles(index, query, limit) {
  const id = parseIdQuery(query);
  if (id !== null) return index.files.filter((f) => f.id === id);
  return filterFiles(index, { q: query, limit });
}

// ---------- представление списка (чистое, для Mini App) ----------

const PREVIEW_PHOTO_MAX_BYTES = 5 * 1024 ** 2;

/** Что грузить как превью: thumbnail; у старых записей фото без thumbnail — сам файл, если не тяжёлый; иначе null (иконка по типу). */
export function previewFileId(file) {
  if (file.thumb_file_id) return file.thumb_file_id;
  if (file.kind === 'photo' && (file.size ?? 0) <= PREVIEW_PHOTO_MAX_BYTES) return file.file_id;
  return null;
}

export const GALLERY_KINDS = ['photo', 'video', 'animation', 'video_note'];

export const DATE_GROUPS = [['today', 'Сегодня'], ['week', 'На этой неделе'], ['earlier', 'Раньше']];

/** Группы «Сегодня / На этой неделе (7 дней) / Раньше»; порядок файлов внутри группы сохраняется, пустые группы опускаются. */
export function groupByDate(files, now = new Date(), offsetMinutes = -now.getTimezoneOffset()) {
  const shift = offsetMinutes * 60;
  const day = (unix) => Math.floor((unix + shift) / 86400);
  const today = day(now.getTime() / 1000);
  const groups = new Map(DATE_GROUPS.map(([key, label]) => [key, { key, label, files: [] }]));
  for (const f of files) {
    const age = today - day(f.created_at);
    groups.get(age <= 0 ? 'today' : age < 7 ? 'week' : 'earlier').files.push(f);
  }
  return [...groups.values()].filter((g) => g.files.length);
}

/** Счётчики фасетов по всем файлам: папки, теги, типы (по убыванию, затем по имени). */
export function facets(index) {
  const count = (values) => {
    const m = new Map();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  return {
    folders: count(index.files.map((f) => f.folder)),
    tags: count(index.files.flatMap((f) => f.tags)),
    kinds: count(index.files.map((f) => f.kind)),
  };
}

// ---------- массовые операции: одна запись индекса на пачку (null — ничего не изменилось) ----------

function mapEntries(index, ids, change) {
  const set = new Set(ids);
  let touched = 0;
  const files = index.files.map((f) => (set.has(f.id) ? (touched++, change(f)) : f));
  return touched ? { ...index, files } : null;
}

export function moveEntries(index, ids, folder) {
  const target = clean(folder, 60);
  return target ? mapEntries(index, ids, (f) => ({ ...f, folder: target })) : null;
}

export function tagEntries(index, ids, tag) {
  const t = clean(tag, 40)?.replaceAll(',', ' ');
  return t ? mapEntries(index, ids, (f) => (f.tags.includes(t) ? f : { ...f, tags: [...f.tags, t] })) : null;
}

export function deleteEntries(index, ids) {
  const set = new Set(ids);
  return index.files.some((f) => set.has(f.id)) ? { ...index, files: index.files.filter((f) => !set.has(f.id)) } : null;
}

// ---------- скачивание и шаринг ----------

/** getFile отдаёт только до 20 MB. Неизвестный размер пробуем (ошибку getFile покажет UI). */
export const DOWNLOAD_LIMIT_BYTES = 20 * 1024 ** 2;
export const canDownload = (file) => file.size == null || file.size <= DOWNLOAD_LIMIT_BYTES;

/** Параметры savePreparedInlineMessage (Bot API 8.0): готовое inline-сообщение для WebApp.shareMessage; null для video_note. */
export function preparedMessageParams(file, userId) {
  const result = inlineResultFor(file);
  return result && { user_id: userId, result, allow_user_chats: true, allow_bot_chats: true, allow_group_chats: true, allow_channel_chats: true };
}

export function listFolders(index) {
  const counts = new Map();
  for (const f of index.files) counts.set(f.folder, (counts.get(f.folder) ?? 0) + 1);
  return [...counts].map(([folder, count]) => ({ folder, count })).sort((a, b) => a.folder.localeCompare(b.folder));
}

// ---------- методы отправки / inline ----------

const SEND_METHOD = {
  document: 'sendDocument', photo: 'sendPhoto', video: 'sendVideo', audio: 'sendAudio',
  voice: 'sendVoice', animation: 'sendAnimation', video_note: 'sendVideoNote',
};

export const sendMethodForKind = (kind) => ({ method: SEND_METHOD[kind], field: kind });

// video_note в inline не кэшируется — исключаем. animation -> gif; если Telegram не примет file_id, заменить на mpeg4_gif.
const INLINE_TYPE = {
  document: { type: 'document', field: 'document_file_id', needsTitle: true },
  photo: { type: 'photo', field: 'photo_file_id', needsTitle: false },
  video: { type: 'video', field: 'video_file_id', needsTitle: true },
  audio: { type: 'audio', field: 'audio_file_id', needsTitle: false },
  voice: { type: 'voice', field: 'voice_file_id', needsTitle: true },
  animation: { type: 'gif', field: 'gif_file_id', needsTitle: false },
};

export function inlineResultFor(file) {
  const spec = INLINE_TYPE[file.kind];
  if (!spec) return null;
  const result = { type: spec.type, id: String(file.id), [spec.field]: file.file_id };
  if (spec.needsTitle) result.title = file.file_name;
  return result;
}

// ---------- протокол индекса: закреплённый index.json в личном чате ----------

/**
 * Файлы в параметрах: `files = { имя: {content, name, type} }`. Строка 'attach://имя' внутри params
 * заменяется на makeFile(...); файл без ссылки становится параметром верхнего уровня с этим именем.
 */
export function resolveFiles(params, files, makeFile) {
  const used = new Set();
  const walk = (value) => {
    if (typeof value === 'string' && value.startsWith('attach://') && files[value.slice(9)]) {
      used.add(value.slice(9));
      return makeFile(files[value.slice(9)]);
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    return value;
  };
  const resolved = walk(params);
  for (const [name, file] of Object.entries(files)) if (!used.has(name)) resolved[name] = makeFile(file);
  return resolved;
}

/**
 * transport = { read(): {index, ref}|null, write(index, ref|null) }.
 * `call(method, params, files)` и `getFileBytes(file_id)` дают бот (Serverless api) или браузер (fetch).
 */
export function pinnedIndexTransport({ call, getFileBytes, chatId }) {
  return {
    async read() {
      const pinned = (await call('getChat', { chat_id: chatId }))?.pinned_message;
      if (pinned?.document?.file_name !== INDEX_FILE_NAME) return null;
      const bytes = await getFileBytes(pinned.document.file_id);
      return { index: JSON.parse(new TextDecoder().decode(bytes)), ref: { message_id: pinned.message_id } };
    },
    async write(index, ref) {
      const file = { content: JSON.stringify(index), name: INDEX_FILE_NAME, type: 'application/json' };
      if (ref) {
        await call('editMessageMedia', { chat_id: chatId, message_id: ref.message_id, media: { type: 'document', media: 'attach://index' } }, { index: file });
        return;
      }
      const sent = await call('sendDocument', { chat_id: chatId, disable_notification: true }, { document: file });
      await call('pinChatMessage', { chat_id: chatId, message_id: sent.message_id, disable_notification: true });
    },
  };
}

export async function readIndex(transport) {
  return (await transport.read())?.index ?? emptyIndex();
}

/**
 * read -> change -> перечитать и сверить rev -> write(rev+1). `change(index)` чистая, возвращает новый индекс
 * или null (нечего писать); при конфликте её перезапускают на свежем индексе.
 * ПОТОЛОК: между сверкой и записью остаётся окно в десятки миллисекунд — одновременная запись бота и
 * Mini App может потерять одну правку. Апгрейд: журнал сообщений (одна операция = одно сообщение, индекс
 * сворачивается при чтении) вместо одного перезаписываемого файла.
 */
export async function mutateIndex(transport, change, { maxAttempts = 3, now = () => new Date().toISOString() } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await transport.read();
    const base = current?.index ?? emptyIndex();
    const next = change(base);
    if (!next) return { index: base, changed: false };
    const fresh = await transport.read();
    if ((fresh?.index.rev ?? 0) !== base.rev) continue;
    const written = { ...next, rev: base.rev + 1, updated_at: now() };
    await transport.write(written, fresh?.ref ?? null);
    return { index: written, changed: true };
  }
  throw new Error('index write conflict: rev kept changing');
}

// ---------- ВРЕМЕННО: приём файлов через getUpdates ----------
// Удалить после запуска Serverless-бота (он принимает файлы сам, а вебхук делает getUpdates недоступным):
// pullFromChat, WebhookActiveError, PULL_* и кнопка «Забрать из чата с ботом» в webapp/list-view.js.

export class WebhookActiveError extends Error {}

export const PULL_PAGE_LIMIT = 100; // потолок Bot API: до 100 апдейтов за вызов
export const PULL_MAX_PAGES = 50; // защита от бесконечного цикла: 5000 апдейтов за нажатие, остальное — следующим нажатием

/** Файлы от whitelisted-пользователя; сообщения ботов и текст (extractFile вернул null) пропускаются. */
export function filesFromUpdates(updates, allowedIds) {
  return updates
    .filter((u) => u.message && !u.message.from?.is_bot && isAllowed(u.message.from?.id, allowedIds))
    .sort((a, b) => a.update_id - b.update_id)
    .map((u) => extractFile(u.message))
    .filter(Boolean);
}

/**
 * Забирает файлы из чата с ботом: страница апдейтов -> ОДНА запись индекса -> только потом подтверждение.
 * Порядок критичен: getUpdates с offset=max+1 удаляет апдейты на стороне Telegram (иначе они хранятся сутки).
 * Подтвердили бы до записи — при ошибке записи файлы пропали бы. Поэтому и пагинация постраничная:
 * следующая страница запрашивается с offset предыдущей, то есть подтверждать приходится по ходу, но всегда после записи.
 * `call(method, params)` — Bot API, `loadOffset()/saveOffset(n)` — хранилище последнего подтверждённого update_id.
 */
export async function pullFromChat({ call, transport, allowedIds, loadOffset, saveOffset, maxPages = PULL_MAX_PAGES }) {
  let added = 0;
  let duplicates = 0;
  for (let page = 0; page < maxPages; page++) {
    const saved = await loadOffset();
    let updates;
    try {
      updates = await call('getUpdates', { ...(saved == null ? {} : { offset: saved + 1 }), limit: PULL_PAGE_LIMIT, timeout: 0, allowed_updates: ['message'] });
    } catch (e) {
      if (/conflict/i.test(e.message) && /webhook/i.test(e.message)) throw new WebhookActiveError('приём файлов теперь делает бот, кнопка больше не нужна');
      throw e;
    }
    if (!updates.length) break;
    const files = filesFromUpdates(updates, allowedIds);
    if (files.length) {
      let created = 0; // change может перезапуститься при конфликте rev — считаем заново
      await mutateIndex(transport, (index) => {
        created = 0;
        const next = files.reduce((acc, file) => { const r = addEntry(acc, file); if (r.created) created++; return r.index; }, index);
        return created ? next : null;
      });
      added += created;
      duplicates += files.length - created;
    }
    const max = Math.max(...updates.map((u) => u.update_id));
    await saveOffset(max);
    await call('getUpdates', { offset: max + 1, limit: 1, timeout: 0, allowed_updates: ['message'] });
    if (updates.length < PULL_PAGE_LIMIT) break;
  }
  return { added, duplicates };
}
