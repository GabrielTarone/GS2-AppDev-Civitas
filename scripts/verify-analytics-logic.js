const assert = require('node:assert/strict');
const { categoryGroupKey, spatialCellDimensions, metricForSamples } = require('../src/utils/analyticsHelpers');

assert.notEqual(
  categoryGroupKey('infraestrutura', 'Outros'),
  categoryGroupKey('acessibilidade', 'Outros'),
  'Categorias com o mesmo nome em módulos diferentes devem permanecer distintas.'
);
assert.notEqual(
  categoryGroupKey('acessibilidade', 'Outros'),
  categoryGroupKey('meio_ambiente', 'Outros'),
  'Categorias homônimas do meio ambiente não devem ser mescladas.'
);

const saoPauloCell = spatialCellDimensions(250, -23.5505);
assert.deepEqual(saoPauloCell, { northSouthMeters: 250, eastWestMeters: 229 });
assert.deepEqual(spatialCellDimensions(500, 0), { northSouthMeters: 500, eastWestMeters: 500 });
assert.equal(spatialCellDimensions(100, 60).eastWestMeters, 50);
assert.throws(() => spatialCellDimensions(0, -23), /cellMeters/);
assert.throws(() => spatialCellDimensions(250, 91), /latitude/);

assert.equal(metricForSamples(1, 0), 0, 'Médias iguais a zero precisam ser preservadas quando há amostras.');
assert.equal(metricForSamples(2, 12.5), 12.5);
assert.equal(metricForSamples(0, 0), null, 'Módulos sem amostras devem continuar sem média.');
assert.equal(metricForSamples(1, null), null);
assert.equal(metricForSamples(1, undefined), null);

console.log('Lógica de análises aprovada: categorias por módulo, dimensões geográficas aproximadas e preservação de médias zero e ausência de amostras.');
