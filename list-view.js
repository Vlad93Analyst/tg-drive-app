// Главный экран: поисковая «пилюля», вкладки, FAB; содержимое вкладок — sections.js.
import { ALLOWED_USER_IDS, BOT_LINK } from './config.js';
import { filterFiles, pullFromChat, readIndex, WebhookActiveError } from './core.js';
import { parentPath } from './drive.js';
import { newFolder } from './folder-actions.js';
import { go, register } from './nav.js';
import { loadUpdatesOffset, savePref, saveUpdatesOffset } from './prefs.js';
import { bindRerender, cancelSelection, renderSelectionBar } from './selection.js';
import { filesSection, homeSection, searchSection, starredSection, trashSection } from './sections.js';
import { openSheet } from './sheet.js';
import { state } from './state.js';
import { haptic, openTelegramLink } from './tg.js';
import { $, button, el, guard, toast } from './ui.js';

const SECTIONS = { home: () => homeSection(), starred: () => starredSection(render), files: () => filesSection(render, openPath), trash: () => trashSection() };

function openPath(path) { state.path = path; render(); window.scrollTo(0, 0); refreshBackButton(); }
let refreshBackButton = () => {};

function emptyDrive() {
  const box = el('div', 'empty');
  const p = el('p'); p.append('Драйв пуст. Пришли любой файл боту ');
  p.append(Object.assign(el('a'), { href: BOT_LINK, textContent: '@tdrive_private_bot' }), ' — он появится здесь.');
  box.append(p);
  if (!state.pullHidden) box.append(el('p', 'hint', 'перешли файлы боту @tdrive_private_bot, потом нажми'), button('Забрать из чата с ботом', '', pullChat));
  return box;
}

// ВРЕМЕННО: удалить после запуска Serverless-бота (см. pullFromChat в core.js).
async function pullChat() {
  haptic.impact('light');
  try {
    const { added, duplicates } = await pullFromChat({
      call: state.client.call, transport: state.transport, allowedIds: ALLOWED_USER_IDS,
      loadOffset: loadUpdatesOffset, saveOffset: saveUpdatesOffset,
    });
    toast(`Добавлено ${added}, уже были ${duplicates}`);
  } catch (e) {
    if (!(e instanceof WebhookActiveError)) throw e;
    state.pullHidden = true; toast(e.message);
  }
  await reload();
}

function openFab() {
  haptic.impact('light');
  openSheet('Добавить', [
    ...(state.pullHidden ? [] : [{ icon: '📥', label: 'Забрать из чата с ботом', onClick: pullChat }]),
    { icon: '💬', label: 'Открыть чат с ботом', onClick: () => openTelegramLink('https://t.me/tdrive_private_bot') },
    { icon: '📁', label: 'Новая папка', onClick: newFolder },
  ]);
}

export function render() {
  if (!state.index) { if (state.loadError) showLoadError(state.loadError); return; }
  const content = $('content');
  const nodes = state.q ? searchSection() : state.index.files.length || state.tab === 'files' ? SECTIONS[state.tab]() : [emptyDrive()];
  content.replaceChildren(...nodes);
  $('skeleton').hidden = true;
  $('view-toggle').textContent = state.prefs.view === 'grid' ? '☰' : '▦';
  $('fab').hidden = state.selecting || state.tab === 'trash';
  for (const tab of $('tabs').children) tab.classList.toggle('active', tab.dataset.tab === state.tab);
  const visible = state.q || state.tab !== 'files' ? filterFiles(state.index, { trashed: state.tab === 'trash', starred: state.tab === 'starred', q: state.q }) : state.index.files.filter((f) => !f.trashed_at && f.folder === state.path);
  renderSelectionBar(visible.map((f) => f.id));
}

function showLoadError(error) {
  $('skeleton').hidden = true;
  const box = el('div', 'banner');
  box.append(el('p', '', `Не удалось загрузить индекс: ${error.message}`), button('Повторить', '', reload));
  $('content').replaceChildren(box);
}

/** Ошибка загрузки не бросается наружу: интерфейс (табы, FAB, настройки) остаётся рабочим, в списке баннер «Повторить». */
export async function reload() {
  if (!state.index) $('skeleton').hidden = false;
  try {
    state.index = await readIndex(state.transport);
    state.loadError = null;
  } catch (e) {
    state.loadError = e; haptic.error();
    if (!state.index) return showLoadError(e);
    return toast(`Не удалось обновить: ${e.message}`);
  }
  render();
}

function selectTab(tab) {
  if (state.selecting) cancelSelection();
  if (state.tab === tab && tab === 'files') state.path = ''; // повторный тап по «Файлы» — в корень
  state.tab = tab; state.q = ''; $('search').value = '';
  haptic.select(); render(); window.scrollTo(0, 0); refreshBackButton();
}

function initPullToRefresh() {
  let startY = null;
  const hint = $('pull');
  window.addEventListener('touchstart', (e) => { startY = window.scrollY === 0 && state.screen === 'list' ? e.touches[0].clientY : null; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    hint.hidden = e.touches[0].clientY - startY < 60;
  }, { passive: true });
  window.addEventListener('touchend', guard(async () => {
    if (startY === null || hint.hidden) { hint.hidden = true; startY = null; return; }
    hint.hidden = true; startY = null; haptic.impact('light'); await reload();
  }));
}

export function initList(onBackChanged) {
  refreshBackButton = onBackChanged;
  state.onChange = render;
  bindRerender(render);
  register('list', {
    enter: guard(async () => (state.index ? render() : reload())),
    cancelSelection,
    up: () => openPath(parentPath(state.path)),
  });
  let timer;
  $('search').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); render(); refreshBackButton(); }, 250); };
  for (const tab of $('tabs').children) tab.onclick = () => selectTab(tab.dataset.tab);
  $('fab').onclick = openFab;
  $('avatar').onclick = () => go('settings');
  $('view-toggle').onclick = guard(async () => {
    await savePref(state.prefs, 'view', state.prefs.view === 'grid' ? 'list' : 'grid'); haptic.select(); render();
  });
  initPullToRefresh();
}
