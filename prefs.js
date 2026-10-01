// Настройки интерфейса (вид, тема, биометрия): DeviceStorage (Bot API 9.0), иначе localStorage.
// Токен здесь НЕ хранится — он в SecureStorage (token-store.js).
import { atLeast, tg } from './tg.js';
import { promisify } from './token-store.js';

const PREFIX = 'tgd_';
export const DEFAULT_PREFS = { view: 'list', theme: 'auto', biometric: 'off' };

const useDevice = () => atLeast('9.0') && tg.DeviceStorage;

async function read(key) {
  if (useDevice()) return promisify((cb) => tg.DeviceStorage.getItem(PREFIX + key, cb));
  return localStorage.getItem(PREFIX + key);
}

export async function loadPrefs() {
  const prefs = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS)) {
    try { prefs[key] = (await read(key)) || DEFAULT_PREFS[key]; } catch { /* битое хранилище = значение по умолчанию */ }
  }
  return prefs;
}

export async function savePref(prefs, key, value) {
  prefs[key] = value;
  if (useDevice()) return promisify((cb) => tg.DeviceStorage.setItem(PREFIX + key, value, cb));
  localStorage.setItem(PREFIX + key, value);
}
