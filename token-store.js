// Токен бота хранится на устройстве: SecureStorage, если работает (Bot API 9.0+), иначе CloudStorage.
// Токен никогда не попадает в код/бандл; при утечке — /revoke в BotFather.
const KEY = 'bot_token';

export const promisify = (fn) => new Promise((resolve, reject) => fn((error, value) => (error ? reject(new Error(String(error))) : resolve(value))));

// telegram-web-app.js объявляет SecureStorage на всех клиентах, но на неподдерживаемых (Desktop/Web)
// вызовы падают с ошибкой UNSUPPORTED — поэтому наличие объекта не проверка, пробуем и откатываемся.
async function trySecureThenCloud(webApp, operation) {
  if (webApp.SecureStorage) {
    try { return await operation(webApp.SecureStorage); } catch { /* клиент без SecureStorage → CloudStorage */ }
  }
  if (!webApp.CloudStorage) throw new Error('нет хранилища Telegram для токена');
  return operation(webApp.CloudStorage);
}

export function createTokenStore(webApp) {
  return {
    get: async () => {
      try {
        const token = await trySecureThenCloud(webApp, (store) => promisify((cb) => store.getItem(KEY, cb)));
        if (token) return token;
      } catch { return null; }
      // токен мог быть сохранён в CloudStorage на клиенте без SecureStorage — проверить и его
      if (!webApp.CloudStorage || !webApp.SecureStorage) return null;
      return (await promisify((cb) => webApp.CloudStorage.getItem(KEY, cb)).catch(() => null)) || null;
    },
    set: (token) => trySecureThenCloud(webApp, (store) => promisify((cb) => store.setItem(KEY, token, cb))),
    clear: async () => {
      for (const store of [webApp.SecureStorage, webApp.CloudStorage]) {
        if (store) await promisify((cb) => store.removeItem(KEY, cb)).catch(() => {}); // нет ключа/хранилища — не ошибка
      }
    },
  };
}
