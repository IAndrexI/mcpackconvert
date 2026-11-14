import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT, HOST, ROOT_DIR } from './config.js';
import packsRouter from './routes/packs.js';
import modsRouter from './routes/mods.js';
import updatesRouter from './routes/updates.js';
import exportRouter from './routes/export.js';
import { ensurePacksDir } from './services/packManager.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static client frontend
const clientDir = path.join(ROOT_DIR, 'client');
app.use(express.static(clientDir));

// API Routes
app.use('/api/packs', packsRouter);
app.use('/api/mods', modsRouter);
app.use('/api/updates', updatesRouter);
app.use('/api/export', exportRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for SPA navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Start server
async function start() {
  await ensurePacksDir();
  app.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`   PackHub - Self-Hosted Modpack Manager Server        `);
    console.log(`   Web Dashboard: http://localhost:${PORT}             `);
    console.log(`   API Endpoint:  http://localhost:${PORT}/api         `);
    console.log(`=======================================================`);
  });
}

start().catch(err => {
  console.error('Failed to start PackHub server:', err);
  process.exit(1);
});
