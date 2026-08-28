// WayForPay возвращает покупателя методом POST, статика на Vercel отвечает 405.
module.exports = (req, res) => {
  res.writeHead(303, { Location: '/uaclubfail' });
  res.end();
};
