// Действия над файлами: bottom sheet как в Drive, корзина с undo, звёзды, теги, переименование, перемещение.
import { addTag, deleteChatMessages, updateEntry } from './core.js';
import {
  emptyTrash, folderTargets, moveFiles, purgeEntries, purgeTargets, restoreEntries, setFolders, snapshotFolders, starEntries, trashEntries,
} from './drive.js';
import { go } from './nav.js';
import { openSheet, pickFolder } from './sheet.js';
import { openAction } from './core.js';
import { downloadInBrowser, downloadToDevice, openFile, sendToBotChat, shareToAnyChat } from './transfer.js';
import { commit, nowSeconds, state } from './state.js';
import { confirmDialog, haptic } from './tg.js';
import { ask, toast } from './ui.js';

const undoAction = (label, change) => ({ label: 'Отменить', onClick: () => commit(change).then(() => toast(label)).catch((e) => toast(`Ошибка: ${e.message}`)) });

export async function trashFiles(ids) {
  await commit((idx) => trashEntries(idx, ids, nowSeconds()));
  haptic.success(); toast(`В корзине: ${ids.length}`, undoAction('Восстановлено', (idx) => restoreEntries(idx, ids)));
}

export async function moveFilesTo(ids) {
  const snapshot = snapshotFolders(state.index, ids);
  const folder = await pickFolder(folderTargets(state.index), { current: state.index.files.find((f) => f.id === ids[0])?.folder });
  if (!folder) return;
  await commit((idx) => moveFiles(idx, ids, folder));
  haptic.success(); toast(`Перемещено: ${ids.length}`, undoAction('Возвращено', (idx) => setFolders(idx, snapshot)));
}

export async function setStar(ids, starred) {
  await commit((idx) => starEntries(idx, ids, starred)); haptic.success();
}

export async function restoreFiles(ids) {
  await commit((idx) => restoreEntries(idx, ids)); haptic.success(); toast(`Восстановлено: ${ids.length}`);
}

/** Сообщения в чате удаляем ПОСЛЕ записи индекса: сбой чата не отменяет удаление из драйва. */
async function purgeWithChat(change, targets) {
  await commit(change); haptic.success();
  const { deleted, left } = await deleteChatMessages({ call: state.client.call, chatId: state.chatId, files: targets, now: nowSeconds() }).catch(() => ({ deleted: 0, left: 0 }));
  const total = deleted + left;
  toast(total ? `Удалено из чата: ${deleted}${left ? `; старше 48 ч осталось: ${left} — удали вручную` : ''}` : 'Удалено навсегда');
}

const CHAT_NOTE = 'Сообщения в чате с ботом тоже будут удалены, если им меньше 48 ч.';

export async function purgeFiles(ids) {
  const ok = await confirmDialog(`Удалить навсегда (${ids.length})? Из индекса драйва. ${CHAT_NOTE} Исходные файлы в Telegram останутся.`, { okText: 'Удалить', destructive: true });
  if (!ok) return;
  await purgeWithChat((idx) => purgeEntries(idx, ids), purgeTargets(state.index, ids));
}

export async function emptyTrashAction() {
  const ok = await confirmDialog(`Очистить корзину? Файлы исчезнут из индекса навсегда. ${CHAT_NOTE}`, { okText: 'Очистить', destructive: true });
  if (!ok) return;
  const targets = purgeTargets(state.index, state.index.files.filter((f) => f.trashed_at).map((f) => f.id));
  await purgeWithChat(emptyTrash, targets);
}

export async function renameFile(file) {
  const name = ask('Новое имя', file.file_name);
  if (name) await commit((idx) => updateEntry(idx, file.id, { file_name: name }));
}

export async function addTagTo(ids) {
  const tag = ask('Тег');
  if (tag) await commit((idx) => ids.reduce((acc, id) => addTag(acc, id, tag) ?? acc, idx));
}

export function fileSheet(file) {
  const act = (fn) => () => fn(file);
  openSheet(file.file_name, [
    ...(openAction(file) === 'chat' ? [] : [{ icon: '▶', label: 'Открыть', onClick: act(openFile) }]),
    { icon: '💬', label: 'Открыть в Telegram', onClick: act(sendToBotChat) },
    { icon: '📤', label: 'Отправить…', onClick: act(shareToAnyChat) },
    { icon: '⬇', label: 'Скачать', onClick: act(downloadToDevice) },
    { icon: '🌐', label: 'Скачать в браузере', onClick: act(downloadInBrowser) },
    { icon: file.starred ? '★' : '☆', label: file.starred ? 'Снять пометку' : 'Пометить', onClick: () => setStar([file.id], !file.starred) },
    { icon: '✎', label: 'Переименовать', onClick: act(renameFile) },
    { icon: '📁', label: 'Переместить', onClick: () => moveFilesTo([file.id]) },
    { icon: '#', label: 'Теги', onClick: () => addTagTo([file.id]) },
    { icon: 'ⓘ', label: 'Сведения', onClick: () => go('card', file) },
    { icon: '🗑', label: 'В корзину', danger: true, onClick: () => trashFiles([file.id]) },
  ]);
}

export function trashSheet(file) {
  openSheet(file.file_name, [
    { icon: '↩', label: 'Восстановить', onClick: () => restoreFiles([file.id]) },
    { icon: '✕', label: 'Удалить навсегда', danger: true, onClick: () => purgeFiles([file.id]) },
  ]);
}
