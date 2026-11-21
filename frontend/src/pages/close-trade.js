export function openCloseTrade(page, trade, request, refresh) {
  const dialog = document.createElement('dialog');
  dialog.className = 'n-out dash-dialog close-trade-dialog';
  dialog.setAttribute('aria-label','Close trade');
  dialog.innerHTML = `<h2>Close trade</h2><p data-position></p>
    <form><label>Realized result in R<input name="result" type="number" min="-10000" max="10000" step="0.0001" required></label>
      <small>Enter a loss as a negative number. One R is the amount you originally risked.</small>
      <label>Exit price (optional)<input name="exit" type="number" min="0.00000001" max="999999999999" step="any"></label>
      <p role="status"></p><div><button class="n-btn n-out dash-button" type="button">Cancel</button>
      <button class="n-btn n-acc dash-button" type="submit">Close trade</button></div></form>`;
  dialog.querySelector('[data-position]').textContent = trade.symbol + ' · This records the exit in your journal.';
  const form = dialog.querySelector('form');
  const submit = form.querySelector('[type=submit]');
  form.querySelector('[type=button]').onclick = () => dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      await request('/api/workspace?page=history','POST',{action:'close',tradeId:trade.id,
        result:form.elements.result.valueAsNumber, exit:form.elements.exit.value ? form.elements.exit.valueAsNumber : null});
    } catch (error) {
      form.querySelector('[role=status]').textContent = error.message;
      submit.disabled = false;
      return;
    }
    dialog.close();
    try { await refresh(); } catch { location.reload(); }
  };
  page.append(dialog);
  dialog.showModal();
}
