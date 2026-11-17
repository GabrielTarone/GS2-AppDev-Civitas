(function () {
  window.CivitasNavigation = {
    readHash() {
      const value = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (value.startsWith('map/')) {
        const module = value.split('/')[1] || '';
        return { view: 'map', module: ['infraestrutura', 'acessibilidade', 'meio_ambiente'].includes(module) ? module : '' };
      }
      if (value === 'mapa' || value === 'map') return { view: 'map', module: '' };
      if (value === 'gerenciamento') return { view: 'management', module: '' };
      if (value === 'analises') return { view: 'analytics', module: '' };
      if (value.startsWith('ocorrencias/')) return { view: 'occurrences', module: value.split('/')[1] || '' };
      if (value.startsWith('novo/')) return { view: 'form', module: value.split('/')[1] || '' };
      if (['infraestrutura', 'acessibilidade', 'meio_ambiente'].includes(value)) return { view: 'module', module: value };
      if (value === 'ocorrencias') return { view: 'occurrences', module: '' };
      if (value === 'novo') return { view: 'form', module: '' };
      return { view: 'dashboard', module: '' };
    },
    update(view, module) {
      document.body.dataset.theme = module && ['module', 'form', 'occurrences'].includes(view) ? module : 'civitas';
      document.querySelectorAll('.nav-link').forEach(link => {
        const active = view === 'dashboard' || view === 'management' || view === 'analytics' ? link.dataset.view === view : view === 'map' ? link.dataset.view === 'map' : Boolean(module) && link.dataset.module === module;
        link.classList.toggle('is-active', active);
      });
      const labels = { dashboard: 'Dashboard geral', map: 'Mapa de ocorrências', management: 'Gerenciamento', analytics: 'An\u00e1lises e Estat\u00edsticas', module: { infraestrutura: 'Infraestrutura', acessibilidade: 'Acessibilidade', meio_ambiente: 'Meio ambiente' }, occurrences: 'Ocorrências', form: 'Nova ocorrência' };
      document.querySelector('#breadcrumb-current').textContent = view === 'module' ? labels.module[module] : labels[view];
    }
  };
})();
