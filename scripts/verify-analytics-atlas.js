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
  },
  {
    module: 'infraestrutura', category: 'Outros', description: 'Ocorrência resolvida imediatamente para testar média zero.',
    location: 'Avenida de validação, 100', severity: 'Baixa', status: 'Resolvida',
    coordinates: { latitude: -23.5505, longitude: -46.6333 }
  },
  {
    module: 'acessibilidade', category: 'Outros', description: 'Categoria homônima em outro módulo com resolução imediata.',
    location: 'Avenida de validação, 100', severity: 'Média', status: 'Resolvida',
    coordinates: { latitude: -23.5505, longitude: -46.6333 }
  },
  {
    module: 'meio_ambiente', category: 'Outros', description: 'Categoria homônima do módulo ambiental ainda pendente.',
    location: 'Rua de validação ambiental, 502', severity: 'Alta', status: 'Pendente'
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
    if (index === 2 || index === 3) {
      fixture.statusHistory = [
        { previousStatus: null, newStatus: 'Pendente', note: '', changedAt: fixture.createdAt },
        { previousStatus: 'Pendente', newStatus: 'Resolvida', note: 'Resolução imediata de teste.', changedAt: fixture.createdAt }
      ];
    }
  }
  const start = new Date(baseTime);
  const end = new Date(baseTime.getTime() + 9 * 86400000);
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
      assert.equal(result.summary.geolocated, 4);
      assert.equal(result.summary.withoutCoordinates, 3);
      assert.equal(result.heatPoints.length, 4);
      assert.equal(result.areas[0].count, 4);
      assert.ok(result.areas[0].center.latitude < -23.55 && result.areas[0].center.longitude < -46.63);
      assert.deepEqual(result.areas[0].approximateCellDimensionsMeters, { northSouthMeters: 250, eastWestMeters: 229 });
      const clusteredCategories = result.areas[0].categories.map(item => `${item.module}:${item.category}`);
      assert.ok(clusteredCategories.includes('infraestrutura:Buracos nas vias'));
      assert.ok(clusteredCategories.includes('acessibilidade:Rampas ausentes ou inadequadas'));
      assert.ok(clusteredCategories.includes('infraestrutura:Outros'), 'A categoria Outros de infraestrutura deve permanecer separada.');
      assert.ok(clusteredCategories.includes('acessibilidade:Outros'), 'A categoria Outros de acessibilidade deve permanecer separada dentro da mesma área.');
      assert.equal(result.summary.recurrentPlaces, 2, 'A célula espacial e o endereço sem coordenadas devem ser recorrentes.');
      assert.equal(result.recurrences.length, 2);
      assert.equal(result.resolution.count, 3);
      assert.equal(result.resolution.averageHours, 16);
      assert.equal(result.resolution.medianHours, 0, 'Resoluções imediatas devem preservar duração igual a zero.');
      assert.equal(result.resolution.withoutReliableHistory, 1, 'Registro legado resolvido sem statusHistory deve ficar fora da duração.');
      assert.equal(result.resolution.notResolved, 3);
      const accessibilityResolution = result.resolution.byModule.find(item => item.module === 'acessibilidade');
      assert.equal(accessibilityResolution.count, 1);
      assert.equal(accessibilityResolution.averageHours, 0, 'Média zero por módulo não deve ser convertida em null.');
      assert.equal(result.timelineUnit, 'day');
      assert.equal(result.timeline.length, 9);
      assert.ok(result.timeline.some(item => item.total === 0), 'Intervalos vazios precisam aparecer com zero.');
      assert.equal(result.byModule.infraestrutura, 3);
      const duplicateCategoryRows = result.byCategory.filter(item => item.category === 'Outros');
      assert.equal(duplicateCategoryRows.length, 3, 'A categoria Outros deve permanecer separada por módulo.');
      assert.deepEqual(new Set(duplicateCategoryRows.map(item => item.module)), new Set(['infraestrutura', 'acessibilidade', 'meio_ambiente']));
      assert.ok(duplicateCategoryRows.every(item => item.count === 1));

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
    console.log(`Analytics/Atlas aprovados: filtros combinados, categorias separadas por módulo, heatmap, ${payload.summary.geolocated} pontos geolocalizados, dimensões espaciais, agrupamentos espaciais e textuais, resolução incluindo duração zero e timeline com zeros; ${initialCount} documentos preservados após rollback.`);
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
