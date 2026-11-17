const multer = require('multer');

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 10, fieldSize: 16 * 1024, parts: 13 },
  fileFilter(_req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) return callback(new Error('Formato inválido. Envie imagens JPG, PNG ou WebP.'));
    callback(null, true);
  }
}).array('photos', 3);

module.exports = function photoUpload(req, res, next) {
  upload(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({ message: tooLarge ? 'Cada fotografia deve ter no máximo 5 MB.' : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE' ? 'Envie no máximo três fotografias no campo photos.' : 'Os anexos excedem os limites permitidos.' });
    }
    return res.status(400).json({ message: error.message || 'Não foi possível receber as fotografias.' });
  });
};
