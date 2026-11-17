require('dotenv').config();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Occurrence = require('../src/models/Occurrence');
const app = require('../src/app');
const connectDatabase = require('../src/config/database');
const analyticsService = require('../src/services/analyticsService');

const fixtures = [
  {
    module: 'infraestrutura', category: 'Buracos nas vias', description: 'Registro temporário resolvido com histórico verificável.',
    location: 'Avenida de validação, 100', severity: 'Alta', status: 'Resolvida',
    coordinates: { latitude: -23.5505, longitude: -46.6333 },
    statusHistory: []
  },
  {
    module: 'acessibilidade', category: 'Rampas ausentes ou inadequadas', description: 'Registro temporário próximo para agrupamento espacial.',
    location: 'Avenida de validação, 102', severity: 'Média', status: 'Pendente',
    coordinates: { latitude: -23.5507, longitude: -46.6335 },
    statusHistory: []
  },
  {
    module: 'meio_ambiente', category: 'Resíduos domésticos', description: 'Documento legado sem coordenadas nem histórico.',
    location: 'Praça Temporária, 12', severity: 'Baixa', status: 'Resolvida'
  },
  {
    module: 'infraestrutura', category: 'Iluminação pública', description: 'Outro legado no mesmo endereço normalizado.',
    location: '  prACA   temporaria, 12 ', severity: 'Crítica', status: 'Em andamento'
  }
];

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI no .env.');
  const database = decodeURIComponent(new URL(process.env.MONGODB_URI).pathname.slice(1));
  if (database !== 'Civitas-Database') throw new Error('A verificação exige Civitas-Database.');
  for (const [index, fixture] of fixtures.slice(0, 2).entries()) {
    const createdAt = new Date(Date.now() + 2 * 86400000 + index * 86400000 + 3600000);
    fixture.createdAt = createdAt;
    fixture.updatedAt = createdAt;
    fixture.statusHistory = [{ previousStatus: null, newStatus: 'Pendente', note: '', changedAt: createdAt }];
    if (index === 0) fixture.statusHistory.push({ previousStatus: 'Pendente', newStatus: 'Resolvida', note: 'Resolução temporária de teste.', changedAt: new Date(createdAt.getTime() + 48 * 3600000) });
  }
  const baseTime = new Date(Date.now() + 2 * 86400000);
  for (const [index, fixture] of fixtures.slice(2).entries()) {
    fixture.createdAt = new Date(baseTime.getTime() + (index + 4) * 86400000 + 3600000);
    fixture.updatedAt = fixture.createdAt;
  }
  const start = new Date(baseTime);
  const end = new Date(baseTime.getTime() + 8 * 86400000);
  const parsed = analyticsService.parseFilters({ period: 'custom', start: start.toISOString(), end: end.toISOString(), cellMeters: '250' });
  assert.ok(!parsed.error, parsed.error);
  assert.ok(analyticsService.parseFilters({ period: 'custom' }).error, 'Intervalo personalizado precisa de duas datas.');
  assert.ok(analyticsService.parseFilters({ module: 'inexistente' }).error, 'Módulos inválidos devem ser rejeitados.');
  assert.ok(analyticsService.parseFilters({ cellMeters: '99' }).error, 'Resolução espacial fora da lista deve ser rejeitada.');

  await connectDatabase(process.env.MONGODB_URI);
  const initialCount = await Occurrence.countDocuments();
  const rollback = new Error('rollback-analytics-verification');
  try {
    await mongoose.connection.transaction(async session => {
      await Occurrence.create(fixtures, { session, ordered: true });
      const result = await analyticsService.getAnalytics(parsed, session);
      assert.equal(result.summary.total, fixtures.length);
      assert.equal(result.summary.geolocated, 2);
      assert.equal(result.summary.withoutCoordinates, 2);
      assert.equal(result.heatPoints.length, 2);
      assert.equal(result.areas[0].count, 2);
      assert.ok(result.areas[0].center.latitude < -23.55 && result.areas[0].center.longitude < -46.63);
      assert.equal(result.summary.recurrentPlaces, 2, 'A célula espacial e o endereço sem coordenadas devem ser recorrentes.');
      assert.equal(result.recurrences.length, 2);
      assert.equal(result.resolution.count, 1);
      assert.equal(result.resolution.averageHours, 48);
      assert.equal(result.resolution.medianHours, 48);
      assert.equal(result.resolution.withoutReliableHistory, 1, 'Registro legado resolvido sem statusHistory deve ficar fora da duração.');
      assert.equal(result.resolution.notResolved, 2);
      assert.equal(result.timelineUnit, 'day');
      assert.equal(result.timeline.length, 8);
      assert.ok(result.timeline.some(item => item.total === 0), 'Intervalos vazios precisam aparecer com zero.');
      assert.equal(result.byModule.infraestrutura, 2);
      assert.equal(result.byCategory[0].count, 1);

      const combined = analyticsService.parseFilters({
        period: 'custom', start: start.toISOString(), end: end.toISOString(),
        module: 'infraestrutura', category: 'Buracos nas vias', severity: 'Alta', status: 'Resolvida'
      });
      assert.ok(!combined.error, combined.error);
      const filtered = await analyticsService.getAnalytics(combined, session);
      assert.equal(filtered.summary.total, 1, 'Módulo, categoria, gravidade e status devem combinar.');
      assert.equal(filtered.resolution.count, 1);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  assert.equal(await Occurrence.countDocuments(), initialCount, 'Os documentos temporários devem ser revertidos.');
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const [response, invalidResponse] = await Promise.all([
      fetch(`${baseUrl}/api/analytics?period=all&cellMeters=250`, { signal: AbortSignal.timeout(20000) }),
      fetch(`${baseUrl}/api/analytics?module=invalid`, { signal: AbortSignal.timeout(10000) })
    ]);
    assert.equal(response.status, 200);
    assert.equal(invalidResponse.status, 400);
    const payload = await response.json();
    assert.ok(payload.summary && payload.timeline && payload.heatPoints && payload.resolution);
    console.log(`Analytics/Atlas aprovados: filtros combinados, agregações, heatmap, ${payload.summary.geolocated} pontos geolocalizados, agrupamentos espaciais e textuais, resolução por histórico e timeline com zeros; ${initialCount} documentos preservados após rollback.`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
