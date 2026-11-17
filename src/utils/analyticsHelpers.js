function categoryGroupKey(module, category) {
  return `${module}\u0000${category}`;
}

function spatialCellDimensions(cellMeters, latitude) {
  const numericLatitude = Number(latitude);
  if (!Number.isFinite(cellMeters) || cellMeters <= 0) {
    throw new TypeError('cellMeters deve ser um número positivo.');
  }
  if (!Number.isFinite(numericLatitude) || numericLatitude < -90 || numericLatitude > 90) {
    throw new TypeError('latitude deve estar entre -90 e 90.');
  }

  const latitudeRadians = numericLatitude * Math.PI / 180;
  return {
    northSouthMeters: Math.round(cellMeters),
    eastWestMeters: Math.round(cellMeters * Math.abs(Math.cos(latitudeRadians)))
  };
}

function metricForSamples(sampleCount, value) {
  return sampleCount > 0 ? (value ?? null) : null;
}

module.exports = { categoryGroupKey, spatialCellDimensions, metricForSamples };
