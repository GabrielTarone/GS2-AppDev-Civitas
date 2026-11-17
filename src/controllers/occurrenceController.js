const Occurrence = require('../models/Occurrence');
const { CATEGORIES, MODULES, SEVERITIES, STATUSES, validateOccurrence } = require('../utils/validators');
const photoStorage = require('../services/photoStorage');
const mongoose = require('mongoose');

function parseFilters(query) {
  const filter = {};
  const allowed = { module: MODULES, severity: SEVERITIES, status: STATUSES };
  for (const [key, options] of Object.entries(allowed)) {
    if (query[key]) {
      if (!options.includes(query[key])) return { error: `Filtro ${key} inválido.` };
      filter[key] = query[key];
    }
  }
  const categories = Object.values(CATEGORIES).flat();
  if (query.category) {
    if (!categories.includes(query.category)) return { error: 'Filtro category inválido.' };
    if (filter.module && !CATEGORIES[filter.module].includes(query.category)) return { error: 'A categoria não pertence ao módulo selecionado.' };
    filter.category = query.category;
  }
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 120) return { error: 'A pesquisa deve ter no máximo 120 caracteres.' };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['description', 'category', 'location'].map(field => ({ [field]: { $regex: escaped, $options: 'i' } }));
  }
  return { filter };
}

function sendError(res, error) {
  if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: 'Verifique os dados informados.', errors: Object.values(error.errors).map(item => item.message) });
  }
  console.error(error);
  return res.status(500).json({ message: 'Não foi possível concluir a solicitação.' });
}

async function createOccurrence(req, res) {
  let input = req.body || {};
  if (typeof input.coordinates === 'string') {
    try { input.coordinates = JSON.parse(input.coordinates); }
    catch { return res.status(400).json({ message: 'As coordenadas informadas são inválidas.' }); }
  }
  const { errors, value } = validateOccurrence(input);
  if (errors.length) return res.status(400).json({ message: 'Verifique os dados informados.', errors });
  const uploaded = [];
  try {
    for (const file of req.files || []) uploaded.push(await photoStorage.storeImage(file));
    const occurrence = await Occurrence.create({
      ...value,
      status: 'Pendente',
      statusHistory: [{ previousStatus: null, newStatus: 'Pendente', note: '', changedAt: new Date() }],
      ...(uploaded.length ? { photos: uploaded } : {})
    });
    return res.status(201).json({ message: 'Ocorrência cadastrada com sucesso.', occurrence });
  } catch (error) {
    await photoStorage.cleanupFiles(uploaded.map(photo => photo.fileId)).catch(cleanupError => console.error('Falha ao remover fotos órfãs:', cleanupError.message));
    return sendError(res, error);
  }
}

function isValidObjectId(value) { return /^[a-f\d]{24}$/i.test(String(value || '')); }

async function getOccurrence(req, res) {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador da ocorrência inválido.' });
  try {
    const occurrence = await Occurrence.findById(req.params.id).lean();
    if (!occurrence) return res.status(404).json({ message: 'Ocorrência não encontrada.' });
    return res.json({ occurrence });
  } catch (error) { return sendError(res, error); }
}

async function updateOccurrenceStatus(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Identificador da ocorrência inválido.' });
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  if (Object.keys(body).some(key => !['status', 'note'].includes(key))) {
    return res.status(400).json({ message: 'Envie somente o novo status e uma observação opcional.' });
  }
  const newStatus = typeof body.status === 'string' ? body.status.trim() : '';
  const note = body.note === undefined ? '' : typeof body.note === 'string' ? body.note.trim() : null;
  if (!STATUSES.includes(newStatus)) return res.status(400).json({ message: 'Selecione um dos quatro status disponíveis.' });
  if (note === null || note.length > 500) return res.status(400).json({ message: 'A observação deve ter no máximo 500 caracteres.' });

  try {
    const current = await Occurrence.findById(id).select('status').lean();
    if (!current) return res.status(404).json({ message: 'Ocorrência não encontrada.' });
    if (current.status === newStatus) return res.status(400).json({ message: 'A ocorrência já está neste status.' });
    const occurrence = await Occurrence.findOneAndUpdate(
      { _id: id, status: current.status },
      { $set: { status: newStatus }, $push: { statusHistory: { previousStatus: current.status, newStatus, note, changedAt: new Date() } } },
      { new: true, runValidators: true }
    ).lean();
    if (!occurrence) return res.status(409).json({ message: 'O status foi alterado em outra solicitação. Atualize os detalhes e tente novamente.' });
    return res.json({ message: 'Status atualizado com sucesso.', occurrence });
  } catch (error) { return sendError(res, error); }
}

