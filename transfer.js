// Отправка и скачивание файла + пометка «открыт» для «Недавних».
import { canDownload, idQuery, preparedMessageParams, sendMethodForKind, startDownload } from './core.js';
import { downloadFileName, openAction } from './core.js';
import { playFile } from './player.js';
import { recordSent, touchOpened } from './drive.js';
import { openViewer } from './viewer.js';
import { commit, nowSeconds, state } from './state.js';
import { atLeast, haptic, tg } from './tg.js';
import { toast } from './ui.js';

const CHAT_TYPES = ['users', 'groups', 'channels'];

/**
 * Одна фоновая мутация opened_at; коалесцирование (не чаще раза в минуту на файл) — в touchOpened.
 * Ошибку записи глотаем намеренно: файл уже отправлен/скачан, а «Недавние» — вторичная польза,
 * падать из-за неё и пугать пользователя нельзя.
 */
export function markOpened(file) {
  commit((idx) => touchOpened(idx, file.id, nowSeconds()), { quiet: true }).then(() => state.onChange(), () => {});
}

/**
 * Копия в чат + tg.close(): пользователь оказывается в чате, файл — внизу. Прежнюю копию бота удаляем (best-effort),
 * чтобы в чате не копились дубли. Все id уходят в chat_messages — для «Удалить навсегда».
 */
export async function sendToBotChat(file) {
  const { method, field } = sendMethodForKind(file.kind);
  // Свежая запись из индекса: переданный объект мог устареть (прежняя отправка записала id уже после его отрисовки).
  const prev = (state.index.files.find((f) => f.id === file.id) ?? file).sent_message_id;
  let removedPrevious = false;
  if (prev) {
    try { await state.client.call('deleteMessage', { chat_id: state.chatId, message_id: prev }); removedPrevious = true; } catch { /* старше 48 ч или уже удалено — не мешает отправке */ }
  }
  const sent = await state.client.call(method, { chat_id: state.chatId, [field]: file.file_id });
  haptic.success(); toast('Отправлено в чат с ботом');
  // Запись id — до close(): после закрытия Mini App мутация не успеет.
  await commit((idx) => recordSent(idx, file.id, sent?.message_id ?? null, nowSeconds(), { removedPrevious }), { quiet: true }).then(() => state.onChange(), () => {});
  tg.close();
}

/** Основное «Открыть»: аудио — плеер, фото/видео ≤20 МБ — просмотрщик, остальное (документы, большие файлы) — копия в чат. */
export function openFile(file) {
  const action = openAction(file);
  if (action === 'chat') return sendToBotChat(file);
  markOpened(file);
  return action === 'player' ? playFile(file) : openViewer(file);
}

/** shareMessage (8.0) через savePreparedInlineMessage; на старых клиентах — switchInlineQuery (6.7) с запросом id:<n>. */
export async function shareToAnyChat(file) {
  const params = preparedMessageParams(file, state.chatId);
  if (!params) throw new Error('этот тип нельзя переслать — откройте в чате с ботом');
  markOpened(file);
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
export async function downloadToDevice(file) {
  if (!canDownload(file)) throw new Error('файл больше 20 МБ — откройте его в чате');
  const { url } = await state.client.getFileUrl(file.file_id);
  markOpened(file);
  const messages = { accepted: 'Загрузка запущена', declined: 'Скачивание отменено', browser: 'Открыто в браузере — файл скачается там' };
  const result = await startDownload(tg, { url, file_name: downloadFileName(file) }, (answer) => toast(messages[answer]));
  if (result === 'browser') toast(messages.browser);
}

/** Прямой путь через внешний браузер: когда нативное скачивание молчит. */
export async function downloadInBrowser(file) {
  if (!canDownload(file)) throw new Error('файл больше 20 МБ — откройте его в чате');
  const { url } = await state.client.getFileUrl(file.file_id);
  markOpened(file);
  tg.openLink(url); toast('Открыто в браузере — файл скачается там');
}
