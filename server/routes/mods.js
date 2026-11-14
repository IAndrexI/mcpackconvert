import { Router } from 'express';
import { searchModrinth, getModrinthProject, getModrinthVersions } from '../services/modrinth.js';
import { searchCurseForge, getCurseForgeMod, getCurseForgeFiles } from '../services/curseforge.js';
import { addModrinthMod, addCurseForgeMod, removeMod } from '../services/packManager.js';

const router = Router();

/**
 * Unified mod search across Modrinth and/or CurseForge
 */
router.get('/search', async (req, res) => {
  const {
    q = '',
    mcVersion = '',
    loader = '',
    source = 'all', // 'all', 'modrinth', 'curseforge'
    limit = 20,
    offset = 0
  } = req.query;

  const numLimit = parseInt(limit, 10) || 20;
  const numOffset = parseInt(offset, 10) || 0;

  try {
    const promises = [];

    if (source === 'all' || source === 'modrinth') {
      promises.push(
        searchModrinth({
          query: q,
          mcVersion,
          loader,
          limit: source === 'all' ? Math.ceil(numLimit / 2) : numLimit,
          offset: numOffset
        }).catch(err => ({ source: 'modrinth', error: err.message, hits: [] }))
      );
    }

    if (source === 'all' || source === 'curseforge') {
      promises.push(
        searchCurseForge({
          query: q,
          mcVersion,
          loader,
          limit: source === 'all' ? Math.ceil(numLimit / 2) : numLimit,
          offset: numOffset
        }).catch(err => ({ source: 'curseforge', error: err.message, hits: [] }))
      );
    }

    const results = await Promise.all(promises);

    let combinedHits = [];
    let errors = [];

    for (const r of results) {
      if (r.error) errors.push({ source: r.source, message: r.error });
      if (r.hits) combinedHits = combinedHits.concat(r.hits);
    }

    // Interleave or sort hits by downloads if unified
    if (source === 'all') {
      combinedHits.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    }

    res.json({
      success: true,
      hits: combinedHits,
      total: combinedHits.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Modrinth project details & versions
router.get('/modrinth/:slugOrId', async (req, res) => {
  try {
    const { mcVersion, loader } = req.query;
    const [project, versions] = await Promise.all([
      getModrinthProject(req.params.slugOrId),
      getModrinthVersions(req.params.slugOrId, { mcVersion, loader })
    ]);
    res.json({ success: true, project, versions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get CurseForge mod details & files
router.get('/curseforge/:id', async (req, res) => {
  try {
    const { mcVersion, loader } = req.query;
    const [mod, files] = await Promise.all([
      getCurseForgeMod(req.params.id),
      getCurseForgeFiles(req.params.id, { mcVersion, loader })
    ]);
    res.json({ success: true, mod, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add Modrinth mod to a pack
router.post('/packs/:id/modrinth', async (req, res) => {
  try {
    const { slugOrId, versionId, side } = req.body;
    if (!slugOrId) {
      return res.status(400).json({ success: false, error: 'slugOrId is required' });
    }
    const result = await addModrinthMod(req.params.id, { slugOrId, versionId, side });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add CurseForge mod to a pack
router.post('/packs/:id/curseforge', async (req, res) => {
  try {
    const { modId, fileId, side } = req.body;
    if (!modId) {
      return res.status(400).json({ success: false, error: 'modId is required' });
    }
    const result = await addCurseForgeMod(req.params.id, { modId, fileId, side });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remove a mod from a pack
router.delete('/packs/:id/:slug', async (req, res) => {
  try {
    const result = await removeMod(req.params.id, req.params.slug);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
