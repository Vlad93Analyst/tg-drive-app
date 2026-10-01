// Действия над файлами: bottom sheet как в Drive, корзина с undo, звёзды, теги, переименование, перемещение.
import { addTag, updateEntry } from './core.js';
import {
  emptyTrash, folderTargets, moveFiles, purgeEntries, restoreEntries, setFolders, snapshotFolders, starEntries, trashEntries,
} from './drive.js';
import { go } from './nav.js';
import { openSheet, pickFolder } from './sheet.js';
import { downloadToDevice, sendToBotChat, shareToAnyChat } from './transfer.js';
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

export async function purgeFiles(ids) {
  const ok = await confirmDialog(`Удалить навсегда (${ids.length})? Из индекса драйва; в Telegram файлы останутся в исходном чате.`, { okText: 'Удалить', destructive: true });
  if (!ok) return;
  await commit((idx) => purgeEntries(idx, ids)); haptic.success(); toast(`Удалено навсегда: ${ids.length}`);
}

export async function emptyTrashAction() {
  const ok = await confirmDialog('Очистить корзину? Файлы исчезнут из индекса навсегда (в Telegram они останутся).', { okText: 'Очистить', destructive: true });
  if (!ok) return;
  await commit(emptyTrash); haptic.success(); toast('Корзина очищена');
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
    { icon: '💬', label: 'Открыть в чате', onClick: act(sendToBotChat) },
    { icon: '📤', label: 'Отправить…', onClick: act(shareToAnyChat) },
    { icon: '⬇', label: 'Скачать', onClick: act(downloadToDevice) },
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
