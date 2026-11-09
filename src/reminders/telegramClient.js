const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 15_000;

export class TelegramError extends Error {
  constructor(message, { retryable, retryAfterMs = null, status = null } = {}) {
    super(message);
    this.name = 'TelegramError';
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

export const getTelegramConfig = () => {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  const topicRaw = String(process.env.TELEGRAM_TOPIC_ID || '').trim();
  const topicId = topicRaw ? Number(topicRaw) : null;

  const missing = [];
  if (!token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!chatId) missing.push('TELEGRAM_CHAT_ID');
  if (!topicRaw) missing.push('TELEGRAM_TOPIC_ID');
  else if (!Number.isInteger(topicId) || topicId <= 0) missing.push('TELEGRAM_TOPIC_ID (must be a positive integer)');

  return { token, chatId, topicId, isConfigured: missing.length === 0, missing };
};

export const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Sends an HTML message to the configured chat topic.
 * Resolves only when Telegram answers `ok: true`; otherwise throws a TelegramError.
 */
export const sendTopicMessage = async (config, text) => {
  let response;
  try {
    response = await fetch(`${API_BASE}/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        message_thread_id: config.topicId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TelegramError(`Network error: ${error.message || error}`, { retryable: true });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON answers (proxies, outages) are handled by the status code below.
  }

  if (response.ok && payload?.ok === true) return payload.result;

  const status = payload?.error_code ?? response.status;
  const description = payload?.description || `HTTP ${response.status}`;
  const retryAfterSec = payload?.parameters?.retry_after;
  throw new TelegramError(`Telegram ${status}: ${description}`, {
    status,
    retryable: status === 429 || status >= 500,
    retryAfterMs: Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : null,
  });
};
