// Токен бота хранится на устройстве: SecureStorage, если есть (Bot API 9.x+), иначе CloudStorage.
// Токен никогда не попадает в код/бандл; при утечке — /revoke в BotFather.
const KEY = 'bot_token';

export const promisify = (fn) => new Promise((resolve, reject) => fn((error, value) => (error ? reject(new Error(String(error))) : resolve(value))));

export function createTokenStore(webApp) {
  const store = webApp.SecureStorage ?? webApp.CloudStorage;
  return {
    get: async () => (store ? (await promisify((cb) => store.getItem(KEY, cb))) || null : null),
    set: (token) => promisify((cb) => store.setItem(KEY, token, cb)),
    clear: () => promisify((cb) => store.removeItem(KEY, cb)),
  };
}
