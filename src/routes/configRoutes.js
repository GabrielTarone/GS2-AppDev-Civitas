const express = require('express');
const router = express.Router();

router.get('/maps', (_req, res) => res.json({ cartoBasemapKey: process.env.CARTO_BASEMAP_KEY || '' }));

module.exports = router;
