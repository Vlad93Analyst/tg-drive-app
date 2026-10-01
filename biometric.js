// BiometricManager (Bot API 7.2): запрос биометрии при открытии, если включено в настройках.
import { atLeast, tg } from './tg.js';

const REASON = 'Доступ к вашему драйву';
const callback = (fn) => new Promise((resolve) => fn(resolve));

export const biometricSupported = () => atLeast('7.2') && Boolean(tg.BiometricManager);

async function ready() {
  const manager = tg.BiometricManager;
  if (!manager.isInited) await callback((cb) => manager.init(cb));
  return manager;
}

/** Нужна ли у устройства биометрия вообще (датчик + доступ выдан/можно запросить). */
export async function biometricAvailable() {
  if (!biometricSupported()) return false;
  return (await ready()).isBiometricAvailable;
}

/** Включение: запрашивает доступ у пользователя и подтверждает отпечатком/лицом. */
export async function enableBiometric() {
  const manager = await ready();
  if (!manager.isBiometricAvailable) return false;
  if (!manager.isAccessGranted && !(await callback((cb) => manager.requestAccess({ reason: REASON }, cb)))) return false;
  return callback((cb) => manager.authenticate({ reason: REASON }, cb));
}

export async function authenticate() {
  const manager = await ready();
  if (!manager.isBiometricAvailable || !manager.isAccessGranted) return true; // биометрию убрали из системы: не запираем навсегда
  return callback((cb) => manager.authenticate({ reason: REASON }, cb));
}
