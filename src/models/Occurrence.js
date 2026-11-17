const mongoose = require('mongoose');
const { CATEGORIES, MODULES, SEVERITIES, STATUSES } = require('../utils/validators');

const coordinatesSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 }
}, { _id: false });

const photoSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  contentType: { type: String, enum: ['image/webp'], required: true },
  size: { type: Number, required: true, min: 0 },
  uploadedAt: { type: Date, required: true, default: Date.now }
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  previousStatus: { type: String, enum: STATUSES, default: null },
  newStatus: { type: String, required: true, enum: STATUSES },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  changedAt: { type: Date, required: true, default: Date.now }
}, { _id: false });

const occurrenceSchema = new mongoose.Schema({
  module: { type: String, required: true, enum: MODULES },
  category: {
    type: String,
    required: true,
    validate: {
      validator(value) { return Boolean(CATEGORIES[this.module]?.includes(value)); },
      message: 'A categoria não pertence ao módulo selecionado.'
    }
  },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
  location: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  severity: { type: String, required: true, enum: SEVERITIES },
  status: { type: String, required: true, enum: STATUSES, default: 'Pendente' },
  coordinates: { type: coordinatesSchema, default: undefined },
  photos: { type: [photoSchema], default: undefined },
  statusHistory: { type: [statusHistorySchema], default: undefined }
}, { timestamps: true, collection: 'occurrences' });

module.exports = mongoose.model('Occurrence', occurrenceSchema);
