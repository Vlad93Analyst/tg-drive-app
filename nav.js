// Навигация между экранами и «хром» Telegram: BackButton (6.1), SettingsButton (7.0), свайпы, нижняя панель.
import { state } from './state.js';
import { atLeast, setBottomBar, setVerticalSwipes, tg } from './tg.js';
import { show } from './ui.js';

const SCREEN_ID = { list: 'list-view', card: 'card-view', settings: 'settings-view', token: 'token-view', lock: 'lock-view', denied: 'denied' };
const screens = {}; // name -> { enter(arg), cancelSelection?() }

export const register = (name, handlers) => { screens[name] = handlers; };

/** BackButton виден везде, кроме корня списка (и в режиме выбора он выходит из выбора). */
export function refreshChrome() {
  const needsBack = state.screen !== 'list' || state.selecting;
  if (needsBack) tg.BackButton.show(); else tg.BackButton.hide();
}

export function go(name, arg) {
  setBottomBar();
  state.screen = name;
  show(SCREEN_ID[name]);
  // На списке жест «потянуть вниз» = обновить; свайп-сворачивание приложения тут мешает.
  setVerticalSwipes(name !== 'list');
  refreshChrome();
  return screens[name]?.enter?.(arg);
}

export function back() {
  if (state.selecting) return screens.list.cancelSelection();
  return go('list');
}

export function initChrome() {
  tg.BackButton.onClick(back);
  if (atLeast('7.0')) { tg.SettingsButton.show(); tg.SettingsButton.onClick(() => go('settings')); }
}
