function notFound(req, res) {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ message: 'Rota não encontrada.' });
  return res.status(404).send('Página não encontrada.');
}

module.exports = notFound;
