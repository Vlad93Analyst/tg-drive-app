// Тема: по умолчанию — как в Telegram (--tg-theme-*); пользователь может зафиксировать светлую/тёмную.
// Цвета шапки/фона/нижней панели синхронизируются с темой, где клиент это умеет.
import { atLeast, tg } from './tg.js';

export const THEMES = ['auto', 'light', 'dark'];
const PALETTE = { light: '#ffffff', dark: '#17212b' };

export function applyTheme(pref = 'auto') {
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', pref);
  const color = PALETTE[pref] ?? tg.themeParams?.bg_color ?? PALETTE.light;
  if (atLeast('6.1')) { tg.setHeaderColor(PALETTE[pref] ? color : 'bg_color'); tg.setBackgroundColor(color); }
  if (atLeast('7.10')) tg.setBottomBarColor(color);
}
