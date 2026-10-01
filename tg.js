// Тонкая обёртка над Telegram.WebApp: каждая функция проверяет минимальную версию Bot API и тихо
// ничего не делает на старом клиенте (минимальные версии — в README § «Возможности интерфейса»).
export const tg = window.Telegram.WebApp;
export const atLeast = (version) => Boolean(tg.isVersionAtLeast?.(version));

const safely = (fn) => { try { fn(); } catch { /* опциональная функция клиента: отсутствие не должно ронять интерфейс */ } };

export const haptic = {
  impact: (style = 'light') => atLeast('6.1') && safely(() => tg.HapticFeedback.impactOccurred(style)),
  success: () => atLeast('6.1') && safely(() => tg.HapticFeedback.notificationOccurred('success')),
  error: () => atLeast('6.1') && safely(() => tg.HapticFeedback.notificationOccurred('error')),
  select: () => atLeast('6.1') && safely(() => tg.HapticFeedback.selectionChanged()),
};

/** Нативный showConfirm/showPopup (6.2), иначе window.confirm. */
export function confirmDialog(message, { okText = 'OK', destructive = false } = {}) {
  if (!atLeast('6.2')) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => tg.showPopup(
    { message, buttons: [{ id: 'ok', type: destructive ? 'destructive' : 'default', text: okText }, { type: 'cancel' }] },
    (id) => resolve(id === 'ok'),
  ));
}

// ---------- нижняя панель: MainButton (6.0) и SecondaryButton (7.10) ----------

const bar = { main: null, secondary: null };

/** setBottomBar({ main: {text, onClick, active?}, secondary: {...} }) — отсутствующая кнопка скрывается. Вызов без аргументов очищает панель. */
export function setBottomBar({ main, secondary } = {}) {
  const buttons = [['main', tg.MainButton, main], ['secondary', atLeast('7.10') ? tg.SecondaryButton : null, secondary]];
  for (const [name, button, cfg] of buttons) {
    if (!button) continue;
    if (bar[name]) button.offClick(bar[name]);
    bar[name] = null;
    if (!cfg) { button.hide(); continue; }
    button.setParams({ text: cfg.text, is_visible: true, is_active: cfg.active !== false, ...(cfg.params ?? {}) });
    button.onClick(cfg.onClick);
    bar[name] = cfg.onClick;
  }
}
export const hasSecondaryButton = () => atLeast('7.10');

// ---------- закрытие во время записи индекса (6.2) ----------

let pendingWrites = 0;
export function guardClosing(on) {
  if (!atLeast('6.2')) return;
  pendingWrites = Math.max(0, pendingWrites + (on ? 1 : -1));
  if (on && pendingWrites === 1) tg.enableClosingConfirmation();
  if (!on && pendingWrites === 0) tg.disableClosingConfirmation();
}

// ---------- вертикальные свайпы (7.7): на экране со скролл-жестами сворачивание приложения мешает ----------

export function setVerticalSwipes(enabled) {
  if (!atLeast('7.7')) return;
  if (enabled) tg.enableVerticalSwipes(); else tg.disableVerticalSwipes();
}

// ---------- fullscreen / home screen / safe area (8.0) ----------

export const canFullscreen = () => atLeast('8.0');
export const toggleFullscreen = () => (tg.isFullscreen ? tg.exitFullscreen() : tg.requestFullscreen());

export function homeScreenStatus() {
  if (!atLeast('8.0')) return Promise.resolve('unsupported');
  return new Promise((resolve) => tg.checkHomeScreenStatus(resolve));
}
export const addToHomeScreen = () => tg.addToHomeScreen();

const px = (n) => `${n ?? 0}px`;
export function applyInsets() {
  const { safeAreaInset: s = {}, contentSafeAreaInset: c = {} } = tg;
  const root = document.documentElement.style;
  root.setProperty('--safe-top', px((s.top ?? 0) + (c.top ?? 0)));
  root.setProperty('--safe-bottom', px((s.bottom ?? 0) + (c.bottom ?? 0)));
  root.setProperty('--safe-left', px((s.left ?? 0) + (c.left ?? 0)));
  root.setProperty('--safe-right', px((s.right ?? 0) + (c.right ?? 0)));
}
