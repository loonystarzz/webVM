import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { vmRouter } from './routes/vm.js';
import { getVM, ensureVMRunning, getVMSpicePort, startCleanupScheduler } from './lib/vmManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, './public')));

app.use('/api/vm', vmRouter);

app.get('/vm/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const meta = await getVM(code); // getVM writes lastAccessed internally
  if (!meta) return res.status(404).sendFile(path.join(__dirname, './public/404.html'));
  res.redirect(`/viewer.html?code=${code}&type=${encodeURIComponent(meta.type)}`);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './public/index.html'));
});

// WebSocket proxy: /ws/:code  <->  SPICE TCP
server.on('upgrade', async (req, socket, head) => {
  const match = req.url.match(/^\/ws\/([A-Fa-f0-9]{6})$/i);
  if (!match) { socket.destroy(); return; }

  const code = match[1].toUpperCase();
  const meta = await getVM(code); // also updates lastAccessed
  if (!meta) { socket.destroy(); return; }

  try {
    await ensureVMRunning(meta);
    const spicePort = await getVMSpicePort(meta.vmName);
    if (!spicePort) { socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const tcp = net.createConnection({ host: '127.0.0.1', port: spicePort });

      tcp.on('connect', () => {
        ws.on('message', (data) => { if (tcp.writable) tcp.write(data); });
        tcp.on('data', (data) => { if (ws.readyState === ws.OPEN) ws.send(data, { binary: true }); });
        ws.on('close', () => tcp.destroy());
        ws.on('error', () => tcp.destroy());
        tcp.on('close', () => { try { ws.terminate(); } catch {} });
        tcp.on('error', (err) => { console.error(`SPICE TCP [${code}]:`, err.message); try { ws.terminate(); } catch {} });
      });

      tcp.on('error', (err) => {
        console.error(`SPICE connect [${code}]:`, err.message);
        try { ws.terminate(); } catch {}
      });
    });
  } catch (err) {
    console.error('WS upgrade error:', err);
    socket.destroy();
  }
});

const PORT = process.env.PORT || 3103;
server.listen(PORT, () => {
  console.log(`\n🖥️  VM Portal running on http://localhost:${PORT}\n`);
  startCleanupScheduler();
});
