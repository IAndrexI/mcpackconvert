import { Router } from 'express';
import { 
  getPublisherConfig, 
  savePublisherConfig, 
  publishToModrinth, 
  publishToCurseForge, 
  publishToAll 
} from '../services/publisher.js';

const router = Router();

// Get configured tokens & per-pack project mappings
router.get('/config', async (req, res) => {
  try {
    const config = await getPublisherConfig();
    res.json({
      success: true,
      hasModrinthToken: Boolean(config.modrinthToken),
      hasCurseForgeToken: Boolean(config.curseforgeToken),
      projects: config.projects || {}
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save or update tokens & project mappings
router.post('/config', async (req, res) => {
  try {
    const { modrinthToken, curseforgeToken, projects } = req.body;
    const updates = {};
    if (modrinthToken !== undefined) updates.modrinthToken = modrinthToken;
    if (curseforgeToken !== undefined) updates.curseforgeToken = curseforgeToken;
    if (projects !== undefined) updates.projects = projects;

    await savePublisherConfig(updates);
    res.json({ success: true, message: 'Publisher settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Push to Modrinth
router.post('/:id/modrinth', async (req, res) => {
  try {
    const config = await getPublisherConfig();
    const { projectId, token, versionName, versionNumber, changelog, versionType } = req.body;

    const actualToken = token || config.modrinthToken;
    const actualProjectId = projectId || config.projects?.[req.params.id]?.modrinthProjectId;

    if (!actualToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Modrinth API Token is missing. Provide it in the request or save it in Settings.' 
      });
    }
    if (!actualProjectId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Modrinth Project ID / Slug is missing. Specify the project to upload to.' 
      });
    }

    const result = await publishToModrinth({
      packId: req.params.id,
      projectId: actualProjectId,
      token: actualToken,
      versionName,
      versionNumber,
      changelog,
      versionType
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Push to CurseForge
router.post('/:id/curseforge', async (req, res) => {
  try {
    const config = await getPublisherConfig();
    const { projectId, token, displayName, changelog, releaseType } = req.body;

    const actualToken = token || config.curseforgeToken;
    const actualProjectId = projectId || config.projects?.[req.params.id]?.curseforgeProjectId;

    if (!actualToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'CurseForge API Token is missing. Provide it in the request or save it in Settings.' 
      });
    }
    if (!actualProjectId) {
      return res.status(400).json({ 
        success: false, 
        error: 'CurseForge Project ID is missing. Specify the project to upload to.' 
      });
    }

    const result = await publishToCurseForge({
      packId: req.params.id,
      projectId: actualProjectId,
      token: actualToken,
      displayName,
      changelog,
      releaseType
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Flush Push to BOTH Modrinth & CurseForge simultaneously
router.post('/:id/all', async (req, res) => {
  try {
    const config = await getPublisherConfig();
    const { 
      modrinthProjectId, 
      curseforgeProjectId, 
      modrinthToken, 
      curseforgeToken, 
      versionName, 
      versionNumber, 
      changelog, 
      releaseType 
    } = req.body;

    const finalMrToken = modrinthToken || config.modrinthToken;
    const finalMrProject = modrinthProjectId || config.projects?.[req.params.id]?.modrinthProjectId;

    const finalCfToken = curseforgeToken || config.curseforgeToken;
    const finalCfProject = curseforgeProjectId || config.projects?.[req.params.id]?.curseforgeProjectId;

    if (!finalMrProject && !finalCfProject) {
      return res.status(400).json({
        success: false,
        error: 'At least one target project (Modrinth or CurseForge) must be specified.'
      });
    }

    const results = await publishToAll({
      packId: req.params.id,
      modrinthProjectId: finalMrProject,
      curseforgeProjectId: finalCfProject,
      modrinthToken: finalMrToken,
      curseforgeToken: finalCfToken,
      versionName,
      versionNumber,
      changelog,
      releaseType
    });

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
