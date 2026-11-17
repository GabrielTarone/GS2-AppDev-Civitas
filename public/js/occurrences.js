(function () {
  const moduleLabels = { infraestrutura: 'Infraestrutura', acessibilidade: 'Acessibilidade', meio_ambiente: 'Meio ambiente' };
  const categoriesByModule = {
    infraestrutura: ['Buracos nas vias', 'Calçadas danificadas', 'Iluminação pública', 'Sinalização danificada', 'Espaços públicos danificados', 'Outros'],
    acessibilidade: ['Rampas ausentes ou inadequadas', 'Ausência de piso tátil', 'Calçadas obstruídas', 'Travessias inadequadas', 'Acessos públicos inacessíveis', 'Outros'],
    meio_ambiente: ['Resíduos domésticos', 'Entulho e resíduos de construção', 'Resíduos eletrônicos', 'Resíduos orgânicos', 'Outros']
  };

  function tableRows(items) {
    const safe = Civitas.escapeHTML;
    return items.map(item => `<tr><td><span class="table-category">${safe(item.category)}</span><span class="table-description">${safe(item.description)}</span>${CivitasPhotoGallery.render(item._id, item.photos, 'photo-gallery-compact')}</td><td>${safe(item.location)}</td><td><span class="severity-dot severity-${safe(item.severity.toLowerCase())}"></span>${safe(item.severity)}</td><td><span class="status-badge ${Civitas.statusClass(item.status)}">${safe(item.status)}</span></td><td>${Civitas.formatDate(item.createdAt)}</td><td><span class="module-chip">${moduleLabels[item.module]}</span></td></tr>`).join('');
  }

  window.CivitasOccurrences = {
    async render(module = '') {
      const selectedModule = Civitas.currentFilters.module;
      const filters = { module: selectedModule, category: Civitas.currentFilters.category, status: Civitas.currentFilters.status, severity: Civitas.currentFilters.severity };
      const occurrences = await CivitasAPI.getOccurrences(filters);
      const rows = tableRows(occurrences);
      const title = selectedModule ? `Ocorrências de ${moduleLabels[selectedModule]}` : 'Todas as ocorrências';
      const categories = selectedModule ? categoriesByModule[selectedModule] : [...new Set(Object.values(categoriesByModule).flat())].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const moduleOptions = Object.entries(moduleLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
      const categoryOptions = categories.map(category => `<option>${Civitas.escapeHTML(category)}</option>`).join('');
      return `<div class="page-heading"><div><p class="eyebrow">CONSULTA DE REGISTROS</p><h1>${title}</h1><p class="page-description">Consulte os problemas urbanos registrados e acompanhe seu status.</p></div></div>
        <div class="toolbar"><div class="field"><label for="filter-module">Módulo</label><select id="filter-module"><option value="">Todos os módulos</option>${moduleOptions}</select></div><div class="field"><label for="filter-category">Categoria</label><select id="filter-category"><option value="">Todas as categorias</option>${categoryOptions}</select></div><div class="field"><label for="filter-status">Status</label><select id="filter-status"><option value="">Todos os status</option><option>Pendente</option><option>Em análise</option><option>Em andamento</option><option>Resolvida</option></select></div><div class="field"><label for="filter-severity">Gravidade</label><select id="filter-severity"><option value="">Todas as gravidades</option><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select></div><button class="button button-secondary" data-action="clear-filters">Limpar filtros</button><span class="field-help">${occurrences.length} registro(s) nesta consulta</span></div>
        <div class="table-wrap"><table class="occurrence-table"><thead><tr><th>Categoria / descrição</th><th>Localização</th><th>Gravidade</th><th>Status</th><th>Data</th><th>Módulo</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state"><strong>Nenhuma ocorrência encontrada</strong>Quando houver registros correspondentes, eles serão exibidos aqui.</div></td></tr>`}</tbody></table></div>`;
    }
  };
})();
