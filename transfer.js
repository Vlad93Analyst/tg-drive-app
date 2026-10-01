// Отправка и скачивание файла + пометка «открыт» для «Недавних».
import { canDownload, idQuery, preparedMessageParams, sendMethodForKind } from './core.js';
import { touchOpened } from './drive.js';
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

export async function sendToBotChat(file) {
  const { method, field } = sendMethodForKind(file.kind);
  await state.client.call(method, { chat_id: state.chatId, [field]: file.file_id });
  haptic.success(); toast('Отправлено в чат с ботом'); markOpened(file);
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
  if (!atLeast('8.0')) throw new Error('обновите Telegram для скачивания');
  const { url } = await state.client.getFileUrl(file.file_id);
  markOpened(file);
  tg.downloadFile({ url, file_name: file.file_name }, (accepted) => { if (accepted) toast('Загрузка запущена'); });
}
