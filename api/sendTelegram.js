// api/sendTelegram.js
// Vercel serverless function (Node 18+ runtime).
// Remember to set environment variables in Vercel:
//   TELEGRAM_BOT_TOKEN  -> your bot token (e.g. 123456:ABCDEF...)
//   TELEGRAM_CHAT_ID    -> your chat id (e.g. -1001234567890 or a user id)

// This function expects JSON body:
// { username, message, date, time, timestamp }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { username, message, date, time, timestamp } = req.body ?? {};

    if (!username || !message) {
      return res.status(400).json({ error: 'Missing username or message' });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ error: 'Bot token or chat id not configured on server' });
    }

    // Build a safe message text for Telegram
    const text =
      `📝 New anonymous message\n` +
      `User: ${escapeHtml(username)}\n` +
      `Date: ${escapeHtml(date || '-')}\n` +
      `Time: ${escapeHtml(time || '-')}\n\n` +
      `${escapeHtml(message)}`;

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    const payload = {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML'
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await r.json();

    if (!r.ok) {
      return res.status(502).json({ error: 'Telegram API error', details: json });
    }

    return res.status(200).json({ ok: true, result: json.result });
  } catch (err) {
    console.error('sendTelegram error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// small helper to avoid Telegram HTML injection
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
