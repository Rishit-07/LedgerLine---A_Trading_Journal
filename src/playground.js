const original = [88, 80, 72, 60, 65];
const weights = [30, 30, 20, 10, 10];
const presets = {
  scBest: [96, 88, 82, 90, 78],
  scWorst: [35, 28, 40, 45, 30],
  scReset: original,
};

export function initPlayground() {
  const playground = document.querySelector('#try');
  const rows = [...playground.querySelectorAll('[data-score-row]')];
  const ring = playground.querySelector('#demo-ring');
  const outputs = Object.fromEntries(
    [...playground.querySelectorAll('[data-output]')].map((element) => [element.dataset.output, element]),
  );
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let scores = [...original];
  let probability = 45;
  let payoff = 2;

  function renderScore() {
    const score = Math.round(scores.reduce((sum, value, index) => sum + (value * weights[index]) / 100, 0));
    const circumference = 2 * Math.PI * 42;
    outputs.score.textContent = score;
    outputs.tier.textContent = score >= 85 ? 'PLATINUM' : score >= 70 ? 'GOLD' : score >= 50 ? 'SILVER' : 'BRONZE';
    ring.setAttribute(
      'stroke-dasharray',
      ((circumference * score) / 100).toFixed(1) + ' ' + circumference.toFixed(1),
    );
    rows.forEach((row, index) => {
      row.querySelector('[data-score-value]').textContent = scores[index];
      row.querySelector('[data-score-fill]').style.width = scores[index] + '%';
    });
  }

  function renderKelly() {
    const p = probability / 100;
    const fraction = p - (1 - p) / payoff;
    const expected = p * payoff - (1 - p);
    const percentage = (factor) => (fraction > 0 ? (fraction * factor * 100).toFixed(1) + '%' : '0%');
    outputs.kpTxt.textContent = probability + '%';
    outputs.kbTxt.textContent = payoff.toFixed(1) + 'R';
    outputs.kFull.textContent = percentage(1);
    outputs.kHalf.textContent = percentage(0.5);
    outputs.kQuart.textContent = percentage(0.25);
    outputs.kEv.textContent = (expected >= 0 ? '+' : '') + expected.toFixed(2) + 'R';
    outputs.kFull.style.color = fraction > 0 ? 'var(--acc)' : 'var(--down)';
    outputs.kNote.textContent =
      fraction > 0
        ? 'of the sample account at full Kelly. Most traders use half or quarter.'
        : 'No edge at these numbers, so Kelly says do not take it.';
  }

  const adjustments = {
    kpDec: () => {
      probability = clamp(probability - 5, 5, 95);
    },
    kpInc: () => {
      probability = clamp(probability + 5, 5, 95);
    },
    kbDec: () => {
      payoff = clamp(payoff - 0.5, 0.5, 6);
    },
    kbInc: () => {
      payoff = clamp(payoff + 0.5, 0.5, 6);
    },
  };

  playground.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const { scoreStep, action } = button.dataset;
    if (scoreStep) {
      const index = Number(button.closest('[data-score-row]').dataset.scoreRow);
      scores[index] = clamp(scores[index] + Number(scoreStep), 0, 100);
      renderScore();
    } else if (presets[action]) {
      scores = [...presets[action]];
      renderScore();
    } else if (adjustments[action]) {
      adjustments[action]();
      renderKelly();
    }
  });

  renderScore();
  renderKelly();
}
