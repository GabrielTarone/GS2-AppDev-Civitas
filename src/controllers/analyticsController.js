const analyticsService = require('../services/analyticsService');

async function getAnalytics(req, res) {
  const parsed = analyticsService.parseFilters(req.query);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    return res.json(await analyticsService.getAnalytics(parsed));
  } catch (error) {
    console.error('Falha ao calcular análises urbanas:', error);
    return res.status(500).json({ message: 'Não foi possível calcular as análises. Tente novamente.' });
  }
}

module.exports = { getAnalytics };
