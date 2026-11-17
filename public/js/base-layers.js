(function () {
  const preferenceKey = 'civitas-map-base-layer';
  let configPromise;
  let cartoKey = '';

  async function load() {
    if (!configPromise) configPromise = fetch('/api/config/maps').then(response => response.ok ? response.json() : {}).catch(() => ({}));
    const config = await configPromise;
    cartoKey = typeof config.cartoBasemapKey === 'string' ? config.cartoBasemapKey : '';
    return { cartoEnabled: Boolean(cartoKey) };
  }

  function getPreference() {
    try { return localStorage.getItem(preferenceKey) === 'dark' && cartoKey ? 'dark' : 'light'; }
    catch { return 'light'; }
  }

  function setPreference(mode) {
    const normalized = mode === 'dark' && cartoKey ? 'dark' : 'light';
    try { localStorage.setItem(preferenceKey, normalized); } catch {}
    return normalized;
  }

  function createLayer(mode) {
    const selected = mode === 'dark' && cartoKey ? 'dark' : 'light';
    if (cartoKey) {
      const style = selected === 'dark' ? 'dark_all' : 'light_all';
      const url = `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoKey)}`;
      const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, &copy; <a href="https://carto.com/attribution/" target="_blank" rel="noopener noreferrer">CARTO</a>';
      return L.tileLayer(url, { maxZoom: 19, attribution });
    }
    return L.tileLayer(CivitasMapConfig.tileUrl, { maxZoom: 19, attribution: CivitasMapConfig.attribution });
  }

  function renderControl(mode, id = 'map-layer-control') {
    const darkDisabled = !cartoKey;
    return `<div class="map-layer-control" id="${id}" role="group" aria-label="Tema do mapa"><button type="button" data-map-layer="light" aria-pressed="${mode === 'light'}" class="${mode === 'light' ? 'is-selected' : ''}">☀️ Claro</button><button type="button" data-map-layer="dark" aria-pressed="${mode === 'dark'}" class="${mode === 'dark' ? 'is-selected' : ''}" ${darkDisabled ? 'disabled title="Configure CARTO_BASEMAP_KEY para habilitar o modo escuro"' : ''}>🌙 Escuro</button>${darkDisabled ? '<span class="map-layer-help" role="status">Modo escuro indisponível: configure CARTO_BASEMAP_KEY.</span>' : ''}</div>`;
  }

  function replaceLayer(map, oldLayer, mode) {
    const center = map.getCenter();
    const zoom = map.getZoom();
    if (oldLayer) map.removeLayer(oldLayer);
    const layer = createLayer(mode).addTo(map);
    map.setView(center, zoom, { animate: false });
    return layer;
  }

  window.CivitasBaseLayers = { load, getPreference, setPreference, createLayer, renderControl, replaceLayer, hasCarto: () => Boolean(cartoKey) };
})();
