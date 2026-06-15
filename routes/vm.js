import { Router } from 'express';
import { createVM, getVM, getVMStatus, ensureVMRunning, getVMSpicePort } from '../lib/vmManager.js';

export const vmRouter = Router();

// POST /api/vm/create  body: { type: 'xp' | '2000' }
vmRouter.post('/create', async (req, res) => {
  const { type } = req.body;
  if (!['xp', '2000'].includes(type)) {
    return res.status(400).json({ error: 'type must be "xp" or "2000"' });
  }
  try {
    const result = await createVM(type);
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
