// Главный экран: поиск, фасеты, список/сетка, группировка по датам, превью, pull-to-refresh.
import { ALLOWED_USER_IDS, BOT_LINK } from './config.js';
import { facets, filterFiles, groupByDate, previewFileId, pullFromChat, readIndex, WebhookActiveError } from './core.js';
import { go, register } from './nav.js';
import { bindRerender, cancelSelection, renderSelectionBar, startSelection, toggleSelected } from './selection.js';
import { loadUpdatesOffset, savePref, saveUpdatesOffset } from './prefs.js';
import { state } from './state.js';
import { haptic } from './tg.js';
import { $, button, chip, toast, formatDate, formatSize, guard, KIND_ICON, KIND_LABEL } from './ui.js';

const LONG_PRESS_MS = 500;

const toggleFilter = (key, value) => () => { state[key] = state[key] === value ? '' : value; render(); };

function renderFacets() {
  const f = facets(state.index);
  const row = (id, items, key, label = (n) => n) => {
    const el = $(id); el.hidden = items.length < 2 && !state[key];
    el.replaceChildren(...items.map(({ name, count }) => chip(`${label(name)} ${count}`, state[key] === name, toggleFilter(key, name))));
  };
  row('f-folders', f.folders, 'folder');
  row('f-kinds', f.kinds, 'kind', (n) => `${KIND_ICON[n] ?? ''} ${KIND_LABEL[n] ?? n}`);
  row('f-tags', f.tags, 'tag', (n) => `#${n}`);
}

function renderItem(file) {
  const el = document.createElement('div');
  el.className = `item${state.selected.has(file.id) ? ' selected' : ''}`;
  const thumb = document.createElement('div'); thumb.className = 'thumb';
  thumb.textContent = KIND_ICON[file.kind] ?? '📄';
  const previewId = previewFileId(file);
  if (previewId) { const img = document.createElement('img'); img.alt = ''; state.thumbs.attach(img, previewId); thumb.append(img); }
  if (state.selecting) thumb.append(Object.assign(document.createElement('span'), { className: 'check', textContent: state.selected.has(file.id) ? '✓' : '' }));
  const title = document.createElement('div'); title.className = 'title'; title.textContent = file.file_name;
  const meta = document.createElement('small'); meta.textContent = `${formatSize(file.size)} · ${file.folder} · ${formatDate(file.created_at)}`;
  const text = document.createElement('div'); text.className = 'text'; text.append(title, meta);
  el.append(thumb, text);

  let timer; let longPressed = false;
  el.onpointerdown = () => { longPressed = false; timer = setTimeout(() => { longPressed = true; startSelection(file.id); }, LONG_PRESS_MS); };
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'pointermove']) el.addEventListener(type, () => clearTimeout(timer));
  el.onclick = () => {
    if (longPressed) return;
    if (state.selecting) return toggleSelected(file.id);
    haptic.impact('light'); go('card', file);
  };
  return el;
}

function renderEmpty(totalFiles, shown) {
  const el = $('empty'); el.hidden = shown > 0; el.replaceChildren();
  if (shown > 0) return;
  const p = document.createElement('p');
  if (!totalFiles) {
    p.append('Драйв пуст. Пришли любой файл боту ');
    p.append(Object.assign(document.createElement('a'), { href: BOT_LINK, textContent: '@tdrive_private_bot' }), ' — он появится здесь.');
    el.append(p);
    if (!state.pullHidden) el.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'перешли файлы боту @tdrive_private_bot, потом нажми' }), button('Забрать из чата с ботом', '', pullChat));
    return;
  }
  p.textContent = 'Ничего не найдено по этим условиям.';
  el.append(p, chip('Сбросить фильтры', false, () => { Object.assign(state, { folder: '', tag: '', kind: '', q: '' }); $('search').value = ''; render(); }));
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

export function render() {
  if (!state.index) return;
  renderFacets();
  $('pull-chat').hidden = state.pullHidden;
  const files = filterFiles(state.index, state);
  const groups = state.order === 'desc' ? groupByDate(files) : [{ key: 'all', label: '', files }];
  const container = $('files'); container.className = state.prefs.view === 'grid' ? 'grid' : 'list';
  container.replaceChildren(...groups.flatMap((g) => [
    ...(g.label ? [Object.assign(document.createElement('h3'), { className: 'group', textContent: g.label })] : []),
    ...g.files.map(renderItem),
  ]));
  $('skeleton').hidden = true;
  $('view-toggle').textContent = state.prefs.view === 'grid' ? '☰' : '▦';
  renderEmpty(state.index.files.length, files.length);
  renderSelectionBar(files.map((f) => f.id));
}

export async function reload() {
  if (!state.index) $('skeleton').hidden = false;
  state.index = await readIndex(state.transport);
  render();
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

export function initList() {
  bindRerender(render);
  register('list', { enter: guard(reload), cancelSelection });
  let timer;
  $('search').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 250); };
  $('order').onchange = (e) => { state.order = e.target.value; render(); };
  $('refresh').onclick = guard(async () => { haptic.impact('light'); await reload(); });
  $('pull-chat').onclick = guard(pullChat);
  $('select-toggle').onclick = () => (state.selecting ? cancelSelection() : startSelection());
  $('view-toggle').onclick = guard(async () => {
    await savePref(state.prefs, 'view', state.prefs.view === 'grid' ? 'list' : 'grid'); haptic.select(); render();
  });
  $('open-settings').onclick = () => go('settings');
  initPullToRefresh();
}
