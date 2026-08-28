// То же самое для страницы неуспешной оплаты клуба.
module.exports = (req, res) => {
  res.writeHead(303, { Location: '/clubfail' });
  res.end();
};
