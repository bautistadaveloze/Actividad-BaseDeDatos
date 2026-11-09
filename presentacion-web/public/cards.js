'use strict';

(() => {
  const PARTITION_COUNT = 4;
  const CARDS_PER_PARTITION = 50;
  const STORAGE_KEY = 'spark-card-comparison-v4';
  const root = document.querySelector('.cards-page');
  const partitionRoot = document.querySelector('#partitions');

  function emptyState() {
    return {
      traditional: { time: '', errors: '' },
      partitions: Array.from({ length: PARTITION_COUNT }, () => ({ time: '', errors: '' })),
    };
  }

  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.traditional && saved.partitions?.length === PARTITION_COUNT) return saved;
    } catch (error) {
      console.warn('No se pudieron recuperar los resultados guardados.', error);
    }
    return emptyState();
  }

  const state = loadSaved();

  function renderPartitions() {
    partitionRoot.innerHTML = state.partitions.map((partition, index) => `
      <article class="partition-card" data-partition="${index}">
        <h3>Mesa ${index + 1} · 50 fichas</h3>
        <div class="partition-fields">
          <label class="count-field">Segundos
            <input data-kind="time" type="number" min="0.1" step="0.1" inputmode="decimal" aria-label="Tiempo de la mesa ${index + 1} en segundos" value="${partition.time}">
          </label>
          <label class="count-field">Fichas mal clasificadas
            <input data-kind="errors" type="number" min="0" max="${CARDS_PER_PARTITION}" step="1" inputmode="numeric" aria-label="Errores de clasificación de la mesa ${index + 1}" value="${partition.errors}">
          </label>
        </div>
      </article>`).join('');
  }

  function readNumber(value) {
    if (value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function readInputs() {
    state.traditional.time = document.querySelector('#traditionalTime').value;
    state.traditional.errors = document.querySelector('#traditionalErrors').value;
    partitionRoot.querySelectorAll('.partition-card').forEach((card, index) => {
      state.partitions[index] = {
        time: card.querySelector('[data-kind="time"]').value,
        errors: card.querySelector('[data-kind="errors"]').value,
      };
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('No se pudieron guardar los resultados de esta sesión.', error);
    }
  }

  function validTime(value) {
    return Number.isFinite(value) && value > 0;
  }

  function validErrors(value, maximum) {
    return Number.isInteger(value) && value >= 0 && value <= maximum;
  }

  function formatTime(value) {
    return `${value.toFixed(1)} s`;
  }

  function update() {
    readInputs();

    const traditionalTime = readNumber(state.traditional.time);
    const traditionalErrors = readNumber(state.traditional.errors);
    const traditionalComplete = validTime(traditionalTime) && validErrors(traditionalErrors, 200);

    document.querySelector('#traditionalResult').textContent =
      traditionalComplete ? 'Resultado registrado.' : '';
    document.querySelector('#traditionalResult').dataset.state = traditionalComplete ? 'correct' : '';
    document.querySelector('#baselineTime').textContent =
      traditionalComplete ? formatTime(traditionalTime) : '—';
    document.querySelector('#traditionalErrorsSummary').textContent =
      traditionalComplete ? `${traditionalErrors} errores` : '—';
    document.querySelector('#traditionalBarLabel').textContent =
      traditionalComplete ? formatTime(traditionalTime) : '—';

    const partitions = state.partitions.map((partition) => ({
      time: readNumber(partition.time),
      errors: readNumber(partition.errors),
    }));
    const distributedComplete = partitions.every((partition) =>
      validTime(partition.time) && validErrors(partition.errors, CARDS_PER_PARTITION));
    const distributedTime = distributedComplete
      ? Math.max(...partitions.map((partition) => partition.time))
      : null;
    const distributedErrors = distributedComplete
      ? partitions.reduce((sum, partition) => sum + partition.errors, 0)
      : null;

    document.querySelector('#distributedResult').textContent =
      distributedComplete ? 'Resultados de las cuatro mesas registrados.' : '';
    document.querySelector('#distributedResult').dataset.state = distributedComplete ? 'correct' : '';
    document.querySelector('#distributedTime').textContent =
      distributedTime !== null ? formatTime(distributedTime) : '—';
    document.querySelector('#distributedErrorsSummary').textContent =
      distributedErrors !== null ? `${distributedErrors} errores en total` : '—';
    document.querySelector('#distributedBarLabel').textContent =
      distributedTime !== null ? formatTime(distributedTime) : '—';

    const complete = traditionalComplete && distributedComplete;
    const difference = complete ? traditionalTime - distributedTime : null;
    document.querySelector('#timeDifference').textContent = difference === null
      ? '—'
      : difference > 0
        ? `${formatTime(difference)} menos en paralelo`
        : difference < 0
          ? `${formatTime(Math.abs(difference))} menos en una mesa`
          : 'Mismo tiempo';
    document.querySelector('#accuracy').textContent = complete
      ? `${traditionalErrors + distributedErrors} errores observados en total`
      : '—';

    const maxTime = Math.max(traditionalComplete ? traditionalTime : 0, distributedTime || 0);
    document.querySelector('#traditionalBar').style.width =
      traditionalComplete && maxTime > 0 ? `${traditionalTime / maxTime * 100}%` : '0%';
    document.querySelector('#distributedBar').style.width =
      distributedTime !== null && maxTime > 0 ? `${distributedTime / maxTime * 100}%` : '0%';
  }

  function restoreFields() {
    document.querySelector('#traditionalTime').value = state.traditional.time;
    document.querySelector('#traditionalErrors').value = state.traditional.errors;
    partitionRoot.querySelectorAll('.partition-card').forEach((card, index) => {
      card.querySelector('[data-kind="time"]').value = state.partitions[index].time;
      card.querySelector('[data-kind="errors"]').value = state.partitions[index].errors;
    });
  }

  root.addEventListener('input', (event) => {
    if (event.target.matches('input[type="number"]')) update();
  });

  document.querySelector('#reset').addEventListener('click', () => {
    Object.assign(state, emptyState());
    restoreFields();
    update();
    document.querySelector('#traditionalTime').focus();
  });

  renderPartitions();
  restoreFields();
  update();
})();
