const Occurrence = require('../models/Occurrence');
const { CATEGORIES, MODULES, SEVERITIES, STATUSES } = require('../utils/validators');
const { categoryGroupKey, spatialCellDimensions, metricForSamples } = require('../utils/analyticsHelpers');

const TIME_ZONE = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;
const CELL_SIZES = [100, 250, 500, 1000];

function parseInstant(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return { error: `O parâmetro ${name} deve ser uma data ISO com fuso horário.` };
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { error: `O parâmetro ${name} é inválido.` };
  return { date };
}

function parseFilters(query = {}) {
  const filter = {};
  for (const [key, allowed] of Object.entries({ module: MODULES, severity: SEVERITIES, status: STATUSES })) {
    if (query[key]) {
      if (!allowed.includes(query[key])) return { error: `Filtro ${key} inválido.` };
      filter[key] = query[key];
    }
  }

  if (query.category) {
    const categories = Object.values(CATEGORIES).flat();
    if (!categories.includes(query.category)) return { error: 'Filtro category inválido.' };
    if (filter.module && !CATEGORIES[filter.module].includes(query.category)) return { error: 'A categoria não pertence ao módulo selecionado.' };
    filter.category = query.category;
  }

  const periods = ['7d', '30d', '90d', 'all', 'custom'];
  const period = query.period || (query.start || query.end ? 'custom' : '30d');
  if (!periods.includes(period)) return { error: 'Filtro period inválido.' };

  let start = null;
  let end = null;
  if (period === 'all') {
    if (query.start || query.end) return { error: 'O período todo não deve receber limites de data.' };
  } else if (period === 'custom' && !query.start && !query.end) {
    return { error: 'Informe o intervalo personalizado.' };
  } else if (query.start || query.end) {
    if (!query.start || !query.end) return { error: 'Informe os limites inicial e final do período.' };
    const parsedStart = parseInstant(query.start, 'start');
    const parsedEnd = parseInstant(query.end, 'end');
    if (parsedStart.error || parsedEnd.error) return { error: parsedStart.error || parsedEnd.error };
    start = parsedStart.date;
    end = parsedEnd.date;
    if (end <= start) return { error: 'A data final deve ser posterior à data inicial.' };
  } else {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    end = new Date();
    start = new Date(end.getTime() - days * DAY_MS);
  }

  if (start && end) filter.createdAt = { $gte: start, $lt: end };

  const cellMeters = query.cellMeters === undefined ? 250 : Number(query.cellMeters);
  if (!CELL_SIZES.includes(cellMeters)) return { error: `cellMeters deve ser um destes valores: ${CELL_SIZES.join(', ')}.` };

  return {
    filters: { module: filter.module || '', category: filter.category || '', severity: filter.severity || '', status: filter.status || '', period, start, end, cellMeters },
    filter
  };
}

function validCoordinatesMatch() {
  return {
    'coordinates.latitude': { $type: 'number', $gte: -90, $lte: 90 },
    'coordinates.longitude': { $type: 'number', $gte: -180, $lte: 180 }
  };
}

function firstResolvedStages() {
  const resolvedEvents = {
    $filter: {
      input: { $ifNull: ['$statusHistory', []] },
      as: 'event',
      cond: { $and: [
        { $eq: ['$$event.newStatus', 'Resolvida'] },
        { $eq: [{ $type: '$$event.changedAt' }, 'date'] }
      ] }
    }
  };
  return [
    { $addFields: { _resolvedDates: { $map: { input: resolvedEvents, as: 'event', in: '$$event.changedAt' } } } },
    { $addFields: { _firstResolvedAt: { $min: '$_resolvedDates' } } },
    { $match: { $expr: { $and: [
      { $eq: [{ $type: '$_firstResolvedAt' }, 'date'] },
      { $gte: ['$_firstResolvedAt', '$createdAt'] }
    ] } } },
    { $addFields: { _resolutionHours: { $divide: [{ $subtract: ['$_firstResolvedAt', '$createdAt'] }, 3600000] } } }
  ];
}

