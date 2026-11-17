const express = require('express');
const { createOccurrence, listOccurrences, getStats, getOccurrence, updateOccurrenceStatus, getOccurrencePhoto } = require('../controllers/occurrenceController');
const photoUpload = require('../middleware/photoUpload');
const router = express.Router();

router.get('/stats', getStats);
router.get('/:occurrenceId/photos/:fileId', getOccurrencePhoto);
router.get('/:id', getOccurrence);
router.patch('/:id/status', updateOccurrenceStatus);
router.get('/', listOccurrences);
router.post('/', photoUpload, createOccurrence);

module.exports = router;
