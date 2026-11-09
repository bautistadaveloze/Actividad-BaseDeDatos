'use strict';

(() => {
  const slides = [...document.querySelectorAll('[data-slide]')];
  const previous = document.querySelector('#previous');
  const next = document.querySelector('#next');
  const count = document.querySelector('#slideCount');
  const dots = document.querySelector('#progressDots');
  const requestedSlide = Number(new URLSearchParams(location.search).get('slide'));
  let current = Number.isInteger(requestedSlide) && requestedSlide >= 1 && requestedSlide <= slides.length
    ? requestedSlide - 1
    : 0;

  function render() {
    slides.forEach((slide, index) => {
      slide.hidden = index !== current;
      slide.classList.toggle('active', index === current);
    });
    count.textContent = `${current + 1} / ${slides.length}`;
    previous.disabled = current === 0;
    next.disabled = current === slides.length - 1;
    next.textContent = current === slides.length - 1 ? 'Fin' : 'Siguiente →';
    [...dots.children].forEach((dot, index) => {
      if (index === current) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
  }

  function move(delta) {
    current = Math.max(0, Math.min(slides.length - 1, current + delta));
    render();
  }

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  dots.innerHTML = slides.map((_, index) =>
    `<button type="button" aria-label="Ir a la diapositiva ${index + 1}"></button>`).join('');
  dots.addEventListener('click', (event) => {
    const dot = event.target.closest('button');
    if (!dot) return;
    current = [...dots.children].indexOf(dot);
    render();
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, button, a') && !event.target.matches('#next, #previous')) return;
    if (document.documentElement.dataset.embed === 'true') {
      const delta = event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'PageUp'
          ? -1
          : event.key === 'Home'
            ? 'first'
            : event.key === 'End'
              ? 'last'
              : null;
      if (delta !== null) {
        event.preventDefault();
        parent.postMessage({ type: 'deck-navigate', delta }, location.origin);
      }
      return;
    }
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft') {
      move(-1);
    }
  });
  render();
})();
