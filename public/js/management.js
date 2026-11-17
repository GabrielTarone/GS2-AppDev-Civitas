(function () {
  const moduleLabels = { infraestrutura: 'Infraestrutura', acessibilidade: 'Acessibilidade', meio_ambiente: 'Meio ambiente' };
  const moduleColors = { infraestrutura: '#9A5B00', acessibilidade: '#1E5AA8', meio_ambiente: '#256C4A' };
  const statusNames = ['Pendente', 'Em análise', 'Em andamento', 'Resolvida'];
  const severityNames = ['Baixa', 'Média', 'Alta', 'Crítica'];
  const allCategories = [...new Set(Object.values(CivitasCategories).flat())].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const state = { search: '', module: '', category: '', severity: '', status: '', occurrences: [], stats: null, selected: null, pendingStatus: '', requestId: 0 };
  let documentScrollSnapshot = null;

  // Civitas is assigned by app.js, which is intentionally loaded after this file.
  // Resolve the shared helper when rendering instead of during script evaluation.
  const safe = value => window.Civitas.escapeHTML(value);
  function statusClass(status) { return `status-${String(status || '').toLowerCase().replaceAll(' ', '-')}`; }
  function formatDate(value, time = false) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('pt-BR', time ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(value));
  }

  function lockDocumentScroll() {
    if (documentScrollSnapshot) return;
    const body = document.body;
    documentScrollSnapshot = {
      y: window.scrollY,
      styles: ['position', 'top', 'left', 'right', 'width', 'overflow'].reduce((saved, property) => {
        saved[property] = body.style[property];
        return saved;
      }, {})
    };
    body.style.position = 'fixed';
    body.style.top = `-${documentScrollSnapshot.y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }

  function restoreDocumentScroll() {
    if (!documentScrollSnapshot) return;
    const { y, styles } = documentScrollSnapshot;
    for (const [property, value] of Object.entries(styles)) document.body.style[property] = value;
    documentScrollSnapshot = null;
    window.scrollTo(0, y);
  }

  function render() {
    const moduleOptions = Object.entries(moduleLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
    const categoryOptions = allCategories.map(category => `<option>${safe(category)}</option>`).join('');
    const statusOptions = statusNames.map(status => `<option>${status}</option>`).join('');
    const severityOptions = severityNames.map(severity => `<option>${severity}</option>`).join('');
    return `<div id="management-page">
      <div class="page-heading"><div><p class="eyebrow">CIVITAS · ACOMPANHAMENTO</p><h1>Gerenciamento de ocorrências</h1><p class="page-description">Consulte os registros enviados à Civitas e acompanhe as mudanças de status.</p></div></div>
      <div class="management-stats" id="management-stats" aria-live="polite"><div class="management-stat"><span>Total de ocorrências</span><strong>—</strong></div>${statusNames.map(status => `<div class="management-stat ${statusClass(status)}"><span>${status}</span><strong>—</strong></div>`).join('')}</div>
      <section class="panel management-panel"><div class="panel-heading"><div><h2>Ocorrências cadastradas</h2><p id="management-result-count" aria-live="polite">Carregando registros…</p></div></div>
        <div class="toolbar management-toolbar"><div class="field management-search"><label for="management-search">Pesquisar</label><input id="management-search" type="search" maxlength="120" placeholder="Descrição, categoria ou endereço" value="${safe(state.search)}"></div>
          <div class="field"><label for="management-module">Módulo</label><select id="management-module"><option value="">Todos os módulos</option>${moduleOptions}</select></div>
          <div class="field"><label for="management-category">Categoria</label><select id="management-category"><option value="">Todas as categorias</option>${categoryOptions}</select></div>
          <div class="field"><label for="management-severity">Gravidade</label><select id="management-severity"><option value="">Todas</option>${severityOptions}</select></div>
          <div class="field"><label for="management-status">Status</label><select id="management-status"><option value="">Todos</option>${statusOptions}</select></div>
          <button class="button button-secondary" type="button" data-management-action="clear">Limpar filtros</button>
        </div>
        <p class="management-filter-count" id="management-filter-count" aria-live="polite"></p>
        <div class="table-wrap"><table class="occurrence-table management-table"><thead><tr><th>ID</th><th>Categoria</th><th>Módulo</th><th>Localização</th><th>Gravidade</th><th>Status</th><th>Criação</th><th>Fotos</th><th>Ação</th></tr></thead><tbody id="management-rows"><tr><td colspan="9"><div class="empty-state">Carregando ocorrências…</div></td></tr></tbody></table></div>
      </section>
      <p class="management-disclaimer">As atualizações representam o acompanhamento registrado na Civitas e não confirmam providências oficiais de prefeituras ou órgãos públicos.</p>
    </div>`;
  }

  async function bind() {
    const root = document.querySelector('#management-page');
    if (!root) return;
    const module = root.querySelector('#management-module');
    const category = root.querySelector('#management-category');
    module.value = state.module;
    root.querySelector('#management-severity').value = state.severity;
    root.querySelector('#management-status').value = state.status;
    updateCategories(category, state.module);
    category.value = state.category;
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-management-action]')?.dataset.managementAction;
      if (action === 'clear') {
        state.search = ''; state.module = ''; state.category = ''; state.severity = ''; state.status = '';
        root.querySelector('#management-search').value = '';
        module.value = ''; updateCategories(category, ''); category.value = '';
        root.querySelector('#management-severity').value = '';
        root.querySelector('#management-status').value = '';
        loadData();
        return;
      }
      const detailButton = event.target.closest('[data-management-detail]');
      if (detailButton) openDetails(detailButton.dataset.managementDetail);
    });
    let searchTimer;
    root.querySelector('#management-search').addEventListener('input', event => {
      state.search = event.target.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadData(false), 250);
    });
    module.addEventListener('change', () => {
      state.module = module.value;
      state.category = '';
      updateCategories(category, state.module);
      loadData(false);
    });
    category.addEventListener('change', () => { state.category = category.value; loadData(false); });
    root.querySelector('#management-severity').addEventListener('change', event => { state.severity = event.target.value; loadData(false); });
    root.querySelector('#management-status').addEventListener('change', event => { state.status = event.target.value; loadData(false); });
    bindDetailsDialog();
    await loadData();
  }

  function updateCategories(select, module) {
    const categories = module ? (CivitasCategories[module] || []) : allCategories;
    select.innerHTML = `<option value="">Todas as categorias</option>${categories.map(item => `<option>${safe(item)}</option>`).join('')}`;
  }

  async function loadData(refreshStats = true) {
    const root = document.querySelector('#management-page');
    if (!root) return;
    const requestId = ++state.requestId;
    const query = { all: 'true', search: state.search, module: state.module, category: state.category, severity: state.severity, status: state.status };
    root.setAttribute('aria-busy', 'true');
    try {
      const [occurrences, stats] = await Promise.all([CivitasAPI.getOccurrences(query), refreshStats || !state.stats ? CivitasAPI.getStats() : Promise.resolve(state.stats)]);
      if (requestId !== state.requestId || !root.isConnected) return;
      state.occurrences = occurrences;
      state.stats = stats;
      drawStats(stats);
      drawRows(occurrences);
      root.querySelector('#management-result-count').textContent = `${occurrences.length} ${occurrences.length === 1 ? 'registro encontrado' : 'registros encontrados'}`;
      const filtered = hasFilters() ? occurrences.length : '—';
      root.querySelector('#management-filter-count').textContent = hasFilters() ? `${filtered} resultado(s) com os filtros atuais. Os indicadores acima mostram o total geral.` : '';
    } catch (error) {
      if (requestId !== state.requestId || !root.isConnected) return;
      root.querySelector('#management-rows').innerHTML = `<tr><td colspan="9"><div class="empty-state"><strong>Não foi possível carregar as ocorrências</strong>${safe(error.message)}</div></td></tr>`;
      Civitas.toast(error.message, true);
    } finally { if (requestId === state.requestId && root.isConnected) root.setAttribute('aria-busy', 'false'); }
  }

  function hasFilters() { return Boolean(state.search || state.module || state.category || state.severity || state.status); }

  function drawStats(stats) {
    const items = [['Total de ocorrências', stats.total], ...statusNames.map(status => [status, stats.byStatus?.[status] || 0])];
    document.querySelector('#management-stats').innerHTML = items.map(([label, value], index) => `<div class="management-stat ${index ? statusClass(label) : ''}"><span>${safe(label)}</span><strong>${value}</strong></div>`).join('');
  }

  function drawRows(items) {
    const rows = items.map(item => {
      const moduleColor = moduleColors[item.module] || '#64748B';
      const photos = Array.isArray(item.photos) ? item.photos.length : 0;
      return `<tr><td><code title="${safe(item._id)}">#${safe(String(item._id).slice(-6).toUpperCase())}</code></td><td><span class="table-category">${safe(item.category)}</span></td><td><span class="management-module-chip" style="--module-color:${moduleColor}">${safe(moduleLabels[item.module] || 'Módulo')}</span></td><td>${safe(item.location)}</td><td><span class="severity-dot severity-${safe(String(item.severity).toLowerCase())}"></span>${safe(item.severity)}</td><td><span class="status-badge ${statusClass(item.status)}">${safe(item.status)}</span></td><td>${formatDate(item.createdAt)}</td><td>${photos ? `<span class="photo-count" aria-label="${photos} fotografias">▧ ${photos}</span>` : '<span class="muted-value">—</span>'}</td><td><button type="button" class="button button-secondary button-small" data-management-detail="${safe(item._id)}">Detalhes</button></td></tr>`;
    }).join('');
    document.querySelector('#management-rows').innerHTML = rows || '<tr><td colspan="9"><div class="empty-state"><strong>Nenhuma ocorrência encontrada</strong>Ajuste os filtros ou a pesquisa para ver outros registros.</div></td></tr>';
  }

  async function openDetails(id) {
    const dialog = document.querySelector('#occurrence-detail-dialog');
    const content = dialog.querySelector('#occurrence-detail-content');
    content.innerHTML = '<div class="loading-state">Carregando detalhes…</div>';
    if (!dialog.open) {
      lockDocumentScroll();
      try { dialog.showModal(); }
      catch (error) { restoreDocumentScroll(); throw error; }
    }
    try {
      const data = await CivitasAPI.getOccurrence(id);
      state.selected = data.occurrence;
      renderDetails(data.occurrence);
    } catch (error) {
      content.innerHTML = `<div class="error-banner">${safe(error.message)}</div>`;
    }
  }

  function renderDetails(item) {
    const dialog = document.querySelector('#occurrence-detail-dialog');
    const moduleColor = moduleColors[item.module] || '#64748B';
    const coordinates = item.coordinates && Number.isFinite(item.coordinates.latitude) && Number.isFinite(item.coordinates.longitude);
    const history = Array.isArray(item.statusHistory) ? [...item.statusHistory].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt)) : [];
    const historyHtml = history.length ? `<ol class="status-timeline">${history.map(event => `<li><span class="timeline-dot"></span><div><strong>${event.previousStatus ? `${safe(event.previousStatus)} → ` : ''}${safe(event.newStatus)}</strong><time>${formatDate(event.changedAt, true)}</time>${event.note ? `<p>${safe(event.note)}</p>` : ''}</div></li>`).join('')}</ol>` : '<p class="history-empty">Ainda não há registros de alterações de status para esta ocorrência.</p>';
    dialog.querySelector('#occurrence-detail-content').innerHTML = `<div class="detail-heading"><div><p class="eyebrow">OCORRÊNCIA #${safe(String(item._id).slice(-6).toUpperCase())}</p><h2 id="occurrence-detail-title">${safe(item.category)}</h2><span class="management-module-chip" style="--module-color:${moduleColor}">${safe(moduleLabels[item.module] || 'Módulo')}</span></div><button type="button" class="picker-close" data-detail-close aria-label="Fechar detalhes">×</button></div>
      <div class="detail-grid"><div class="detail-item detail-wide"><span>Descrição</span><p>${safe(item.description)}</p></div><div class="detail-item"><span>Localização</span><p>${safe(item.location)}</p></div><div class="detail-item"><span>Gravidade</span><p>${safe(item.severity)}</p></div><div class="detail-item"><span>Status atual</span><p><span class="status-badge ${statusClass(item.status)}">${safe(item.status)}</span></p></div><div class="detail-item"><span>Data de criação</span><p>${formatDate(item.createdAt, true)}</p></div><div class="detail-item"><span>Última atualização</span><p>${formatDate(item.updatedAt, true)}</p></div>${coordinates ? `<div class="detail-item detail-wide"><span>Coordenadas</span><p>${item.coordinates.latitude.toFixed(6)}, ${item.coordinates.longitude.toFixed(6)}</p><button type="button" class="button button-secondary button-small" data-detail-map>⌖ Ver no mapa</button></div>` : '<div class="detail-item detail-wide"><span>Localização geográfica</span><p>Esta ocorrência não possui coordenadas para exibição no mapa.</p><button type="button" class="button button-secondary button-small" disabled>⌖ Ver no mapa</button></div>'}</div>
      <section class="detail-section"><h3>Fotografias</h3>${CivitasPhotoGallery.render(item._id, item.photos, 'detail-gallery') || '<p class="history-empty">Nenhuma fotografia foi anexada.</p>'}</section>
      <section class="detail-section"><h3>Histórico de status</h3>${historyHtml}</section>
      <section class="detail-section status-update-section"><h3>Atualizar status</h3><form id="status-update-form"><div class="status-update-fields"><label for="status-update-select">Novo status<select id="status-update-select">${statusNames.map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><label for="status-update-note">Observação opcional<textarea id="status-update-note" maxlength="500" rows="2" placeholder="Até 500 caracteres"></textarea></label></div><button type="button" class="button button-primary button-small" data-status-review>Revisar atualização</button><div class="status-confirmation" id="status-confirmation" hidden><p id="status-confirmation-text"></p><button type="button" class="button button-secondary button-small" data-status-cancel>Voltar</button><button type="button" class="button button-primary button-small" data-status-confirm>Confirmar atualização</button></div></form></section>`;
    const contentRoot = dialog.querySelector('#occurrence-detail-content');
    const header = contentRoot.querySelector('.detail-heading');
    const scrollArea = document.createElement('div');
    scrollArea.className = 'occurrence-detail-scroll';
    while (header.nextSibling) scrollArea.append(header.nextSibling);
    contentRoot.replaceChildren(header, scrollArea);
  }

  function bindDetailsDialog() {
    const dialog = document.querySelector('#occurrence-detail-dialog');
    if (!dialog || dialog.dataset.bound) return;
    dialog.dataset.bound = 'true';
    dialog.addEventListener('click', async event => {
      if (event.target === dialog || event.target.closest('[data-detail-close]')) { dialog.close(); return; }
      if (event.target.closest('[data-detail-map]') && state.selected?.coordinates) {
        const occurrence = state.selected;
        dialog.close();
        CivitasMap.focusOccurrence(occurrence);
        Civitas.navigate('map');
        return;
      }
      if (event.target.closest('[data-status-review]')) {
        const status = dialog.querySelector('#status-update-select').value;
        const note = dialog.querySelector('#status-update-note').value.trim();
        if (status === state.selected?.status) { Civitas.toast('Escolha um status diferente do atual.', true); return; }
        state.pendingStatus = status;
        const confirmation = dialog.querySelector('#status-confirmation');
        dialog.querySelector('#status-confirmation-text').textContent = `Confirmar a mudança de “${state.selected.status}” para “${status}”${note ? ' com a observação informada' : ''}?`;
        confirmation.hidden = false;
      }
      if (event.target.closest('[data-status-cancel]')) dialog.querySelector('#status-confirmation').hidden = true;
      if (event.target.closest('[data-status-confirm]')) await confirmStatusUpdate(dialog);
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
    dialog.addEventListener('close', restoreDocumentScroll);
  }

  async function confirmStatusUpdate(dialog) {
    if (!state.selected || !state.pendingStatus) return;
    const confirmButton = dialog.querySelector('[data-status-confirm]');
    confirmButton.disabled = true;
    try {
      const result = await CivitasAPI.updateOccurrenceStatus(state.selected._id, state.pendingStatus, dialog.querySelector('#status-update-note').value.trim());
      state.selected = result.occurrence;
      renderDetails(result.occurrence);
      await loadData();
      Civitas.toast(result.message || 'Status atualizado com sucesso.');
      state.pendingStatus = '';
    } catch (error) {
      Civitas.toast(error.message, true);
      confirmButton.disabled = false;
    }
  }

  window.CivitasManagement = { render, bind, refresh: () => loadData() };
})();
