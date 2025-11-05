document.addEventListener('DOMContentLoaded', () => {
  const balance = document.getElementById('balance');
  const remaining = document.getElementById('remaining');
  const icon = document.getElementById('icon');

  if (!balance || !remaining || !icon) {
    return;
  }

  const RESET_DELAY = 60 * 60 * 1000; // 1 hour in milliseconds
  const initialCount = parseInt(remaining.textContent.trim(), 10) || 0;
  let count = initialCount;
  let isClickable = true;

  function animateNumber() {
    const rect = icon.getBoundingClientRect();
    const number = document.createElement('span');

    number.textContent = '+1';
    number.className = 'floating-number';
    number.style.left = `${rect.left + rect.width / 2}px`;
    number.style.top = `${rect.top + rect.height / 2}px`;

    document.body.appendChild(number);

    requestAnimationFrame(() => {
      number.classList.add('floating-number--visible');
    });

    number.addEventListener(
      'transitionend',
      () => {
        number.remove();
      },
      { once: true },
    );
  }

  function updateBalance(addValue) {
    if (!isClickable) {
      return;
    }

    const increment = Math.min(Math.max(addValue, 0), count);

    if (increment === 0) {
      return;
    }

    const currentBalance = parseInt(balance.textContent.trim(), 10) || 0;
    balance.textContent = currentBalance + increment;
    count -= increment;
    remaining.textContent = count;

    for (let i = 0; i < increment; i += 1) {
      animateNumber();
    }

    if (count === 0) {
      isClickable = false;
      setTimeout(() => {
        isClickable = true;
        count = initialCount;
        remaining.textContent = count;
      }, RESET_DELAY);
    }
  }

  icon.addEventListener('click', (event) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    updateBalance(1);
  });

  icon.addEventListener(
    'touchstart',
    (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      const touchCount = event.touches.length || 1;
      updateBalance(touchCount);
    },
    { passive: false },
  );
});
