// Точка входа Mini App: инициализация Telegram, предпочтений, темы и маршрут «доступ -> биометрия -> токен -> список».
// Vanilla ES modules без сборки. Папка = путь `a/b/c` в поле folder + словарь folders в индексе (цвет, пустые папки).
import { biometricSupported } from './biometric.js';
import { createBotClient, normalizeToken } from './botapi.js';
import { ALLOWED_USER_IDS } from './config.js';
import { cloudIndexTransport, isAllowed } from './core.js';
import { initCard } from './card-view.js';
import { offerLegacyPinCleanup } from './legacy-pin.js';
import { initList } from './list-view.js';
import { go, initChrome, refreshChrome } from './nav.js';
import { initSheet } from './sheet.js';
import { loadPrefs } from './prefs.js';
import { initSettings, unlock } from './settings-view.js';
import { state } from './state.js';
import { applyTheme } from './theme.js';
import { applyInsets, cloudStorage, confirmDialog, tg } from './tg.js';
import { createTokenStore } from './token-store.js';
import { $, guard } from './ui.js';

tg.ready(); tg.expand();
const tokenStore = createTokenStore(tg);

async function start(token) {
  state.client = createBotClient(token);
  state.transport = cloudIndexTransport(cloudStorage());
  await go('list'); // ошибка загрузки индекса показывается баннером в списке и не роняет интерфейс
  offerLegacyPinCleanup({ call: state.client.call, chatId: state.chatId, transport: state.transport, confirm: confirmDialog }).catch(() => {}); // необязательная уборка
}

async function openWithToken() {
  let token;
  try { token = await tokenStore.get(); } catch (e) {
    state.loadError = e; state.retryStart = openWithToken; // баннер «Повторить» в списке вместо белого экрана
    return go('list');
  }
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
  try {
    await createBotClient(token).call('getMe'); // невалидный токен -> ошибка до сохранения
  } catch (e) {
    // маска вместо токена: по ней видно, что именно ушло в запрос, не раскрывая секрет
    throw new Error(`${e.message} (ушло: ${token.slice(0, 6)}…${token.slice(-4)}, ${token.length} симв.)`);
  }
  await tokenStore.set(token);
  $('token-input').value = '';
  await start(token);
});

initSheet(); initList(refreshChrome); initCard(); initSettings(); initChrome();
for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged']) tg.onEvent(event, applyInsets);
tg.onEvent('themeChanged', () => applyTheme(state.prefs.theme));

guard(async () => {
  state.prefs = await loadPrefs();
  applyTheme(state.prefs.theme); applyInsets();
  state.chatId = tg.initDataUnsafe?.user?.id;
  await openApp();
})();
