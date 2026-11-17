(function () {
  const moduleColors = { infraestrutura: '#9A5B00', acessibilidade: '#1E5AA8', meio_ambiente: '#256C4A' };
  const moduleLabels = { infraestrutura: 'Infraestrutura', acessibilidade: 'Acessibilidade', meio_ambiente: 'Meio ambiente' };
  const statusColors = { Pendente: '#D18A24', 'Em análise': '#55778F', 'Em andamento': '#725CB4', Resolvida: '#2F8A61' };
  const statuses = ['Pendente', 'Em análise', 'Em andamento', 'Resolvida'];
  let instances = [];

  function destroy() {
    for (const chart of instances) chart.destroy();
    instances = [];
  }

  function makeChart(selector, config) {
    const canvas = document.querySelector(selector);
    if (!canvas || !window.Chart) return;
    const chart = new Chart(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 220 }, ...config.options } });
    instances.push(chart);
  }

  function render(data) {
    destroy();
    if (!window.Chart) {
      document.querySelectorAll('.analytics-chart-empty').forEach(element => {
        element.hidden = false;
        element.textContent = 'A biblioteca de gráficos não foi carregada. Confira sua conexão e tente novamente.';
      });
      return;
    }
    document.querySelectorAll('.analytics-chart-empty').forEach(element => { element.hidden = data.summary.total > 0; });

    const modules = Object.keys(moduleLabels);
    makeChart('#analytics-chart-trend', {
      type: 'line',
      data: { labels: data.timeline.map(row => row.label), datasets: modules.map(module => ({
        label: moduleLabels[module], data: data.timeline.map(row => row.byModule[module] || 0),
        borderColor: moduleColors[module], backgroundColor: `${moduleColors[module]}22`, tension: 0.25, pointRadius: 2, fill: false
      })) },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
    makeChart('#analytics-chart-modules', {
      type: 'doughnut',
      data: { labels: modules.map(module => moduleLabels[module]), datasets: [{ data: modules.map(module => data.byModule[module]), backgroundColor: modules.map(module => moduleColors[module]), borderWidth: 0 }] },
      options: { plugins: { legend: { position: 'bottom' } }, cutout: '62%' }
    });
    const categories = data.byCategory.slice(0, 10);
    makeChart('#analytics-chart-categories', {
      type: 'bar',
      data: { labels: categories.map(row => `${moduleLabels[row.module]} · ${row.category}`), datasets: [{ label: 'Ocorrências', data: categories.map(row => row.count), backgroundColor: categories.map(row => moduleColors[row.module] || '#4E758B'), borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
    const severityLabels = ['Baixa', 'Média', 'Alta', 'Crítica'];
    makeChart('#analytics-chart-severity', {
      type: 'bar',
      data: { labels: severityLabels, datasets: [{ label: 'Ocorrências', data: severityLabels.map(label => data.bySeverity[label]), backgroundColor: ['#72A887', '#D1B24A', '#D4803A', '#B94C4C'], borderRadius: 4 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
    makeChart('#analytics-chart-status', {
      type: 'doughnut',
      data: { labels: statuses, datasets: [{ data: statuses.map(status => data.byStatus[status]), backgroundColor: statuses.map(status => statusColors[status]), borderWidth: 0 }] },
      options: { plugins: { legend: { position: 'bottom' } }, cutout: '62%' }
    });
    const resolutionModules = data.resolution.byModule;
    makeChart('#analytics-chart-resolution-modules', {
      type: 'bar',
      data: { labels: resolutionModules.map(row => moduleLabels[row.module]), datasets: [{ label: 'Dias até primeira resolução', data: resolutionModules.map(row => row.averageHours === null ? null : row.averageHours / 24), backgroundColor: resolutionModules.map(row => moduleColors[row.module]), borderRadius: 4 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Dias' } } } }
    });
    const resolutionCategories = data.resolution.byCategory.slice(0, 8);
    makeChart('#analytics-chart-resolution-categories', {
      type: 'bar',
      data: { labels: resolutionCategories.map(row => `${moduleLabels[row.module]}: ${row.category}`), datasets: [{ label: 'Dias até primeira resolução', data: resolutionCategories.map(row => row.averageHours / 24), backgroundColor: '#60866F', borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, title: { display: true, text: 'Dias' } } } }
    });
  }

  window.CivitasAnalyticsCharts = { render, destroy };
})();
