const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load environment variables from backend/.env first, then from project root as a fallback.
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

const app = express();

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ethpoint';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-ethpoint-key';
const RESET_DELAY_MS = Number.parseInt(process.env.RESET_DELAY_MS || '', 10) || 60 * 60 * 1000;
const STATIC_ROOT = path.resolve(__dirname, '..');

const PLAN_CONFIG = {
  free: {
    id: 'free',
    label: 'Free',
    description: 'Start earning points with the base plan.',
    maxTaps: 1000,
    rewardMultiplier: 1,
    upgradeCost: 0,
    priceUSD: 0,
  },
  silver: {
    id: 'silver',
    label: 'Silver',
    description: 'Unlock 2.5k taps and a 25% reward boost.',
    maxTaps: 2500,
    rewardMultiplier: 1.25,
    upgradeCost: 5000,
    priceUSD: 25,
  },
  gold: {
    id: 'gold',
    label: 'Gold',
    description: 'Go big with 5k taps and 50% more rewards.',
    maxTaps: 5000,
    rewardMultiplier: 1.5,
    upgradeCost: 15000,
    priceUSD: 60,
  },
  platinum: {
    id: 'platinum',
    label: 'Platinum',
    description: 'Maximise with 10k taps and double rewards.',
    maxTaps: 10000,
    rewardMultiplier: 2,
    upgradeCost: 40000,
    priceUSD: 120,
  },
};

const CRYPTO_PAYMENT_OPTIONS = [
  { id: 'usdt-bep20', label: 'USDT (BEP20/BSC)' },
  { id: 'usdt-trc20', label: 'USDT (TRC20/TRON)' },
  { id: 'usdc-erc20', label: 'USDC (ERC20)' },
  { id: 'bnb-bep20', label: 'BNB (BEP20/BSC)' },
];

const CRYPTO_ADDRESSES = CRYPTO_PAYMENT_OPTIONS.reduce((map, option) => {
  const envKey = `ADDRESS_${option.id.replace(/[-]/g, '_').toUpperCase()}`;
  // eslint-disable-next-line no-param-reassign
  map[option.id] = process.env[envKey] || '';
  return map;
}, {});

mongoose.set('strictQuery', true);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    tapRemaining: {
      type: Number,
      default: PLAN_CONFIG.free.maxTaps,
      min: 0,
    },
    lastResetAt: {
      type: Date,
      default: () => new Date(),
    },
    plan: {
      type: String,
      enum: Object.keys(PLAN_CONFIG),
      default: 'free',
    },
    cashBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    plan: {
      type: String,
      enum: Object.keys(PLAN_CONFIG),
      required: true,
    },
    currency: {
      type: String,
      enum: CRYPTO_PAYMENT_OPTIONS.map((option) => option.id),
      required: true,
    },
    amountUSD: {
      type: Number,
      required: true,
      min: 0,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected'],
      default: 'pending',
    },
    txHash: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

const CryptoPayment = mongoose.model('CryptoPayment', paymentSchema);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: false,
  }),
);
app.use(express.json());
app.use(express.static(STATIC_ROOT));

function buildPlanSnapshot(planKey) {
  const plan = PLAN_CONFIG[planKey] || PLAN_CONFIG.free;
  return {
    id: plan.id,
    label: plan.label,
    description: plan.description,
    maxTaps: plan.maxTaps,
    rewardMultiplier: plan.rewardMultiplier,
    upgradeCost: plan.upgradeCost,
    priceUSD: plan.priceUSD,
  };
}

async function ensureTapWindow(user) {
  const plan = PLAN_CONFIG[user.plan] || PLAN_CONFIG.free;
  const lastReset = user.lastResetAt ? user.lastResetAt.getTime() : 0;
  const now = Date.now();
  const elapsed = now - lastReset;
  if (elapsed >= RESET_DELAY_MS) {
    user.tapRemaining = plan.maxTaps;
    user.lastResetAt = new Date(now);
    await user.save();
    return RESET_DELAY_MS;
  }
  return RESET_DELAY_MS - elapsed;
}