async function getOccurrencePhoto(req, res) {
  const { occurrenceId, fileId } = req.params;
  if (!/^[a-f\d]{24}$/i.test(occurrenceId) || !/^[a-f\d]{24}$/i.test(fileId)) {
    return res.status(404).json({ message: 'Fotografia não encontrada.' });
  }
  try {
    const occurrence = await Occurrence.findById(occurrenceId).select('photos').lean();
    const photo = occurrence?.photos?.find(item => String(item.fileId) === fileId);
    if (!photo) return res.status(404).json({ message: 'Fotografia não encontrada.' });
    const objectId = new mongoose.Types.ObjectId(fileId);
    const file = await photoStorage.getFile(objectId);
    if (!file) return res.status(404).json({ message: 'Fotografia não encontrada.' });
    res.set({
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600, immutable',
      'Content-Length': String(file.length)
    });
    const stream = photoStorage.openDownloadStream(objectId);
    stream.on('error', error => {
      if (res.headersSent) return res.destroy(error);
      return res.status(404).json({ message: 'Fotografia não encontrada.' });
    });
    stream.pipe(res);
  } catch (error) { return sendError(res, error); }
}

async function listOccurrences(req, res) {
  const parsed = parseFilters(req.query);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const filter = parsed.filter;
  const includeOnlyGeolocated = req.query.geolocated === 'true';
  if (req.query.geolocated && !['true', 'false'].includes(req.query.geolocated)) {
    return res.status(400).json({ message: 'Filtro geolocated inválido.' });
  }
  if (includeOnlyGeolocated) {
    filter['coordinates.latitude'] = { $type: 'number', $gte: -90, $lte: 90 };
    filter['coordinates.longitude'] = { $type: 'number', $gte: -180, $lte: 180 };
  }
  try {
    const query = Occurrence.find(filter).sort({ createdAt: -1 });
    if (!includeOnlyGeolocated && req.query.all !== 'true') query.limit(200);
    const occurrences = await query.lean();
    return res.json({ occurrences });
  } catch (error) { return sendError(res, error); }
}

async function getStats(req, res) {
  try {
    const parsed = parseFilters(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const match = parsed.filter;
    const matchStage = Object.keys(match).length ? [{ $match: match }] : [];
    const [total, withoutCoordinates, byModule, byCategory, bySeverity, byStatus] = await Promise.all([
      Occurrence.countDocuments(match),
      Occurrence.countDocuments({
        ...match,
        $nor: [{
          'coordinates.latitude': { $type: 'number', $gte: -90, $lte: 90 },
          'coordinates.longitude': { $type: 'number', $gte: -180, $lte: 180 }
        }]
      }),
      Occurrence.aggregate([...matchStage, { $group: { _id: '$module', count: { $sum: 1 } } }]),
      Occurrence.aggregate([...matchStage, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      Occurrence.aggregate([...matchStage, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      Occurrence.aggregate([...matchStage, { $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);
    const mapCounts = (items, keys) => Object.fromEntries(keys.map(key => [key, items.find(item => item._id === key)?.count || 0]));
    return res.json({
      total,
      withoutCoordinates,
      byModule: mapCounts(byModule, MODULES),
      byCategory: Object.fromEntries(byCategory.map(item => [item._id, item.count])),
      bySeverity: mapCounts(bySeverity, SEVERITIES),
      byStatus: mapCounts(byStatus, STATUSES)
    });
  } catch (error) { return sendError(res, error); }
}

module.exports = { createOccurrence, listOccurrences, getStats, getOccurrence, updateOccurrenceStatus, getOccurrencePhoto };
