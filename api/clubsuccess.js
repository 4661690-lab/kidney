// WayForPay возвращает покупателя методом POST, статика на Vercel отвечает 405.
// В запросе к API есть только один адрес возврата, общий для успеха и для отказа,
// поэтому здесь читаем статус платежа и разводим людей по разным страницам.
module.exports = (req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    let status = '';
    try {
      if (raw && raw.trim().charAt(0) === '{') {
        status = (JSON.parse(raw).transactionStatus || '');
      } else if (raw) {
        const p = new URLSearchParams(raw);
        status = p.get('transactionStatus') || '';
        // W4P иногда шлёт json одним полем без имени
        if (!status) {
          for (const [k] of p) {
            if (k.trim().charAt(0) === '{') {
              try { status = (JSON.parse(k).transactionStatus || ''); } catch (e) {}
            }
          }
        }
      }
    } catch (e) {}

    const ok = !status || status === 'Approved' || status === 'InProcessing' || status === 'Pending';
    res.writeHead(303, { Location: ok ? '/clubsuccess' : '/clubfail' });
    res.end();
  });
  if (req.method === 'GET') { req.emit('end'); }
};
