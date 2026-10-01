// Настройки: вид, тема, биометрия, fullscreen, ярлык на домой, сброс токена.
import { authenticate, biometricAvailable, enableBiometric } from './biometric.js';
import { go, register } from './nav.js';
import { savePref } from './prefs.js';
import { state } from './state.js';
import { applyTheme } from './theme.js';
import { addToHomeScreen, canFullscreen, confirmDialog, haptic, homeScreenStatus, tg, toggleFullscreen } from './tg.js';
import { storageStats, TYPE_LABEL } from './drive.js';
import { $, el, formatSize, guard, toast } from './ui.js';
import { createTokenStore } from './token-store.js';

const tokenStore = createTokenStore(tg);

/** Полоска «как в Drive»: сегменты по типам. Это объём файлов в Telegram, не занятое место и не лимит. */
function renderStorage() {
  if (!state.index) return;
  const { total, trash, byType } = storageStats(state.index);
  $('s-storage-bar').replaceChildren(...byType.filter((r) => r.bytes > 0).map((r) => {
    const seg = el('span', `seg t-${r.type}`); seg.style.flexGrow = r.bytes; return seg;
  }));
  $('s-storage-total').textContent = `${total.count} файл. · ${formatSize(total.bytes)}${trash.count ? ` (в корзине ещё ${trash.count}: ${formatSize(trash.bytes)})` : ''}`;
  $('s-storage-list').replaceChildren(...byType.map((r) => {
    const row = el('div', 'storage-row'); row.append(el('span', `dot t-${r.type}`), el('span', 'grow', TYPE_LABEL[r.type]), el('small', '', `${r.count} · ${formatSize(r.bytes)}`));
    return row;
  }));
}

async function enter() {
  renderStorage();
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
