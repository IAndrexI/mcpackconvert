import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '../config.js';
import { readTomlFile, writeTomlFile, createPwToml, rebuildPackwizIndex } from './packwiz.js';
import { getModrinthProject, getModrinthVersions, checkModrinthUpdates } from './modrinth.js';
import { getCurseForgeMod, getCurseForgeFiles, checkCurseForgeUpdates } from './curseforge.js';

export const PACKS_DIR = path.join(DATA_DIR, 'packs');

/**
 * Ensure pack directory exists
 */
export async function ensurePacksDir() {
  await fs.mkdir(PACKS_DIR, { recursive: true });
}

/**
 * List all available packs
 */
export async function listPacks() {
  await ensurePacksDir();
  const entries = await fs.readdir(PACKS_DIR, { withFileTypes: true });
  const packs = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const packTomlPath = path.join(PACKS_DIR, entry.name, 'pack.toml');
      try {
        const packData = await readTomlFile(packTomlPath);
        const loader = Object.keys(packData.versions || {}).find(k => k !== 'minecraft') || 'fabric';
        
        // Count mods
        let modCount = 0;
        try {
          const modFiles = await fs.readdir(path.join(PACKS_DIR, entry.name, 'mods'));
          modCount = modFiles.filter(f => f.endsWith('.pw.toml')).length;
        } catch {}

        packs.push({
          id: entry.name,
          name: packData.name || entry.name,
          author: packData.author || '',
          version: packData.version || '1.0.0',
          description: packData.description || '',
          mcVersion: packData.versions?.minecraft || '',
          loader,
          loaderVersion: packData.versions?.[loader] || '',
          modCount
        });
      } catch (err) {
        // Skip invalid directories
      }
    }
  }

  return packs;
}

/**
 * Create a new modpack
 */
export async function createPack({ id, name, author = '', version = '1.0.0', description = '', mcVersion, loader = 'fabric', loaderVersion = '' }) {
  await ensurePacksDir();
  const safeId = (id || name).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const packDir = path.join(PACKS_DIR, safeId);

  // Check if exists
  try {
    await fs.access(packDir);
    throw new Error(`Pack '${safeId}' already exists.`);
  } catch (err) {
    if (err.message.includes('already exists')) throw err;
  }

  await fs.mkdir(path.join(packDir, 'mods'), { recursive: true });

  // Default loader versions if empty
  let actualLoaderVer = loaderVersion;
  if (!actualLoaderVer) {
    if (loader === 'fabric') actualLoaderVer = '0.16.9';
    else if (loader === 'neoforge') actualLoaderVer = '21.1.65';
    else if (loader === 'forge') actualLoaderVer = '51.0.33';
    else if (loader === 'quilt') actualLoaderVer = '0.26.1';
  }

  const packData = {
    name,
    author,
    version,
    description,
    'pack-format': 'packwiz:1.1.0',
    index: {
      file: 'index.toml',
      'hash-format': 'sha256',
      hash: ''
    },
    versions: {
      minecraft: mcVersion,
      [loader]: actualLoaderVer
    }
  };

  await writeTomlFile(path.join(packDir, 'pack.toml'), packData);
  await rebuildPackwizIndex(packDir);

  return { id: safeId, ...packData };
}

/**
 * Get detailed pack info including installed mods
 */
export async function getPackDetails(packId) {
  const packDir = path.join(PACKS_DIR, packId);
  const packData = await readTomlFile(path.join(packDir, 'pack.toml'));
  const loader = Object.keys(packData.versions || {}).find(k => k !== 'minecraft') || 'fabric';

  const mods = [];
  const modsDir = path.join(packDir, 'mods');

  try {
    const modFiles = await fs.readdir(modsDir);
    for (const f of modFiles) {
      if (f.endsWith('.pw.toml')) {
        const pwData = await readTomlFile(path.join(modsDir, f));
        const slug = f.replace('.pw.toml', '');

        let source = 'other';
        let projectId = null;
        let versionId = null;

        if (pwData.update?.modrinth) {
          source = 'modrinth';
          projectId = pwData.update.modrinth['mod-id'];
          versionId = pwData.update.modrinth.version;
        } else if (pwData.update?.curseforge) {
          source = 'curseforge';
          projectId = pwData.update.curseforge['project-id'];
          versionId = pwData.update.curseforge['file-id'];
        }

        mods.push({
          slug,
          name: pwData.name,
          filename: pwData.filename,
          side: pwData.side || 'both',
          downloadUrl: pwData.download?.url,
          hash: pwData.download?.hash,
          hashFormat: pwData.download?.['hash-format'],
          source,
          projectId,
          versionId
        });
      }
    }
  } catch {}

  // Sort mods alphabetically
  mods.sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: packId,
    name: packData.name,
    author: packData.author,
    version: packData.version,
    description: packData.description,
    mcVersion: packData.versions?.minecraft,
    loader,
    loaderVersion: packData.versions?.[loader],
    mods
  };
}

/**
 * Add a Modrinth mod to the pack
 */
