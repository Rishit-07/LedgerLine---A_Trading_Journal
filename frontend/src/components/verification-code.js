import './verification-code.css';

// confirm resolves only when the delivery provider accepts the code.
export function mountVerificationCode(host, { destination, confirm, onVerified }) {
  host.innerHTML = `<label class="otp-label">Enter the six-digit verification code
      <small></small>
      <span class="otp-entry">
        <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Six-digit verification code">
        <span class="otp-cells" aria-hidden="true">${'<i></i>'.repeat(6)}</span>
      </span>
    </label>
    <div class="otp-success" hidden><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m10 20 7 7 13-14"/></svg><strong>Successfully verified!</strong></div>
    <p role="status"></p>`;
  const label = host.querySelector('label');
  const input = host.querySelector('input');
  const cells = [...host.querySelectorAll('i')];
  const status = host.querySelector('[role=status]');
  label.querySelector('small').textContent = 'Sent to ' + destination;
  input.focus();
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') event.preventDefault();
  });
  input.addEventListener('input', async () => {
    if (input.readOnly) return;
    const code = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = code;
    cells.forEach((cell, index) => { cell.textContent = code[index] || ''; });
    status.textContent = '';
    if (code.length !== 6) return;
    input.readOnly = true;
    status.textContent = 'Verifying…';
    try {
      await confirm(code);
    } catch (error) {
      input.readOnly = false;
      input.select();
      status.textContent = error.message || 'Could not verify the code. Try again.';
      return;
    }
    if (!input.isConnected) return;
    label.hidden = true;
    host.querySelector('.otp-success').hidden = false;
    status.textContent = 'Verification complete.';
    onVerified();
  });
}
