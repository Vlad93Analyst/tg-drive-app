// Клиент Bot API из браузера. api.telegram.org отвечает CORS `*`, но на preflight (OPTIONS) даёт 501,
// поэтому ТОЛЬКО simple requests: POST с urlencoded/FormData, без headers (никакого application/json),
// вложенные объекты — JSON-строкой в поле формы; скачивание — простой GET.
const API = 'https://api.telegram.org';

export class BotApiError extends Error {}

const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{30,}$/;

/** Вставка из заметок/чатов приносит пробелы, переносы и невидимые символы внутри — URL с ними
 * WebKit отвергает ошибкой «The string did not match the expected pattern». Чистим и проверяем формат. */
export function normalizeToken(raw) {
  const token = String(raw ?? '').replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '');
  if (!TOKEN_PATTERN.test(token)) throw new BotApiError('не похоже на токен бота: нужен вид 123456789:AAH… из @BotFather');
  return token;
}

export function toFormData(params, files = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  for (const [key, { content, name, type }] of Object.entries(files)) form.append(key, new Blob([content], { type }), name);
  return form;
}

/** multipart — только когда есть файлы: пустой multipart (WebKit шлёт одну закрывающую границу)
 * Bot API отвергает HTTP 400 без JSON. Без файлов — urlencoded, тоже simple request. */
export function toRequestBody(params, files = {}) {
  if (Object.keys(files).length) return toFormData(params, files);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return body;
}

export function createBotClient(token, fetchImpl = (...args) => fetch(...args)) {
  async function call(method, params = {}, files = {}) {
    let response;
    try {
      response = await fetchImpl(`${API}/bot${token}/${method}`, { method: 'POST', body: toRequestBody(params, files) });
    } catch (e) {
      throw new BotApiError(`${method}: сеть — ${e.message}`);
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch {
      throw new BotApiError(`${method}: HTTP ${response.status}, не JSON — ${text.slice(0, 80)}`);
    }
    if (!json.ok) throw new BotApiError(`${method}: ${json.description ?? response.status}`);
    return json.result;
  }

  /**
   * URL содержит токен бота: годится для fetch/<img> из самого Mini App; в WebApp.downloadFile он уходит
   * в клиент Telegram — это осознанный компромисс (бэкенда, который подписал бы ссылку, нет).
   * Лимит getFile — 20 MB.
   */
  async function getFileUrl(fileId) {
    const { file_path, file_size } = await call('getFile', { file_id: fileId });
    return { url: `${API}/file/bot${token}/${file_path}`, size: file_size ?? null };
  }

  async function getFileBytes(fileId) {
    const response = await fetchImpl((await getFileUrl(fileId)).url);
    if (!response.ok) throw new BotApiError(`download: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  return { call, getFileBytes, getFileUrl };
}
