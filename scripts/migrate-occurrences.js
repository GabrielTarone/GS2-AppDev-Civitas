require('dotenv').config();
const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');

const SOURCE_DATABASE = 'test';
const DESTINATION_DATABASE = 'Civitas-Database';
const COLLECTION = 'occurrences';
const BATCH_SIZE = 500;

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Configure MONGODB_URI no .env antes de continuar.');

  const configuredDatabase = decodeURIComponent(new URL(uri).pathname.slice(1));
  if (configuredDatabase !== DESTINATION_DATABASE) {
    throw new Error(`MONGODB_URI deve apontar para ${DESTINATION_DATABASE}; nenhum documento foi alterado.`);
  }

  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  try {
    const source = connection.useDb(SOURCE_DATABASE).collection(COLLECTION);
    const destination = connection.useDb(DESTINATION_DATABASE).collection(COLLECTION);
    const [sourceBefore, destinationBefore] = await Promise.all([
      source.countDocuments(),
      destination.countDocuments()
    ]);

    console.log(`Antes da migração — origem ${SOURCE_DATABASE}.${COLLECTION}: ${sourceBefore}`);
    console.log(`Antes da migração — destino ${DESTINATION_DATABASE}.${COLLECTION}: ${destinationBefore}`);
    if (process.argv.includes('--check-only')) {
      console.log('Modo de conferência: nenhum documento foi copiado ou modificado.');
      return;
    }

    let scanned = 0;
    let copied = 0;
    let alreadyPresent = 0;
    let operations = [];

    async function writeBatch() {
      if (!operations.length) return;
      const result = await destination.bulkWrite(operations, { ordered: false });
      copied += result.upsertedCount;
      alreadyPresent += operations.length - result.upsertedCount;
      operations = [];
    }

    for await (const document of source.find({}).batchSize(BATCH_SIZE)) {
      scanned += 1;
      const { _id, ...fields } = document;
      operations.push({
        updateOne: {
          filter: { _id },
          update: { $setOnInsert: fields },
          upsert: true
        }
      });
      if (operations.length >= BATCH_SIZE) await writeBatch();
    }
    await writeBatch();

    const [sourceAfter, destinationAfter, verification] = await Promise.all([
      source.countDocuments(),
      destination.countDocuments(),
      verifySourceDocuments(source, destination)
    ]);

    console.log(`Migração concluída — copiados: ${copied}; já existentes no destino: ${alreadyPresent}.`);
    console.log(`Depois da migração — origem ${SOURCE_DATABASE}.${COLLECTION}: ${sourceAfter}`);
    console.log(`Depois da migração — destino ${DESTINATION_DATABASE}.${COLLECTION}: ${destinationAfter}`);
    console.log(`IDs da origem encontrados no destino: ${verification.matched}/${scanned}.`);
    console.log(`Documentos com conteúdo e datas idênticos: ${verification.identical}/${scanned}.`);

    if (sourceBefore !== sourceAfter) throw new Error('A contagem da origem mudou durante a execução; revise a coleção antiga.');
    if (verification.matched !== scanned) throw new Error('Nem todos os IDs da origem foram confirmados no destino.');
    if (verification.identical !== scanned) throw new Error('Há IDs existentes no destino cujo conteúdo difere da origem; nenhum documento existente foi sobrescrito.');
  } finally {
    await connection.close();
  }
}

async function verifySourceDocuments(source, destination) {
  let matched = 0;
  let identical = 0;
  let documents = [];
  async function verifyBatch() {
    if (!documents.length) return;
    const copies = await destination.find({ _id: { $in: documents.map(document => document._id) } }).toArray();
    const byId = new Map(copies.map(document => [String(document._id), document]));
    for (const document of documents) {
      const copy = byId.get(String(document._id));
      if (!copy) continue;
      matched += 1;
      if (isDeepStrictEqual(document, copy)) identical += 1;
    }
    documents = [];
  }
  for await (const document of source.find({}).batchSize(BATCH_SIZE)) {
    documents.push(document);
    if (documents.length >= BATCH_SIZE) await verifyBatch();
  }
  await verifyBatch();
  return { matched, identical };
}

run().catch(error => {
  const safeMessage = String(error.message || error).replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[URI MongoDB redigida]');
  console.error(`Migração não concluída: ${safeMessage}`);
  process.exitCode = 1;
});
