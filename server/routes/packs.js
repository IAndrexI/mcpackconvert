import { Router } from 'express';
import path from 'path';
import { listPacks, createPack, getPackDetails, deletePack, PACKS_DIR } from '../services/packManager.js';

const router = Router();

// List all packs
router.get('/', async (req, res) => {
  try {
    const packs = await listPacks();
    res.json({ success: true, packs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new pack
router.post('/', async (req, res) => {
  try {
    const { id, name, author, version, description, mcVersion, loader, loaderVersion } = req.body;
    if (!name || !mcVersion) {
      return res.status(400).json({ success: false, error: 'Name and Minecraft version are required' });
    }
    const pack = await createPack({ id, name, author, version, description, mcVersion, loader, loaderVersion });
    res.json({ success: true, pack });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get pack details
router.get('/:id', async (req, res) => {
  try {
    const details = await getPackDetails(req.params.id);
    res.json({ success: true, pack: details });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// Delete a pack
router.delete('/:id', async (req, res) => {
  try {
    const result = await deletePack(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve raw pack.toml for packwiz installer
router.get('/:id/pack.toml', (req, res) => {
  const filePath = path.join(PACKS_DIR, req.params.id, 'pack.toml');
  res.sendFile(filePath);
});

// Serve raw index.toml for packwiz installer
router.get('/:id/index.toml', (req, res) => {
  const filePath = path.join(PACKS_DIR, req.params.id, 'index.toml');
  res.sendFile(filePath);
});

// Serve raw mod .pw.toml file
router.get('/:id/mods/:file', (req, res) => {
  const filePath = path.join(PACKS_DIR, req.params.id, 'mods', req.params.file);
  res.sendFile(filePath);
});

export default router;
