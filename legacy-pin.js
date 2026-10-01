// Миграция со старой схемы: индекс жил закреплённым index.json в чате. Браузер скачать его не может (CORS на /file/),
// поэтому не переносим, а предлагаем убрать: открепить и удалить сообщение (перешлёшь файлы боту заново).
import { INDEX_FILE_NAME } from './core.js';

/** Только когда CloudStorage-индекс ещё пуст и в чате закреплён старый index.json. `confirm` приходит снаружи (tg.js тянет window). */
export async function offerLegacyPinCleanup({ call, chatId, transport, confirm }) {
  if (await transport.read()) return false;
  const pinned = (await call('getChat', { chat_id: chatId }))?.pinned_message;
  if (pinned?.document?.file_name !== INDEX_FILE_NAME) return false;
  if (!(await confirm('Старый индекс в чате больше не нужен — удалить?', { okText: 'Удалить', destructive: true }))) return false;
  await call('unpinChatMessage', { chat_id: chatId, message_id: pinned.message_id });
  await call('deleteMessage', { chat_id: chatId, message_id: pinned.message_id });
  return true;
}
