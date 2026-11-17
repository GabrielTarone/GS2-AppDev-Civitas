(function () {
  const moduleLabels = { infraestrutura: 'Infraestrutura urbana', acessibilidade: 'Acessibilidade', meio_ambiente: 'Meio ambiente' };
  const moduleColors = { infraestrutura: '#9A5B00', acessibilidade: '#1E5AA8', meio_ambiente: '#256C4A' };
  const statusLabels = ['Pendente', 'Em análise', 'Em andamento', 'Resolvida'];
  const categories = window.CivitasCategories;
  const state = { data: null, requestId: 0, root: null, mapMounted: false };

  const safe = value => Civitas.escapeHTML(value);
  const number = value => new Intl.NumberFormat('pt-BR').format(value || 0);
  const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '';

  function render() {
    const moduleOptions = Object.entries(moduleLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    const categoryOptions = [...new Set(Object.values(categories).flat())].map(value => `<option>${safe(value)}</option>`).join('');
    const statusOptions = statusLabels.map(value => `<option>${value}</option>`).join('');
    return `<div class="analytics-page" id="analytics-page" aria-busy="true">
      <header class="page-heading analytics-heading"><div><p class="eyebrow">CIVITAS · INTELIGÊNCIA URBANA</p><h1>Análises e Estatísticas</h1><p class="page-description">Explore padrões, concentração geográfica e evolução das ocorrências registradas na Civitas.</p></div></header>
      <section class="panel analytics-filters" aria-labelledby="analytics-filters-title"><div class="panel-heading"><div><h2 id="analytics-filters-title">Filtros da análise</h2><p>Os filtros são aplicados em conjunto a todos os indicadores e visualizações.</p></div><button type="button" class="button button-secondary" data-analytics-action="clear">Limpar filtros</button></div>
        <div class="analytics-filter-grid"><div class="field"><label for="analytics-module">Módulo</label><select id="analytics-module"><option value="">Todos os módulos</option>${moduleOptions}</select></div>
          <div class="field"><label for="analytics-period">Período</label><select id="analytics-period"><option value="7d">Últimos 7 dias</option><option value="30d" selected>Últimos 30 dias</option><option value="90d">Últimos 90 dias</option><option value="all">Todo o período</option><option value="custom">Intervalo personalizado</option></select></div>
          <div class="field"><label for="analytics-severity">Gravidade</label><select id="analytics-severity"><option value="">Todas</option>${['Baixa', 'Média', 'Alta', 'Crítica'].map(value => `<option>${value}</option>`).join('')}</select></div>
          <div class="field"><label for="analytics-status">Status atual</label><select id="analytics-status"><option value="">Todos</option>${statusOptions}</select></div>
          <div class="field"><label for="analytics-category">Categoria</label><select id="analytics-category"><option value="">Todas as categorias</option>${categoryOptions}</select></div>
        </div>
        <div class="analytics-custom-range" id="analytics-custom-range" hidden><div class="field"><label for="analytics-start-date">De</label><input type="date" id="analytics-start-date"></div><div class="field"><label for="analytics-end-date">Até</label><input type="date" id="analytics-end-date"></div><p id="analytics-date-error" role="alert" hidden></p></div>
        <p class="analytics-period-note" id="analytics-period-note">Período padrão: últimos 30 dias.</p>
      </section>
      <div class="analytics-error error-banner" id="analytics-error" role="alert" hidden></div>
      <div class="analytics-empty empty-state" id="analytics-empty" hidden><strong>Nenhuma ocorrência corresponde aos filtros</strong>Amplie o período ou ajuste um ou mais filtros.</div>

      <section aria-labelledby="analytics-summary-title"><div class="analytics-section-heading"><div><p class="eyebrow">RESUMO ESTATÍSTICO</p><h2 id="analytics-summary-title">Indicadores do período</h2><p>As quantidades abaixo usam a data de cadastro; status representam o estado atual desses registros.</p></div></div>
        <div class="analytics-stat-grid" id="analytics-stats"><article class="analytics-stat"><span>Total no período</span><strong>—</strong><small>Ocorrências cadastradas</small></article></div>
      </section>

      <section class="panel analytics-panel" aria-labelledby="analytics-map-title"><div class="panel-heading"><div><p class="eyebrow">CONCENTRAÇÃO GEOGRÁFICA</p><h2 id="analytics-map-title">Mapa de calor</h2><p>A intensidade representa o número de registros próximos, sem ponderar gravidade ou status.</p></div><div id="analytics-layer-control" class="analytics-layer-control"></div></div>
        <div class="analytics-map-controls"><div class="field"><label for="analytics-map-module">Módulo no mapa</label><select id="analytics-map-module"><option value="">Todos os módulos</option>${moduleOptions}</select></div><div class="field"><label for="analytics-map-period">Período no mapa</label><select id="analytics-map-period"><option value="7d">Últimos 7 dias</option><option value="30d" selected>Últimos 30 dias</option><option value="90d">Últimos 90 dias</option><option value="all">Todo o período</option><option value="custom">Intervalo personalizado</option></select></div><div class="field"><label for="analytics-cell-meters">Célula aproximada</label><select id="analytics-cell-meters"><option value="100">100 m</option><option value="250" selected>250 m</option><option value="500">500 m</option><option value="1000">1 km</option></select></div></div>
        <p class="analytics-map-summary" id="analytics-map-summary" aria-live="polite">Carregando registros geolocalizados…</p>
        <div class="analytics-map-frame"><div id="analytics-heatmap" class="analytics-heatmap" role="application" aria-label="Mapa de calor interativo das ocorrências geolocalizadas"></div><div class="analytics-heat-legend" aria-label="Legenda de intensidade"><strong>Concentração</strong><span>Menor</span><i></i><span>Maior</span></div></div>
        <p class="analytics-unlocated" id="analytics-unlocated" hidden></p>
        <p class="analytics-method-note">As coordenadas são agrupadas em células aproximadas configuráveis. Elas indicam concentração local e não representam bairros oficiais.</p>
      </section>

      <section class="panel analytics-panel" aria-labelledby="analytics-areas-title"><div class="panel-heading"><div><p class="eyebrow">RANKING GEOGRÁFICO</p><h2 id="analytics-areas-title">Áreas de concentração</h2><p>Centros aproximados calculados a partir das coordenadas existentes.</p></div></div><div class="analytics-area-list" id="analytics-areas"><p class="analytics-chart-empty">Carregando áreas de concentração…</p></div></section>

      <section class="panel analytics-panel" aria-labelledby="analytics-trend-title"><div class="panel-heading"><div><p class="eyebrow">EVOLUÇÃO TEMPORAL</p><h2 id="analytics-trend-title">Novos registros ao longo do tempo</h2><p id="analytics-timeline-caption">Agrupamento diário, semanal ou mensal conforme o intervalo.</p></div></div><div class="analytics-chart-wrap analytics-chart-trend"><canvas id="analytics-chart-trend" role="img" aria-label="Evolução de novos registros por módulo"></canvas><p class="analytics-chart-empty" hidden>Sem ocorrências para exibir neste período.</p></div></section>

      <section aria-labelledby="analytics-distribution-title"><div class="analytics-section-heading"><div><p class="eyebrow">COMPARAÇÃO ENTRE MÓDULOS</p><h2 id="analytics-distribution-title">Distribuição dos registros</h2><p>Contagens baseadas nas ocorrências que correspondem aos filtros.</p></div></div>
        <div class="analytics-chart-grid"><article class="panel analytics-chart-panel"><h3>Por módulo</h3><div class="analytics-chart-wrap"><canvas id="analytics-chart-modules" role="img" aria-label="Distribuição de ocorrências entre módulos"></canvas><p class="analytics-chart-empty" hidden>Sem dados para exibir.</p></div></article>
          <article class="panel analytics-chart-panel"><h3>Categorias mais frequentes</h3><div class="analytics-chart-wrap analytics-chart-bars"><canvas id="analytics-chart-categories" role="img" aria-label="Categorias com mais ocorrências"></canvas><p class="analytics-chart-empty" hidden>Sem dados para exibir.</p></div></article>
          <article class="panel analytics-chart-panel"><h3>Por gravidade</h3><div class="analytics-chart-wrap"><canvas id="analytics-chart-severity" role="img" aria-label="Distribuição por gravidade"></canvas><p class="analytics-chart-empty" hidden>Sem dados para exibir.</p></div></article>
          <article class="panel analytics-chart-panel"><h3>Por status atual</h3><div class="analytics-chart-wrap"><canvas id="analytics-chart-status" role="img" aria-label="Distribuição pelo status atual"></canvas><p class="analytics-chart-empty" hidden>Sem dados para exibir.</p></div></article>
        </div>
      </section>

      <section class="panel analytics-panel" aria-labelledby="analytics-recurring-title"><div class="panel-heading"><div><p class="eyebrow">PROBLEMAS RECORRENTES</p><h2 id="analytics-recurring-title">Ocorrências recorrentes no mesmo local</h2><p>Proximidade espacial ou endereço normalizado indica repetição de registros, não identidade comprovada do problema.</p></div></div><div class="analytics-area-list" id="analytics-recurrences"><p class="analytics-chart-empty">Carregando ocorrências recorrentes…</p></div></section>

      <section class="panel analytics-panel" aria-labelledby="analytics-resolution-title"><div class="panel-heading"><div><p class="eyebrow">TEMPO ATÉ RESOLUÇÃO</p><h2 id="analytics-resolution-title">Alterações registradas na Civitas</h2><p>Tempo entre o cadastro e a primeira transição documentada para “Resolvida”. Não confirma providências oficiais.</p></div></div>
        <div class="analytics-resolution-summary" id="analytics-resolution-summary"><div><span>Média</span><strong>—</strong></div><div><span>Mediana</span><strong>—</strong></div><div><span>Amostras calculáveis</span><strong>—</strong></div><div><span>Sem histórico confiável</span><strong>—</strong></div></div>
        <div class="analytics-chart-grid"><article class="analytics-chart-panel"><h3>Tempo médio por módulo</h3><div class="analytics-chart-wrap"><canvas id="analytics-chart-resolution-modules" role="img" aria-label="Tempo médio até resolução por módulo"></canvas><p class="analytics-chart-empty" hidden>Não há histórico suficiente para calcular tempos.</p></div></article><article class="analytics-chart-panel"><h3>Categorias com amostras suficientes</h3><div class="analytics-chart-wrap analytics-chart-bars"><canvas id="analytics-chart-resolution-categories" role="img" aria-label="Tempo até resolução por categoria"></canvas><p class="analytics-chart-empty" hidden>São necessárias pelo menos duas resoluções calculáveis por categoria.</p></div></article></div>
        <p class="analytics-method-note">O cálculo usa exclusivamente statusHistory.changedAt e createdAt. Registros antigos sem histórico ou com datas inconsistentes não recebem tempos estimados.</p>
      </section>
    </div>`;
  }

  function updateCategories(module) {
    const select = document.querySelector('#analytics-category');
    const options = module ? categories[module] || [] : [...new Set(Object.values(categories).flat())];
    const selected = select.value;
    select.innerHTML = `<option value="">Todas as categorias</option>${options.map(category => `<option>${safe(category)}</option>`).join('')}`;
    if (options.includes(selected)) select.value = selected;
  }

  function localDateStart(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  function collectFilters() {
    const period = document.querySelector('#analytics-period').value;
    const filters = {
      module: document.querySelector('#analytics-module').value,
      category: document.querySelector('#analytics-category').value,
      severity: document.querySelector('#analytics-severity').value,
      status: document.querySelector('#analytics-status').value,
      period,
      cellMeters: document.querySelector('#analytics-cell-meters').value
    };
    if (period === 'all') return { filters };
    let start;
    let end;
    if (period === 'custom') {
      const startValue = document.querySelector('#analytics-start-date').value;
      const endValue = document.querySelector('#analytics-end-date').value;
      if (!startValue || !endValue) return { error: 'Selecione as duas datas do intervalo personalizado.' };
      start = localDateStart(startValue);
      end = localDateStart(endValue);
      if (end < start) return { error: 'A data final deve ser igual ou posterior à data inicial.' };
      end.setDate(end.getDate() + 1);
    } else {
      const days = Number(period.slice(0, -1));
      const today = new Date();
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    }
    filters.start = start.toISOString();
    filters.end = end.toISOString();
    return { filters };
  }

  async function bind() {
    const root = document.querySelector('#analytics-page');
    if (!root) return;
    state.root = root;
    const category = root.querySelector('#analytics-category');
    category.value = '';
    root.querySelector('#analytics-custom-range').hidden = true;
    try {
      await CivitasBaseLayers.load();
      if (!root.isConnected) return;
      root.querySelector('#analytics-layer-control').innerHTML = CivitasBaseLayers.renderControl(CivitasBaseLayers.getPreference(), 'analytics-map-layer-control');
    } catch { }
    root.addEventListener('change', event => {
      const target = event.target;
      if (target.id === 'analytics-module') updateCategories(target.value);
      if (target.id === 'analytics-module') root.querySelector('#analytics-map-module').value = target.value;
      if (target.id === 'analytics-map-module') root.querySelector('#analytics-module').value = target.value;
      if (target.id === 'analytics-period') {
        root.querySelector('#analytics-map-period').value = target.value;
        root.querySelector('#analytics-custom-range').hidden = target.value !== 'custom';
      }
      if (target.id === 'analytics-map-period') {
        root.querySelector('#analytics-period').value = target.value;
        root.querySelector('#analytics-custom-range').hidden = target.value !== 'custom';
      }
      if (['analytics-module', 'analytics-map-module', 'analytics-period', 'analytics-map-period', 'analytics-start-date', 'analytics-end-date', 'analytics-severity', 'analytics-status', 'analytics-category', 'analytics-cell-meters'].includes(target.id)) loadData();
    });
    root.addEventListener('click', event => {
      const layerButton = event.target.closest('#analytics-map-layer-control [data-map-layer]');
      if (layerButton && !layerButton.disabled) {
        const preference = CivitasAnalyticsMap.setBaseLayer(layerButton.dataset.mapLayer);
        root.querySelector('#analytics-layer-control').innerHTML = CivitasBaseLayers.renderControl(preference, 'analytics-map-layer-control');
      }
      const action = event.target.closest('[data-analytics-action]')?.dataset.analyticsAction;
      if (action === 'clear') {
        root.querySelector('#analytics-module').value = '';
        root.querySelector('#analytics-map-module').value = '';
        root.querySelector('#analytics-period').value = '30d';
        root.querySelector('#analytics-map-period').value = '30d';
        root.querySelector('#analytics-severity').value = '';
        root.querySelector('#analytics-status').value = '';
        root.querySelector('#analytics-cell-meters').value = '250';
        root.querySelector('#analytics-custom-range').hidden = true;
        root.querySelector('#analytics-start-date').value = '';
        root.querySelector('#analytics-end-date').value = '';
        updateCategories('');
        root.querySelector('#analytics-category').value = '';
        loadData();
      }
      const focusButton = event.target.closest('[data-analytics-area-index]');
      if (focusButton) focusArea(Number(focusButton.dataset.analyticsAreaIndex), Boolean(focusButton.closest('#analytics-recurrences')));
      if (action === 'retry') loadData();
    });
    await loadData();
  }

  function updatePeriodNote(filters) {
    const label = filters.period === 'all' ? 'Todo o histórico disponível.' : filters.period === 'custom'
      ? `Intervalo selecionado: ${dateLabel(filters.start)} a ${dateLabel(new Date(new Date(filters.end).getTime() - 1))}.`
      : `Período: últimos ${filters.period.slice(0, -1)} dias, considerando dias locais em America/Sao_Paulo.`;
    document.querySelector('#analytics-period-note').textContent = label;
  }

  function setLoading(loading) {
    const root = state.root;
    if (!root) return;
    root.setAttribute('aria-busy', String(loading));
    if (loading) {
      root.querySelector('#analytics-error').hidden = true;
      root.querySelector('#analytics-empty').hidden = true;
    }
  }

  async function loadData() {
    const root = state.root;
    if (!root?.isConnected) return;
    const requestId = ++state.requestId;
    const collected = collectFilters();
    if (collected.error) {
      root.querySelector('#analytics-date-error').textContent = collected.error;
      root.querySelector('#analytics-date-error').hidden = false;
      return;
    }
    root.querySelector('#analytics-date-error').hidden = true;
    setLoading(true);
    updatePeriodNote({ ...collected.filters, period: collected.filters.period });
    try {
      const data = await CivitasAPI.getAnalytics(collected.filters);
      if (requestId !== state.requestId || !root.isConnected) return;
      state.data = data;
      renderStats(data);
      renderAreas(data.areas);
      renderRecurrences(data.recurrences);
      renderResolution(data.resolution);
      root.querySelector('#analytics-map-summary').textContent = data.heatPoints.length
        ? `${number(data.summary.geolocated)} ocorrências geolocalizadas · ${number(data.heatPoints.length)} pontos no mapa`
        : 'Nenhuma ocorrência geolocalizada corresponde aos filtros. O mapa mostra a área de referência da Civitas.';
      root.querySelector('#analytics-unlocated').hidden = data.summary.withoutCoordinates === 0;
      root.querySelector('#analytics-unlocated').textContent = `${number(data.summary.withoutCoordinates)} registro(s) deste recorte não possuem coordenadas geográficas válidas. Eles participam dos indicadores e ficam fora do mapa de calor.`;
      root.querySelector('#analytics-empty').hidden = data.summary.total > 0;
      root.querySelector('#analytics-timeline-caption').textContent = `Agrupamento ${data.timelineUnit === 'day' ? 'diário' : data.timelineUnit === 'week' ? 'semanal' : 'mensal'} no fuso ${data.filters.timezone}. Períodos vazios do intervalo aparecem com zero.`;
      CivitasAnalyticsCharts.render(data);
      try {
        if (!state.mapMounted) {
          await CivitasAnalyticsMap.mount(root.querySelector('#analytics-heatmap'), data.heatPoints, data.areas);
          if (requestId !== state.requestId || !root.isConnected) { CivitasAnalyticsMap.destroy(); return; }
          state.mapMounted = true;
        } else CivitasAnalyticsMap.update(data.heatPoints, data.areas);
      } catch (error) {
        root.querySelector('#analytics-map-summary').textContent = error.message || 'Não foi possível carregar o mapa de calor.';
      }
    } catch (error) {
      if (requestId !== state.requestId || !root.isConnected) return;
      root.querySelector('#analytics-error').innerHTML = `${safe(error.message)} <button type="button" class="button button-secondary button-small" data-analytics-action="retry">Tentar novamente</button>`;
      root.querySelector('#analytics-error').hidden = false;
    } finally {
      if (requestId === state.requestId && root.isConnected) setLoading(false);
    }
  }

  function renderStats(data) {
    const summary = data.summary;
    const average = data.resolution.averageHours;
    const averageLabel = average === null ? '—' : average < 24 ? `${(average).toFixed(1).replace('.', ',')} h` : `${(average / 24).toFixed(1).replace('.', ',')} dias`;
    const values = [
      ['Total no período', summary.total, 'Cadastros dentro do período selecionado'],
      ['Pendentes', summary.pending, 'Status atual dos registros filtrados'],
      ['Em andamento', summary.inProgress, 'Status atual dos registros filtrados'],
      ['Resolvidas', summary.resolved, 'Status atual dos registros filtrados'],
      ['Tempo médio até resolução', averageLabel, `${number(data.resolution.count)} registro(s) com histórico calculável`],
      ['Locais recorrentes', summary.recurrentPlaces, 'Agrupamentos com pelo menos dois registros']
    ];
    document.querySelector('#analytics-stats').innerHTML = values.map(([label, value, caption]) => `<article class="analytics-stat"><span>${label}</span><strong>${typeof value === 'number' ? number(value) : safe(value)}</strong><small>${caption}</small></article>`).join('');
  }

  function locationMarkup(item, index, includeMap = true) {
    const center = item.center;
    const coords = center ? `${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}` : safe(item.location || 'Endereço normalizado');
    const modules = Object.entries(item.byModule || {}).filter(([, count]) => count).map(([module, count]) => `${safe(moduleLabels[module] || module)} ${number(count)}`).join(' · ');
    const categoryText = (item.categories || []).slice(0, 3).map(category => `${safe(category.category)} (${number(category.count)})`).join(', ');
    const action = includeMap && center ? `<button type="button" class="button button-secondary button-small" data-analytics-area-index="${index}">Ver no mapa</button>` : '';
    return `<article class="analytics-area-item"><div><strong>${number(item.count)} ocorrências</strong><span>${center ? `Centro aproximado: ${coords} · célula ~${number(item.approximateCellMeters)} m` : `Endereço textual normalizado: ${coords}`}</span><small>${modules || 'Módulos sem registros'} · ${number(item.pending)} pendentes · ${number(item.resolved)} resolvidas</small><small>Categorias: ${categoryText || 'sem dados'}</small></div>${action}</article>`;
  }

  function renderAreas(areas) {
    const target = document.querySelector('#analytics-areas');
    target.innerHTML = areas.length ? areas.slice(0, 20).map((area, index) => locationMarkup(area, index)).join('') : '<p class="analytics-chart-empty">Não há coordenadas válidas suficientes para formar áreas neste recorte.</p>';
  }

  function renderRecurrences(items) {
    const target = document.querySelector('#analytics-recurrences');
    target.innerHTML = items.length ? items.slice(0, 20).map((item, index) => locationMarkup(item, index)).join('') : '<p class="analytics-chart-empty">Nenhum agrupamento atingiu o critério de recorrência (dois ou mais registros no mesmo agrupamento).</p>';
  }

  function renderResolution(resolution) {
    const average = resolution.averageHours === null ? '—' : `${(resolution.averageHours / 24).toFixed(1).replace('.', ',')} dias`;
    const median = resolution.count < 5 || resolution.medianHours === null ? 'Dados insuficientes' : `${(resolution.medianHours / 24).toFixed(1).replace('.', ',')} dias`;
    const values = [average, median, number(resolution.count), number(resolution.withoutReliableHistory)];
    document.querySelector('#analytics-resolution-summary').innerHTML = ['Média', 'Mediana (mínimo 5 amostras)', 'Amostras calculáveis', 'Resolvidas sem histórico confiável'].map((label, index) => `<div><span>${label}</span><strong>${safe(values[index])}</strong></div>`).join('') + `<p class="analytics-method-note">${number(resolution.notResolved)} registro(s) ainda não resolvido(s) também ficam fora do cálculo.</p>`;
  }

  function focusArea(index, recurrence = false) {
    const area = recurrence ? state.data?.recurrences?.[index] : state.data?.areas?.[index];
    if (!area?.center) return;
    if (CivitasMap.focusArea(area.center)) Civitas.navigate('map');
  }

  function unmount() {
    state.requestId += 1;
    state.root = null;
    state.mapMounted = false;
    CivitasAnalyticsCharts.destroy();
    CivitasAnalyticsMap.destroy();
  }

  window.CivitasAnalytics = { render, bind, unmount };
})();