function buildState(user, awarded = 0) {
  const plan = PLAN_CONFIG[user.plan] || PLAN_CONFIG.free;
  const now = Date.now();
  const lastReset = user.lastResetAt ? user.lastResetAt.getTime() : now;
  const elapsed = now - lastReset;
  const resetInMs = Math.max(RESET_DELAY_MS - elapsed, 0);

  return {
    balance: Math.floor(user.balance),
    remaining: Math.max(0, Math.floor(user.tapRemaining)),
    initialRemaining: plan.maxTaps,
    resetInMs,
    awarded,
    plan: buildPlanSnapshot(user.plan),
    cashBalance: Math.floor(user.cashBalance || 0),
  };
}

function buildProfile(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    plan: buildPlanSnapshot(user.plan),
    balance: Math.floor(user.balance),
    cashBalance: Math.floor(user.cashBalance || 0),
    role: user.role,
  };
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function authorizeAdmin(req, res, next) {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  User.findById(req.userId)
    .then((user) => {
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Admin access required' });
        return;
      }
      req.currentUser = user;
      next();
    })
    .catch(next);
}

function applyPlanToUser(user, planId) {
  const plan = PLAN_CONFIG[planId] || PLAN_CONFIG.free;
  user.plan = plan.id;
  user.tapRemaining = plan.maxTaps;
  user.lastResetAt = new Date(Date.now());
}

async function ensureDefaultAdmin() {
  const username = process.env.DEFAULT_ADMIN_USERNAME;
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!username || !password) {
    return;
  }

  const normalized = username.toLowerCase();
  const existing = await User.findOne({ username: normalized });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({
      username: normalized,
      passwordHash,
      plan: 'free',
      tapRemaining: PLAN_CONFIG.free.maxTaps,
      role: 'admin',
    });
    return;
  }

  if (existing.role !== 'admin') {
    existing.role = 'admin';
  }

  const passwordMatches = await bcrypt.compare(password, existing.passwordHash);
  if (!passwordMatches) {
    existing.passwordHash = await bcrypt.hash(password, 12);
  }

  await existing.save();
}

app.get(
  '/api/plans',
  asyncHandler(async (req, res) => {
    const plans = Object.values(PLAN_CONFIG).map(buildPlanSnapshot);
    res.json({
      plans,
      cryptoOptions: CRYPTO_PAYMENT_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        addressAvailable: Boolean(CRYPTO_ADDRESSES[option.id]),
      })),
    });
  }),
);

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || typeof username !== 'string' || username.length < 3) {
      res.status(400).json({ message: 'Username must be at least 3 characters.' });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters.' });
      return;
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      res.status(409).json({ message: 'Username already exists.' });
      return;
    }

    const plan = PLAN_CONFIG.free;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: username.toLowerCase(),
      passwordHash,
      plan: plan.id,
      tapRemaining: plan.maxTaps,
    });

    const token = jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: buildProfile(user), state: buildState(user) });
  }),
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ message: 'Username and password are required.' });
      return;
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    await ensureTapWindow(user);
    const token = jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: buildProfile(user), state: buildState(user) });
  }),
);

app.get(
  '/api/auth/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(401).json({ message: 'User no longer exists.' });
      return;
    }

    await ensureTapWindow(user);
    res.json({ user: buildProfile(user), state: buildState(user) });
  }),
);

app.get(
  '/api/state',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    await ensureTapWindow(user);
    res.json(buildState(user));
  }),
);

app.post(
  '/api/tap',
  authenticate,
  asyncHandler(async (req, res) => {
    const { amount } = req.body || {};
    const requestedAmount = Number.parseInt(amount, 10);

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const plan = PLAN_CONFIG[user.plan] || PLAN_CONFIG.free;
    await ensureTapWindow(user);

    const safeAmount = Number.isFinite(requestedAmount)
      ? Math.max(0, Math.min(requestedAmount, user.tapRemaining))
      : 0;

    if (safeAmount === 0) {
      res.json(buildState(user, 0));
      return;
    }

    const awarded = Math.round(safeAmount * plan.rewardMultiplier);
    user.balance += awarded;
    user.tapRemaining -= safeAmount;
    if (user.tapRemaining <= 0) {
      user.tapRemaining = 0;
      user.lastResetAt = new Date(Date.now());
    }

    await user.save();

    res.json(buildState(user, awarded));
  }),
);

