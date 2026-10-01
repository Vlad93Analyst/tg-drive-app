// Ленивая загрузка превью: getFile -> GET файла (simple request) -> blob-URL. Кэш в памяти, параллелизм ограничен.
// ПОТОЛОК: кэш только на время сессии и ограничен MAX_CACHED (старые blob-URL отзываются); апгрейд — Cache API.
const MAX_CACHED = 300;

export function createLimiter(max) {
  let running = 0;
  const waiting = [];
  const next = () => {
    if (running >= max || !waiting.length) return;
    running++;
    const { task, resolve, reject } = waiting.shift();
    task().then(resolve, reject).finally(() => { running--; next(); });
  };
  return (task) => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); next(); });
}

/** getFileUrl(fileId) -> {url}; возвращает { load(fileId) -> Promise<blobUrl>, attach(img, fileId) }. */
export function createThumbLoader({ getFileUrl, fetchImpl = (...a) => fetch(...a), concurrency = 4 }) {
  const limit = createLimiter(concurrency);
  const cache = new Map(); // fileId -> Promise<blobUrl>; порядок вставки = порядок вытеснения

  function load(fileId) {
    if (cache.has(fileId)) return cache.get(fileId);
    const promise = limit(async () => {
      const { url } = await getFileUrl(fileId);
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`thumb: ${response.status}`);
      return URL.createObjectURL(await response.blob());
    });
    cache.set(fileId, promise);
    promise.catch(() => cache.delete(fileId)); // не кэшируем ошибку: следующий показ повторит
    if (cache.size > MAX_CACHED) {
      const [oldId, oldPromise] = cache.entries().next().value;
      cache.delete(oldId);
      oldPromise.then((blobUrl) => URL.revokeObjectURL(blobUrl), () => {});
    }
    return promise;
  }

  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      fill(entry.target);
    }
  }, { rootMargin: '200px' });

  function fill(img) {
    load(img.dataset.thumb).then((blobUrl) => { img.src = blobUrl; img.classList.add('loaded'); }, () => img.remove());
  }

  /** Превью подгрузится, когда img окажется рядом с экраном (без IntersectionObserver — сразу). */
  function attach(img, fileId) {
    img.dataset.thumb = fileId;
    if (observer) observer.observe(img); else fill(img);
  }

  return { load, attach };
}
