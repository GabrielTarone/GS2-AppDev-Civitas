const mongoose = require('mongoose');
const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');

const BUCKET_NAME = 'occurrencePhotos';
const formats = new Set(['jpeg', 'png', 'webp']);
const mimeByFormat = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
let bucket;

function getBucket() {
  if (!mongoose.connection.db) throw new Error('A conexão com o MongoDB ainda não está disponível.');
  if (!bucket) bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
  return bucket;
}

async function processImage(file) {
  try {
    const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40000000 });
    const metadata = await image.metadata();
    if (!formats.has(metadata.format) || mimeByFormat[metadata.format] !== file.mimetype) {
      throw Object.assign(new Error('A fotografia precisa ser uma imagem JPG, PNG ou WebP válida.'), { statusCode: 400 });
    }
    const buffer = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 40000000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { buffer, contentType: 'image/webp' };
  } catch (error) {
    if (error.statusCode) throw error;
    throw Object.assign(new Error('Uma das fotografias está inválida ou não pôde ser processada.'), { statusCode: 400 });
  }
}

async function storeImage(file) {
  const processed = await processImage(file);
  const filename = `${randomUUID()}.webp`;
  const stream = getBucket().openUploadStream(filename, { contentType: processed.contentType, metadata: { source: 'civitas-occurrence' } });
  const fileId = stream.id;
  try {
    await new Promise((resolve, reject) => {
      stream.once('finish', resolve);
      stream.once('error', reject);
      Readable.from(processed.buffer).pipe(stream);
    });
    return { fileId, contentType: processed.contentType, size: processed.buffer.length, uploadedAt: new Date() };
  } catch (error) {
    await cleanupFiles([fileId]).catch(() => {});
    throw error;
  }
}

async function cleanupFiles(ids = []) {
  if (!ids.length || !mongoose.connection.db) return;
  const collection = mongoose.connection.db.collection(`${BUCKET_NAME}.files`);
  const chunks = mongoose.connection.db.collection(`${BUCKET_NAME}.chunks`);
  const validIds = ids.filter(Boolean);
  if (!validIds.length) return;
  await Promise.all([
    collection.deleteMany({ _id: { $in: validIds } }),
    chunks.deleteMany({ files_id: { $in: validIds } })
  ]);
}

function openDownloadStream(fileId) { return getBucket().openDownloadStream(fileId); }

async function getFile(fileId) {
  return mongoose.connection.db.collection(`${BUCKET_NAME}.files`).findOne({ _id: fileId });
}

module.exports = { BUCKET_NAME, processImage, storeImage, cleanupFiles, openDownloadStream, getFile };
