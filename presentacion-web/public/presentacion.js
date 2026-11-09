'use strict';

(() => {
  const slides = [...document.querySelectorAll('.deck-slide')];
  const previous = document.querySelector('#previous');
  const next = document.querySelector('#next');
  const count = document.querySelector('#slideCount');
  const progress = document.querySelector('#progress');
  const sectionLabel = document.querySelector('#sectionLabel');
  const resultKey = 'spark-card-comparison-v4';
  const params = new URLSearchParams(location.search);
  const driverKey = params.get('key');
  const theorySlides = [...document.querySelectorAll('.theory-slide iframe')];
  const activityFrame = document.querySelector('#activityFrame');
  const activityUrlParams = new URLSearchParams({ embed: '1' });
  let current = 0;

  document.querySelector('.deck-brand').href =
    `/presentacion${driverKey ? `?key=${encodeURIComponent(driverKey)}` : ''}`;
  theorySlides.forEach((frame, index) => {
    frame.src = `/teoria?slide=${index + 1}&embed=1`;
  });
  if (driverKey) activityUrlParams.set('key', driverKey);
  const activityUrl = `/driver?${activityUrlParams}`;
  activityFrame.src = activityUrl;

  function readResults() {
    try {
      const result = JSON.parse(localStorage.getItem(resultKey));
      if (!result || !result.traditional || !Array.isArray(result.partitions) || result.partitions.length !== 4) return null;
      return result;
    } catch (error) {
      console.warn('No se pudieron leer los resultados de la actividad presencial.', error);
      return null;
    }
  }

  function numberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function seconds(value) {
    return `${value.toFixed(1)} s`;
  }

  function renderResults() {
    const result = readResults();
    const setText = (selector, value) => { document.querySelector(selector).textContent = value; };
    if (!result) {
      setText('#deckTraditionalTime', '—');
      setText('#deckTraditionalErrors', '—');
      setText('#deckDistributedTime', '—');
      setText('#deckDistributedErrors', '—');
      setText('#deckDifference', '—');
      setText('#deckTotalErrors', '—');
      setText('#deckTraditionalLabel', '—');
      setText('#deckDistributedLabel', '—');
      document.querySelector('#deckTraditionalBar').style.width = '0%';
      document.querySelector('#deckDistributedBar').style.width = '0%';
      return;
    }

    const traditionalTime = numberOrNull(result.traditional.time);
    const traditionalErrors = numberOrNull(result.traditional.errors);
    const partitions = result.partitions.map((partition) => ({
      time: numberOrNull(partition.time),
      errors: numberOrNull(partition.errors),
    }));
    const distributedComplete = partitions.every((partition) =>
      partition.time > 0 && Number.isInteger(partition.errors)
      && partition.errors >= 0 && partition.errors <= 50);
    const traditionalComplete = traditionalTime > 0
      && Number.isInteger(traditionalErrors) && traditionalErrors >= 0 && traditionalErrors <= 200;
    const distributedTime = distributedComplete
      ? Math.max(...partitions.map((partition) => partition.time))
      : null;
    const distributedErrors = distributedComplete
      ? partitions.reduce((sum, partition) => sum + partition.errors, 0)
      : null;
    const maxTime = Math.max(traditionalTime || 0, distributedTime || 0);

    setText('#deckTraditionalTime', traditionalComplete ? seconds(traditionalTime) : '—');
    setText('#deckTraditionalErrors', traditionalComplete
      ? `${traditionalErrors} fichas mal clasificadas`
      : '—');
    setText('#deckDistributedTime', distributedTime !== null ? seconds(distributedTime) : '—');
    setText('#deckDistributedErrors', distributedComplete
      ? `${distributedErrors} fichas mal clasificadas`
      : '—');
    setText('#deckDifference', traditionalComplete && distributedTime !== null
      ? traditionalTime > distributedTime
        ? `${seconds(traditionalTime - distributedTime)} menos en paralelo`
        : traditionalTime < distributedTime
          ? `${seconds(distributedTime - traditionalTime)} menos en una mesa`
          : 'Mismo tiempo registrado'
      : '—');
    setText('#deckTotalErrors', traditionalComplete && distributedComplete
      ? `${traditionalErrors + distributedErrors} errores sumados en ambas rondas`
      : '—');
    setText('#deckTraditionalLabel', traditionalComplete ? seconds(traditionalTime) : '—');
    setText('#deckDistributedLabel', distributedTime !== null ? seconds(distributedTime) : '—');
    document.querySelector('#deckTraditionalBar').style.width =
      traditionalComplete && maxTime > 0 ? `${traditionalTime / maxTime * 100}%` : '0%';
    document.querySelector('#deckDistributedBar').style.width =
      distributedTime !== null && maxTime > 0 ? `${distributedTime / maxTime * 100}%` : '0%';
  }

  function render() {
    slides.forEach((slide, index) => {
      slide.hidden = index !== current;
      slide.classList.toggle('is-active', index === current);
    });
    const activeSlide = slides[current];
    count.textContent = `${current + 1} / ${slides.length}`;
    sectionLabel.textContent = activeSlide.dataset.title;
    previous.disabled = current === 0;
    next.textContent = current === slides.length - 1 ? 'Fin' : 'Siguiente →';
    [...progress.children].forEach((dot, index) => {
      if (index === current) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
    if (current === 1) renderResults();
  }

  function move(delta) {
    current = Math.max(0, Math.min(slides.length - 1, current + delta));
    render();
  }

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  progress.innerHTML = slides.map((_, index) =>
    `<button type="button" aria-label="Ir a la diapositiva ${index + 1}"></button>`).join('');
  progress.addEventListener('click', (event) => {
    const dot = event.target.closest('button');
    if (!dot) return;
    current = [...progress.children].indexOf(dot);
    render();
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      current = 0;
      render();
    } else if (event.key === 'End') {
      current = slides.length - 1;
      render();
    } else if (event.key.toLowerCase() === 'f') {
      toggleFullscreen();
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === resultKey) renderResults();
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || !event.data) return;
    if (event.data.type === 'deck-fullscreen') {
      toggleFullscreen();
      return;
    }
    if (event.data.type !== 'deck-navigate') return;
    if (event.data.delta === 'first') current = 0;
    else if (event.data.delta === 'last') current = slides.length - 1;
    else if (Number.isInteger(event.data.delta)) current += event.data.delta;
    else return;
    current = Math.max(0, Math.min(slides.length - 1, current));
    render();
  });
  document.querySelector('#fullScreen').addEventListener('click', toggleFullscreen);
  document.querySelector('#reloadActivity').addEventListener('click', () => {
    activityFrame.src = activityUrl;
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  renderResults();
  render();
})();