function buildPipeline(filter, cellMeters, unit) {
  const coordMatch = validCoordinatesMatch();
  const step = cellMeters / 111320;
  const timelineGroup = { $dateTrunc: { date: '$createdAt', unit, timezone: TIME_ZONE, ...(unit === 'week' ? { startOfWeek: 'monday' } : {}) } };
  const bucketGroup = [
    { $addFields: { _latCell: { $floor: { $divide: ['$coordinates.latitude', step] } }, _lonCell: { $floor: { $divide: ['$coordinates.longitude', step] } } } },
    { $group: {
      _id: { latCell: '$_latCell', lonCell: '$_lonCell', module: '$module', category: '$category', status: '$status' },
      count: { $sum: 1 }, sumLatitude: { $sum: '$coordinates.latitude' }, sumLongitude: { $sum: '$coordinates.longitude' }
    } }
  ];
  const resolution = firstResolvedStages();
  const trimmedAddress = { $toLower: { $trim: { input: { $ifNull: ['$location', ''] } } } };

  return [
    { $match: filter },
    { $facet: {
      summary: [{ $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'Pendente'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'Em andamento'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolvida'] }, 1, 0] } },
        withoutCoordinates: { $sum: { $cond: [{ $and: [
          { $isNumber: '$coordinates.latitude' },
          { $gte: ['$coordinates.latitude', -90] }, { $lte: ['$coordinates.latitude', 90] },
          { $isNumber: '$coordinates.longitude' },
          { $gte: ['$coordinates.longitude', -180] }, { $lte: ['$coordinates.longitude', 180] }
        ] }, 0, 1] } },
        firstCreatedAt: { $min: '$createdAt' }
      } }],
      byModule: [{ $group: { _id: '$module', count: { $sum: 1 } } }],
      byCategory: [{ $group: { _id: { module: '$module', category: '$category' }, count: { $sum: 1 } } }, { $sort: { count: -1, '_id.module': 1, '_id.category': 1 } }],
      bySeverity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
      byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
      timeline: [{ $group: { _id: timelineGroup, moduleCounts: { $push: '$module' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      heatPoints: [{ $match: coordMatch }, { $project: { _id: 0, latitude: '$coordinates.latitude', longitude: '$coordinates.longitude' } }],
      spatialRows: [{ $match: coordMatch }, ...bucketGroup],
      addressRows: [
        { $match: { $nor: [coordMatch] } },
        { $addFields: { _addressKey: trimmedAddress } },
        { $match: { _addressKey: { $ne: '' } } },
        { $group: { _id: { address: '$_addressKey', module: '$module', category: '$category', status: '$status' }, count: { $sum: 1 }, location: { $first: '$location' } } }
      ],
      resolutionSummary: [...resolution, { $group: { _id: null, count: { $sum: 1 }, averageHours: { $avg: '$_resolutionHours' }, samples: { $push: '$_resolutionHours' } } }],
      resolutionByModule: [...resolution, { $group: { _id: '$module', count: { $sum: 1 }, averageHours: { $avg: '$_resolutionHours' } } }, { $sort: { count: -1 } }],
      resolutionByCategory: [...resolution, { $group: { _id: { category: '$category', module: '$module' }, count: { $sum: 1 }, averageHours: { $avg: '$_resolutionHours' } } }, { $sort: { count: -1 } }]
    } }
  ];
}

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function dateKey(date) {
  const { year, month, day } = localParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function bucketStartKey(key, unit) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (unit === 'month') date.setUTCDate(1);
  if (unit === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function nextBucketKey(key, unit) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (unit === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + (unit === 'week' ? 7 : 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function buildTimeline(rows, filters, firstCreatedAt, unit) {
  const counts = new Map();
  for (const row of rows) {
    const key = bucketStartKey(dateKey(row._id), unit);
    counts.set(key, row);
  }
  if (!filters.start && !firstCreatedAt) return [];
  const start = filters.start || firstCreatedAt;
  const end = filters.end || new Date();
  let cursor = bucketStartKey(dateKey(start), unit);
  const last = bucketStartKey(dateKey(new Date(Math.max(start.getTime(), end.getTime() - 1))), unit);
  const timeline = [];
  for (let limit = 0; cursor <= last && limit < 2400; limit += 1) {
    const row = counts.get(cursor);
    const byModule = Object.fromEntries(MODULES.map(module => [module, (row?.moduleCounts || []).filter(item => item === module).length]));
    timeline.push({ key: cursor, label: timelineLabel(cursor, unit), total: row?.count || 0, byModule });
    cursor = nextBucketKey(cursor, unit);
  }
  return timeline;
}

function timelineLabel(key, unit) {
  const [year, month, day] = key.split('-');
  if (unit === 'month') return `${month}/${year}`;
  return unit === 'week' ? `Sem. ${day}/${month}` : `${day}/${month}`;
}

function normalizeAddress(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function emptyCounts(keys) { return Object.fromEntries(keys.map(key => [key, 0])); }

function mergeRows(rows, mode, cellMeters) {
  const groups = new Map();
  for (const row of rows) {
    const key = mode === 'spatial'
      ? `${row._id.latCell}:${row._id.lonCell}`
      : normalizeAddress(row._id.address);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = { id: `${mode}-${key}`, mode, count: 0, sumLatitude: 0, sumLongitude: 0, byModule: emptyCounts(MODULES), byStatus: emptyCounts(STATUSES), categories: new Map(), location: row.location || '' };
      if (mode === 'spatial') group.cell = { lat: row._id.latCell, lon: row._id.lonCell };
      groups.set(key, group);
    }
    group.count += row.count;
    if (mode === 'spatial') {
      group.sumLatitude += row.sumLatitude;
      group.sumLongitude += row.sumLongitude;
    }
    group.byModule[row._id.module] = (group.byModule[row._id.module] || 0) + row.count;
    group.byStatus[row._id.status] = (group.byStatus[row._id.status] || 0) + row.count;
    const categoryKey = categoryGroupKey(row._id.module, row._id.category);
    const categoryEntry = group.categories.get(categoryKey) || { module: row._id.module, category: row._id.category, count: 0 };
    categoryEntry.count += row.count;
    group.categories.set(categoryKey, categoryEntry);
  }
  return [...groups.values()].map(group => {
    const center = mode === 'spatial' ? { latitude: group.sumLatitude / group.count, longitude: group.sumLongitude / group.count } : null;
    const { sumLatitude, sumLongitude, cell, ...rest } = group;
    const approximateCellDimensionsMeters = mode === 'spatial'
      ? spatialCellDimensions(cellMeters, center.latitude)
      : null;
    return {
      ...rest,
      center,
      approximateCellDimensionsMeters,
      categories: [...group.categories.values()].sort((a, b) => b.count - a.count || a.module.localeCompare(b.module) || a.category.localeCompare(b.category)),
      pending: group.byStatus.Pendente,
      resolved: group.byStatus.Resolvida
    };
  }).sort((a, b) => b.count - a.count || String(a.location || '').localeCompare(String(b.location || ''), 'pt-BR'));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function getAnalytics(filters, session) {
  const durationDays = filters.filters.start && filters.filters.end ? (filters.filters.end - filters.filters.start) / DAY_MS : Infinity;
  const unit = durationDays <= 45 ? 'day' : durationDays <= 210 ? 'week' : 'month';
  const aggregate = Occurrence.aggregate(buildPipeline(filters.filter, filters.filters.cellMeters, unit)).option({ maxTimeMS: 20000 });
  if (session) aggregate.session(session);
  const [raw = {}] = await aggregate.exec();
  const summary = raw.summary?.[0] || { total: 0, pending: 0, inProgress: 0, resolved: 0, withoutCoordinates: 0, firstCreatedAt: null };
  const areas = mergeRows(raw.spatialRows || [], 'spatial', filters.filters.cellMeters);
  const addressGroups = mergeRows(raw.addressRows || [], 'address', filters.filters.cellMeters);
  const recurrentAreas = areas.filter(area => area.count >= 2);
  const recurrentAddresses = addressGroups.filter(group => group.count >= 2);
  const recurrentPlaces = recurrentAreas.length + recurrentAddresses.length;
  const recurrence = [...recurrentAreas, ...recurrentAddresses].sort((a, b) => b.count - a.count).slice(0, 100);
  const resolution = raw.resolutionSummary?.[0];
  const calculated = resolution?.count || 0;
  const timeline = buildTimeline(raw.timeline || [], filters.filters, summary.firstCreatedAt, unit);
  const byModule = emptyCounts(MODULES);
  for (const row of raw.byModule || []) byModule[row._id] = row.count;
  const bySeverity = emptyCounts(SEVERITIES);
  for (const row of raw.bySeverity || []) bySeverity[row._id] = row.count;
  const byStatus = emptyCounts(STATUSES);
  for (const row of raw.byStatus || []) byStatus[row._id] = row.count;
  const resolutionByModule = emptyCounts(MODULES);
  const resolutionModuleCounts = emptyCounts(MODULES);
  for (const row of raw.resolutionByModule || []) {
    resolutionByModule[row._id] = row.averageHours;
    resolutionModuleCounts[row._id] = row.count;
  }

  return {
    filters: { ...filters.filters, start: filters.filters.start?.toISOString() || null, end: filters.filters.end?.toISOString() || null, timezone: TIME_ZONE },
    summary: {
      total: summary.total || 0,
      pending: summary.pending || 0,
      inProgress: summary.inProgress || 0,
      resolved: summary.resolved || 0,
      withoutCoordinates: summary.withoutCoordinates || 0,
      geolocated: Math.max(0, (summary.total || 0) - (summary.withoutCoordinates || 0)),
      recurrentPlaces
    },
    byModule,
    byCategory: (raw.byCategory || []).map(row => ({ module: row._id.module, category: row._id.category, count: row.count })),
    bySeverity,
    byStatus,
    timelineUnit: unit,
    timeline,
    heatPoints: (raw.heatPoints || []).map(point => [point.latitude, point.longitude, 1]),
    areas: areas.slice(0, 100),
    recurrences: recurrence,
    resolution: {
      count: calculated,
      withoutReliableHistory: Math.max(0, (summary.resolved || 0) - calculated),
      notResolved: Math.max(0, (summary.total || 0) - (summary.resolved || 0)),
      averageHours: resolution?.averageHours ?? null,
      medianHours: median(resolution?.samples || []),
      byModule: MODULES.map(module => ({ module, count: resolutionModuleCounts[module], averageHours: metricForSamples(resolutionModuleCounts[module], resolutionByModule[module]) })),
      byCategory: (raw.resolutionByCategory || []).map(row => ({ category: row._id.category, module: row._id.module, count: row.count, averageHours: row.averageHours })).filter(row => row.count >= 2)
    },
    methodology: {
      timezone: TIME_ZONE,
      spatialCellMeters: filters.filters.cellMeters,
      spatialCellDimensions: 'A altura norte-sul é nominal; a largura leste-oeste é aproximada e varia conforme a latitude.',
      categoryAggregation: 'Categorias são agrupadas por módulo e nome, preservando categorias homônimas em módulos diferentes.',
      addressFallbackOnlyForRecordsWithoutValidCoordinates: true
    }
  };
}

module.exports = { CELL_SIZES, TIME_ZONE, parseFilters, getAnalytics, buildPipeline, normalizeAddress, median };
