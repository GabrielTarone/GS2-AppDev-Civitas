function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'O corpo da requisição contém JSON inválido.' });
  return res.status(500).json({ message: 'Ocorreu um erro interno no servidor.' });
}

module.exports = errorHandler;
