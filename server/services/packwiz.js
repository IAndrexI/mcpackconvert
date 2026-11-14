import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as toml from 'smol-toml';

/**
 * Calculate SHA256 of a string or buffer
 */
export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate SHA1 of a string or buffer
 */
export function sha1(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

/**
 * Parse a TOML file
 */
export async function readTomlFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return toml.parse(content);
}

/**
 * Write a TOML file with formatted output
 */
export async function writeTomlFile(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const content = toml.stringify(data);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Format a mod metadata object into a .pw.toml file
 */
export function createPwToml({
  name,
  filename,
  side = 'both',
  downloadUrl,
  hashFormat = 'sha1',
  hash = '',
  updateSource = 'modrinth',
  modrinth = null,
  curseforge = null,
  option = null
}) {
  const pw = {
    name,
    filename,
    side,
    download: {
      url: downloadUrl,
      'hash-format': hashFormat,
      hash
    }
  };

  const update = {};
  if (updateSource === 'modrinth' && modrinth) {
    update.modrinth = {
      'mod-id': modrinth.modId,
      version: modrinth.versionId
    };
  } else if (updateSource === 'curseforge' && curseforge) {
    update.curseforge = {
      'project-id': curseforge.projectId,
      'file-id': curseforge.fileId
    };
  }

  if (Object.keys(update).length > 0) {
    pw.update = update;
  }

  if (option) {
    pw.option = option;
  }

  return pw;
}

/**
 * Refresh and write the index.toml and pack.toml for a pack directory
 */
export async function rebuildPackwizIndex(packDir) {
  const packTomlPath = path.join(packDir, 'pack.toml');
  const indexTomlPath = path.join(packDir, 'index.toml');

  // Read pack.toml
  const packData = await readTomlFile(packTomlPath);

  // Scan all files in pack directory (excluding pack.toml and index.toml)
  const filesList = [];

  async function scanDirectory(dir, relPrefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relPrefix, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, relPath);
      } else {
        if (relPath === 'pack.toml' || relPath === 'index.toml') continue;
        
        const content = await fs.readFile(fullPath);
        const fileHash = sha256(content);
        const isMetafile = relPath.endsWith('.pw.toml');

        filesList.push({
          file: relPath,
          hash: fileHash,
          ...(isMetafile ? { metafile: true } : {})
        });
      }
    }
  }

  await scanDirectory(packDir);

  // Sort files for deterministic index.toml
  filesList.sort((a, b) => a.file.localeCompare(b.file));

  // Build index.toml data
  const indexData = {
    'hash-format': 'sha256',
    files: filesList
  };

  // Write index.toml
  const indexContent = toml.stringify(indexData);
  await fs.writeFile(indexTomlPath, indexContent, 'utf-8');

  // Update pack.toml with new index.toml hash
  const indexHash = sha256(indexContent);
  packData.index = {
    file: 'index.toml',
    'hash-format': 'sha256',
    hash: indexHash
  };

  await fs.writeFile(packTomlPath, toml.stringify(packData), 'utf-8');
  return { indexHash, filesCount: filesList.length };
}
