(function () {
  const baseUrl = '/api/occurrences';

  async function request(url, options = {}) {
    let response;
    try {
      const headers = { ...(options.headers || {}) };
      if (!(options.body instanceof FormData) && !Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      response = await fetch(url, { ...options, headers });
    } catch (error) {
      throw new Error('Não foi possível acessar o servidor. Verifique se a Civitas está em execução.');
    }
    let body;
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) throw new Error(body.errors?.join(' ') || body.message || 'Não foi possível concluir a solicitação.');
    return body;
  }

  window.CivitasAPI = {
    getStats(filters = {}) {
      const values = typeof filters === 'string' ? { module: filters } : filters;
      const query = new URLSearchParams(Object.entries(values).filter(([, value]) => Boolean(value))).toString();
      return request(`${baseUrl}/stats${query ? `?${query}` : ''}`);
    },
    async getOccurrences(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value))).toString();
      const data = await request(`${baseUrl}${query ? `?${query}` : ''}`);
      return data.occurrences;
    },
    getOccurrence(id) { return request(`${baseUrl}/${encodeURIComponent(id)}`); },
    updateOccurrenceStatus(id, status, note = '') {
      return request(`${baseUrl}/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) });
    },
    getHealth() { return request('/api/health'); },
    getAnalytics(filters = {}) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)).toString();
      return request(`/api/analytics${query ? `?${query}` : ''}`);
    },
    createOccurrence(payload) { return request(baseUrl, { method: 'POST', body: payload instanceof FormData ? payload : JSON.stringify(payload) }); }
  };
})();
