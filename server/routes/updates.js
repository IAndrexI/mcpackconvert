import { Router } from 'express';
import { checkAllUpdates, applyUpdate } from '../services/packManager.js';

const router = Router();

// Check for updates for all installed mods in a pack
router.get('/:id', async (req, res) => {
  try {
    const updates = await checkAllUpdates(req.params.id);
    const availableCount = updates.filter(u => u.hasUpdate).length;
    res.json({
      success: true,
      packId: req.params.id,
      totalChecked: updates.length,
      availableUpdates: availableCount,
      updates
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Apply update to a single mod
router.post('/:id/apply', async (req, res) => {
  try {
    const { slug, source, latestVersionId } = req.body;
    if (!slug || !source || !latestVersionId) {
      return res.status(400).json({ success: false, error: 'slug, source, and latestVersionId are required' });
    }
    const result = await applyUpdate(req.params.id, { slug, source, latestVersionId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch update all outdated mods in a pack
router.post('/:id/apply-all', async (req, res) => {
  try {
    const updates = await checkAllUpdates(req.params.id);
    const outdated = updates.filter(u => u.hasUpdate);
    const updated = [];
    const failed = [];

    for (const item of outdated) {
      try {
        await applyUpdate(req.params.id, {
          slug: item.slug,
          source: item.source,
          latestVersionId: item.latestVersionId
        });
        updated.push(item.slug);
      } catch (err) {
        failed.push({ slug: item.slug, error: err.message });
      }
    }

    res.json({
      success: true,
      updatedCount: updated.length,
      failedCount: failed.length,
      updated,
      failed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
