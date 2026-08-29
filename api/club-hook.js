// Приём уведомлений WayForPay о платежах клуба (serviceUrl).
// WayForPay шлёт сюда POST при каждом событии: первый платёж, ежемесячное списание,
// отказ, возврат. Мы проверяем подпись, пишем строку в таблицу и отвечаем так,
// как ждёт WayForPay, иначе он будет повторять запрос четыре дня.

const crypto = require('crypto');

const SECRET = process.env.WFP_SECRET_KEY || '';
const LEAD_URL = 'https://script.google.com/macros/s/AKfycbxC4EYSubfJr3OtnmogtXMWmreJ8UyG4EmE3KEU8uBJt12MxmFPVrMB_AAX0PVUyUEc/exec';
const SHEET = 'ClubPayments';

function readRaw(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => resolve(raw));
    if (req.method === 'GET') resolve('');
  });
}

// WayForPay присылает тело то как json, то как одно поле формы, внутри которого json
function parseBody(raw) {
  if (!raw) return null;
  const t = raw.trim();
  try {
    if (t.charAt(0) === '{') return JSON.parse(t);
  } catch (e) {}
  try {
    const p = new URLSearchParams(t);
    for (const [k, v] of p) {
      const cand = (k.trim().charAt(0) === '{') ? k : (v && v.trim().charAt(0) === '{' ? v : null);
      if (cand) return JSON.parse(cand);
    }
    const obj = {};
    for (const [k, v] of p) obj[k] = v;
    return Object.keys(obj).length ? obj : null;
  } catch (e) {}
  return null;
}

function hmac(str) {
  return crypto.createHmac('md5', SECRET).update(str, 'utf8').digest('hex');
}

module.exports = async (req, res) => {
  const raw = await readRaw(req);
  const d = parseBody(raw) || {};

  // подпись входящего уведомления: merchantAccount;orderReference;amount;currency;
  // authCode;cardPan;transactionStatus;reasonCode
  let signatureOk = false;
  if (SECRET && d.merchantSignature) {
    const src = [
      d.merchantAccount, d.orderReference, d.amount, d.currency,
      d.authCode, d.cardPan, d.transactionStatus, d.reasonCode
    ].join(';');
    signatureOk = (hmac(src) === d.merchantSignature);
  }

  // пишем в таблицу рядом с лидами, тем же способом, что и заявки
  if (d.orderReference) {
    const row = new URLSearchParams({
      sheet: SHEET,
      email: d.email || '',
      phone: d.phone || '',
      lang: (d.currency === 'UAH' ? 'Українська (UA)' : 'Русский (RU)'),
      page: (d.currency === 'UAH' ? '/uaclub' : '/club'),
      utm: d.clientAccountId || '',
      source: [
        d.transactionStatus || 'unknown',
        d.amount != null ? d.amount : '',
        d.currency || '',
        d.orderReference,
        d.reason || '',
        signatureOk ? 'подпись ок' : 'подпись не сошлась'
      ].join(' | ')
    });
    try {
      await fetch(LEAD_URL, { method: 'POST', body: row });
    } catch (e) {}
  }

  // WayForPay ждёт именно такой ответ, иначе повторяет запрос четверо суток
  const time = Math.floor(Date.now() / 1000);
  const answer = {
    orderReference: d.orderReference || '',
    status: 'accept',
    time: time
  };
  answer.signature = SECRET ? hmac([answer.orderReference, answer.status, answer.time].join(';')) : '';

  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(answer));
};
