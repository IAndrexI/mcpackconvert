import fs from 'fs/promises';
import path from 'path';
import { PassThrough } from 'stream';
import { DATA_DIR, USER_AGENT } from '../config.js';
import { PACKS_DIR } from './packManager.js';
import { readTomlFile } from './packwiz.js';
import { exportMrpack, exportCurseForgeZip } from './prismExporter.js';

const CONFIG_FILE = path.join(DATA_DIR, 'publisher-config.json');

/**
 * Get stored publisher settings & tokens
 */
export async function getPublisherConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return {
      modrinthToken: data.modrinthToken || process.env.MODRINTH_TOKEN || '',
      curseforgeToken: data.curseforgeToken || process.env.CURSEFORGE_TOKEN || '',
      projects: data.projects || {}
    };
  } catch (err) {
    return {
      modrinthToken: process.env.MODRINTH_TOKEN || '',
      curseforgeToken: process.env.CURSEFORGE_TOKEN || '',
      projects: {}
    };
  }
}

/**
 * Save publisher settings & tokens
 */
export async function savePublisherConfig(updates) {
  const current = await getPublisherConfig();
  const merged = {
    ...current,
    ...updates,
    projects: {
      ...(current.projects || {}),
      ...(updates.projects || {})
    }
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return { success: true };
}

/**
 * Convert archiver stream to Buffer
 */
async function streamToBuffer(exportFn, packDir) {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];

    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', err => reject(err));

    exportFn(packDir, stream).catch(reject);
  });
}

/**
 * Auto-publish modpack directly to Modrinth (via Labrinth API)
 */
export async function publishToModrinth({
  packId,
  projectId,
  token,
  versionName,
  versionNumber,
  changelog = '',
  versionType = 'release',
  featured = true
}) {
  const packDir = path.join(PACKS_DIR, packId);
  const packToml = await readTomlFile(path.join(packDir, 'pack.toml'));

  const loaderName = Object.keys(packToml.versions).find(k => k !== 'minecraft') || 'fabric';
  const mcVer = packToml.versions.minecraft;

  const actualVersionNumber = versionNumber || packToml.version || '1.0.0';
  const actualVersionName = versionName || `${packToml.name || 'Pack'} ${actualVersionNumber}`;

  // Build the .mrpack archive in memory
  const mrpackBuffer = await streamToBuffer(exportMrpack, packDir);
  const filename = `${packId}-${actualVersionNumber}.mrpack`;

  const metadata = {
    name: actualVersionName,
    version_number: actualVersionNumber,
    changelog: changelog || `Automated release created via PackHub for Minecraft ${mcVer} (${loaderName}).`,
    dependencies: [],
    game_versions: [mcVer],
    version_type: versionType, // 'release', 'beta', 'alpha'
    loaders: [loaderName.toLowerCase()],
    featured: featured !== false,
    status: 'listed',
    project_id: projectId,
    file_parts: ['file']
  };

  const formData = new FormData();
  formData.append('data', JSON.stringify(metadata));
  formData.append('file', new Blob([mrpackBuffer], { type: 'application/x-modrinth-modpack+zip' }), filename);

  const res = await fetch('https://api.modrinth.com/v2/version', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'User-Agent': USER_AGENT
    },
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Modrinth upload failed [${res.status}]: ${errorText}`);
  }

  const result = await res.json();
  return {
    success: true,
    platform: 'modrinth',
    versionId: result.id,
    projectId: result.project_id,
    versionNumber: result.version_number,
    url: `https://modrinth.com/modpack/${projectId}/version/${result.id}`
  };
}

/**
 * Auto-publish modpack directly to CurseForge (via CurseForge Upload API)
 */
export async function publishToCurseForge({
  packId,
  projectId,
  token,
  displayName,
  changelog = '',
  releaseType = 'release'
}) {
  const packDir = path.join(PACKS_DIR, packId);
  const packToml = await readTomlFile(path.join(packDir, 'pack.toml'));

  const actualName = displayName || `${packToml.name || 'Pack'} ${packToml.version || '1.0.0'}`;

  // Build CurseForge modpack zip in memory
  const zipBuffer = await streamToBuffer(exportCurseForgeZip, packDir);
  const filename = `${packId}-${packToml.version || '1.0.0'}.zip`;

  const metadata = {
    changelog: changelog || `Automated release created via PackHub.`,
    changelogType: 'markdown',
    displayName: actualName,
    parentFileID: null,
    releaseType: releaseType // 'release', 'beta', 'alpha'
  };

  const formData = new FormData();
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), filename);

  const res = await fetch(`https://minecraft.curseforge.com/api/projects/${projectId}/upload-file`, {
    method: 'POST',
    headers: {
      'X-Api-Token': token,
      'User-Agent': USER_AGENT
    },
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`CurseForge upload failed [${res.status}]: ${errorText}`);
  }

  const result = await res.json();
  return {
    success: true,
    platform: 'curseforge',
    fileId: result.id,
    projectId,
    url: `https://www.curseforge.com/minecraft/modpacks/${projectId}`
  };
}

/**
 * Flush Auto-Push to both platforms simultaneously
 */
export async function publishToAll({
  packId,
  modrinthProjectId,
  curseforgeProjectId,
  modrinthToken,
  curseforgeToken,
  versionName,
  versionNumber,
  changelog,
  releaseType = 'release'
}) {
  const results = {
    modrinth: null,
    curseforge: null
  };

  const tasks = [];

  if (modrinthProjectId && modrinthToken) {
    tasks.push(
      publishToModrinth({
        packId,
        projectId: modrinthProjectId,
        token: modrinthToken,
        versionName,
        versionNumber,
        changelog,
        versionType: releaseType
      })
      .then(res => { results.modrinth = res; })
      .catch(err => { results.modrinth = { success: false, error: err.message }; })
    );
  }

  if (curseforgeProjectId && curseforgeToken) {
    tasks.push(
      publishToCurseForge({
        packId,
        projectId: curseforgeProjectId,
        token: curseforgeToken,
        displayName: versionName,
        changelog,
        releaseType
      })
      .then(res => { results.curseforge = res; })
      .catch(err => { results.curseforge = { success: false, error: err.message }; })
    );
  }

  await Promise.all(tasks);
  return results;
}
