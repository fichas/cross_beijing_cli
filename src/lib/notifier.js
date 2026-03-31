import { createHmac } from 'crypto';

/**
 * Parse a notify URL into scheme and path.
 * @param {string} url
 * @returns {{ scheme: string, path: string } | null}
 */
function parseNotifyUrl(url) {
  const m = url.match(/^(\w+):\/\/(.+)$/);
  if (!m) return null;
  return { scheme: m[1], path: m[2] };
}

// ── Channel handlers ────────────────────────────────────────────────

async function sendBark(path, title, body) {
  // bark://<key> (default server) or bark://<server>/<key>
  const parts = path.split('/');
  let server, key;
  if (parts.length === 1) {
    server = 'api.day.app';
    key = parts[0];
  } else {
    server = parts[0];
    key = parts.slice(1).join('/');
  }
  const url = `https://${server}/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bark HTTP ${res.status}`);
}

async function sendTelegram(path, title, body) {
  // tgram://<bot_token>/<chat_id>
  const idx = path.lastIndexOf('/');
  if (idx === -1) throw new Error('Invalid Telegram URL: missing chat_id');
  const token = path.slice(0, idx);
  const chatId = path.slice(idx + 1);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `*${title}*\n${body}`,
      parse_mode: 'Markdown',
    }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
}

async function sendDingTalk(path, title, body) {
  // dingtalk://<access_token>[/<secret>]
  const parts = path.split('/');
  const token = parts[0];
  const secret = parts[1];
  let url = `https://oapi.dingtalk.com/robot/send?access_token=${token}`;
  if (secret) {
    const ts = Date.now();
    const stringToSign = `${ts}\n${secret}`;
    const sign = encodeURIComponent(
      createHmac('sha256', secret).update(stringToSign).digest('base64'),
    );
    url += `&timestamp=${ts}&sign=${sign}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: `${title}\n${body}` } }),
  });
  if (!res.ok) throw new Error(`DingTalk HTTP ${res.status}`);
}

async function sendWeCom(path, title, body) {
  // wecom://<key>
  const key = path;
  const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: `${title}\n${body}` } }),
  });
  if (!res.ok) throw new Error(`WeCom HTTP ${res.status}`);
}

async function sendFeishu(path, title, body) {
  // feishu://<hook_id>[/<secret>]
  const parts = path.split('/');
  const hookId = parts[0];
  const secret = parts[1];
  const url = `https://open.feishu.cn/open-apis/bot/v2/hook/${hookId}`;
  const payload = {
    msg_type: 'text',
    content: { text: `${title}\n${body}` },
  };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = createHmac('sha256', stringToSign).update(Buffer.alloc(0)).digest('base64');
    payload.timestamp = timestamp;
    payload.sign = sign;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Feishu HTTP ${res.status}`);
}

async function sendSlack(path, title, body) {
  // slack://<T>/<B>/<token>
  const url = `https://hooks.slack.com/services/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${title}*\n${body}` }),
  });
  if (!res.ok) throw new Error(`Slack HTTP ${res.status}`);
}

async function sendJson(path, title, body) {
  // json://<host>/<path>
  const idx = path.indexOf('/');
  const host = idx === -1 ? path : path.slice(0, idx);
  const urlPath = idx === -1 ? '' : path.slice(idx);
  const url = `https://${host}${urlPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
}

// ── Dispatcher ──────────────────────────────────────────────────────

const handlers = {
  bark: sendBark,
  barks: sendBark,       // apprise 兼容：barks:// = bark:// over HTTPS
  tgram: sendTelegram,
  dingtalk: sendDingTalk,
  wecom: sendWeCom,
  feishu: sendFeishu,
  slack: sendSlack,
  json: sendJson,
};

/**
 * Send a notification to all configured URLs.
 * Best-effort: errors are logged but never thrown.
 *
 * @param {string[]} urls  Notification URLs (e.g. ["bark://key", "tgram://token/chatid"])
 * @param {string}   title Notification title
 * @param {string}   body  Notification body
 * @returns {Promise<PromiseSettledResult[]>}
 */
export async function notify(urls, title, body) {
  if (!urls || urls.length === 0) return [];

  const tasks = urls.map(async (url) => {
    const parsed = parseNotifyUrl(url);
    if (!parsed) {
      console.error(`[notifier] invalid URL: ${url}`);
      throw new Error(`Invalid notify URL: ${url}`);
    }
    const handler = handlers[parsed.scheme];
    if (!handler) {
      console.error(`[notifier] unsupported scheme: ${parsed.scheme}`);
      throw new Error(`Unsupported notify scheme: ${parsed.scheme}`);
    }
    try {
      await handler(parsed.path, title, body);
    } catch (err) {
      console.error(`[notifier] ${parsed.scheme} failed:`, err.message);
      throw err;
    }
  });

  return Promise.allSettled(tasks);
}

/**
 * Send a test notification to all configured URLs.
 *
 * @param {string[]} urls  Notification URLs
 * @returns {Promise<PromiseSettledResult[]>}
 */
export async function testNotify(urls) {
  return notify(urls, '测试通知 / Test Notification', '如果你看到这条消息，说明通知配置正确。');
}
