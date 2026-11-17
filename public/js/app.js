(function () {
  const moduleDetails = {
    infraestrutura: { title: 'Infraestrutura urbana', desc: 'Registros sobre vias, calçadas, iluminação, sinalização e espaços públicos.' },
    acessibilidade: { title: 'Acessibilidade', desc: 'Barreiras que dificultam a circulação de pessoas com deficiência ou mobilidade reduzida.' },
    meio_ambiente: { title: 'Meio ambiente', desc: 'Pontos de descarte irregular, acúmulo de lixo, entulho e outros problemas ambientais.' }
  };
  const severityOrder = ['Baixa', 'Média', 'Alta', 'Crítica'];
  const currentFilters = { module: '', category: '', status: '', severity: '' };
  let current = { view: 'dashboard', module: '' };
  let formReturn = { view: 'dashboard', module: '' };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function formatDate(value) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value)); }
  function statusClass(value) { return `status-${String(value).toLowerCase().replaceAll(' ', '-')}`; }
  function chartRows(label, data) {
    const keys = label.includes('gravidade') ? severityOrder : Object.keys(data);
    const max = Math.max(1, ...keys.map(key => data[key] || 0));
    return `<div class="panel-heading"><div><h2>${label}</h2><p>Distribuição dos registros consultados</p></div></div>${keys.map(key => `<div class="chart-row"><span>${escapeHTML(key)}</span><div class="chart-track"><div class="chart-fill" style="width:${Math.round((data[key] || 0) / max * 100)}%"></div></div><span class="chart-count">${data[key] || 0}</span></div>`).join('')}`;
  }
  function toast(message, error = false) {
    const element = document.createElement('div');
    element.className = `toast${error ? ' error' : ''}`;
    element.textContent = message;
    document.querySelector('#toast-region').append(element);
    window.setTimeout(() => element.remove(), 4500);
  }

  async function renderModule(module) {
    const detail = moduleDetails[module];
    const [stats, occurrences] = await Promise.all([CivitasAPI.getStats(module), CivitasAPI.getOccurrences({ module })]);
    const categoryData = stats.byCategory;
    const categories = Object.keys(categoryData).length ? categoryData : { 'Ainda sem registros': 0 };
    const severityData = stats.bySeverity;
    const pending = stats.byStatus['Pendente'] || 0;
    return `<div class="page-heading"><div><p class="eyebrow">MÓDULO DE MONITORAMENTO</p><h1>${detail.title}</h1><p class="page-description">${detail.desc}</p></div><div class="module-page-actions"><button class="button button-secondary" data-action="show-module-map" data-module="${module}">⌖ Ver no Mapa</button><button class="button button-primary" data-action="new-occurrence" data-module="${module}">＋ Nova ocorrência</button></div></div>
      <div class="stats-grid">${statCard('TOTAL DO MÓDULO', stats.total, 'Problemas registrados', true)}${statCard('PENDENTES', pending, 'Aguardando encaminhamento')}${statCard('RESOLVIDAS', stats.byStatus['Resolvida'] || 0, 'Marcadas como concluídas')}${statCard('EM ANDAMENTO', stats.byStatus['Em andamento'] || 0, 'Em acompanhamento')}</div>
      <div class="module-lower-grid"><section class="panel"><div class="chart-list">${chartRows('Distribuição por categoria', categories)}</div></section><section class="panel"><div class="chart-list">${chartRows('Distribuição por gravidade', severityData)}</div></section></div>
      <section class="panel" style="margin-top:15px"><div class="panel-heading"><div><h2>Registros recentes</h2><p>Ocorrências deste módulo</p></div><a href="#ocorrencias" class="text-link" data-view="occurrences" data-module="${module}">Ver todos →</a></div><div class="recent-list">${occurrences.slice(0, 3).map(item => `<div class="recent-row"><div class="recent-main"><strong>${escapeHTML(item.category)}</strong><span>${escapeHTML(item.location)} · ${formatDate(item.createdAt)}</span>${CivitasPhotoGallery.render(item._id, item.photos, 'photo-gallery-compact')}</div><div class="recent-side"><span class="status-badge ${statusClass(item.status)}">${escapeHTML(item.status)}</span></div></div>`).join('') || `<div class="empty-state"><strong>Nenhuma ocorrência cadastrada neste módulo</strong>Os indicadores serão preenchidos conforme a comunidade enviar registros.</div>`}</div></section>`;
  }

  function statCard(label, value, foot, accent = false) {
    return `<article class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${accent ? 'stat-accent' : ''}">${value}</div><div class="stat-foot">${foot}</div></article>`;
  }

  async function render() {
    const content = document.querySelector('#app-content');
    content.setAttribute('aria-busy', 'true');
    CivitasNavigation.update(current.view, current.module);
    window.CivitasAnalytics?.unmount();
    CivitasMap.destroy();
    if (current.view !== 'form') CivitasLocationPicker.destroy();
    try {
      if (current.view === 'form') content.innerHTML = CivitasForm.render(current.module);
      else if (current.view === 'dashboard') content.innerHTML = await CivitasDashboard.render();
      else if (current.view === 'module') content.innerHTML = await renderModule(current.module);
      else if (current.view === 'management') { content.innerHTML = CivitasManagement.render(); await CivitasManagement.bind(); }
      else if (current.view === 'analytics') { content.innerHTML = CivitasAnalytics.render(); await CivitasAnalytics.bind(); }
      else if (current.view === 'map') {
        content.innerHTML = CivitasMap.render(current.module);
        await CivitasMap.mount(current.module);
      }
      else content.innerHTML = await CivitasOccurrences.render(current.module);
      if (current.view === 'form') { CivitasForm.bind(); CivitasLocationPicker.bind(); }
      if (current.view === 'occurrences') {
        document.querySelector('#filter-module').value = currentFilters.module;
        document.querySelector('#filter-category').value = currentFilters.category;
        document.querySelector('#filter-status').value = currentFilters.status;
        document.querySelector('#filter-severity').value = currentFilters.severity;
      }
    } catch (error) {
      content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">CIVITAS</p><h1>Não foi possível carregar os dados</h1><p class="page-description">${escapeHTML(error.message)}</p></div></div><div class="error-banner">Os indicadores não foram simulados. Verifique a conexão com o servidor e o MongoDB e tente novamente.</div><button class="button button-primary" data-action="reload">Tentar novamente</button>`;
    } finally { content.setAttribute('aria-busy', 'false'); }
  }

  function navigate(view, module = '') {
    if (view === 'form' && current.view !== 'form') formReturn = { view: current.view, module: current.module };
    current = { view, module };
    currentFilters.module = view === 'occurrences' ? module : '';
    currentFilters.category = '';
    currentFilters.status = '';
    currentFilters.severity = '';
    const hash = view === 'module' ? module : view === 'map' ? (module ? `map/${module}` : 'map') : view === 'occurrences' ? (module ? `ocorrencias/${module}` : 'ocorrencias') : view === 'form' ? (module ? `novo/${module}` : 'novo') : view === 'management' ? 'gerenciamento' : view === 'analytics' ? 'analises' : 'dashboard';
    if (window.location.hash !== `#${hash}`) window.location.hash = hash;
    else render();
  }

  function completeOccurrence(payload) {
    if (formReturn.view === 'map') navigate('map', formReturn.module);
    else if (formReturn.view === 'module') navigate('module', formReturn.module);
    else navigate('occurrences', payload.module);
  }

  window.Civitas = { escapeHTML, formatDate, statusClass, chartRows, toast, navigate, completeOccurrence, currentFilters };
  function setPlatformStatus(online) {
    const element = document.querySelector('#platform-status');
    if (!element) return;
    element.classList.toggle('is-online', online);
    element.classList.toggle('is-offline', !online);
    element.querySelector('span').textContent = online ? 'Plataforma online' : 'Plataforma offline';
    element.setAttribute('aria-label', online ? 'Plataforma online' : 'Plataforma offline');
  }
  async function checkPlatformHealth() {
    try { const health = await CivitasAPI.getHealth(); setPlatformStatus(health.status === 'online'); }
    catch { setPlatformStatus(false); }
  }
  window.addEventListener('offline', () => setPlatformStatus(false));
  window.addEventListener('online', checkPlatformHealth);
  checkPlatformHealth();
  window.setInterval(checkPlatformHealth, 45000);
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-view]');
    if (link) { event.preventDefault(); navigate(link.dataset.view, link.dataset.module || ''); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'new-occurrence') {
      const module = action.dataset.module || (['module', 'occurrences'].includes(current.view) ? current.module : current.view === 'map' ? CivitasMap.getFilters().module : '');
      navigate('form', module);
    }
    if (action.dataset.action === 'show-module-map') navigate('map', action.dataset.module || '');
    if (action.dataset.action === 'back') navigate(current.module ? 'module' : 'dashboard', current.module);
    if (action.dataset.action === 'reload') render();
    if (action.dataset.action === 'clear-filters') { currentFilters.module = current.module || ''; currentFilters.category = ''; currentFilters.status = ''; currentFilters.severity = ''; render(); }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'filter-module') { currentFilters.module = event.target.value; currentFilters.category = ''; }
    if (event.target.id === 'filter-category') currentFilters.category = event.target.value;
    if (event.target.id === 'filter-status') currentFilters.status = event.target.value;
    if (event.target.id === 'filter-severity') currentFilters.severity = event.target.value;
    if (event.target.id?.startsWith('filter-')) render();
  });
  window.addEventListener('hashchange', () => { current = CivitasNavigation.readHash(); currentFilters.module = current.view === 'occurrences' ? current.module : ''; render(); });
  document.querySelector('#current-year').textContent = new Date().getFullYear();
  current = CivitasNavigation.readHash();
  currentFilters.module = current.view === 'occurrences' ? current.module : '';
  render();
})();
