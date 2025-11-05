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
  },
  silver: {
    id: 'silver',
    label: 'Silver',
    description: 'Unlock 2.5k taps and a 25% reward boost.',
    maxTaps: 2500,
    rewardMultiplier: 1.25,
    upgradeCost: 5000,
  },
  gold: {
    id: 'gold',
    label: 'Gold',
    description: 'Go big with 5k taps and 50% more rewards.',
    maxTaps: 5000,
    rewardMultiplier: 1.5,
    upgradeCost: 15000,
  },
  platinum: {
    id: 'platinum',
    label: 'Platinum',
    description: 'Maximise with 10k taps and double rewards.',
    maxTaps: 10000,
    rewardMultiplier: 2,
    upgradeCost: 40000,
  },
};

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
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);

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

app.get(
  '/api/plans',
  asyncHandler(async (req, res) => {
    const plans = Object.values(PLAN_CONFIG).map(buildPlanSnapshot);
    res.json({ plans });
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
  .then(() => {
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
