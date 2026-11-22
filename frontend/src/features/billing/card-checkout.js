let scriptLoad;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    function fail() {
      clearTimeout(timer);
      script.remove();
      scriptLoad = undefined;
      reject(new Error('Card checkout could not load. Please try again.'));
    }
    const timer = setTimeout(fail, 8000);
    script.onerror = fail;
    script.onload = () => {
      if (!window.Razorpay) return fail();
      clearTimeout(timer);
      resolve(window.Razorpay);
    };
    document.head.append(script);
  });
  return scriptLoad;
}

export async function openCardCheckout({key, subscriptionId}, onOpen, onReturn) {
  const Razorpay = await loadCheckout();
  let returned = false;
  function finish(authorized) {
    if (returned) return;
    returned = true;
    onReturn(authorized);
  }
  const checkout = new Razorpay({
    key,
    subscription_id: subscriptionId,
    name: 'Ledgerline',
    prefill: {method: 'card'},
    config: {
      display: {
        blocks: {cards: {name: 'Pay by card', instruments: [{method: 'card'}]}},
        sequence: ['block.cards'],
        preferences: {show_default_blocks: false}
      }
    },
    handler: () => finish(true),
    modal: {ondismiss: () => finish(false)}
  });
  checkout.open();
  onOpen();
}
