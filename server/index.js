import express from 'express';
import cors from 'cors';
import path from 'path';
import net from 'net';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { PORT, HOST, ROOT_DIR, DATA_DIR } from './config.js';
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

/**
 * Check if a port is currently available
 */
function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err) => {
        resolve(false);
      })
      .once('listening', () => {
        server.once('close', () => resolve(true)).close();
      })
      .listen(port, host);
  });
}

/**
 * Find the next available port starting from preferredPort
 */
export async function getAvailablePort(preferredPort, host = '0.0.0.0', maxAttempts = 50) {
  for (let port = preferredPort; port < preferredPort + maxAttempts; port++) {
    const available = await isPortAvailable(port, host);
    if (available) {
      return port;
    }
    console.log(`Port ${port} is currently in use, trying port ${port + 1}...`);
  }
  throw new Error(`Could not find an available port between ${preferredPort} and ${preferredPort + maxAttempts}`);
}

/**
 * Open URL in default system browser
 */
function openBrowser(url) {
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`Could not automatically open browser: ${err.message}`);
  });
}

// Start server
export async function startServer(preferredPort = PORT, host = HOST) {
  await ensurePacksDir();

  const actualPort = await getAvailablePort(preferredPort, host);

  return new Promise((resolve, reject) => {
    const server = app.listen(actualPort, host, async () => {
      const displayHost = (host === '0.0.0.0' || host === '::') ? 'localhost' : host;
      const url = `http://${displayHost}:${actualPort}`;

      console.log(`=======================================================`);
      console.log(`   PackHub - Self-Hosted Modpack Manager Server        `);
      console.log(`   Web Dashboard: ${url}                             `);
      console.log(`   API Endpoint:  ${url}/api                         `);
      if (actualPort !== preferredPort) {
        console.log(`   [NOTICE] Preferred port ${preferredPort} was taken!  `);
        console.log(`            Automatically bound to port ${actualPort} instead.`);
      }
      console.log(`=======================================================`);

      // Write server-info.json so CLI and scripts know the active port
      try {
        await fs.writeFile(
          path.join(DATA_DIR, 'server-info.json'),
          JSON.stringify({ port: actualPort, host, url, startedAt: new Date().toISOString() }, null, 2),
          'utf-8'
        );
      } catch (err) {
        console.warn('Could not write server-info.json:', err.message);
      }

      // Auto-open browser if requested
      if (process.env.AUTO_OPEN_BROWSER === 'true' || process.argv.includes('--open')) {
        openBrowser(url);
      }

      resolve({ server, port: actualPort, url });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startServer().catch(err => {
    console.error('Failed to start PackHub server:', err);
    process.exit(1);
  });
}
