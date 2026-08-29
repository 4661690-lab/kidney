// Оплата клуба через API WayForPay (Purchase + регулярный платёж).
// Зачем не готовая страница подписки: там нельзя убрать строку про число платежей
// и дату последнего списания. В API мы просто не передаём dateEnd и regularCount.
//
// Требует переменную окружения WFP_SECRET_KEY (секретный ключ магазина в кабинете W4P).
// Пока ключа нет, обработчик молча уводит покупателя на старую ссылку подписки,
// поэтому сайт продолжает продавать как раньше.

const crypto = require('crypto');

const MERCHANT   = process.env.WFP_MERCHANT || 't_me_33629';
const DOMAIN     = process.env.WFP_DOMAIN   || 'zadiraka.cc';
const SECRET     = process.env.WFP_SECRET_KEY || '';
const FALLBACK   = 'https://secure.wayforpay.com/sub/t_me_33629';

const PRODUCT    = 'Клуб Смак життя';
const FIRST      = '1';        // первый месяц
const REGULAR    = '369';      // дальше каждый месяц
const CURRENCY   = 'UAH';
const RETURN_URL = 'https://zadiraka.cc/api/uaclubsuccess';

function esc(v) {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function nextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}

function readBody(req) {
  return new Promise(resolve => {
    if (req.body) return resolve(req.body);
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const out = {};
      new URLSearchParams(raw).forEach((v, k) => { out[k] = v; });
      resolve(out);
    });
  });
}

const BUILT_AT = new Date().toISOString();

module.exports = async (req, res) => {
  // диагностика: сообщает только факт наличия ключа, само значение не раскрывается
  if (req.url && req.url.indexOf('diag') !== -1) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({
      hasKey: !!SECRET,
      keyLength: SECRET ? SECRET.length : 0,
      merchant: MERCHANT,
      domain: DOMAIN,
      builtAt: BUILT_AT,
      project: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || null,
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
      // только имена переменных, значения не раскрываются
      wfpVars: Object.keys(process.env).filter(function (k) { return k.indexOf('WFP') === 0; })
    }));
  }

  if (!SECRET) {
    res.writeHead(303, { Location: FALLBACK });
    return res.end();
  }

  const body  = await readBody(req);
  const email = (body.email || '').slice(0, 120);
  const phone = (body.phone || '').slice(0, 40);

  const orderReference = 'club-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const orderDate      = Math.floor(Date.now() / 1000);

  // Строка подписи: merchantAccount;domain;orderReference;orderDate;amount;currency;
  // productName...;productCount...;productPrice...
  const signSource = [
    MERCHANT, DOMAIN, orderReference, orderDate, FIRST, CURRENCY,
    PRODUCT, '1', FIRST
  ].join(';');
  const signature = crypto.createHmac('md5', SECRET).update(signSource, 'utf8').digest('hex');

  const fields = {
    merchantAccount: MERCHANT,
    merchantAuthType: 'SimpleSignature',
    merchantDomainName: DOMAIN,
    merchantSignature: signature,
    orderReference: orderReference,
    orderDate: orderDate,
    amount: FIRST,
    currency: CURRENCY,
    'productName[]': PRODUCT,
    'productPrice[]': FIRST,
    'productCount[]': '1',
    language: 'UA',
    returnUrl: RETURN_URL,
    serviceUrl: 'https://zadiraka.cc/api/club-hook',
    // регулярный платёж: раз в месяц, без даты окончания и без счётчика платежей
    regularMode: 'monthly',
    regularAmount: REGULAR,
    regularOn: '1',
    regularBehavior: 'preset',
    dateNext: nextMonth()
  };
  if (email) fields.clientEmail = email;
  if (phone) fields.clientPhone = phone;

  // рекламные метки: складываем в служебное поле, WayForPay вернёт его в уведомлении,
  // и покупку можно будет связать с кампанией
  const track = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbp','fbc']
    .map(k => body[k] ? k + '=' + String(body[k]).slice(0, 120) : '')
    .filter(Boolean).join('&');
  if (track) fields.clientAccountId = track.slice(0, 250);

  const inputs = Object.keys(fields)
    .map(k => '<input type="hidden" name="' + esc(k) + '" value="' + esc(fields[k]) + '">')
    .join('\n');

  const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Переход к оплате</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#faf6ee;color:#23291f;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px}' +
    'button{margin-top:16px;background:#c2653a;color:#fff;border:none;border-radius:999px;' +
    'padding:14px 22px;font-size:16px;font-weight:700;cursor:pointer}</style></head><body>' +
    '<form id="f" method="post" action="https://secure.wayforpay.com/pay" accept-charset="utf-8">' +
    inputs +
    '<div>Открываем страницу оплаты</div><button type="submit">Продолжить</button>' +
    '</form><script>document.getElementById("f").submit();<\/script></body></html>';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
};
