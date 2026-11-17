const CATEGORIES = {
  infraestrutura: [
    'Buracos nas vias', 'Calçadas danificadas', 'Iluminação pública',
    'Sinalização danificada', 'Espaços públicos danificados', 'Outros'
  ],
  acessibilidade: [
    'Rampas ausentes ou inadequadas', 'Ausência de piso tátil', 'Calçadas obstruídas',
    'Travessias inadequadas', 'Acessos públicos inacessíveis', 'Outros'
  ],
  meio_ambiente: [
    'Resíduos domésticos', 'Entulho e resíduos de construção', 'Resíduos eletrônicos',
    'Resíduos orgânicos', 'Outros'
  ]
};
const MODULES = Object.keys(CATEGORIES);
const SEVERITIES = ['Baixa', 'Média', 'Alta', 'Crítica'];
const STATUSES = ['Pendente', 'Em análise', 'Em andamento', 'Resolvida'];

function validateOccurrence(input) {
  const errors = [];
  const module = typeof input.module === 'string' ? input.module.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const location = typeof input.location === 'string' ? input.location.trim() : '';
  const severity = typeof input.severity === 'string' ? input.severity.trim() : '';
  const coordinates = input.coordinates && typeof input.coordinates === 'object' && !Array.isArray(input.coordinates)
    ? input.coordinates
    : null;
  const latitude = coordinates?.latitude;
  const longitude = coordinates?.longitude;

  if (!MODULES.includes(module)) errors.push('Selecione um módulo válido.');
  if (!category || (CATEGORIES[module] && !CATEGORIES[module].includes(category))) errors.push('Selecione uma categoria válida para o módulo.');
  if (description.length < 10 || description.length > 1000) errors.push('A descrição deve ter entre 10 e 1000 caracteres.');
  if (location.length < 3 || location.length > 200) errors.push('A localização deve ter entre 3 e 200 caracteres.');
  if (!SEVERITIES.includes(severity)) errors.push('Selecione uma gravidade válida.');
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.push('Informe uma latitude válida entre -90 e 90.');
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.push('Informe uma longitude válida entre -180 e 180.');

  return { errors, value: { module, category, description, location, severity, coordinates: { latitude, longitude } } };
}

module.exports = { CATEGORIES, MODULES, SEVERITIES, STATUSES, validateOccurrence };
