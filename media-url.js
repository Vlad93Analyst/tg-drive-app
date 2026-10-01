// Ссылки на файлы для <img>/<audio>/<video>: getFile -> URL, кэш с TTL. fetch не используем (CORS), crossOrigin на тегах НЕ ставить.
import { createLimiter, createUrlCache } from './core.js';
import { state } from './state.js';

const cache = createUrlCache();
const limit = createLimiter(4);

export async function mediaUrl(fileId) {
  const hit = cache.get(fileId);
  if (hit) return hit;
  const { url } = await state.client.getFileUrl(fileId);
  cache.set(fileId, url);
  return url;
}

/** Для превью: не больше 4 getFile одновременно. */
export const mediaUrlLimited = (fileId) => limit(() => mediaUrl(fileId));
