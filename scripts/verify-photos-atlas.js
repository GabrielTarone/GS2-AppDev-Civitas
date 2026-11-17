require('dotenv').config();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const sharp = require('sharp');
const { Readable } = require('node:stream');
const connectDatabase = require('../src/config/database');
const Occurrence = require('../src/models/Occurrence');
const { createOccurrence, getOccurrencePhoto } = require('../src/controllers/occurrenceController');
const photoUpload = require('../src/middleware/photoUpload');
const photoStorage = require('../src/services/photoStorage');

function invoke(handler, req, res = {}) {
  Object.assign(res, {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(headers) { Object.assign(this.headers, headers); return this; }
  });
  return Promise.resolve(handler(req, res)).then(() => res);
}

async function readPhoto(params) {
  const { PassThrough } = require('node:stream');
  const response = new PassThrough();
  response.statusCode = 200;
  response.headers = {};
  response.status = function (code) { this.statusCode = code; return this; };
  response.json = function (body) { this.body = body; return this; };
  response.set = function (headers) { Object.assign(this.headers, headers); return this; };
  const buffers = [];
  response.on('data', part => buffers.push(part));
  const complete = new Promise((resolve, reject) => { response.once('end', resolve); response.once('error', reject); });
  await getOccurrencePhoto({ params }, response);
  if (response.statusCode !== 200) return response;
  await complete;
  response.image = Buffer.concat(buffers);
  return response;
}

async function runUploadMiddleware(files) {
  const form = new FormData();
  for (const file of files) form.append('photos', new Blob([file.buffer], { type: file.type }), file.name);
  const request = new Request('http://civitas.test/api/occurrences', { method: 'POST', body: form });
  const bytes = Buffer.from(await request.arrayBuffer());
  const req = Readable.from([bytes]);
  req.headers = { 'content-type': request.headers.get('content-type'), 'content-length': String(bytes.length) };
  req.method = 'POST';
  return new Promise(resolve => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve(this); }
    };
    photoUpload(req, res, () => resolve({ statusCode: 200, body: req.files }));
  });
}

