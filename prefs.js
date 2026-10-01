// Настройки интерфейса (вид, тема, биометрия): DeviceStorage (Bot API 9.0), иначе localStorage.
// Токен здесь НЕ хранится — он в SecureStorage (token-store.js).
import { atLeast, tg } from './tg.js';
import { promisify } from './token-store.js';

const PREFIX = 'tgd_';
export const DEFAULT_PREFS = { view: 'list', theme: 'auto', biometric: 'off', sortBy: 'created', sortDir: 'desc' };

const useDevice = () => atLeast('9.0') && tg.DeviceStorage;

// Настройки необязательны: короткий таймаут, чтобы молчащее DeviceStorage не держало белый экран.
const PREFS_TIMEOUT_MS = 1500;

async function read(key) {
  if (useDevice()) return promisify((cb) => tg.DeviceStorage.getItem(PREFIX + key, cb), PREFS_TIMEOUT_MS);
  return localStorage.getItem(PREFIX + key);
}

export async function loadPrefs() {
  // параллельно: последовательное чтение × таймаут давало десятки секунд пустого экрана
  const keys = Object.keys(DEFAULT_PREFS);
  const values = await Promise.all(keys.map((key) => read(key).catch(() => null))); // битое/молчащее хранилище = значение по умолчанию
  return Object.fromEntries(keys.map((key, i) => [key, values[i] || DEFAULT_PREFS[key]]));
}

export async function savePref(prefs, key, value) {
  prefs[key] = value;
  if (useDevice()) return promisify((cb) => tg.DeviceStorage.setItem(PREFIX + key, value, cb));
  localStorage.setItem(PREFIX + key, value);
}

// ВРЕМЕННО (вместе с pullFromChat): последний подтверждённый update_id для getUpdates.
const OFFSET_KEY = 'updates_offset';
export async function loadUpdatesOffset() {
  const raw = await read(OFFSET_KEY);
  return raw ? Number(raw) : null;
}
export async function saveUpdatesOffset(value) {
  if (useDevice()) return promisify((cb) => tg.DeviceStorage.setItem(PREFIX + OFFSET_KEY, String(value), cb));
  localStorage.setItem(PREFIX + OFFSET_KEY, String(value));
}
