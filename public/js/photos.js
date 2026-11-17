(function () {
  function render(occurrence, photos = [], className = '') {
    if (!Array.isArray(photos) || !photos.length) return '';
    const id = String(occurrence || '');
    return `<div class="photo-gallery ${className}" aria-label="Fotografias da ocorrência">${photos.map((photo, index) => {
      const source = `/api/occurrences/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.fileId)}`;
      return `<button type="button" class="photo-thumb" data-photo-open="${source}" data-photo-index="${index}" aria-label="Ampliar fotografia ${index + 1}"><img src="${source}" alt="Fotografia ${index + 1} da ocorrência" loading="lazy" decoding="async"></button>`;
    }).join('')}</div>`;
  }

  function bind() {
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-photo-open]');
      if (!button) return;
      const dialog = document.querySelector('#photo-lightbox');
      const image = dialog.querySelector('img');
      image.src = button.dataset.photoOpen;
      image.alt = button.querySelector('img')?.alt || 'Fotografia da ocorrência ampliada';
      dialog.showModal();
      dialog.querySelector('[data-photo-close]').focus();
    });
    const dialog = document.querySelector('#photo-lightbox');
    dialog?.addEventListener('click', event => { if (event.target === dialog || event.target.closest('[data-photo-close]')) dialog.close(); });
    dialog?.addEventListener('close', () => { dialog.querySelector('img').removeAttribute('src'); });
  }

  window.CivitasPhotoGallery = { render, bind };
  bind();
})();
