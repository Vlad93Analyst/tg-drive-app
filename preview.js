// Ленивые превью: <img src> без CORS; при ошибке остаётся иконка по типу.
import { previewFileId } from './core.js';
import { mediaUrlLimited } from './media-url.js';

const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); entry.target.__loadPreview?.(); }
}, { rootMargin: '200px' });

export function attachPreview(box, file) {
  const fileId = previewFileId(file);
  if (!fileId) return;
  box.__loadPreview = async () => {
    try {
      const img = new Image(); // без crossOrigin: иначе браузер потребует CORS-заголовок и загрузка упадёт
      img.alt = '';
      img.onload = () => img.classList.add('loaded');
      img.onerror = () => img.remove();
      img.src = await mediaUrlLimited(fileId);
      box.prepend(img);
    } catch { /* getFile не ответил — остаётся иконка */ }
  };
  if (observer) observer.observe(box); else box.__loadPreview();
}