app.post(
  '/api/upgrade',
  authenticate,
  asyncHandler(async (req, res) => {
    const { plan: requestedPlan } = req.body || {};

    if (!requestedPlan || typeof requestedPlan !== 'string' || !PLAN_CONFIG[requestedPlan]) {
      res.status(400).json({ message: 'Unknown plan selected.' });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const targetPlan = PLAN_CONFIG[requestedPlan];
    const currentPlan = PLAN_CONFIG[user.plan] || PLAN_CONFIG.free;

    if (targetPlan.id === currentPlan.id) {
      res.status(400).json({ message: 'You are already on this plan.' });
      return;
    }

    if (targetPlan.upgradeCost > user.balance) {
      res.status(400).json({ message: 'Not enough balance to upgrade.' });
      return;
    }

    user.balance -= targetPlan.upgradeCost;
    user.plan = targetPlan.id;
    user.tapRemaining = targetPlan.maxTaps;
    user.lastResetAt = new Date(Date.now());

    await user.save();

    res.json({ user: buildProfile(user), state: buildState(user) });
  }),
);

app.post(
  '/api/upgrade/crypto',
  authenticate,
  asyncHandler(async (req, res) => {
    const { plan: requestedPlan, currency } = req.body || {};

    if (!requestedPlan || typeof requestedPlan !== 'string' || !PLAN_CONFIG[requestedPlan]) {
      res.status(400).json({ message: 'Unknown plan selected.' });
      return;
    }

    if (!currency || typeof currency !== 'string') {
      res.status(400).json({ message: 'Select a cryptocurrency option.' });
      return;
    }

    const paymentOption = CRYPTO_PAYMENT_OPTIONS.find((option) => option.id === currency);
    if (!paymentOption) {
      res.status(400).json({ message: 'Unsupported cryptocurrency selection.' });
      return;
    }

    const address = CRYPTO_ADDRESSES[paymentOption.id];
    if (!address) {
      res.status(400).json({ message: 'Payment option not configured yet. Please contact support.' });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const targetPlan = PLAN_CONFIG[requestedPlan];
    const currentPlan = PLAN_CONFIG[user.plan] || PLAN_CONFIG.free;

    if (targetPlan.id === currentPlan.id) {
      res.status(400).json({ message: 'You are already on this plan.' });
      return;
    }

    const payment = await CryptoPayment.create({
      user: user._id,
      plan: targetPlan.id,
      currency: paymentOption.id,
      amountUSD: targetPlan.priceUSD,
      address,
    });

    res.status(201).json({
      payment: {
        id: payment._id.toString(),
        plan: buildPlanSnapshot(payment.plan),
        currency: payment.currency,
        amountUSD: payment.amountUSD,
        address: payment.address,
        status: payment.status,
        createdAt: payment.createdAt,
      },
      cryptoOptions: CRYPTO_PAYMENT_OPTIONS,
    });
  }),
);

app.post(
  '/api/cashout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { amount } = req.body || {};
    const requested = Number.parseInt(amount, 10);

    if (!Number.isFinite(requested) || requested <= 0) {
      res.status(400).json({ message: 'Enter a valid amount to cash out.' });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    if (requested > user.balance) {
      res.status(400).json({ message: 'Insufficient balance for cash out.' });
      return;
    }

    user.balance -= requested;
    user.cashBalance += requested;
    await user.save();

    res.json({ user: buildProfile(user), state: buildState(user) });
  }),
);

app.get(
  '/api/admin/users',
  authenticate,
  authorizeAdmin,
  asyncHandler(async (req, res) => {
    const { search } = req.query || {};
    const conditions = {};

    if (search && typeof search === 'string') {
      conditions.username = { $regex: search.trim(), $options: 'i' };
    }

    const users = await User.find(conditions)
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();

    res.json({
      users: users.map((user) => ({
        ...buildProfile(user),
        tapRemaining: user.tapRemaining,
        lastResetAt: user.lastResetAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      total: await User.countDocuments(conditions),
    });
  }),
);

app.get(
  '/api/admin/users/:id',
  authenticate,
  authorizeAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    res.json({
      ...buildProfile(user),
      tapRemaining: user.tapRemaining,
      lastResetAt: user.lastResetAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }),
);

app.patch(
  '/api/admin/users/:id',
  authenticate,
  authorizeAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const { plan, balance, tapRemaining, cashBalance, role } = req.body || {};

    if (plan && PLAN_CONFIG[plan]) {
      applyPlanToUser(user, plan);
    }

    if (balance !== undefined) {
      const parsedBalance = Number(balance);
      if (Number.isFinite(parsedBalance)) {
        user.balance = Math.max(0, parsedBalance);
      }
    }

    if (tapRemaining !== undefined) {
      const parsedTaps = Number(tapRemaining);
      if (Number.isFinite(parsedTaps)) {
        user.tapRemaining = Math.max(0, parsedTaps);
      }
    }

    if (cashBalance !== undefined) {
      const parsedCash = Number(cashBalance);
      if (Number.isFinite(parsedCash)) {
        user.cashBalance = Math.max(0, parsedCash);
      }
    }

    if (role && ['user', 'admin'].includes(role)) {
      user.role = role;
    }

    await user.save();

    res.json({ user: buildProfile(user) });
  }),
);

app.get(
  '/api/admin/payments',
  authenticate,
  authorizeAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.query || {};
    const conditions = {};
    if (status && ['pending', 'confirmed', 'rejected'].includes(status)) {
      conditions.status = status;
    }

    const payments = await CryptoPayment.find(conditions)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('user')
      .exec();

    res.json({
      payments: payments.map((payment) => ({
        id: payment._id.toString(),
        user: payment.user ? buildProfile(payment.user) : null,
        plan: buildPlanSnapshot(payment.plan),
        currency: payment.currency,
        amountUSD: payment.amountUSD,
        address: payment.address,
        status: payment.status,
        txHash: payment.txHash,
        notes: payment.notes,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })),
      total: await CryptoPayment.countDocuments(conditions),
    });
  }),
);

