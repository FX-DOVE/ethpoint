document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    loginSection: document.getElementById('admin-login'),
    dashboard: document.getElementById('admin-dashboard'),
    loginForm: document.getElementById('admin-login-form'),
    loginUsername: document.getElementById('admin-username'),
    loginPassword: document.getElementById('admin-password'),
    loginFeedback: document.getElementById('admin-login-feedback'),
    logout: document.getElementById('admin-logout'),
    status: document.getElementById('admin-status'),
    usersTotal: document.getElementById('admin-users-total'),
    usersBody: document.getElementById('admin-users-body'),
    userForm: document.getElementById('admin-user-form'),
    userId: document.getElementById('admin-user-id'),
    userName: document.getElementById('admin-user-name'),
    userPlan: document.getElementById('admin-user-plan'),
    userBalance: document.getElementById('admin-user-balance'),
    userTaps: document.getElementById('admin-user-taps'),
    userCash: document.getElementById('admin-user-cash'),
    userRole: document.getElementById('admin-user-role'),
    userFeedback: document.getElementById('admin-user-feedback'),
    paymentsBody: document.getElementById('admin-payments-body'),
  };

  const API_BASE = '/api';
  let authToken = localStorage.getItem('ethpoint_admin_token') || '';
  let plans = [];
  let cryptoOptions = [];
  let planMap = new Map();
  let users = [];
  let payments = [];
  let selectedUserId = '';
  let usersTotalCount = 0;

  function setStatus(message, variant = '') {
    if (!elements.status) {
      return;
    }
    elements.status.textContent = message || '';
    elements.status.classList.remove('success', 'error');
    if (variant) {
      elements.status.classList.add(variant);
    }
  }

  function setLoginFeedback(message, variant = '') {
    if (!elements.loginFeedback) {
      return;
    }
    elements.loginFeedback.textContent = message;
    elements.loginFeedback.classList.remove('success', 'error');
    if (variant) {
      elements.loginFeedback.classList.add(variant);
    }
  }

  function setUserFeedback(message, variant = '') {
    if (!elements.userFeedback) {
      return;
    }
    elements.userFeedback.textContent = message;
    elements.userFeedback.classList.remove('success', 'error');
    if (variant) {
      elements.userFeedback.classList.add(variant);
    }
  }

  function setAuthToken(token) {
    authToken = token || '';
    if (authToken) {
      localStorage.setItem('ethpoint_admin_token', authToken);
      if (elements.logout) {
        elements.logout.disabled = false;
      }
    } else {
      localStorage.removeItem('ethpoint_admin_token');
      if (elements.logout) {
        elements.logout.disabled = true;
      }
    }
  }

  function showDashboard(show) {
    if (elements.loginSection) {
      elements.loginSection.classList.toggle('is-hidden', show);
    }
    if (elements.dashboard) {
      elements.dashboard.classList.toggle('is-hidden', !show);
    }
    if (!show) {
      setStatus('');
      setUserFeedback('');
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
        return response
          .json()
          .catch(() => ({}))
          .then((body) => {
            const error = new Error(body.message || `Request failed with ${response.status}`);
            error.status = response.status;
            throw error;
          });
      }
      return response.json();
    });
  }

  function loadPlans() {
    return fetch(`${API_BASE}/plans`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load plan catalogue.');
        }
        return response.json();
      })
      .then((data) => {
        plans = Array.isArray(data.plans) ? data.plans : [];
        cryptoOptions = Array.isArray(data.cryptoOptions) ? data.cryptoOptions : [];
        planMap = new Map(plans.map((plan) => [plan.id, plan]));
        if (elements.userPlan) {
          elements.userPlan.innerHTML = '';
          plans.forEach((plan) => {
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = `${plan.label} (${plan.maxTaps} taps)`;
            elements.userPlan.appendChild(option);
          });
          if (plans.length > 0) {
            elements.userPlan.value = plans[0].id;
          }
        }
      });
  }

  function formatNumber(value) {
    if (!Number.isFinite(Number(value))) {
      return '0';
    }
    return Number(value).toLocaleString();
  }

  function renderUsers() {
    if (!elements.usersBody) {
      return;
    }
    elements.usersBody.innerHTML = '';
    users.forEach((user) => {
      const row = document.createElement('tr');
      row.className = 'admin-row';
      row.dataset.id = user.id;
      const plan = planMap.get(user.plan?.id) || user.plan;
      row.innerHTML = `
        <td>${user.username}</td>
        <td>${plan?.label || user.plan?.label || '—'}</td>
        <td>${formatNumber(user.balance)}</td>
        <td>${formatNumber(user.tapRemaining)}</td>
        <td>${formatNumber(user.cashBalance)}</td>
        <td><span class="badge">${user.role || 'user'}</span></td>
      `;
      row.addEventListener('click', () => {
        selectUser(user.id);
      });
      elements.usersBody.appendChild(row);
    });
    if (elements.usersTotal) {
      elements.usersTotal.textContent = formatNumber(usersTotalCount);
    }
  }

  function renderPayments() {
    if (!elements.paymentsBody) {
      return;
    }
    elements.paymentsBody.innerHTML = '';
    if (payments.length === 0) {
      const emptyRow = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.textContent = 'No payment requests in this view.';
      emptyRow.appendChild(td);
      elements.paymentsBody.appendChild(emptyRow);
      return;
    }
    payments.forEach((payment) => {
      const row = document.createElement('tr');
      const plan = planMap.get(payment.plan?.id) || payment.plan;
      const userCell = payment.user?.username || 'Unknown';
      const option = cryptoOptions.find((entry) => entry.id === payment.currency);
      const currencyLabel = option?.label || payment.currency;

      const statusSelect = document.createElement('select');
      ['pending', 'confirmed', 'rejected'].forEach((status) => {
        const optionEl = document.createElement('option');
        optionEl.value = status;
        optionEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        if (status === payment.status) {
          optionEl.selected = true;
        }
        statusSelect.appendChild(optionEl);
      });

      const txInput = document.createElement('input');
      txInput.type = 'text';
      txInput.value = payment.txHash || '';
      txInput.placeholder = 'Transaction hash';

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'admin-button primary';
      saveButton.textContent = 'Update';
      saveButton.addEventListener('click', () => {
        updatePayment(payment.id, statusSelect.value, txInput.value);
      });

      const actionCell = document.createElement('td');
      actionCell.className = 'table-action';
      actionCell.append(statusSelect, txInput, saveButton);

      row.innerHTML = `
        <td>${userCell}</td>
        <td>${plan?.label || '—'}</td>
        <td>${currencyLabel}</td>
        <td>${Number(payment.amountUSD || 0).toFixed(2)}</td>
        <td></td>
        <td></td>
        <td></td>
      `;

      const cells = row.querySelectorAll('td');
      if (cells[4]) {
        cells[4].textContent = payment.status;
      }
      if (cells[5]) {
        cells[5].textContent = payment.txHash || '—';
      }
      row.replaceChild(actionCell, row.lastElementChild);
      elements.paymentsBody.appendChild(row);
    });
  }

  function selectUser(userId) {
    const user = users.find((entry) => entry.id === userId);
    if (!user) {
      return;
    }
    selectedUserId = user.id;
    if (elements.userId) {
      elements.userId.value = user.id;
    }
    if (elements.userName) {
      elements.userName.value = user.username;
    }
    if (elements.userPlan) {
      elements.userPlan.value = user.plan?.id || user.plan;
    }
    if (elements.userBalance) {
      elements.userBalance.value = Number(user.balance || 0);
    }
    if (elements.userTaps) {
      elements.userTaps.value = Number(user.tapRemaining || 0);
    }
    if (elements.userCash) {
      elements.userCash.value = Number(user.cashBalance || 0);
    }
    if (elements.userRole) {
      elements.userRole.value = user.role || 'user';
    }
    if (elements.userForm) {
      const submit = elements.userForm.querySelector('button[type="submit"]');
      if (submit) {
        submit.disabled = false;
      }
    }
    setUserFeedback('Editing user details.');
  }

  function clearUserSelection() {
    selectedUserId = '';
    if (elements.userId) {
      elements.userId.value = '';
    }
    if (elements.userName) {
      elements.userName.value = '';
    }
    if (elements.userPlan) {
      elements.userPlan.value = plans[0]?.id || '';
    }
    if (elements.userBalance) {
      elements.userBalance.value = '';
    }
    if (elements.userTaps) {
      elements.userTaps.value = '';
    }
    if (elements.userCash) {
      elements.userCash.value = '';
    }
    if (elements.userRole) {
      elements.userRole.value = 'user';
    }
    if (elements.userForm) {
      const submit = elements.userForm.querySelector('button[type="submit"]');
      if (submit) {
        submit.disabled = true;
      }
    }
  }

  function loadUsers() {
    return fetchWithAuth('/admin/users')
      .then((data) => {
        users = Array.isArray(data.users) ? data.users : [];
        usersTotalCount = Number(data.total) || users.length;
        renderUsers();
        if (!users.some((user) => user.id === selectedUserId)) {
          clearUserSelection();
        }
      })
      .catch((error) => {
        setStatus(error.message || 'Unable to load users.', 'error');
        if (error.status === 401) {
          handleLogout('Session expired. Please sign in again.');
        }
        throw error;
      });
  }

  function loadPayments() {
    return fetchWithAuth('/admin/payments?status=pending')
      .then((data) => {
        payments = Array.isArray(data.payments) ? data.payments : [];
        renderPayments();
      })
      .catch((error) => {
        setStatus(error.message || 'Unable to load payments.', 'error');
        if (error.status === 401) {
          handleLogout('Session expired. Please sign in again.');
        }
      });
  }

  function updatePayment(id, status, txHash) {
    fetchWithAuth(`/admin/payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, txHash }),
    })
      .then(() => {
        setStatus('Payment updated successfully.', 'success');
        return Promise.all([loadPayments(), loadUsers()]);
      })
      .catch((error) => {
        setStatus(error.message || 'Unable to update payment.', 'error');
        if (error.status === 401) {
          handleLogout('Session expired. Please sign in again.');
        }
      });
  }

  function handleLogin(event) {
    event.preventDefault();
    setLoginFeedback('Signing you in...');
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
          return response
            .json()
            .catch(() => ({}))
            .then((body) => {
              throw new Error(body.message || 'Unable to sign in.');
            });
        }
        return response.json();
      })
      .then((data) => {
        if (data.user?.role !== 'admin') {
          throw new Error('Administrator access required.');
        }
        setAuthToken(data.token);
        setLoginFeedback('Welcome back!', 'success');
        showDashboard(true);
        setStatus(`Signed in as ${data.user.username}`, 'success');
        return Promise.all([loadPlans(), loadUsers(), loadPayments()]);
      })
      .catch((error) => {
        setLoginFeedback(error.message, 'error');
        setAuthToken('');
      });
  }

  function handleUserUpdate(event) {
    event.preventDefault();
    if (!selectedUserId) {
      setUserFeedback('Select a user to update.', 'error');
      return;
    }
    const payload = {
      plan: elements.userPlan.value,
      balance: Number(elements.userBalance.value),
      tapRemaining: Number(elements.userTaps.value),
      cashBalance: Number(elements.userCash.value),
      role: elements.userRole.value,
    };
    setUserFeedback('Saving changes...');
    fetchWithAuth(`/admin/users/${selectedUserId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
      .then(() => {
        setUserFeedback('User updated successfully.', 'success');
        return loadUsers();
      })
      .catch((error) => {
        setUserFeedback(error.message || 'Unable to update user.', 'error');
        if (error.status === 401) {
          handleLogout('Session expired. Please sign in again.');
        }
      });
  }

  function handleLogout(message) {
    setAuthToken('');
    showDashboard(false);
    clearUserSelection();
    if (message) {
      setLoginFeedback(message, 'error');
    } else {
      setLoginFeedback('You have been signed out.');
    }
  }

  elements.loginForm.addEventListener('submit', handleLogin);
  elements.userForm.addEventListener('submit', handleUserUpdate);
  elements.logout.addEventListener('click', () => handleLogout());

  if (authToken) {
    fetchWithAuth('/admin/users')
      .then((data) => {
        showDashboard(true);
        setStatus('Restored previous admin session.', 'success');
        users = Array.isArray(data.users) ? data.users : [];
        usersTotalCount = Number(data.total) || users.length;
        return loadPlans().then(() => {
          renderUsers();
          return loadPayments();
        });
      })
      .catch(() => {
        setAuthToken('');
        showDashboard(false);
      });
  } else {
    showDashboard(false);
  }
});