function validBody() {
  return {
    module: 'infraestrutura', category: 'Buracos nas vias',
    description: 'Registro transitório de verificação de fotografias.',
    location: 'Ponto temporário de validação', severity: 'Baixa',
    coordinates: JSON.stringify({ latitude: -23.5505, longitude: -46.6333 })
  };
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI no .env.');
  const configuredDatabase = decodeURIComponent(new URL(process.env.MONGODB_URI).pathname.slice(1));
  if (configuredDatabase !== 'Civitas-Database') throw new Error('A verificação exige MONGODB_URI apontando para Civitas-Database.');

  const input = await sharp({ create: { width: 1800, height: 900, channels: 3, background: '#a3b5c5' } }).png().toBuffer();
  const transformed = await photoStorage.processImage({ buffer: input, mimetype: 'image/png' });
  const metadata = await sharp(transformed.buffer).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 1600 && metadata.height <= 1600);
  await assert.rejects(photoStorage.processImage({ buffer: Buffer.from('não é imagem'), mimetype: 'image/png' }), /fotografia/);
  await assert.rejects(photoStorage.processImage({ buffer: input, mimetype: 'image/gif' }), /JPG, PNG ou WebP/);
  const rejectedType = await runUploadMiddleware([{ buffer: Buffer.from('texto'), type: 'text/plain', name: 'arquivo.txt' }]);
  assert.equal(rejectedType.statusCode, 400);
  const rejectedSize = await runUploadMiddleware([{ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), type: 'image/png', name: 'grande.png' }]);
  assert.equal(rejectedSize.statusCode, 413);
  const rejectedCount = await runUploadMiddleware(Array.from({ length: 4 }, (_, index) => ({ buffer: input, type: 'image/png', name: `foto-${index}.png` })));
  assert.equal(rejectedCount.statusCode, 400);
  console.log('Processamento em memória, MIME rejeitado e limites de 5 MB/3 fotos aprovados.');

  await connectDatabase(process.env.MONGODB_URI);
  const temporaryFileIds = [];
  const filesCollection = mongoose.connection.db.collection(`${photoStorage.BUCKET_NAME}.files`);
  const chunksCollection = mongoose.connection.db.collection(`${photoStorage.BUCKET_NAME}.chunks`);
  const beforeOccurrences = await Occurrence.countDocuments();
  const beforeFiles = await filesCollection.countDocuments();
  try {
    mongoose.set('transactionAsyncLocalStorage', true);
    const rollback = new Error('rollback-photo-verification');
    try {
      await mongoose.connection.transaction(async () => {
        for (const count of [1, 3]) {
          const created = await invoke(createOccurrence, {
            body: validBody(),
            files: Array.from({ length: count }, () => ({ buffer: input, mimetype: 'image/png', originalname: 'ignored.png' }))
          });
          assert.equal(created.statusCode, 201);
          assert.equal(created.body.occurrence.photos.length, count);
          assert.ok(created.body.occurrence.photos.every(photo => photo.contentType === 'image/webp'));
          temporaryFileIds.push(...created.body.occurrence.photos.map(photo => photo.fileId));
          const photo = created.body.occurrence.photos[0];
          const readBack = await readPhoto({ occurrenceId: String(created.body.occurrence._id), fileId: String(photo.fileId) });
          assert.equal(readBack.statusCode, 200);
          assert.equal(readBack.headers['Content-Type'], 'image/webp');
          assert.equal(readBack.headers['X-Content-Type-Options'], 'nosniff');
          assert.ok((await sharp(readBack.image).metadata()).format === 'webp');
          const unrelated = await invoke(getOccurrencePhoto, {
            params: { occurrenceId: String(created.body.occurrence._id), fileId: String(new mongoose.Types.ObjectId()) }
          });
          assert.equal(unrelated.statusCode, 404, 'Uma foto que não pertence à ocorrência não deve ser acessível.');
          console.log(`Fluxo temporário com ${count} foto(s) aprovado.`);
        }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }

    const originalCreate = Occurrence.create;
    try {
      const beforeFailedSave = await filesCollection.countDocuments();
      Occurrence.create = async () => { throw new Error('Falha simulada ao salvar ocorrência.'); };
      const originalConsoleError = console.error;
      console.error = () => {};
      let failed;
      try { failed = await invoke(createOccurrence, { body: validBody(), files: [{ buffer: input, mimetype: 'image/png' }] }); }
      finally { console.error = originalConsoleError; }
      assert.equal(failed.statusCode, 500);
      assert.equal(await filesCollection.countDocuments(), beforeFailedSave, 'Arquivos órfãos devem ser removidos após falha do cadastro.');
    } finally { Occurrence.create = originalCreate; }

    const inaccessible = await invoke(getOccurrencePhoto, { params: { occurrenceId: '000000000000000000000000', fileId: '000000000000000000000001' } });
    assert.equal(inaccessible.statusCode, 404);
    console.log('Fotos: transformação WebP e limite 1600px, arquivo inválido, MIME rejeitado, limite de 5 MB, máximo de 3 arquivos, criação sem persistência com 1 e 3 imagens, leitura GridFS e limpeza após falha passaram.');
  } finally {
    await photoStorage.cleanupFiles(temporaryFileIds);
    assert.equal(await Occurrence.countDocuments(), beforeOccurrences, 'A verificação não deve deixar ocorrências temporárias.');
    assert.equal(await filesCollection.countDocuments(), beforeFiles, 'A verificação não deve deixar arquivos GridFS temporários.');
    assert.equal(await chunksCollection.countDocuments({ files_id: { $in: temporaryFileIds } }), 0);
    await mongoose.disconnect();
  }
}

run().catch(error => {
  const safeMessage = String(error.message || error).replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[URI MongoDB redigida]');
  console.error(`Verificação de fotos não concluída: ${safeMessage}`);
  process.exitCode = 1;
});
