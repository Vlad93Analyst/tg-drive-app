// Действия над папками: создание (в т.ч. пустой), цвет, переименование и перемещение целиком.
import { createFolder, folderTargets, moveFolderInto, parentPath, renameFolder, setFolderColor } from './drive.js';
import { openSheet, pickFolder, pickOption } from './sheet.js';
import { commit, state } from './state.js';
import { haptic } from './tg.js';
import { ask, FOLDER_COLORS, toast } from './ui.js';

export async function newFolder() {
  const name = ask(state.path ? `Новая папка в «${state.path}»` : 'Название новой папки');
  if (!name) return;
  await commit((idx) => createFolder(idx, state.path ? `${state.path}/${name.replaceAll('/', ' ')}` : name));
  haptic.success();
}

async function renameFolderAction(folder) {
  const name = ask('Новое имя папки', folder.name);
  if (name) await commit((idx) => renameFolder(idx, folder.path, name));
}

async function moveFolderAction(folder) {
  const target = await pickFolder(folderTargets(state.index, folder.path), { current: parentPath(folder.path), root: true, title: 'Куда переместить папку' });
  if (target === null) return;
  await commit((idx) => moveFolderInto(idx, folder.path, target));
  haptic.success(); toast('Папка перемещена');
}

async function colorFolderAction(folder) {
  const color = await pickOption('Цвет папки', FOLDER_COLORS.map(([value, label]) => ({ value, label, icon: '●' })), folder.color ?? 'gray');
  if (color) await commit((idx) => setFolderColor(idx, folder.path, color));
}

export function folderSheet(folder) {
  openSheet(folder.name, [
    { icon: '🎨', label: 'Цвет папки', onClick: () => colorFolderAction(folder) },
    { icon: '✎', label: 'Переименовать', onClick: () => renameFolderAction(folder) },
    { icon: '📁', label: 'Переместить', onClick: () => moveFolderAction(folder) },
  ]);
}
