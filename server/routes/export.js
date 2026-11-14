import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { exportMrpack, exportPrismInstanceZip, deployToPrismLauncher } from '../services/prismExporter.js';
import { PACKS_DIR } from '../services/packManager.js';
import { getDefaultPrismInstancesPath, PORT } from '../config.js';

const router = Router();

// Export as Modrinth .mrpack
router.get('/:id/mrpack', async (req, res) => {
  try {
    const packDir = path.join(PACKS_DIR, req.params.id);
    await fs.access(packDir);

    res.attachment(`${req.params.id}.mrpack`);
    await exportMrpack(packDir, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Export as ready-to-import Prism Launcher Instance (.zip)
router.get('/:id/prism', async (req, res) => {
  try {
    const packDir = path.join(PACKS_DIR, req.params.id);
    await fs.access(packDir);

    const autoSync = req.query.autoSync === 'true';
    const hostHeader = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol;
    const packUrl = `${protocol}://${hostHeader}/api/packs/${req.params.id}/pack.toml`;

    res.attachment(`${req.params.id}-prism-instance.zip`);
    await exportPrismInstanceZip(packDir, res, { autoSync, packUrl });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Deploy directly to local Prism Launcher instances directory
router.post('/:id/prism/deploy', async (req, res) => {
  try {
    const packDir = path.join(PACKS_DIR, req.params.id);
    const { targetPath, autoSync = true } = req.body;

    const hostHeader = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol;
    const packUrl = `${protocol}://${hostHeader}/api/packs/${req.params.id}/pack.toml`;

    const result = await deployToPrismLauncher(packDir, {
      targetInstancesPath: targetPath || getDefaultPrismInstancesPath(),
      autoSync,
      packUrl
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get default Prism Launcher detected path and settings
router.get('/config/prism-info', async (req, res) => {
  const defaultPath = getDefaultPrismInstancesPath();
  let exists = false;
  try {
    await fs.access(defaultPath);
    exists = true;
  } catch {}

  res.json({
    defaultPath,
    exists,
    platform: process.platform
  });
});

export default router;
