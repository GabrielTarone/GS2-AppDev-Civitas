(function () {
  const moduleLabels = {
    infraestrutura: 'Infraestrutura',
    acessibilidade: 'Acessibilidade',
    meio_ambiente: 'Meio ambiente'
  };
  const moduleColors = {
    infraestrutura: { main: '#9A5B00', highlight: '#E8B83F' },
    acessibilidade: { main: '#1E5AA8', highlight: '#6DA4DF' },
    meio_ambiente: { main: '#256C4A', highlight: '#69B88A' }
  };
  const statusClasses = { Pendente: 'status-pendente', 'Em análise': 'status-em-análise', 'Em andamento': 'status-em-andamento', Resolvida: 'status-resolvida' };
  const severityClasses = { Baixa: 'severity-baixa', 'Média': 'severity-média', Alta: 'severity-alta', 'Crítica': 'severity-crítica' };
  const state = {
    map: null,
    markerLayer: null,
    tileLayer: null,
    tileMode: 'light',
    initialModule: null,
    refreshTimer: null,
    filters: { module: '', category: '', severity: '', status: '' },
    refreshId: 0,
    tileError: false,
    focusTarget: null
  };

  function render(initialModule = '') {
    if (state.initialModule !== initialModule) {
      state.initialModule = initialModule;
      state.filters = { module: initialModule, category: '', severity: '', status: '' };
    }
    const moduleOptions = Object.entries(moduleLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
    const severityOptions = ['Baixa', 'Média', 'Alta', 'Crítica'].map(item => `<option>${item}</option>`).join('');
    const categoryOptions = getCategoryOptions(state.filters.module);
    return `<div class="page-heading map-page-heading"><div><p class="eyebrow">CIVITAS · VISUALIZAÇÃO GEOGRÁFICA</p><h1>Mapa de ocorrências</h1><p class="page-description">Explore os registros geolocalizados e filtre por módulo, categoria, gravidade ou status.</p></div>${CivitasBaseLayers.renderControl(CivitasBaseLayers.getPreference())}</div>
      <div class="map-toolbar" aria-label="Filtros do mapa">
        <div class="field"><label for="map-filter-module">Módulo</label><select id="map-filter-module"><option value="">Todos os módulos</option>${moduleOptions}</select></div>
        <div class="field"><label for="map-filter-category">Categoria</label><select id="map-filter-category"><option value="">Todas as categorias</option>${categoryOptions}</select></div>
        <div class="field"><label for="map-filter-severity">Gravidade</label><select id="map-filter-severity"><option value="">Todas as gravidades</option>${severityOptions}</select></div>
        <div class="field"><label for="map-filter-status">Status</label><select id="map-filter-status"><option value="">Todos os status</option><option>Pendente</option><option>Em análise</option><option>Em andamento</option><option>Resolvida</option></select></div>
        <button type="button" class="button button-secondary" data-map-action="clear">Limpar filtros</button>
      </div>
      <p class="map-summary" id="map-summary" aria-live="polite">Carregando ocorrências…</p>
      <section class="map-panel" aria-label="Mapa interativo de ocorrências">
        <div id="occurrence-map" class="occurrence-map" role="application" aria-label="Mapa OpenStreetMap com marcadores de ocorrências">
          <div id="map-loading" class="map-feedback">Carregando ocorrências geolocalizadas…</div>
          <div id="map-empty" class="map-feedback map-empty" hidden><strong>Nenhuma ocorrência geolocalizada</strong><span>Os registros sem coordenadas continuam disponíveis nas listas e indicadores.</span></div>
          <div id="map-error" class="map-error" role="alert" hidden></div>
          <div class="map-legend" aria-label="Legenda dos módulos"><strong>Módulos</strong><span><i class="legend-dot infrastructure"></i>Infraestrutura</span><span><i class="legend-dot accessibility"></i>Acessibilidade</span><span><i class="legend-dot environment"></i>Meio ambiente</span></div>
        </div>
      </section>
      <p class="map-attribution-note">Os marcadores mostram somente registros com coordenadas. A atribuição do provedor permanece visível no canto inferior direito do mapa.</p>`;
  }

  function getCategoryOptions(module) {
    const categories = module ? (CivitasCategories[module] || []) : [...new Set(Object.values(CivitasCategories).flat())].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return categories.map(category => `<option>${Civitas.escapeHTML(category)}</option>`).join('');
  }

  function setControlValues() {
    document.querySelector('#map-filter-module').value = state.filters.module;
    document.querySelector('#map-filter-category').value = state.filters.category;
    document.querySelector('#map-filter-severity').value = state.filters.severity;
    document.querySelector('#map-filter-status').value = state.filters.status;
  }

  async function mount(initialModule = '') {
    const mapElement = document.querySelector('#occurrence-map');
    if (!mapElement) return;
    setControlValues();
    if (!window.L) {
      showMapError('A biblioteca do mapa não foi carregada. Verifique a conexão e tente novamente.');
      document.querySelector('#map-loading').hidden = true;
      return;
    }

    await CivitasBaseLayers.load();
    state.tileMode = CivitasBaseLayers.getPreference();
    const layerControl = document.querySelector('#map-layer-control');
    if (layerControl) setLayerControl(layerControl, state.tileMode);

    state.map = L.map(mapElement, { scrollWheelZoom: true }).setView(CivitasMapConfig.initialCenter, CivitasMapConfig.initialZoom);
    state.tileLayer = CivitasBaseLayers.createLayer(state.tileMode).addTo(state.map);
    state.tileLayer.on('tileerror', () => {
      state.tileError = true;
      showMapError('Não foi possível carregar um bloco do mapa. Verifique sua conexão e a configuração do provedor.');
    });
    state.tileLayer.on('tileload', () => {
      if (state.tileError) {
        state.tileError = false;
        hideMapError();
      }
    });
    state.markerLayer = L.layerGroup().addTo(state.map);
    layerControl?.addEventListener('click', event => {
      const button = event.target.closest('[data-map-layer]');
      if (!button || button.disabled) return;
      state.tileMode = CivitasBaseLayers.setPreference(button.dataset.mapLayer);
      state.tileLayer = CivitasBaseLayers.replaceLayer(state.map, state.tileLayer, state.tileMode);
      setLayerControl(layerControl, state.tileMode);
    });
    requestAnimationFrame(() => state.map?.invalidateSize());
    state.refreshTimer = window.setInterval(() => refresh(), 60000);

    document.querySelector('#map-filter-module').addEventListener('change', event => {
      state.filters.module = event.target.value;
      state.filters.category = '';
      const categorySelect = document.querySelector('#map-filter-category');
      categorySelect.innerHTML = `<option value="">Todas as categorias</option>${getCategoryOptions(state.filters.module)}`;
      setControlValues();
      refresh();
    });
    document.querySelector('#map-filter-category').addEventListener('change', event => { state.filters.category = event.target.value; refresh(); });
    document.querySelector('#map-filter-severity').addEventListener('change', event => { state.filters.severity = event.target.value; refresh(); });
    document.querySelector('#map-filter-status').addEventListener('change', event => { state.filters.status = event.target.value; refresh(); });
    document.querySelector('[data-map-action="clear"]').addEventListener('click', () => {
      state.filters = { module: '', category: '', severity: '', status: '' };
      const categorySelect = document.querySelector('#map-filter-category');
      categorySelect.innerHTML = `<option value="">Todas as categorias</option>${getCategoryOptions('')}`;
      setControlValues();
      refresh();
    });

    await refresh();
  }

  function setLayerControl(control, mode) {
    const template = document.createElement('div');
    template.innerHTML = CivitasBaseLayers.renderControl(mode);
    const rendered = template.firstElementChild;
    control.replaceChildren(...rendered.childNodes);
    control.className = rendered.className;
    control.setAttribute('role', rendered.getAttribute('role'));
    control.setAttribute('aria-label', rendered.getAttribute('aria-label'));
  }

  async function refresh() {
    const requestId = ++state.refreshId;
    setLoading(true);
    hideMapError();
    try {
      const filters = { ...state.filters, geolocated: 'true' };
      const [occurrences, stats] = await Promise.all([
        CivitasAPI.getOccurrences(filters),
        CivitasAPI.getStats(state.filters)
      ]);
      if (requestId !== state.refreshId || !state.map) return;
      const validOccurrences = occurrences.filter(item => {
        const latitude = item.coordinates?.latitude;
        const longitude = item.coordinates?.longitude;
        return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
      });
      drawMarkers(validOccurrences);
      const withoutCoordinates = stats.withoutCoordinates || 0;
      const summary = `${validOccurrences.length} ocorrência(s) no mapa`;
      const summaryText = withoutCoordinates
        ? `${summary} · ${withoutCoordinates} ocorrência(s) sem coordenadas geográficas.`
        : stats.total === 0
          ? `${summary} · Nenhum registro corresponde aos filtros atuais.`
          : summary;
      document.querySelector('#map-summary').textContent = summaryText;
      const empty = document.querySelector('#map-empty');
      empty.hidden = validOccurrences.length !== 0;
      document.querySelector('#map-loading').hidden = true;
    } catch (error) {
      if (requestId !== state.refreshId) return;
      document.querySelector('#map-loading').hidden = true;
      showMapError(error.message || 'Não foi possível carregar os registros do mapa.');
    }
  }

  function drawMarkers(occurrences) {
    state.markerLayer.clearLayers();
    const points = [];
    let focusMarker = null;
    let focusPoint = null;
    occurrences.forEach(item => {
      const colors = moduleColors[item.module];
      if (!colors) return;
      const point = [item.coordinates.latitude, item.coordinates.longitude];
      points.push(point);
      const focused = state.focusTarget && String(item._id) === state.focusTarget.id;
      const marker = L.circleMarker(point, {
        radius: focused ? 12 : 8,
        color: focused ? '#B53E43' : colors.main,
        weight: focused ? 4 : 2,
        fillColor: colors.highlight,
        fillOpacity: 0.95
      }).bindPopup(createPopup(item), { maxWidth: 310 }).addTo(state.markerLayer);
      if (focused) { focusMarker = marker; focusPoint = point; }
    });

    if (state.focusTarget?.center) {
      state.map.setView(state.focusTarget.center, Math.max(state.map.getZoom(), state.focusTarget.zoom), { animate: false });
      state.focusTarget = null;
    } else if (focusPoint) {
      state.map.setView(focusPoint, Math.max(state.map.getZoom(), CivitasMapConfig.singleMarkerZoom));
      focusMarker.openPopup();
      state.focusTarget = null;
    } else if (points.length === 1) state.map.setView(points[0], CivitasMapConfig.singleMarkerZoom);
    else if (points.length > 1) state.map.fitBounds(L.latLngBounds(points).pad(0.14), { maxZoom: 15 });
    else state.map.setView(CivitasMapConfig.initialCenter, CivitasMapConfig.initialZoom);
  }

  function createPopup(item) {
    const safe = Civitas.escapeHTML;
    const description = String(item.description || '');
    const shortDescription = description.length > 180 ? `${description.slice(0, 180)}…` : description;
    const moduleLabel = moduleLabels[item.module] || 'Módulo';
    const moduleClass = Object.hasOwn(moduleColors, item.module) ? item.module : '';
    const severityClass = severityClasses[item.severity] || '';
    const statusClass = statusClasses[item.status] || 'status-pendente';
    return `<article class="map-popup"><span class="module-chip map-module-chip ${moduleClass}">${safe(moduleLabel)}</span><h2>${safe(item.category)}</h2><p class="popup-description">${safe(shortDescription)}</p>${CivitasPhotoGallery.render(item._id, item.photos, 'photo-gallery-popup')}<dl><div><dt>Endereço</dt><dd>${safe(item.location)}</dd></div><div><dt>Gravidade</dt><dd><span class="severity-dot ${severityClass}"></span>${safe(item.severity)}</dd></div><div><dt>Status</dt><dd><span class="status-badge ${statusClass}">${safe(item.status)}</span></dd></div><div><dt>Data</dt><dd>${safe(Civitas.formatDate(item.createdAt))}</dd></div></dl></article>`;
  }

  function setLoading(loading) {
    const element = document.querySelector('#map-loading');
    if (element) {
      element.hidden = !loading;
      element.textContent = loading ? 'Atualizando ocorrências…' : '';
    }
  }

  function showMapError(message) {
    const error = document.querySelector('#map-error');
    if (error) { error.textContent = message; error.hidden = false; }
  }

  function hideMapError() {
    const error = document.querySelector('#map-error');
    if (error) error.hidden = true;
  }

  function destroy() {
    state.refreshId += 1;
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
    if (state.map) state.map.remove();
    state.map = null;
    state.markerLayer = null;
    state.tileLayer = null;
    state.tileError = false;
  }

  function focusOccurrence(occurrence) {
    const coordinates = occurrence?.coordinates;
    if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) return false;
    state.focusTarget = { id: String(occurrence._id) };
    state.initialModule = '';
    state.filters = { module: '', category: '', severity: '', status: '' };
    return true;
  }

  function focusArea(center) {
    const latitude = Number(center?.latitude);
    const longitude = Number(center?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return false;
    state.focusTarget = { center: [latitude, longitude], zoom: 15 };
    state.initialModule = '';
    state.filters = { module: '', category: '', severity: '', status: '' };
    return true;
  }

  window.CivitasMap = { render, mount, refresh, destroy, focusOccurrence, focusArea, getFilters: () => ({ ...state.filters }) };
})();
