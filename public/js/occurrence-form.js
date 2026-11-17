(function () {
  const categories = window.CivitasCategories;
  window.CivitasForm = {
    render(module = '') {
      const options = (selected) => Object.entries({ infraestrutura: 'Infraestrutura urbana', acessibilidade: 'Acessibilidade', meio_ambiente: 'Meio ambiente' }).map(([key, label]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${label}</option>`).join('');
      return `<div class="page-heading"><div><p class="eyebrow">CONTRIBUA COM A CIDADE</p><h1>Registrar ocorrência</h1><p class="page-description">Descreva o problema com clareza para ajudar a comunidade a identificar as necessidades do espaço urbano.</p></div></div>
        <section class="panel form-panel"><div class="panel-heading"><div><h2>Dados do registro</h2><p>Os campos marcados são obrigatórios.</p></div></div><p class="form-hint">Ao enviar, o registro será criado com status <strong>Pendente</strong>.</p>
        <form id="occurrence-form" novalidate><div class="form-grid">
          <div class="field" data-field="module"><label for="occurrence-module">Módulo *</label><select id="occurrence-module" name="module" required><option value="">Selecione o módulo</option>${options(module)}</select><span class="validation-message">Selecione um módulo.</span></div>
          <div class="field" data-field="category"><label for="occurrence-category">Categoria *</label><select id="occurrence-category" name="category" required disabled><option value="">Selecione primeiro o módulo</option></select><span class="validation-message">Selecione uma categoria.</span></div>
          <div class="field field-full" data-field="description"><label for="occurrence-description">Descrição *</label><textarea id="occurrence-description" name="description" minlength="10" maxlength="1000" placeholder="Explique o que foi identificado (mínimo de 10 caracteres)" required></textarea><span class="field-help">Entre 10 e 1000 caracteres.</span><span class="validation-message">Descreva o problema com pelo menos 10 caracteres.</span></div>
          <div class="field field-full" data-field="location"><label for="occurrence-location">Localização / endereço *</label><input id="occurrence-location" name="location" minlength="3" maxlength="200" placeholder="Ex.: Rua das Flores, 120 — Centro" required><span class="validation-message">Informe uma localização com pelo menos 3 caracteres.</span></div>
          <div class="field" data-field="severity"><label for="occurrence-severity">Gravidade *</label><select id="occurrence-severity" name="severity" required><option value="">Selecione a gravidade</option><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select><span class="validation-message">Selecione uma gravidade.</span></div>
          <div class="field field-full" data-field="coordinates"><label>Localização no mapa *</label><div class="coordinate-control"><button type="button" class="button button-secondary" data-picker-action="open">⌖ Selecionar no mapa</button><span class="coordinate-summary" id="selected-coordinates">Nenhuma coordenada selecionada</span></div><input type="hidden" name="latitude"><input type="hidden" name="longitude"><span class="validation-message">Selecione as coordenadas no mapa para continuar.</span></div>
          <div class="field field-full photo-upload-field"><label for="occurrence-photos">Fotografias <span class="optional-label">opcional</span></label><div class="photo-upload-box"><input id="occurrence-photos" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple><span>Selecione até 3 imagens JPG, PNG ou WebP, com no máximo 5 MB cada.</span></div><p id="photo-upload-message" class="photo-upload-message" role="status" aria-live="polite"></p><div id="photo-previews" class="photo-previews"></div></div>
        </div><div class="form-actions"><button type="button" class="button button-secondary" data-action="back">Cancelar</button><button type="submit" class="button button-primary">Enviar ocorrência <span>→</span></button></div></form></section>
        <dialog id="location-picker-dialog" class="location-picker-dialog" aria-labelledby="location-picker-title"><div class="picker-header"><div><h2 id="location-picker-title">Selecionar localização</h2><p>Clique no mapa para marcar o ponto da ocorrência.</p></div>${CivitasBaseLayers.renderControl(CivitasBaseLayers.getPreference(), 'picker-layer-control')}<button type="button" class="picker-close" aria-label="Fechar" data-picker-action="cancel">×</button></div><div id="location-picker-map" class="location-picker-map"></div><div class="picker-footer"><p id="location-picker-message" role="status">Nenhum ponto selecionado.</p><div class="picker-actions"><button type="button" class="button button-secondary" data-picker-action="geolocate">Usar minha localização</button><span><button type="button" class="button button-secondary" data-picker-action="cancel">Cancelar</button><button type="button" class="button button-primary" data-picker-action="confirm" disabled>Confirmar localização</button></span></div></div></dialog>`;
    },
    bind() {
      const form = document.querySelector('#occurrence-form');
      if (!form) return;
      const moduleSelect = form.elements.module;
      const categorySelect = form.elements.category;
      const photoInput = form.querySelector('#occurrence-photos');
      const previewArea = form.querySelector('#photo-previews');
      const photoMessage = form.querySelector('#photo-upload-message');
      let selectedPhotos = [];
      const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
      const revoke = photo => { if (photo.preview) URL.revokeObjectURL(photo.preview); };
      const drawPreviews = () => {
        previewArea.innerHTML = selectedPhotos.map((photo, index) => `<div class="photo-preview"><img src="${photo.preview}" alt="Prévia da fotografia selecionada"><button type="button" data-photo-remove="${index}" aria-label="Remover fotografia ${index + 1}">×</button><span>${Civitas.escapeHTML(photo.file.name)}</span></div>`).join('');
      };
      photoInput.addEventListener('change', async () => {
        const candidates = Array.from(photoInput.files || []);
        photoInput.value = '';
        const messages = [];
        for (const file of candidates) {
          const extensionOkay = /\.(jpe?g|png|webp)$/i.test(file.name);
          if (!allowedMime.has(file.type) || !extensionOkay) { messages.push('Formato inválido. Escolha arquivos JPG, PNG ou WebP.'); continue; }
          if (file.size > 5 * 1024 * 1024) { messages.push('Cada fotografia deve ter no máximo 5 MB.'); continue; }
          if (selectedPhotos.length >= 3) { messages.push('É possível anexar até três fotografias por ocorrência.'); break; }
          const preview = URL.createObjectURL(file);
          try {
            await new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = resolve;
              image.onerror = reject;
              image.src = preview;
            });
            selectedPhotos.push({ file, preview });
          } catch {
            URL.revokeObjectURL(preview);
            messages.push('Um arquivo selecionado não contém uma imagem válida.');
          }
        }
        photoMessage.textContent = messages.join(' ');
        photoMessage.classList.toggle('is-error', messages.length > 0);
        drawPreviews();
      });
      previewArea.addEventListener('click', event => {
        const remove = event.target.closest('[data-photo-remove]');
        if (!remove) return;
        const [photo] = selectedPhotos.splice(Number(remove.dataset.photoRemove), 1);
        if (photo) revoke(photo);
        drawPreviews();
        photoMessage.textContent = '';
        photoMessage.classList.remove('is-error');
      });
      const updateCategories = () => {
        const items = categories[moduleSelect.value] || [];
        document.body.dataset.theme = moduleSelect.value || 'civitas';
        categorySelect.innerHTML = `<option value="">${items.length ? 'Selecione a categoria' : 'Selecione primeiro o módulo'}</option>${items.map(item => `<option>${Civitas.escapeHTML(item)}</option>`).join('')}`;
        categorySelect.disabled = !items.length;
      };
      moduleSelect.addEventListener('change', updateCategories);
      updateCategories();
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        const payload = {
          module: values.module, category: values.category, description: values.description,
          location: values.location, severity: values.severity,
          coordinates: {
          latitude: form.elements.latitude.value === '' ? NaN : Number(form.elements.latitude.value),
          longitude: form.elements.longitude.value === '' ? NaN : Number(form.elements.longitude.value)
          }
        };
        let valid = true;
        for (const name of ['module', 'category', 'description', 'location', 'severity']) {
          const field = form.querySelector(`[data-field="${name}"]`);
          const element = form.elements[name];
          const value = String(element.value || '').trim();
          const okay = Boolean(value) && ((name !== 'description' && name !== 'location') || value.length >= (name === 'description' ? 10 : 3));
          field.classList.toggle('has-error', !okay);
          if (!okay) valid = false;
        }
        const latitude = payload.coordinates.latitude;
        const longitude = payload.coordinates.longitude;
        const hasCoordinates = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
        form.querySelector('[data-field="coordinates"]').classList.toggle('has-error', !hasCoordinates);
        if (!hasCoordinates) valid = false;
        if (!valid) { form.querySelector('.has-error select, .has-error textarea, .has-error input:not([type="hidden"]), .has-error [data-picker-action="open"]')?.focus(); return; }
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        button.textContent = 'Enviando…';
        try {
          const body = new FormData();
          for (const [key, value] of Object.entries(payload)) body.append(key, key === 'coordinates' ? JSON.stringify(value) : value);
          selectedPhotos.forEach(photo => body.append('photos', photo.file, photo.file.name));
          const result = await CivitasAPI.createOccurrence(body);
          Civitas.toast(result.message || 'Ocorrência cadastrada com sucesso.');
          Civitas.completeOccurrence(payload);
        } catch (error) {
          Civitas.toast(error.message, true);
          button.disabled = false;
          button.innerHTML = 'Enviar ocorrência <span>→</span>';
        }
      });
      window.addEventListener('beforeunload', () => selectedPhotos.forEach(revoke), { once: true });
    }
  };
})();