app.patch(
  '/api/admin/payments/:id',
  authenticate,
  authorizeAdmin,
  asyncHandler(async (req, res) => {
    const payment = await CryptoPayment.findById(req.params.id).populate('user');
    if (!payment) {
      res.status(404).json({ message: 'Payment not found.' });
      return;
    }

    const { status, txHash, notes } = req.body || {};

    if (status && ['pending', 'confirmed', 'rejected'].includes(status)) {
      payment.status = status;
    }

    if (txHash !== undefined) {
      payment.txHash = typeof txHash === 'string' ? txHash.trim() : '';
    }

    if (notes !== undefined) {
      payment.notes = typeof notes === 'string' ? notes.trim() : '';
    }

    if (payment.status === 'confirmed' && payment.user) {
      applyPlanToUser(payment.user, payment.plan);
      await payment.user.save();
    }

    await payment.save();

    res.json({
      payment: {
        id: payment._id.toString(),
        user: payment.user ? buildProfile(payment.user) : null,
        plan: buildPlanSnapshot(payment.plan),
        currency: payment.currency,
        amountUSD: payment.amountUSD,
        address: payment.address,
        status: payment.status,
        txHash: payment.txHash,
        notes: payment.notes,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });
  }),
);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  next();
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ message: 'Unexpected error, please try again later.' });
});

app.get('*', (req, res) => {
  const target = path.join(STATIC_ROOT, req.path);
  res.sendFile(target, (error) => {
    if (!error) {
      return;
    }

    if (error.code === 'ENOENT') {
      res.status(404).sendFile(path.join(STATIC_ROOT, 'index.html'));
      return;
    }

    res.status(500).send('Internal Server Error');
  });
});

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    await ensureDefaultAdmin();
    // eslint-disable-next-line no-console
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`EthPoint backend listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', error);
});
