(function () {
  const modules = [
    { id: 'infraestrutura', name: 'Infraestrutura urbana', detail: 'Vias, calçadas, iluminação e espaços públicos', symbol: '⌁' },
    { id: 'acessibilidade', name: 'Acessibilidade', detail: 'Barreiras e circulação acessível', symbol: '♿' },
    { id: 'meio_ambiente', name: 'Meio ambiente', detail: 'Resíduos e conservação urbana', symbol: '♧' }
  ];

  function statCard(label, value, foot, accent = false) {
    return `<article class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${accent ? 'stat-accent' : ''}">${value}</div><div class="stat-foot">${foot}</div></article>`;
  }

  function recentRow(item) {
    const safe = Civitas.escapeHTML;
    return `<div class="recent-row"><div class="recent-main"><strong>${safe(item.category)}</strong><span>${safe(item.location)} · ${Civitas.formatDate(item.createdAt)}</span>${CivitasPhotoGallery.render(item._id, item.photos, 'photo-gallery-compact')}</div><div class="recent-side"><span class="status-badge ${Civitas.statusClass(item.status)}">${safe(item.status)}</span></div></div>`;
  }

  window.CivitasDashboard = {
    async render() {
      const [stats, recent] = await Promise.all([CivitasAPI.getStats(), CivitasAPI.getOccurrences()]);
      const entries = modules.map(module => `<a href="#${module.id}" class="module-card" data-view="module" data-module="${module.id}"><span class="module-icon">${module.symbol}</span><span class="module-info"><strong>${module.name}</strong><span>${module.detail}</span></span><span class="module-count">${stats.byModule[module.id] || 0}</span><span class="module-arrow">›</span></a>`).join('');
      const pending = stats.byStatus['Pendente'] || 0;
      const resolved = stats.byStatus['Resolvida'] || 0;
      const recentHtml = recent.slice(0, 4).map(recentRow).join('') || `<div class="empty-state"><strong>Nenhuma ocorrência cadastrada</strong>Os registros enviados aparecerão aqui.</div>`;
      return `<div class="page-heading"><div><p class="eyebrow">CIVITAS · PARTICIPAÇÃO CIDADÃ</p><h1>Dashboard geral</h1><p class="page-description">Acompanhe os registros e as necessidades identificadas nos espaços públicos da cidade.</p></div></div>
        <div class="stats-grid">${statCard('TOTAL DE OCORRÊNCIAS', stats.total, 'Registros cadastrados na plataforma')}${statCard('PENDENTES', pending, 'Aguardando encaminhamento', true)}${statCard('RESOLVIDAS', resolved, 'Marcadas como concluídas')}${statCard('MÓDULOS ATIVOS', '3', 'Infraestrutura, acessibilidade e ambiente')}</div>
        <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Visão por módulo</h2><p>Ocorrências registradas em cada área</p></div></div><div class="module-list">${entries}</div></section>
        <section class="panel"><div class="panel-heading"><div><h2>Registros recentes</h2><p>Últimas ocorrências cadastradas</p></div><a href="#ocorrencias" class="text-link" data-view="occurrences">Ver todos →</a></div><div class="recent-list">${recentHtml}</div></section></div>
        <div class="panel"><div class="panel-heading"><div><h2>Uma cidade melhor começa com a participação de todos</h2><p>Registre um problema urbano e ajude a tornar visíveis as necessidades da comunidade.</p></div></div><div class="chart-list">${Civitas.chartRows('Ocorrências por gravidade', stats.bySeverity)}</div></div>`;
    }
  };
})();
