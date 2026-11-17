require('dotenv').config();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDatabase = require('../src/config/database');
const Occurrence = require('../src/models/Occurrence');
const { createOccurrence, updateOccurrenceStatus, getOccurrence, listOccurrences } = require('../src/controllers/occurrenceController');
const { getHealth } = require('../src/controllers/healthController');
const { STATUSES } = require('../src/utils/validators');

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

const body = {
  module: 'infraestrutura', category: 'Buracos nas vias',
  description: 'Ocorrência temporária para verificar o histórico de status.',
  location: 'Local temporário de validação', severity: 'Baixa',
  coordinates: { latitude: -23.5505, longitude: -46.6333 }
};

async function run() {
  assert.deepEqual(STATUSES, ['Pendente', 'Em análise', 'Em andamento', 'Resolvida']);
  const offline = await invoke(getHealth, { });
  assert.equal(offline.statusCode, 503, 'A saúde deve retornar offline antes da conexão com o banco.');
  if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI no .env.');
  const configuredDatabase = decodeURIComponent(new URL(process.env.MONGODB_URI).pathname.slice(1));
  if (configuredDatabase !== 'Civitas-Database') throw new Error('A verificação exige Civitas-Database.');
  await connectDatabase(process.env.MONGODB_URI);
  const initialCount = await Occurrence.countDocuments();
  console.log('Conexão Atlas estabelecida; iniciando API local.');
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    console.log('API local respondendo; conferindo rotas.');
    const [allResponse, statsResponse, healthResponse, invalidIdResponse] = await Promise.all([
      fetch(`${baseUrl}/api/occurrences?all=true`, { signal: AbortSignal.timeout(15000) }),
      fetch(`${baseUrl}/api/occurrences/stats`, { signal: AbortSignal.timeout(15000) }),
      fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(15000) }),
      fetch(`${baseUrl}/api/occurrences/invalid`, { signal: AbortSignal.timeout(15000) })
    ]);
    console.log('Listagem, indicadores, health e validação de ID responderam.');
    assert.equal(allResponse.status, 200);
    assert.equal(statsResponse.status, 200);
    assert.equal(healthResponse.status, 200);
    assert.equal(invalidIdResponse.status, 400);
    const existing = (await allResponse.json()).occurrences;
    const stats = await statsResponse.json();
    assert.equal(existing.length, initialCount, 'A listagem completa deve conter os registros existentes.');
    assert.deepEqual(Object.keys(stats.byStatus).sort(), [...STATUSES].sort());

    if (existing.length) {
      const sample = existing[0];
      const detailResponse = await fetch(`${baseUrl}/api/occurrences/${sample._id}`);
      assert.equal(detailResponse.status, 200);
      const detail = (await detailResponse.json()).occurrence;
      assert.equal(String(detail._id), String(sample._id));
      for (const field of ['description', 'category', 'location']) {
        const term = sample[field].slice(0, Math.min(9, sample[field].length));
        const searchResponse = await fetch(`${baseUrl}/api/occurrences?all=true&search=${encodeURIComponent(term)}`);
        assert.equal(searchResponse.status, 200);
        const searched = (await searchResponse.json()).occurrences;
        assert.ok(searched.some(item => String(item._id) === String(sample._id)), `A busca deve localizar pelo campo ${field}.`);
      }
      for (const field of ['module', 'category', 'location', 'severity', 'status', 'createdAt', 'updatedAt']) assert.deepEqual(detail[field], sample[field], `Os detalhes devem preservar ${field}.`);
      assert.deepEqual(detail.coordinates, sample.coordinates);
      assert.deepEqual(detail.photos || [], sample.photos || []);
      const searchTerm = sample.location.slice(0, Math.min(9, sample.location.length));
      const combined = new URLSearchParams({ all: 'true', search: searchTerm, module: sample.module, category: sample.category, severity: sample.severity, status: sample.status });
      const filteredResponse = await fetch(`${baseUrl}/api/occurrences?${combined}`);
      assert.equal(filteredResponse.status, 200);
      const filtered = (await filteredResponse.json()).occurrences;
      assert.ok(filtered.some(item => String(item._id) === String(sample._id)));
      assert.ok(filtered.every(item => item.module === sample.module && item.category === sample.category && item.severity === sample.severity && item.status === sample.status));
    }
    console.log('Pesquisa e filtros combinados aprovados.');

    mongoose.set('transactionAsyncLocalStorage', true);
    const rollback = new Error('rollback-management-verification');
    try {
      await mongoose.connection.transaction(async () => {
        console.log('Iniciando cenários transacionais de status.');
        const created = await invoke(createOccurrence, { body });
        assert.equal(created.statusCode, 201);
        const id = String(created.body.occurrence._id);
        assert.equal(created.body.occurrence.statusHistory.length, 1);
        assert.equal(created.body.occurrence.statusHistory[0].previousStatus, null);
        assert.equal(created.body.occurrence.statusHistory[0].newStatus, 'Pendente');

        const first = await invoke(updateOccurrenceStatus, { params: { id }, body: { status: 'Em análise', note: 'Encaminhada para avaliação.' } });
        assert.equal(first.statusCode, 200);
        assert.equal(first.body.occurrence.statusHistory.length, 2);
        assert.equal(first.body.occurrence.statusHistory[1].previousStatus, 'Pendente');
        assert.equal(first.body.occurrence.statusHistory[1].newStatus, 'Em análise');
        assert.equal(first.body.occurrence.statusHistory[1].note, 'Encaminhada para avaliação.');

        const second = await invoke(updateOccurrenceStatus, { params: { id }, body: { status: 'Resolvida' } });
        assert.equal(second.statusCode, 200);
        assert.equal(second.body.occurrence.statusHistory.length, 3, 'As transições anteriores devem ser preservadas.');
        const reopened = await invoke(updateOccurrenceStatus, { params: { id }, body: { status: 'Pendente', note: 'Reaberta para revisão.' } });
        assert.equal(reopened.statusCode, 200, 'O status pode voltar a um estado anterior.');
        assert.equal(reopened.body.occurrence.statusHistory.length, 4);

        const invalidStatus = await invoke(updateOccurrenceStatus, { params: { id }, body: { status: 'Arquivada' } });
        assert.equal(invalidStatus.statusCode, 400);
        const oversizedNote = await invoke(updateOccurrenceStatus, { params: { id }, body: { status: 'Em análise', note: 'x'.repeat(501) } });
        assert.equal(oversizedNote.statusCode, 400);
        const invalidBody = await invoke(updateOccurrenceStatus, { params: { id }, body: { status: 'Resolvida', extra: true } });
        assert.equal(invalidBody.statusCode, 400);

        const legacy = await Occurrence.create({ ...body, status: 'Em andamento' });
        assert.equal(legacy.statusHistory, undefined, 'Documentos legados podem não ter histórico.');
        const legacyUpdate = await invoke(updateOccurrenceStatus, { params: { id: String(legacy._id) }, body: { status: 'Em análise' } });
        assert.equal(legacyUpdate.statusCode, 200);
        assert.equal(legacyUpdate.body.occurrence.statusHistory.length, 1);
        assert.equal(legacyUpdate.body.occurrence.statusHistory[0].previousStatus, 'Em andamento');
        assert.equal(legacyUpdate.body.occurrence.statusHistory[0].newStatus, 'Em análise');

        const readBack = await invoke(getOccurrence, { params: { id } });
        assert.equal(readBack.statusCode, 200);
        assert.equal(readBack.body.occurrence.status, 'Pendente');
        const filteredReadBack = await invoke(listOccurrences, { query: { search: 'temporária', all: 'true' } });
        assert.ok(filteredReadBack.body.occurrences.some(item => String(item._id) === id));
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }

    const finalCount = await Occurrence.countDocuments();
    assert.equal(finalCount, initialCount, 'Os documentos usados na verificação devem ser revertidos.');
    console.log(`Gerenciamento/Atlas aprovado: ${initialCount} ocorrências reais listadas, pesquisa/filtros combinados, detalhes, quatro status, histórico aditivo, transição de registro legado, validações, health 200/503 e transações revertidas.`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
}

run().catch(error => {
  const safeMessage = String(error.message || error).replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[URI MongoDB redigida]');
  console.error(`Verificação de gerenciamento não concluída: ${safeMessage}`);
  process.exitCode = 1;
});
