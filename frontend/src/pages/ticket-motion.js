export function bindTicketMotion(ticket) {
  const stage = ticket.closest('.au-ticket-wrap');
  const face = ticket.closest('.au-card-plane');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  let flip;

  function resetTilt() {
    face.style.removeProperty('--tilt-x');
    face.style.removeProperty('--tilt-y');
  }

  stage.addEventListener('pointermove', (event) => {
    if (reduce.matches || !finePointer.matches || event.pointerType !== 'mouse') return;
    if (stage.querySelector('input:focus, .au-consent a:focus')) return;
    const bounds = stage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    face.style.setProperty('--tilt-x', -y * 8 + 'deg');
    face.style.setProperty('--tilt-y', x * 10 + 'deg');
  });
  stage.addEventListener('pointerleave', resetTilt);
  stage.addEventListener('focusin', (event) => {
    if (!event.target.matches('input, .au-consent a')) return;
    resetTilt();
    flip?.cancel();
  });
  reduce.addEventListener('change', () => {
    if (!reduce.matches) return;
    resetTilt();
    flip?.cancel();
  });

  return (creating) => {
    flip?.cancel();
    resetTilt();
    if (reduce.matches || typeof ticket.animate !== 'function') return;
    const direction = creating ? 1 : -1;
    flip = ticket.animate(
      [
        { transform: 'perspective(1100px) rotateY(' + direction * 25 + 'deg)', opacity: 0.8 },
        { transform: 'perspective(1100px) rotateY(' + direction * -2 + 'deg)', opacity: 1, offset: 0.78 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(.2,.74,.3,1)' },
    );
  };
}
