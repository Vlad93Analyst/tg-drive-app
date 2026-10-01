// Экран «Сведения»: превью, действия, метаданные (тип, размер, где лежит, добавлен, открыт, источник), теги, заметка.
import { addTag, canDownload, removeTag, updateEntry } from './core.js';
import { fileTypeOf, TYPE_LABEL } from './drive.js';
import { fileSheet } from './actions.js';
import { typeIcon } from './file-row.js';
import { go, register } from './nav.js';
import { commit, state } from './state.js';
import { downloadToDevice, openFile, shareToAnyChat } from './transfer.js';
import { haptic } from './tg.js';
import { $, chip, formatDate, formatSize, guard, toast } from './ui.js';

function renderMeta(file) {
  const meta = $('c-meta'); meta.replaceChildren();
  const rows = [
    ['Тип', `${TYPE_LABEL[fileTypeOf(file)]}${file.mime ? ` (${file.mime})` : ''}`],
    ['Размер', formatSize(file.size)], ['Где лежит', file.folder], ['Добавлен', formatDate(file.created_at)],
    ['Открыт', formatDate(file.opened_at)], ['Источник', file.source || '—'],
    ...(file.trashed_at ? [['В корзине с', formatDate(file.trashed_at)]] : []),
  ];
  for (const [k, v] of rows) {
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

function enter(file) {
  state.current = file;
  $('c-name').textContent = file.file_name;
  const preview = $('c-preview'); preview.replaceChildren(typeIcon(file));
  renderMeta(file); renderTags(file);
  // До 8.0 нативного скачивания нет, но startDownload откроет файл во внешнем браузере — кнопка нужна всегда.
  $('c-download').hidden = false; $('c-download').disabled = !canDownload(file);
  $('c-download-hint').hidden = canDownload(file);
  $('c-note').value = file.note;
}

export function initCard() {
  register('card', { enter });
  // Любая запись индекса (действия из sheet, undo) обновляет открытые «Сведения»; файл исчез из индекса — назад к списку.
  const redrawList = state.onChange;
  state.onChange = () => { redrawList(); if (state.screen === 'card') { if (state.current) enter(state.current); else go('list'); } };
  const withCurrent = (fn) => guard(() => fn(state.current));
  $('c-open').onclick = withCurrent(openFile);
  $('c-share').onclick = withCurrent(shareToAnyChat);
  $('c-download').onclick = withCurrent(downloadToDevice);
  $('c-more').onclick = withCurrent(fileSheet);
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
}
