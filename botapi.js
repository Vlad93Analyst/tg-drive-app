// Клиент Bot API из браузера. api.telegram.org отвечает CORS `*`, но на preflight (OPTIONS) даёт 501,
// поэтому ТОЛЬКО simple requests: POST с FormData, без headers (никакого application/json),
// вложенные объекты — JSON-строкой в поле формы; скачивание — простой GET.
const API = 'https://api.telegram.org';

export class BotApiError extends Error {}

export function toFormData(params, files = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  for (const [key, { content, name, type }] of Object.entries(files)) form.append(key, new Blob([content], { type }), name);
  return form;
}

export function createBotClient(token, fetchImpl = (...args) => fetch(...args)) {
  async function call(method, params = {}, files = {}) {
    const response = await fetchImpl(`${API}/bot${token}/${method}`, { method: 'POST', body: toFormData(params, files) });
    const json = await response.json();
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
