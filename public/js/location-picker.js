(function () {
  const state = { map: null, marker: null, draft: null, tileLayer: null, tileMode: 'light' };
  const initialCenter = CivitasMapConfig.initialCenter;

  function bind() {
    const dialog = document.querySelector('#location-picker-dialog');
    if (!dialog) return;
    dialog.addEventListener('click', event => {
      const action = event.target.closest('[data-picker-action]')?.dataset.pickerAction;
      if (action === 'open') openPicker();
      if (action === 'cancel') closePicker();
      if (action === 'confirm') confirmSelection();
      if (action === 'geolocate') useCurrentLocation();
      const layerMode = event.target.closest('[data-map-layer]')?.dataset.mapLayer;
      if (layerMode) changeLayer(layerMode);
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closePicker(); });
    document.querySelector('#occurrence-form')?.addEventListener('click', event => {
      if (event.target.closest('[data-picker-action="open"]')) openPicker();
    });
  }

  async function openPicker() {
    const dialog = document.querySelector('#location-picker-dialog');
    dialog.showModal();
    const latitude = document.querySelector('#occurrence-form').elements.latitude.value;
    const longitude = document.querySelector('#occurrence-form').elements.longitude.value;
    state.draft = latitude !== '' && longitude !== ''
      ? { latitude: Number(latitude), longitude: Number(longitude) }
      : null;
    if (!window.L) {
      setMessage('O mapa não carregou. Verifique sua conexão e tente novamente.');
      document.querySelector('[data-picker-action="confirm"]').disabled = true;
      return;
    }
    const basemaps = await CivitasBaseLayers.load();
    state.tileMode = CivitasBaseLayers.getPreference();
    const control = document.querySelector('#picker-layer-control');
    if (control) control.outerHTML = CivitasBaseLayers.renderControl(state.tileMode, 'picker-layer-control');
    if (!basemaps.cartoEnabled) setMessage('O modo escuro requer CARTO_BASEMAP_KEY. ' + (state.draft ? formatCoordinates(state.draft) : 'Clique no mapa para escolher o ponto.'));
    if (!state.map) initializeMap();
    if (state.draft) {
      showDraft(state.draft, 15);
      setMessage(formatCoordinates(state.draft));
    } else {
      state.marker?.remove();
      state.marker = null;
      document.querySelector('[data-picker-action="confirm"]').disabled = true;
      setMessage('Clique no mapa para escolher o ponto.');
      state.map.setView(initialCenter, CivitasMapConfig.initialZoom);
    }
    window.setTimeout(() => state.map?.invalidateSize(), 120);
  }

  function initializeMap() {
    const element = document.querySelector('#location-picker-map');
    state.map = L.map(element).setView(initialCenter, CivitasMapConfig.initialZoom);
    state.tileLayer = CivitasBaseLayers.createLayer(state.tileMode).addTo(state.map);
    state.map.on('click', event => {
      const point = {
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6))
      };
      showDraft(point, null);
      setMessage(formatCoordinates(point));
    });
  }

  function changeLayer(mode) {
    if (!state.map || mode === 'dark' && !CivitasBaseLayers.hasCarto()) return;
    state.tileMode = CivitasBaseLayers.setPreference(mode);
    state.tileLayer = CivitasBaseLayers.replaceLayer(state.map, state.tileLayer, state.tileMode);
    const control = document.querySelector('#picker-layer-control');
    if (control) control.outerHTML = CivitasBaseLayers.renderControl(state.tileMode, 'picker-layer-control');
  }

  function showDraft(point, zoom) {
    state.draft = point;
    if (state.marker) state.marker.remove();
    state.marker = L.circleMarker([point.latitude, point.longitude], {
      radius: 9,
      color: '#182B3A',
      weight: 3,
      fillColor: '#E8B83F',
      fillOpacity: 1
    }).addTo(state.map);
    if (zoom) state.map.setView([point.latitude, point.longitude], zoom);
    document.querySelector('[data-picker-action="confirm"]').disabled = false;
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage('Este navegador não disponibiliza geolocalização. Você ainda pode selecionar o ponto manualmente.');
      return;
    }
    const button = document.querySelector('[data-picker-action="geolocate"]');
    button.disabled = true;
    setMessage('Solicitando sua localização…');
    navigator.geolocation.getCurrentPosition(position => {
      const point = {
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6))
      };
      showDraft(point, 16);
      setMessage(`Localização encontrada. ${formatCoordinates(point)}`);
      button.disabled = false;
    }, error => {
      const message = error.code === error.PERMISSION_DENIED
        ? 'Permissão negada. Você pode escolher a localização manualmente no mapa.'
        : error.code === error.TIMEOUT
          ? 'A localização demorou para responder. Tente novamente ou marque o ponto no mapa.'
          : 'Não foi possível obter sua localização. Selecione o ponto manualmente.';
      setMessage(message);
      button.disabled = false;
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function confirmSelection() {
    if (!state.draft) return;
    const form = document.querySelector('#occurrence-form');
    form.elements.latitude.value = state.draft.latitude;
    form.elements.longitude.value = state.draft.longitude;
    form.querySelector('[data-field="coordinates"]').classList.remove('has-error');
    document.querySelector('#selected-coordinates').textContent = formatCoordinates(state.draft);
    document.querySelector('#location-picker-dialog').close();
  }

  function closePicker() {
    document.querySelector('#location-picker-dialog').close();
    state.draft = null;
  }

  function formatCoordinates(point) {
    return `Lat ${point.latitude.toFixed(6)} · Lon ${point.longitude.toFixed(6)}`;
  }

  function setMessage(message) {
    const element = document.querySelector('#location-picker-message');
    if (element) element.textContent = message;
  }

  function destroy() {
    if (state.map) state.map.remove();
    state.map = null;
    state.marker = null;
    state.tileLayer = null;
    state.draft = null;
  }

  window.CivitasLocationPicker = { bind, destroy };
})();
