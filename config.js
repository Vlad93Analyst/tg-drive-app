// Единственный источник констант. Копируется в webapp/config.js (npm run sync-webapp).
// User id не секрет: права даёт токен бота, whitelist лишь отсекает чужих.

// PO: впиши свой user id (узнать — @userinfobot). Пока список пуст, бот молчит для всех.
export const ALLOWED_USER_IDS = [108522527];

export const BOT_USERNAME = 'tdrive_private_bot';
export const BOT_LINK = `https://t.me/${BOT_USERNAME}`;

// Предварительно, зависит от репо: поправить, когда будет известен реальный GitHub Pages URL.
export const WEBAPP_URL = 'https://vlad93analyst.github.io/tg-drive-app/';
