import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { readTomlFile } from './packwiz.js';
import { getDefaultPrismInstancesPath } from '../config.js';

/**
 * Map loader name to Prism component UID & version key
 */
function getLoaderComponent(loader, loaderVersion) {
  const l = loader.toLowerCase();
  if (l === 'fabric') {
    return {
      cachedName: 'Fabric Loader',
      cachedVersion: loaderVersion,
      uid: 'net.fabricmc.fabric-loader',
      version: loaderVersion
    };
  } else if (l === 'neoforge') {
    return {
      cachedName: 'NeoForge',
      cachedVersion: loaderVersion,
      uid: 'net.neoforged',
      version: loaderVersion
    };
  } else if (l === 'forge') {
    return {
      cachedName: 'Minecraft Forge',
      cachedVersion: loaderVersion,
      uid: 'net.minecraftforge',
      version: loaderVersion
    };
  } else if (l === 'quilt') {
    return {
      cachedName: 'Quilt Loader',
      cachedVersion: loaderVersion,
      uid: 'org.quiltmc.quilt-loader',
      version: loaderVersion
    };
  }
  return null;
}

/**
 * Generate mmc-pack.json structure for Prism Launcher
 */
export function generateMmcPackJson(mcVersion, loader, loaderVersion) {
  const components = [
    {
      cachedName: 'Minecraft',
      cachedRequires: [],
      cachedVersion: mcVersion,
      important: true,
      uid: 'net.minecraft',
      version: mcVersion
    }
  ];

  const loaderComp = getLoaderComponent(loader, loaderVersion);
  if (loaderComp) {
    components.push(loaderComp);
  }

  return {
    components,
    formatVersion: 1
  };
}

/**
 * Generate instance.cfg for Prism Launcher
 */
export function generateInstanceCfg({ name, notes = '', icon = 'default', autoSync = false, packUrl = '' }) {
  let cfg = `InstanceType=OneSix\n`;
  cfg += `iconKey=${icon}\n`;
  cfg += `name=${name}\n`;
  cfg += `notes=${notes || 'Created with PackHub'}\n`;
  
  if (autoSync && packUrl) {
    cfg += `OverrideCommands=true\n`;
    // Pre-launch command runs packwiz-installer to sync with PackHub server before launching
    cfg += `PreLaunchCommand="\\"$INST_JAVA\\" -jar packwiz-installer-bootstrap.jar ${packUrl}"\n`;
  } else {
    cfg += `OverrideCommands=false\n`;
  }
  return cfg;
}

/**
 * Export pack directly as a Modrinth .mrpack zip archive (streamed to outputStream or file)
 */
export async function exportMrpack(packDir, outputStream) {
  const packToml = await readTomlFile(path.join(packDir, 'pack.toml'));
  const loaderName = Object.keys(packToml.versions).find(k => k !== 'minecraft') || 'fabric';
  const loaderVer = packToml.versions[loaderName] || '';
  const mcVer = packToml.versions.minecraft;

  // Read all .pw.toml files in mods/ directory
  const modsDir = path.join(packDir, 'mods');
  const files = [];

  try {
    const modFiles = await fs.readdir(modsDir);
    for (const file of modFiles) {
      if (file.endsWith('.pw.toml')) {
        const pwData = await readTomlFile(path.join(modsDir, file));
        
        let client = 'required';
        let server = 'required';
        if (pwData.side === 'client') server = 'unsupported';
        if (pwData.side === 'server') client = 'unsupported';

        const hashes = {};
        if (pwData.download?.['hash-format'] === 'sha1') {
          hashes.sha1 = pwData.download.hash;
        } else if (pwData.download?.['hash-format'] === 'sha512') {
          hashes.sha512 = pwData.download.hash;
        }

        files.push({
          path: `mods/${pwData.filename}`,
          hashes,
          env: { client, server },
          downloads: pwData.download?.url ? [pwData.download.url] : [],
          fileSize: pwData.download?.size || 0
        });
      }
    }
  } catch (err) {
    // mods folder might be empty
  }

  const mrpackIndex = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: packToml.version || '1.0.0',
    name: packToml.name || 'PackHub Modpack',
    summary: packToml.description || `Built with PackHub for Minecraft ${mcVer} (${loaderName})`,
    dependencies: {
      minecraft: mcVer,
      [`${loaderName}-loader`]: loaderVer
    },
    files
  };

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(outputStream);

  // Add modrinth.index.json
  archive.append(JSON.stringify(mrpackIndex, null, 2), { name: 'modrinth.index.json' });

  // Add overrides (config files, scripts, resourcepacks if any exist in pack directory)
  const configDir = path.join(packDir, 'config');
  try {
    await fs.access(configDir);
    archive.directory(configDir, 'overrides/config');
  } catch {}

  await archive.finalize();
}