export async function addModrinthMod(packId, { slugOrId, versionId = null, side = 'both' }) {
  const packDir = path.join(PACKS_DIR, packId);
  const packData = await readTomlFile(path.join(packDir, 'pack.toml'));
  const loader = Object.keys(packData.versions || {}).find(k => k !== 'minecraft') || 'fabric';
  const mcVersion = packData.versions?.minecraft;

  const project = await getModrinthProject(slugOrId);
  const versions = await getModrinthVersions(project.id, { mcVersion, loader });

  if (!versions || versions.length === 0) {
    throw new Error(`No compatible version found for '${project.title}' on Minecraft ${mcVersion} (${loader})`);
  }

  // Find requested version or latest
  let targetVersion = versionId ? versions.find(v => v.id === versionId) : versions[0];
  if (!targetVersion) {
    targetVersion = versions[0];
  }

  const file = targetVersion.file;
  if (!file) {
    throw new Error(`Version '${targetVersion.name}' has no downloadable files`);
  }

  // Determine hash
  let hash = file.hashes?.sha1 || '';
  let hashFormat = 'sha1';
  if (!hash && file.hashes?.sha512) {
    hash = file.hashes.sha512;
    hashFormat = 'sha512';
  }

  const pwData = createPwToml({
    name: project.title,
    filename: file.filename,
    side,
    downloadUrl: file.url,
    hashFormat,
    hash,
    updateSource: 'modrinth',
    modrinth: {
      modId: project.id,
      versionId: targetVersion.id
    }
  });

  const slug = project.slug;
  const modFilePath = path.join(packDir, 'mods', `${slug}.pw.toml`);
  await writeTomlFile(modFilePath, pwData);

  // Check required dependencies
  const dependenciesInstalled = [];
  const requiredDeps = (targetVersion.dependencies || []).filter(d => d.dependencyType === 'required');

  for (const dep of requiredDeps) {
    if (dep.projectId) {
      try {
        const depProject = await getModrinthProject(dep.projectId);
        const depFilePath = path.join(packDir, 'mods', `${depProject.slug}.pw.toml`);
        // Check if already installed
        try {
          await fs.access(depFilePath);
        } catch {
          // Auto-install missing required dependency
          const depVersions = await getModrinthVersions(dep.projectId, { mcVersion, loader });
          if (depVersions.length > 0) {
            const depTarget = dep.versionId ? (depVersions.find(v => v.id === dep.versionId) || depVersions[0]) : depVersions[0];
            const depFile = depTarget.file;
            if (depFile) {
              const depPw = createPwToml({
                name: depProject.title,
                filename: depFile.filename,
                side: 'both',
                downloadUrl: depFile.url,
                hashFormat: 'sha1',
                hash: depFile.hashes?.sha1 || '',
                updateSource: 'modrinth',
                modrinth: {
                  modId: depProject.id,
                  versionId: depTarget.id
                }
              });
              await writeTomlFile(depFilePath, depPw);
              dependenciesInstalled.push(depProject.title);
            }
          }
        }
      } catch (err) {
        // Log dependency error without failing main mod addition
        console.warn(`Could not auto-install dependency ${dep.projectId}: ${err.message}`);
      }
    }
  }

  await rebuildPackwizIndex(packDir);

  return {
    success: true,
    mod: {
      slug,
      name: project.title,
      filename: file.filename,
      version: targetVersion.name,
      dependenciesInstalled
    }
  };
}

/**
 * Add a CurseForge mod to the pack
 */
