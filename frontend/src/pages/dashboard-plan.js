const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', dateStyle: 'medium' });

export function bindDashboardPlan(page, request, getDashboard, onPlan) {
  const dialog = page.querySelector('[data-plan-dialog]');
  const form = dialog.querySelector('[data-plan-form]');
  const fields = form.querySelector('fieldset');
  const status = dialog.querySelector('[data-plan-status]');
  const retry = dialog.querySelector('[data-plan-retry]');
  const buttons = [...form.querySelectorAll('button')];
  let pending = false;

  function paintSummary() {
    const { plan } = getDashboard();
    page.querySelector('[data-plan-text]').textContent = plan ? (plan.locked ? 'Plan locked' : 'Draft saved') : 'No plan for today yet.';
    page.querySelector('[data-plan-bias]').textContent = plan?.bias ? ' · ' + plan.bias : '';
  }

  function fillPlan(plan) {
    const locked = Boolean(plan?.locked);
    form.elements.bias.value = ['Bullish', 'Bearish'].includes(plan?.bias) ? plan.bias : 'Neutral';
    form.elements.levels.value = plan?.levels?.watched ?? '';
    form.elements.notes.value = plan?.levels?.notes ?? '';
    fields.disabled = locked;
    for (const button of buttons) button.hidden = (button.value === 'unlock') !== locked;
    form.hidden = false;
    onPlan(plan);
    paintSummary();
  }

  async function load() {
    if (pending) return;
    pending = true;
    form.hidden = true;
    retry.hidden = true;
    status.textContent = 'Loading today’s plan…';
    try {
      const { plan } = await request('/api/plan', 'GET');
      fillPlan(plan);
      status.textContent = plan?.locked ? 'Plan locked for today.' : '';
    } catch (error) {
      status.textContent = error.message;
      retry.hidden = false;
    } finally { pending = false; }
  }

  function open() {
    if (page.querySelector('dialog[open]')) return;
    const dashboard = getDashboard();
    dialog.querySelector('[data-plan-session]').textContent =
      `${date.format(new Date(dashboard.day))} · IST · ${dashboard.riskPerTrade}% risk per trade · ${dashboard.dailyLossLimit}R daily loss limit`;
    dialog.showModal();
    void load();
  }

  if (request) {
    for (const link of page.querySelectorAll('[data-plan-open]')) {
      link.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        open();
      });
    }
    retry.addEventListener('click', load);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (pending) return;
      const action = event.submitter?.value ?? 'save';
      const body = { action, ...Object.fromEntries(new FormData(form)) };
      pending = true;
      buttons.forEach((button) => { button.disabled = true; });
      try {
        const { plan } = await request('/api/plan', 'PUT', body);
        fillPlan(plan);
        status.textContent = { save: 'Plan saved.', lock: 'Plan locked for today.', unlock: 'Plan unlocked.' }[action];
      } catch (error) { status.textContent = error.message; }
      finally {
        pending = false;
        buttons.forEach((button) => { button.disabled = false; });
      }
    });
    if (location.hash === '#pre-market-plan') queueMicrotask(open);
  }
  return paintSummary;
}
