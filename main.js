document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    balance: document.getElementById('balance'),
    remaining: document.getElementById('remaining'),
    initial: document.getElementById('outOff'),
    icon: document.getElementById('icon'),
    planName: document.getElementById('plan-name'),
    cashBalance: document.getElementById('cash-balance'),
    status: document.getElementById('status-message'),
    logout: document.getElementById('logout-button'),
    upgradeButton: document.getElementById('upgrade-button'),
    planList: document.getElementById('plan-list'),
    upgradeFeedback: document.getElementById('upgrade-feedback'),
    cashoutButton: document.getElementById('cashout-button'),
    cashoutForm: document.getElementById('cashout-form'),
    cashoutAmount: document.getElementById('cashout-amount'),
    cashoutFeedback: document.getElementById('cashout-feedback'),
    cryptoOverlay: document.getElementById('crypto-overlay'),
    cryptoForm: document.getElementById('crypto-form'),
    cryptoPlanName: document.getElementById('crypto-plan-name'),
    cryptoCurrency: document.getElementById('crypto-currency'),
    cryptoPrice: document.getElementById('crypto-price'),
    cryptoFeedback: document.getElementById('crypto-feedback'),
    cryptoInvoice: document.getElementById('crypto-invoice'),
    cryptoAmount: document.getElementById('crypto-amount'),
    cryptoCurrencyLabel: document.getElementById('crypto-currency-label'),
    cryptoAddress: document.getElementById('crypto-address'),
    cryptoReference: document.getElementById('crypto-reference'),
    cryptoCopy: document.getElementById('crypto-copy'),
    authOverlay: document.getElementById('auth-overlay'),
    loginForm: document.getElementById('login-form'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    registerForm: document.getElementById('register-form'),
    registerUsername: document.getElementById('register-username'),
    registerPassword: document.getElementById('register-password'),
    authFeedback: document.getElementById('auth-feedback'),
    showRegister: document.getElementById('show-register'),
    showLogin: document.getElementById('show-login'),
    closeAuth: document.getElementById('close-auth'),
  };

  if (!elements.icon || !elements.balance || !elements.remaining) {
    return;
  }

  const API_BASE = '/api';
  const RESET_DELAY_FALLBACK = 60 * 60 * 1000;
  let authToken = localStorage.getItem('ethpoint_token') || '';
  let isClickable = false;
  let resetTimer = null;
  let plans = [];
  let currentPlanId = 'free';
  let cryptoOptions = [];
  let selectedPlanForCrypto = null;

  function setAuthToken(token) {
    authToken = token || '';
    if (authToken) {
      localStorage.setItem('ethpoint_token', authToken);
    } else {
      localStorage.removeItem('ethpoint_token');
    }
  }

  function setStatus(message, type = 'info') {
    if (!elements.status) {
      return;
    }
    elements.status.textContent = message || '';
    if (!message) {
      delete elements.status.dataset.type;
    } else {
      elements.status.dataset.type = type;
    }
  }

  function showOverlay(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.remove('hidden');
    }
  }

  function hideOverlay(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  function toggleAuthForms(showRegisterForm) {
    if (showRegisterForm) {
      elements.loginForm.classList.add('hidden');
      elements.registerForm.classList.remove('hidden');
    } else {
      elements.registerForm.classList.add('hidden');
      elements.loginForm.classList.remove('hidden');
    }
    setAuthFeedback('');
  }

  function animateNumber(count) {
    const rect = elements.icon.getBoundingClientRect();
    const displayCount = Math.min(count, 25);
    for (let i = 0; i < displayCount; i += 1) {
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
  }

  function clearResetTimer() {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  }

  function scheduleStateRefresh(delay) {
    clearResetTimer();
    if (!Number.isFinite(delay) || delay <= 0) {
      return;
    }
    resetTimer = setTimeout(() => {
      fetchState(false);
    }, delay + 200);
  }

  function applyProfile(profile) {
    if (!profile) {
      return;
    }
    if (profile.plan?.id) {
      currentPlanId = profile.plan.id;
    }
    if (elements.planName) {
      elements.planName.textContent = profile.plan?.label || 'Free';
    }
    if (elements.cashBalance) {
      elements.cashBalance.textContent = profile.cashBalance ?? 0;
    }
    if (Number.isFinite(profile.balance)) {
      elements.balance.textContent = Math.max(0, Math.floor(profile.balance));
    }
  }

  function applyState(state, animate = true) {
    if (!state) {
      return;
    }

    if (state.plan?.id) {
      currentPlanId = state.plan.id;
    }
    if (elements.planName && state.plan) {
      elements.planName.textContent = state.plan.label || 'Free';
    }

    const initialRemaining = Number.isFinite(state.initialRemaining)
      ? state.initialRemaining
      : Number.parseInt(elements.initial.textContent, 10) || 0;

    if (elements.initial && Number.isFinite(initialRemaining)) {
      elements.initial.textContent = initialRemaining;
    }

    if (Number.isFinite(state.balance)) {
      elements.balance.textContent = Math.max(0, Math.floor(state.balance));
    }

    if (Number.isFinite(state.cashBalance) && elements.cashBalance) {
      elements.cashBalance.textContent = Math.max(0, Math.floor(state.cashBalance));
    }

    if (Number.isFinite(state.remaining)) {
      const remaining = Math.max(0, Math.floor(state.remaining));
      elements.remaining.textContent = remaining;
      isClickable = remaining > 0;
    }

    const awarded = Number.isFinite(state.awarded) ? Math.max(0, Math.floor(state.awarded)) : 0;
    if (animate && awarded > 0) {
      animateNumber(awarded);
      setStatus(`+${awarded.toLocaleString()} points added to your balance!`, 'success');
    } else if (!animate) {
      setStatus('');
    }

    if (Number.isFinite(state.resetInMs)) {
      if ((state.remaining || 0) === 0) {
        scheduleStateRefresh(state.resetInMs || RESET_DELAY_FALLBACK);
      } else {
        scheduleStateRefresh(state.resetInMs);
      }
    } else if ((state.remaining || 0) === 0) {
      scheduleStateRefresh(RESET_DELAY_FALLBACK);
    } else {
      clearResetTimer();
    }
  }

  function setAuthFeedback(message, variant = '') {
    if (!elements.authFeedback) {
      return;
    }
    elements.authFeedback.textContent = message;
    elements.authFeedback.classList.remove('error', 'success');
    if (variant) {
      elements.authFeedback.classList.add(variant);
    }
  }

  function fetchWithAuth(endpoint, options = {}) {
    if (!authToken) {
      return Promise.reject(new Error('Not authenticated'));
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${authToken}`);
    if (!(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    }).then((response) => {
      if (!response.ok) {
        return response.json().catch(() => ({})).then((body) => {
          const error = new Error(body.message || `Request failed with ${response.status}`);
          error.status = response.status;
          throw error;
        });
      }
      return response.json();
    });
  }

  function ensureAuthenticated() {
    if (!authToken) {
      showOverlay('auth-overlay');
      if (elements.loginUsername) {
        elements.loginUsername.focus();
      }
      isClickable = false;
      setStatus('Please sign in to start playing.');
      return false;
    }
    return true;
  }

  function fetchPlans() {
    if (plans.length > 0) {
      return Promise.resolve(plans);
    }
    return fetch(`${API_BASE}/plans`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load plans.');
        }
        return response.json();
      })
      .then((data) => {
        plans = Array.isArray(data.plans) ? data.plans : [];
        cryptoOptions = Array.isArray(data.cryptoOptions) ? data.cryptoOptions : [];
        return plans;
      });
  }

  function renderPlans(activePlanId) {
    if (!elements.planList) {
      return;
    }
    elements.planList.innerHTML = '';
    const availableCryptoOptions = cryptoOptions.filter((option) => option.addressAvailable);
    plans.forEach((plan) => {
      const item = document.createElement('li');
      item.className = 'plan-card';
      if (plan.id === activePlanId) {
        item.classList.add('current');
      }

      const header = document.createElement('header');
      const title = document.createElement('span');
      title.className = 'plan-title';
      title.textContent = plan.label;
      header.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'plan-meta';
      meta.innerHTML = `
        <span>${plan.maxTaps.toLocaleString()} taps every hour</span>
        <span>Reward boost ×${plan.rewardMultiplier.toFixed(2)}</span>
      `;

      const description = document.createElement('p');
      description.className = 'overlay-description';
      description.textContent = plan.description;

      const actions = document.createElement('div');
      actions.className = 'plan-actions';

      if (plan.id === activePlanId) {
        const badge = document.createElement('span');
        badge.textContent = 'Current plan';
        badge.className = 'form-feedback success';
        actions.appendChild(badge);
      } else {
        const pointsButton = document.createElement('button');
        pointsButton.type = 'button';
        pointsButton.className = 'primary-action';
        pointsButton.textContent = plan.upgradeCost
          ? `Upgrade for ${plan.upgradeCost.toLocaleString()} pts`
          : 'Switch to this plan';
        pointsButton.addEventListener('click', () => {
          elements.upgradeFeedback.textContent = '';
          elements.upgradeFeedback.classList.remove('error', 'success');
          fetchWithAuth('/upgrade', {
            method: 'POST',
            body: JSON.stringify({ plan: plan.id }),
          })
            .then((body) => {
              if (body.user) {
                applyProfile(body.user);
              }
              if (body.state) {
                applyState(body.state, false);
              }
              elements.upgradeFeedback.textContent = `You are now on the ${plan.label} plan!`;
              elements.upgradeFeedback.classList.add('success');
              renderPlans(currentPlanId);
            })
            .catch((error) => {
              elements.upgradeFeedback.textContent = error.message;
              elements.upgradeFeedback.classList.add('error');
            });
        });
        actions.appendChild(pointsButton);

        if (plan.priceUSD > 0) {
          const cryptoButton = document.createElement('button');
          cryptoButton.type = 'button';
          cryptoButton.className = 'secondary-action';
          if (availableCryptoOptions.length > 0) {
            cryptoButton.textContent = `Pay $${plan.priceUSD.toFixed(2)} in crypto`;
            cryptoButton.addEventListener('click', () => {
              openCryptoOverlay(plan);
            });
          } else {
            cryptoButton.textContent = 'Crypto payments unavailable';
            cryptoButton.disabled = true;
          }
          actions.appendChild(cryptoButton);
        }
      }

      item.appendChild(header);
      item.appendChild(meta);
      item.appendChild(description);
      item.appendChild(actions);
      elements.planList.appendChild(item);
    });
  }

  function resetCryptoInvoice() {
    if (!elements.cryptoInvoice) {
      return;
    }
    elements.cryptoInvoice.classList.add('is-hidden');
    if (elements.cryptoAmount) {
      elements.cryptoAmount.textContent = '';
    }
    if (elements.cryptoCurrencyLabel) {
      elements.cryptoCurrencyLabel.textContent = '';
    }
    if (elements.cryptoAddress) {
      elements.cryptoAddress.textContent = '';
    }
    if (elements.cryptoReference) {
      elements.cryptoReference.textContent = '';
    }
    if (elements.cryptoCopy) {
      elements.cryptoCopy.disabled = true;
    }
  }

  function renderCryptoOptions() {
    if (!elements.cryptoCurrency) {
      return;
    }
    elements.cryptoCurrency.innerHTML = '';
    const enabledOptions = cryptoOptions.filter((option) => option.addressAvailable);
    if (enabledOptions.length === 0) {
      const placeholder = document.createElement('option');
      placeholder.textContent = 'No crypto methods configured yet';
      placeholder.disabled = true;
      placeholder.value = '';
      elements.cryptoCurrency.appendChild(placeholder);
      elements.cryptoCurrency.disabled = true;
      return;
    }
    enabledOptions.forEach((option, index) => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = option.label;
      if (index === 0) {
        opt.selected = true;
      }
      elements.cryptoCurrency.appendChild(opt);
    });
    elements.cryptoCurrency.disabled = false;
  }

  function openCryptoOverlay(plan) {
    if (!ensureAuthenticated()) {
      return;
    }
    selectedPlanForCrypto = plan;
    resetCryptoInvoice();
    if (elements.cryptoFeedback) {
      elements.cryptoFeedback.textContent = '';
      elements.cryptoFeedback.classList.remove('error', 'success');
    }
    if (elements.cryptoPlanName) {
      elements.cryptoPlanName.textContent = plan.label;
    }
    if (elements.cryptoPrice) {
      const priceText = plan.priceUSD
        ? `Plan price: $${plan.priceUSD.toFixed(2)} (settled in your chosen token)`
        : 'Contact support for pricing details.';
      elements.cryptoPrice.textContent = priceText;
    }
    renderCryptoOptions();
    showOverlay('crypto-overlay');
  }

  function findCryptoOption(optionId) {
    return cryptoOptions.find((option) => option.id === optionId);
  }

  function copyToClipboard(text) {
    if (!text) {
      return Promise.resolve();
    }
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.setAttribute('readonly', '');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    return Promise.resolve();
  }

  function fetchState(animate = false) {
    if (!ensureAuthenticated()) {
      return Promise.resolve();
    }
    return fetchWithAuth('/state')
      .then((data) => {
        applyState(data, animate);
      })
      .catch((error) => {
        setStatus(error.message || 'Unable to synchronise with the server.', 'error');
        if (error.status === 401) {
          setAuthToken('');
          ensureAuthenticated();
        }
      });
  }

  function requestTap(amount) {
    const safeAmount = Math.max(0, Math.floor(amount));
    if (!safeAmount || !isClickable) {
      return;
    }
    if (!ensureAuthenticated()) {
      return;
    }

    fetchWithAuth('/tap', {
      method: 'POST',
      body: JSON.stringify({ amount: safeAmount }),
    })
      .then((data) => {
        applyState(data);
      })
      .catch((error) => {
        setStatus(error.message || 'Unable to process tap.', 'error');
        if (error.status === 401) {
          setAuthToken('');
          ensureAuthenticated();
        }
      });
  }

  function handleAuthSuccess(body) {
    if (!body || !body.token) {
      throw new Error('Authentication failed');
    }
    setAuthToken(body.token);
    hideOverlay('auth-overlay');
    elements.loginForm.reset();
    elements.registerForm.reset();
    setAuthFeedback('');
    if (body.user) {
      applyProfile(body.user);
    }
    if (body.state) {
      applyState(body.state, false);
    } else {
      fetchState(false);
    }
    setStatus('You are signed in. Start tapping!');
    isClickable = true;
  }

  // Event listeners
  elements.icon.addEventListener('click', () => {
    requestTap(1);
  });

  elements.icon.addEventListener(
    'touchstart',
    (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      const touches = event.touches?.length || 1;
      requestTap(touches);
    },
    { passive: false },
  );

  if (elements.logout) {
    elements.logout.addEventListener('click', () => {
      setAuthToken('');
      setStatus('You have been signed out.');
      isClickable = false;
      showOverlay('auth-overlay');
    });
  }

  elements.loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    setAuthFeedback('Signing you in...');
    const payload = {
      username: elements.loginUsername.value.trim().toLowerCase(),
      password: elements.loginPassword.value,
    };

    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().catch(() => ({})).then((body) => {
            throw new Error(body.message || 'Unable to sign in.');
          });
        }
        return response.json();
      })
      .then((data) => {
        setAuthFeedback('Welcome back! Tap away.', 'success');
        handleAuthSuccess(data);
      })
      .catch((error) => {
        setAuthFeedback(error.message, 'error');
      });
  });

  elements.registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    setAuthFeedback('Creating your account...');
    const payload = {
      username: elements.registerUsername.value.trim().toLowerCase(),
      password: elements.registerPassword.value,
    };

    fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().catch(() => ({})).then((body) => {
            throw new Error(body.message || 'Unable to create account.');
          });
        }
        return response.json();
      })
      .then((data) => {
        setAuthFeedback('Account created! You are ready to play.', 'success');
        handleAuthSuccess(data);
      })
      .catch((error) => {
        setAuthFeedback(error.message, 'error');
      });
  });

  elements.showRegister.addEventListener('click', () => {
    toggleAuthForms(true);
  });

  elements.showLogin.addEventListener('click', () => {
    toggleAuthForms(false);
  });

  elements.closeAuth.addEventListener('click', () => {
    if (authToken) {
      hideOverlay('auth-overlay');
    }
  });

  document.querySelectorAll('[data-close-overlay]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget.getAttribute('data-close-overlay');
      hideOverlay(target);
      if (target === 'crypto-overlay') {
        selectedPlanForCrypto = null;
        resetCryptoInvoice();
      }
    });
  });

  elements.upgradeButton.addEventListener('click', () => {
    if (!ensureAuthenticated()) {
      return;
    }
    elements.upgradeFeedback.textContent = '';
    elements.upgradeFeedback.classList.remove('error', 'success');
    fetchPlans()
      .then(() => {
        renderPlans(currentPlanId);
        showOverlay('upgrade-overlay');
      })
      .catch((error) => {
        setStatus(error.message, 'error');
      });
  });

  elements.cashoutButton.addEventListener('click', () => {
    if (!ensureAuthenticated()) {
      return;
    }
    elements.cashoutFeedback.textContent = '';
    elements.cashoutFeedback.classList.remove('error', 'success');
    elements.cashoutForm.reset();
    showOverlay('cashout-overlay');
  });

  elements.cashoutForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ensureAuthenticated()) {
      return;
    }
    const amount = Number.parseInt(elements.cashoutAmount.value, 10);
    elements.cashoutFeedback.textContent = 'Processing cash out...';
    elements.cashoutFeedback.classList.remove('error', 'success');

    fetchWithAuth('/cashout', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    })
      .then((data) => {
        if (data.user) {
          applyProfile(data.user);
        }
        if (data.state) {
          applyState(data.state, false);
        }
        elements.cashoutFeedback.textContent = 'Converted to cash successfully!';
        elements.cashoutFeedback.classList.add('success');
      })
      .catch((error) => {
        elements.cashoutFeedback.textContent = error.message;
        elements.cashoutFeedback.classList.add('error');
      });
  });

  if (elements.cryptoForm) {
    elements.cryptoForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!ensureAuthenticated()) {
        return;
      }
      if (!selectedPlanForCrypto) {
        elements.cryptoFeedback.textContent = 'Select a plan to continue.';
        elements.cryptoFeedback.classList.remove('success');
        elements.cryptoFeedback.classList.add('error');
        return;
      }
      if (!elements.cryptoCurrency || elements.cryptoCurrency.disabled) {
        elements.cryptoFeedback.textContent = 'Crypto payments are not available right now.';
        elements.cryptoFeedback.classList.remove('success');
        elements.cryptoFeedback.classList.add('error');
        return;
      }
      const currency = elements.cryptoCurrency.value;
      if (!currency) {
        elements.cryptoFeedback.textContent = 'Choose a cryptocurrency option.';
        elements.cryptoFeedback.classList.remove('success');
        elements.cryptoFeedback.classList.add('error');
        return;
      }
      elements.cryptoFeedback.textContent = 'Generating payment instructions...';
      elements.cryptoFeedback.classList.remove('error', 'success');
      fetchWithAuth('/upgrade/crypto', {
        method: 'POST',
        body: JSON.stringify({ plan: selectedPlanForCrypto.id, currency }),
      })
        .then((body) => {
          if (!body?.payment) {
            throw new Error('Unable to create payment request.');
          }
          const payment = body.payment;
          const option = findCryptoOption(payment.currency) || { label: payment.currency };
          if (elements.cryptoAmount && Number.isFinite(Number(payment.amountUSD))) {
            elements.cryptoAmount.textContent = Number(payment.amountUSD).toFixed(2);
          }
          if (elements.cryptoCurrencyLabel) {
            elements.cryptoCurrencyLabel.textContent = option.label;
          }
          if (elements.cryptoAddress) {
            elements.cryptoAddress.textContent = payment.address;
          }
          if (elements.cryptoReference) {
            elements.cryptoReference.textContent = payment.id;
          }
          if (elements.cryptoInvoice) {
            elements.cryptoInvoice.classList.remove('is-hidden');
          }
          if (elements.cryptoCopy) {
            elements.cryptoCopy.disabled = false;
          }
          elements.cryptoFeedback.textContent = 'Payment request created. Complete your transfer and wait for admin confirmation.';
          elements.cryptoFeedback.classList.remove('error');
          elements.cryptoFeedback.classList.add('success');
        })
        .catch((error) => {
          elements.cryptoFeedback.textContent = error.message || 'Unable to create payment request.';
          elements.cryptoFeedback.classList.remove('success');
          elements.cryptoFeedback.classList.add('error');
        });
    });
  }

  if (elements.cryptoCopy) {
    elements.cryptoCopy.addEventListener('click', () => {
      const address = elements.cryptoAddress?.textContent?.trim();
      if (!address) {
        return;
      }
      copyToClipboard(address)
        .then(() => {
          if (elements.cryptoFeedback) {
            elements.cryptoFeedback.textContent = 'Address copied to clipboard.';
            elements.cryptoFeedback.classList.remove('error');
            elements.cryptoFeedback.classList.add('success');
          }
        })
        .catch(() => {
          if (elements.cryptoFeedback) {
            elements.cryptoFeedback.textContent = 'Unable to copy automatically. Copy the address manually.';
            elements.cryptoFeedback.classList.remove('success');
            elements.cryptoFeedback.classList.add('error');
          }
        });
    });
  }

  if (authToken) {
    fetchWithAuth('/auth/me')
      .then((data) => {
        if (data.user) {
          applyProfile(data.user);
        }
        if (data.state) {
          applyState(data.state, false);
        }
        hideOverlay('auth-overlay');
        isClickable = true;
      })
      .catch(() => {
        setAuthToken('');
        ensureAuthenticated();
      });
  } else {
    ensureAuthenticated();
  }
});
