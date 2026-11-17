(function () {
  const moduleLabels = { infraestrutura: 'Infraestrutura', acessibilidade: 'Acessibilidade', meio_ambiente: 'Meio ambiente' };
  let map = null;
  let heatLayer = null;
  let areaLayer = null;
  let tileLayer = null;

  function safe(value) { return Civitas.escapeHTML(value); }

  async function mount(element, points, areas) {
    destroy();
    if (!window.L || typeof L.heatLayer !== 'function') throw new Error('O mapa de calor não foi carregado. Confira sua conexão e tente novamente.');
    await CivitasBaseLayers.load();
    map = L.map(element, { scrollWheelZoom: true }).setView(CivitasMapConfig.initialCenter, CivitasMapConfig.initialZoom);
    const preference = CivitasBaseLayers.getPreference();
    tileLayer = CivitasBaseLayers.createLayer(preference).addTo(map);
    heatLayer = L.heatLayer([], { radius: 30, blur: 22, maxZoom: 17, minOpacity: 0.28, max: 1, gradient: { 0.2: '#4D8DB4', 0.45: '#69A55D', 0.7: '#E2C34F', 1: '#B84842' } }).addTo(map);
    areaLayer = L.layerGroup().addTo(map);
    update(points, areas);
    const mapPoints = (points || []).map(point => [point[0], point[1]]);
    if (mapPoints.length > 1) map.fitBounds(L.latLngBounds(mapPoints).pad(0.12), { maxZoom: 14, animate: false });
    else if (mapPoints.length === 1) map.setView(mapPoints[0], 14, { animate: false });
    requestAnimationFrame(() => map?.invalidateSize());
  }

  function update(points, areas) {
    if (!map) return;
    heatLayer.setLatLngs(points || []);
    areaLayer.clearLayers();
    (areas || []).slice(0, 100).forEach(area => {
      if (!area.center) return;
      const center = [area.center.latitude, area.center.longitude];
      const marker = L.circleMarker(center, {
        radius: Math.min(15, 5 + Math.sqrt(area.count)),
        color: '#FFFFFF', weight: 2, fillColor: '#9C4A43', fillOpacity: 0.84
      });
      const moduleSummary = Object.entries(area.byModule || {}).filter(([, count]) => count).map(([module, count]) => `${safe(moduleLabels[module] || module)}: ${count}`).join(' · ');
      const categorySummary = (area.categories || []).slice(0, 3).map(item => safe(`${item.category} (${item.count})`)).join(', ');
      marker.bindPopup(`<strong>Área aproximada</strong><br>${area.count} ocorrência(s)<br>${moduleSummary}<br>${categorySummary}`);
      marker.addTo(areaLayer);
    });
  }

  function setBaseLayer(mode) {
    if (!map) return CivitasBaseLayers.getPreference();
    const preference = CivitasBaseLayers.setPreference(mode);
    tileLayer = CivitasBaseLayers.replaceLayer(map, tileLayer, preference);
    return preference;
  }

  function getBaseLayerPreference() { return CivitasBaseLayers.getPreference(); }

  function destroy() {
    if (map) map.remove();
    map = null;
    heatLayer = null;
    areaLayer = null;
    tileLayer = null;
  }

  window.CivitasAnalyticsMap = { mount, update, setBaseLayer, getBaseLayerPreference, destroy };
})();
