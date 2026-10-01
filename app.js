// Точка входа Mini App: инициализация Telegram, предпочтений, темы и маршрут «доступ -> биометрия -> токен -> список».
// Vanilla ES modules без сборки. Пустые папки не поддерживаются: папка = строка в записи.
import { biometricSupported } from './biometric.js';
import { createBotClient, normalizeToken } from './botapi.js';
import { ALLOWED_USER_IDS } from './config.js';
import { isAllowed, pinnedIndexTransport } from './core.js';
import { initCard } from './card-view.js';
import { initList } from './list-view.js';
import { go, initChrome } from './nav.js';
import { loadPrefs } from './prefs.js';
import { initSettings, unlock } from './settings-view.js';
import { state } from './state.js';
import { applyTheme } from './theme.js';
import { applyInsets, tg } from './tg.js';
import { createThumbLoader } from './thumbs.js';
import { createTokenStore } from './token-store.js';
import { $, guard } from './ui.js';

tg.ready(); tg.expand();
const tokenStore = createTokenStore(tg);

async function start(token) {
  state.client = createBotClient(token);
  state.transport = pinnedIndexTransport({ ...state.client, chatId: state.chatId });
  state.thumbs = createThumbLoader({ getFileUrl: state.client.getFileUrl });
  await go('list');
}

async function openWithToken() {
  const token = await tokenStore.get();
  if (!token) return go('token');
  await start(token);
}

async function openApp() {
  // user id из initDataUnsafe не проверяется подписью: бэкенда нет, а доступ к индексу даёт именно обладание
  // токеном бота. whitelist здесь — лишь отсечь чужой аккаунт, у которого токен случайно оказался.
  if (!isAllowed(state.chatId, ALLOWED_USER_IDS)) {
    // id показываем, чтобы владелец мог вписать его в whitelist без сторонних ботов
    document.getElementById('denied-id').textContent = state.chatId ?? 'не определён (открыто вне Telegram)';
    return go('denied');
  }
  if (state.prefs.biometric === 'on' && biometricSupported() && !(await unlock())) return go('lock');
  await openWithToken();
}

$('lock-retry').onclick = guard(openApp);
$('token-save').onclick = guard(async () => {
  const token = normalizeToken($('token-input').value);
  await createBotClient(token).call('getMe'); // невалидный токен -> ошибка до сохранения
  await tokenStore.set(token);
  $('token-input').value = '';
  await start(token);
});

initList(); initCard(); initSettings(); initChrome();
for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged']) tg.onEvent(event, applyInsets);
tg.onEvent('themeChanged', () => applyTheme(state.prefs.theme));

guard(async () => {
  state.prefs = await loadPrefs();
  applyTheme(state.prefs.theme); applyInsets();
  state.chatId = tg.initDataUnsafe?.user?.id;
  await openApp();
})();
