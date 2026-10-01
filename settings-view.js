// Настройки: вид, тема, биометрия, fullscreen, ярлык на домой, сброс токена.
import { authenticate, biometricAvailable, enableBiometric } from './biometric.js';
import { go, register } from './nav.js';
import { savePref } from './prefs.js';
import { state } from './state.js';
import { applyTheme } from './theme.js';
import { addToHomeScreen, canFullscreen, confirmDialog, haptic, homeScreenStatus, tg, toggleFullscreen } from './tg.js';
import { $, guard, toast } from './ui.js';
import { createTokenStore } from './token-store.js';

const tokenStore = createTokenStore(tg);

async function enter() {
  $('s-view').value = state.prefs.view;
  $('s-theme').value = state.prefs.theme;
  $('s-fullscreen-row').hidden = !canFullscreen();
  $('s-fullscreen').textContent = tg.isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран';
  $('s-bio-row').hidden = !(await biometricAvailable());
  $('s-bio').checked = state.prefs.biometric === 'on';
  const status = await homeScreenStatus();
  $('s-home-row').hidden = !(status === 'missed' || status === 'unknown');
}

export const unlock = authenticate;

export function initSettings() {
  register('settings', { enter: guard(enter) });
  $('s-view').onchange = guard((e) => savePref(state.prefs, 'view', e.target.value));
  $('s-theme').onchange = guard(async (e) => { await savePref(state.prefs, 'theme', e.target.value); applyTheme(e.target.value); });
  $('s-bio').onchange = guard(async (e) => {
    const wanted = e.target.checked;
    const on = wanted && (await enableBiometric());
    e.target.checked = on;
    await savePref(state.prefs, 'biometric', on ? 'on' : 'off');
    if (on) haptic.success(); else if (wanted) toast('Биометрия недоступна или отклонена');
  });
  $('s-fullscreen').onclick = () => toggleFullscreen();
  tg.onEvent('fullscreenChanged', () => { $('s-fullscreen').textContent = tg.isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'; });
  $('s-home').onclick = () => addToHomeScreen();
  tg.onEvent('homeScreenAdded', () => { $('s-home-row').hidden = true; toast('Ярлык добавлен'); });
  $('s-close').onclick = () => go('list');
  $('token-reset').onclick = guard(async () => {
    if (!(await confirmDialog('Сбросить сохранённый токен на этом устройстве?', { okText: 'Сбросить', destructive: true }))) return;
    await tokenStore.clear(); go('token');
  });
}