/**
 * Export as a ready-to-import Prism Launcher Instance (.zip)
 */
export async function exportPrismInstanceZip(packDir, outputStream, { autoSync = false, packUrl = '' } = {}) {
  const packToml = await readTomlFile(path.join(packDir, 'pack.toml'));
  const loaderName = Object.keys(packToml.versions).find(k => k !== 'minecraft') || 'fabric';
  const loaderVer = packToml.versions[loaderName] || '';
  const mcVer = packToml.versions.minecraft;

  const mmcPack = generateMmcPackJson(mcVer, loaderName, loaderVer);
  const instanceCfg = generateInstanceCfg({
    name: packToml.name || 'PackHub Pack',
    notes: packToml.description,
    autoSync,
    packUrl
  });

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(outputStream);

  // Prism instance top-level files
  archive.append(instanceCfg, { name: 'instance.cfg' });
  archive.append(JSON.stringify(mmcPack, null, 2), { name: 'mmc-pack.json' });

  // If autoSync is enabled, also bundle packwiz-installer-bootstrap.jar if available
  if (autoSync) {
    try {
      const bootstrapPath = path.join(packDir, '..', '..', 'resources', 'packwiz-installer-bootstrap.jar');
      archive.file(bootstrapPath, { name: 'packwiz-installer-bootstrap.jar' });
    } catch {}
  }

  // Include pack.toml and index.toml in instance folder for local packwiz tracking
  archive.file(path.join(packDir, 'pack.toml'), { name: '.minecraft/pack.toml' });
  const indexTomlPath = path.join(packDir, 'index.toml');
  try {
    await fs.access(indexTomlPath);
    archive.file(indexTomlPath, { name: '.minecraft/index.toml' });
  } catch {}

  // Include .pw.toml mod files
  const modsDir = path.join(packDir, 'mods');
  try {
    const modFiles = await fs.readdir(modsDir);
    for (const file of modFiles) {
      if (file.endsWith('.pw.toml')) {
        archive.file(path.join(modsDir, file), { name: `.minecraft/mods/${file}` });
      }
    }
  } catch {}

  // Include config files if any
  const configDir = path.join(packDir, 'config');
  try {
    await fs.access(configDir);
    archive.directory(configDir, '.minecraft/config');
  } catch {}

  await archive.finalize();
}

/**
 * Direct deploy / sync into local Prism Launcher instances directory
 */
export async function deployToPrismLauncher(packDir, { targetInstancesPath, autoSync = true, packUrl = '' } = {}) {
  const instancesDir = targetInstancesPath || getDefaultPrismInstancesPath();
  const packToml = await readTomlFile(path.join(packDir, 'pack.toml'));

  // Sanitize pack folder name
  const instanceFolderName = (packToml.name || 'PackHub_Pack').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetInstanceDir = path.join(instancesDir, instanceFolderName);
  const targetMinecraftDir = path.join(targetInstanceDir, '.minecraft');

  await fs.mkdir(targetMinecraftDir, { recursive: true });

  const loaderName = Object.keys(packToml.versions).find(k => k !== 'minecraft') || 'fabric';
  const loaderVer = packToml.versions[loaderName] || '';
  const mcVer = packToml.versions.minecraft;

  // Write mmc-pack.json
  const mmcPack = generateMmcPackJson(mcVer, loaderName, loaderVer);
  await fs.writeFile(
    path.join(targetInstanceDir, 'mmc-pack.json'),
    JSON.stringify(mmcPack, null, 2),
    'utf-8'
  );

  // Write instance.cfg
  const instanceCfg = generateInstanceCfg({
    name: packToml.name || 'PackHub Pack',
    notes: packToml.description,
    autoSync,
    packUrl
  });
  await fs.writeFile(path.join(targetInstanceDir, 'instance.cfg'), instanceCfg, 'utf-8');

  // Copy packwiz files for updater
  await fs.copyFile(path.join(packDir, 'pack.toml'), path.join(targetMinecraftDir, 'pack.toml'));
  const indexTomlPath = path.join(packDir, 'index.toml');
  try {
    await fs.copyFile(indexTomlPath, path.join(targetMinecraftDir, 'index.toml'));
  } catch {}

  // Copy mods directory metadata
  const targetModsDir = path.join(targetMinecraftDir, 'mods');
  await fs.mkdir(targetModsDir, { recursive: true });
  const modsDir = path.join(packDir, 'mods');
  try {
    const modFiles = await fs.readdir(modsDir);
    for (const f of modFiles) {
      if (f.endsWith('.pw.toml')) {
        await fs.copyFile(path.join(modsDir, f), path.join(targetModsDir, f));
      }
    }
  } catch {}

  return {
    success: true,
    instancePath: targetInstanceDir,
    instanceName: instanceFolderName
  };
}
