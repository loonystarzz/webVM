import { Router } from 'express';
import { createVM, getVM, getVMStatus, ensureVMRunning, getVMSpicePort } from '../lib/vmManager.js';

export const vmRouter = Router();

// ── IP rate limiting ──────────────────────────────────────────────────────────
// Maps IP → timestamp (ms) of last successful VM creation
const ipLastCreated = new Map();
const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours

function getClientIP(req) {
  // Respect X-Forwarded-For if behind a reverse proxy (nginx, Cloudflare, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
}

function checkCooldown(ip) {
  const last = ipLastCreated.get(ip);
  if (!last) return null; // no cooldown
  const elapsed = Date.now() - last;
  if (elapsed < COOLDOWN_MS) {
    const remaining = COOLDOWN_MS - elapsed;
    const mins = Math.ceil(remaining / 60000);
    const hrs  = Math.floor(mins / 60);
    const rem  = mins % 60;
    const label = hrs > 0
      ? `${hrs}h ${rem}m`
      : `${mins}m`;
    return label;
  }
  return null; // cooldown expired
}
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/vm/create  body: { type: 'xp' | '2000' }
vmRouter.post('/create', async (req, res) => {
  const { type } = req.body;
  if (!['xp', '2000'].includes(type)) {
    return res.status(400).json({ error: 'type must be "xp" or "2000"' });
  }

  const ip = getClientIP(req);
  const wait = checkCooldown(ip);
  if (wait) {
    return res.status(429).json({
      error: `You can only create a VM once every 3 hours. Try again in ${wait}.`,
      retryAfter: wait
    });
  }

  try {
    const result = await createVM(type);
    ipLastCreated.set(ip, Date.now()); // record creation time
    res.json({ success: true, code: result.code, type: result.type });
  } catch (err) {
    console.error('createVM error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vm/:code
vmRouter.get('/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const meta = await getVM(code);
  if (!meta) return res.status(404).json({ error: 'VM not found' });

  const status = await getVMStatus(meta.vmName);
  res.json({ code, type: meta.type, status });
});

// POST /api/vm/:code/start — ensures VM is running and returns its SPICE info
vmRouter.post('/:code/start', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const meta = await getVM(code);
  if (!meta) return res.status(404).json({ error: 'VM not found' });

  try {
    await ensureVMRunning(meta);
    const port = await getVMSpicePort(meta.vmName);
    if (!port) return res.status(500).json({ error: 'Could not get SPICE port' });
    res.json({ success: true, code, type: meta.type, spicePort: port });
  } catch (err) {
    console.error('start error:', err);
    res.status(500).json({ error: err.message });
  }
});
