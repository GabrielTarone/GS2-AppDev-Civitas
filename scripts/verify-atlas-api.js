require('dotenv').config();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDatabase = require('../src/config/database');
const { createOccurrence, listOccurrences } = require('../src/controllers/occurrenceController');
const { validateOccurrence } = require('../src/utils/validators');

function invokeController(handler, req) {
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  return Promise.resolve(handler(req, response)).then(() => response);
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI no .env.');
  const configuredDatabase = decodeURIComponent(new URL(process.env.MONGODB_URI).pathname.slice(1));
  if (configuredDatabase !== 'Civitas-Database') throw new Error('A verificação exige MONGODB_URI apontando para Civitas-Database.');

  await connectDatabase(process.env.MONGODB_URI);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const [homeResponse, mapScriptResponse, pickerScriptResponse, listResponse, statsResponse, geolocatedResponse, invalidCreateResponse, invalidCoordinateResponse, mapConfigResponse, invalidPhotoResponse] = await Promise.all([
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/js/map.js`),
      fetch(`${baseUrl}/js/location-picker.js`),
      fetch(`${baseUrl}/api/occurrences`),
      fetch(`${baseUrl}/api/occurrences/stats`),
      fetch(`${baseUrl}/api/occurrences?geolocated=true`),
      fetch(`${baseUrl}/api/occurrences`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${baseUrl}/api/occurrences`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'infraestrutura', category: 'Buracos nas vias', description: 'Descrição de validação de coordenadas.', location: 'Rua de teste, 1', severity: 'Baixa', coordinates: { latitude: 91, longitude: -46 } })
      }),
      fetch(`${baseUrl}/api/config/maps`),
      fetch(`${baseUrl}/api/occurrences/000000000000000000000000/photos/000000000000000000000001`)
    ]);
    assert.equal(homeResponse.status, 200);
    assert.equal(mapScriptResponse.status, 200);
    assert.equal(pickerScriptResponse.status, 200);
    assert.equal(listResponse.status, 200);
    assert.equal(statsResponse.status, 200);
    assert.equal(geolocatedResponse.status, 200);
    assert.equal(invalidCreateResponse.status, 400);
    assert.equal(invalidCoordinateResponse.status, 400);
    assert.equal(mapConfigResponse.status, 200);
    assert.deepEqual(Object.keys(await mapConfigResponse.json()), ['cartoBasemapKey']);
    assert.equal(invalidPhotoResponse.status, 404);
    const occurrences = (await listResponse.json()).occurrences;
    const initialStats = await statsResponse.json();
    const geolocated = (await geolocatedResponse.json()).occurrences;
    assert.equal(initialStats.total, occurrences.length);
    assert.equal(Object.values(initialStats.byModule).reduce((sum, count) => sum + count, 0), initialStats.total);
    assert.equal(initialStats.withoutCoordinates + geolocated.length, initialStats.total);

    const invalidPayload = validateOccurrence({ module: 'infraestrutura', category: 'Buracos nas vias', description: 'Descrição de validação de coordenadas.', location: 'Rua de teste, 1', severity: 'Baixa', coordinates: { latitude: 0, longitude: 181 } });
    assert.ok(invalidPayload.errors.length > 0);

    if (occurrences.length) {
      const sample = occurrences[0];
      const filter = new URLSearchParams({ module: sample.module, category: sample.category, status: sample.status });
      const filteredResponse = await fetch(`${baseUrl}/api/occurrences?${filter}`);
      assert.equal(filteredResponse.status, 200);
      const filtered = (await filteredResponse.json()).occurrences;
      assert.ok(filtered.some(item => String(item._id) === String(sample._id)));
      assert.ok(filtered.every(item => item.module === sample.module && item.category === sample.category && item.status === sample.status));
    }

    // Exercita o fluxo válido do controller em uma transação sempre revertida,
    // para não deixar ocorrência fictícia na base real do projeto.
    mongoose.set('transactionAsyncLocalStorage', true);
    const rollback = new Error('rollback-check');
    let createdId;
    try {
      await mongoose.connection.transaction(async () => {
        const created = await invokeController(createOccurrence, {
          body: {
            module: 'meio_ambiente',
            category: 'Outros',
            description: 'Registro transitório para validar o fluxo de cadastro.',
            location: 'Validação automatizada temporária',
            severity: 'Baixa',
            coordinates: { latitude: -23.5505, longitude: -46.6333 }
          }
        });
        assert.equal(created.statusCode, 201);
        assert.equal(created.body.occurrence.status, 'Pendente');
        assert.equal(created.body.occurrence.coordinates.latitude, -23.5505);
        assert.equal(created.body.occurrence.coordinates.longitude, -46.6333);
        createdId = created.body.occurrence._id;

        const readBack = await invokeController(listOccurrences, {
          query: { module: 'meio_ambiente', category: 'Outros', status: 'Pendente', geolocated: 'true' }
        });
        assert.ok(readBack.body.occurrences.some(item => String(item._id) === String(createdId)));
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    const finalStatsResponse = await fetch(`${baseUrl}/api/occurrences/stats`);
    const finalStats = await finalStatsResponse.json();
    assert.equal(finalStats.total, initialStats.total, 'A ocorrência de verificação deveria ter sido revertida.');
    console.log(`Atlas/API verificados em Civitas-Database.occurrences: ${initialStats.total} registros consultados (${geolocated.length} com coordenadas e ${initialStats.withoutCoordinates} sem coordenadas); filtros e rejeição de coordenadas inválidas aprovados; cadastro geolocalizado e leitura do controller aprovados em transação revertida.`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
}

run().catch(error => {
  const safeMessage = String(error.message || error).replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[URI MongoDB redigida]');
  console.error(`Verificação não concluída: ${safeMessage}`);
  process.exitCode = 1;
});
