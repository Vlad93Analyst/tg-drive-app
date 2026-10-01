// Экран файла: превью, метаданные, теги, заметка; нативные кнопки нижней панели и действия над файлом.
import {
  addTag, canDownload, deleteEntry, idQuery, listFolders, preparedMessageParams, previewFileId, removeTag,
  sendMethodForKind, updateEntry,
} from './core.js';
import { go, register } from './nav.js';
import { commit, state } from './state.js';
import { atLeast, confirmDialog, hasSecondaryButton, haptic, setBottomBar, tg } from './tg.js';
import { $, ask, chip, formatDate, formatSize, guard, KIND_ICON, pickFolder, toast } from './ui.js';

const CHAT_TYPES = ['users', 'groups', 'channels'];

async function sendToBotChat() {
  const { method, field } = sendMethodForKind(state.current.kind);
  await state.client.call(method, { chat_id: state.chatId, [field]: state.current.file_id });
  haptic.success(); toast('Отправлено в чат с ботом');
}

/** shareMessage (8.0) через savePreparedInlineMessage; на старых клиентах — switchInlineQuery (6.7) с запросом id:<n>. */
async function shareToAnyChat() {
  const file = state.current;
  const params = preparedMessageParams(file, state.chatId);
  if (!params) throw new Error('этот тип нельзя переслать — откройте в чате с ботом');
  if (atLeast('8.0') && tg.shareMessage) {
    try {
      const { id } = await state.client.call('savePreparedInlineMessage', params);
      tg.shareMessage(id, (sent) => { if (sent) { haptic.success(); toast('Отправлено'); } });
      return;
    } catch (e) {
      if (!atLeast('6.7')) throw e; // падаем на inline-режим, если бот-метод недоступен
    }
  }
  if (!atLeast('6.7')) throw new Error('обновите Telegram, чтобы отправлять в другие чаты');
  tg.switchInlineQuery(idQuery(file.id), CHAT_TYPES); // inline-режим должен быть включён у бота в BotFather
}

/** URL содержит токен бота и уходит в нативный клиент Telegram — компромисс без бэкенда. */
async function downloadToDevice() {
  const file = state.current;
  const { url } = await state.client.getFileUrl(file.file_id);
  tg.downloadFile({ url, file_name: file.file_name }, (accepted) => { if (accepted) toast('Загрузка запущена'); });
}

function renderPreview(file) {
  const box = $('c-preview'); box.textContent = KIND_ICON[file.kind] ?? '📄';
  const id = previewFileId(file);
  if (!id) return;
  const img = document.createElement('img'); img.alt = ''; state.thumbs.attach(img, id); box.append(img);
}

function renderMeta(file) {
  const meta = $('c-meta'); meta.replaceChildren();
  for (const [k, v] of [['Тип', `${file.kind}${file.mime ? ` (${file.mime})` : ''}`], ['Размер', formatSize(file.size)], ['Дата', formatDate(file.created_at)], ['Источник', file.source || '—'], ['Папка', file.folder]]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    meta.append(dt, dd);
  }
}

function renderTags(file) {
  $('c-tags').replaceChildren(...file.tags.map((t) => chip(`#${t} ✕`, false, async () => {
    await commit((idx) => removeTag(idx, file.id, t)); renderTags(state.current);
  })));
}

function renderActions(file) {
  const canGet = atLeast('8.0');
  $('c-download').hidden = !canGet;
  $('c-download').disabled = !canDownload(file);
  $('c-download-hint').hidden = !canGet || canDownload(file);
  $('c-share').hidden = hasSecondaryButton(); // на новых клиентах это SecondaryButton
  setBottomBar({
    main: { text: 'Открыть в чате', onClick: guard(sendToBotChat) },
    secondary: { text: 'Отправить в чат…', onClick: guard(shareToAnyChat) },
  });
}

function enter(file) {
  state.current = file;
  $('c-name').textContent = file.file_name;
  renderPreview(file); renderMeta(file); renderTags(file); renderActions(file);
  $('c-note').value = file.note;
}

export function initCard() {
  register('card', { enter });
  const edit = (field, label, ask_) => guard(async () => {
    const value = ask_(label, state.current[field]); if (!value) return;
    const id = state.current.id;
    await commit((idx) => updateEntry(idx, id, { [field]: value })); haptic.success(); enter(state.current);
  });
  $('c-rename').onclick = edit('file_name', 'Новое имя', ask);
  $('c-move').onclick = guard(async () => {
    const folder = await pickFolder(listFolders(state.index).map((f) => f.folder), state.current.folder);
    if (!folder) return;
    const id = state.current.id;
    await commit((idx) => updateEntry(idx, id, { folder })); haptic.success(); enter(state.current);
  });
  $('c-tag-new').onkeydown = guard(async (e) => {
    const tag = e.target.value.trim();
    if (e.key !== 'Enter' || !tag) return;
    const id = state.current.id;
    await commit((idx) => addTag(idx, id, tag)); haptic.success();
    e.target.value = ''; renderTags(state.current);
  });
  $('c-note').onchange = guard(async (e) => {
    const id = state.current.id;
    await commit((idx) => updateEntry(idx, id, { note: e.target.value })); toast('Заметка сохранена');
  });
  $('c-share').onclick = guard(shareToAnyChat);
  $('c-download').onclick = guard(downloadToDevice);
  $('c-delete').onclick = guard(async () => {
    const ok = await confirmDialog('Удалить из драйва? Файл останется в Telegram, исчезнет только из индекса.', { okText: 'Удалить', destructive: true });
    if (!ok) return;
    const id = state.current.id;
    await commit((idx) => deleteEntry(idx, id)); haptic.success(); await go('list');
  });
}