export async function addCurseForgeMod(packId, { modId, fileId = null, side = 'both' }) {
  const packDir = path.join(PACKS_DIR, packId);
  const packData = await readTomlFile(path.join(packDir, 'pack.toml'));
  const loader = Object.keys(packData.versions || {}).find(k => k !== 'minecraft') || 'fabric';
  const mcVersion = packData.versions?.minecraft;

  const project = await getCurseForgeMod(modId);
  const files = await getCurseForgeFiles(modId, { mcVersion, loader });

  if (!files || files.length === 0) {
    throw new Error(`No compatible file found for '${project.title}' on Minecraft ${mcVersion} (${loader})`);
  }

  let targetFile = fileId ? files.find(f => String(f.id) === String(fileId)) : files[0];
  if (!targetFile) {
    targetFile = files[0];
  }

  const pwData = createPwToml({
    name: project.title,
    filename: targetFile.filename,
    side,
    downloadUrl: targetFile.downloadUrl,
    hashFormat: targetFile.sha1 ? 'sha1' : 'none',
    hash: targetFile.sha1 || '',
    updateSource: 'curseforge',
    curseforge: {
      projectId: project.id,
      fileId: targetFile.id
    }
  });

  const slug = project.slug || `curse-${project.id}`;
  const modFilePath = path.join(packDir, 'mods', `${slug}.pw.toml`);
  await writeTomlFile(modFilePath, pwData);

  // Auto-install required dependencies
  const dependenciesInstalled = [];
  const requiredDeps = (targetFile.dependencies || []).filter(d => d.relationType === 3); // 3 = required

  for (const dep of requiredDeps) {
    if (dep.modId) {
      try {
        const depProject = await getCurseForgeMod(dep.modId);
        const depSlug = depProject.slug || `curse-${depProject.id}`;
        const depFilePath = path.join(packDir, 'mods', `${depSlug}.pw.toml`);
        try {
          await fs.access(depFilePath);
        } catch {
          const depFiles = await getCurseForgeFiles(dep.modId, { mcVersion, loader });
          if (depFiles.length > 0) {
            const depTarget = depFiles[0];
            const depPw = createPwToml({
              name: depProject.title,
              filename: depTarget.filename,
              side: 'both',
              downloadUrl: depTarget.downloadUrl,
              hashFormat: depTarget.sha1 ? 'sha1' : 'none',
              hash: depTarget.sha1 || '',
              updateSource: 'curseforge',
              curseforge: {
                projectId: depProject.id,
                fileId: depTarget.id
              }
            });
            await writeTomlFile(depFilePath, depPw);
            dependenciesInstalled.push(depProject.title);
          }
        }
      } catch (err) {
        console.warn(`Could not auto-install CurseForge dependency ${dep.modId}: ${err.message}`);
      }
    }
  }

  await rebuildPackwizIndex(packDir);

  return {
    success: true,
    mod: {
      slug,
      name: project.title,
      filename: targetFile.filename,
      version: targetFile.name,
      dependenciesInstalled
    }
  };
}

/**
 * Remove a mod from the pack
 */
export async function removeMod(packId, slug) {
  const packDir = path.join(PACKS_DIR, packId);
  const modPath = path.join(packDir, 'mods', `${slug}.pw.toml`);
  await fs.unlink(modPath);
  await rebuildPackwizIndex(packDir);
  return { success: true, removed: slug };
}

/**
 * Check updates for all mods in a pack (both Modrinth and CurseForge)
 */
export async function checkAllUpdates(packId) {
  const details = await getPackDetails(packId);
  const { mcVersion, loader, mods } = details;

  const modrinthEntries = [];
  const curseforgeEntries = [];

  for (const mod of mods) {
    if (mod.source === 'modrinth' && mod.projectId && mod.versionId) {
      modrinthEntries.push({
        projectId: mod.projectId,
        currentVersionId: mod.versionId,
        mcVersion,
        loader,
        slug: mod.slug,
        title: mod.name
      });
    } else if (mod.source === 'curseforge' && mod.projectId && mod.versionId) {
      curseforgeEntries.push({
        modId: mod.projectId,
        currentFileId: mod.versionId,
        mcVersion,
        loader,
        slug: mod.slug,
        title: mod.name
      });
    }
  }

  const [mrUpdates, cfUpdates] = await Promise.all([
    checkModrinthUpdates(modrinthEntries),
    checkCurseForgeUpdates(curseforgeEntries)
  ]);

  const results = [];

  for (const item of mrUpdates) {
    const orig = modrinthEntries.find(e => e.projectId === item.projectId);
    results.push({
      slug: orig?.slug,
      title: orig?.title,
      source: 'modrinth',
      projectId: item.projectId,
      hasUpdate: item.hasUpdate,
      currentVersionId: item.currentVersionId,
      latestVersionId: item.latestVersionId,
      latestVersionName: item.latestVersionName || item.latestVersionNumber,
      datePublished: item.datePublished,
      changelog: item.changelog,
      file: item.file
    });
  }

  for (const item of cfUpdates) {
    const orig = curseforgeEntries.find(e => String(e.modId) === String(item.modId));
    results.push({
      slug: orig?.slug,
      title: orig?.title,
      source: 'curseforge',
      projectId: item.modId,
      hasUpdate: item.hasUpdate,
      currentVersionId: item.currentFileId,
      latestVersionId: item.latestFileId,
      latestVersionName: item.latestVersionName || item.latestFileName,
      datePublished: item.datePublished,
      downloadUrl: item.downloadUrl,
      sha1: item.sha1
    });
  }

  return results;
}

/**
 * Apply update for a single mod
 */
export async function applyUpdate(packId, { slug, source, latestVersionId }) {
  if (source === 'modrinth') {
    return await addModrinthMod(packId, { slugOrId: slug, versionId: latestVersionId });
  } else if (source === 'curseforge') {
    const details = await getPackDetails(packId);
    const mod = details.mods.find(m => m.slug === slug);
    if (!mod || !mod.projectId) throw new Error(`Mod ${slug} not found or missing project ID`);
    return await addCurseForgeMod(packId, { modId: mod.projectId, fileId: latestVersionId });
  }
  throw new Error(`Unsupported update source: ${source}`);
}

/**
 * Delete an entire pack
 */
export async function deletePack(packId) {
  const packDir = path.join(PACKS_DIR, packId);
  await fs.rm(packDir, { recursive: true, force: true });
  return { success: true, deleted: packId };
}
