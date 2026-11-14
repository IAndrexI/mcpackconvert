import { CURSEFORGE_API_KEY, USER_AGENT } from '../config.js';

const BASE_URL = 'https://api.curseforge.com/v1';

// ModLoader Type mappings for CurseForge API
export const LOADER_TYPES = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
};

function getLoaderType(loader) {
  if (!loader) return 0;
  const key = loader.toLowerCase();
  return LOADER_TYPES[key] || 0;
}

/**
 * Fetch helper for CurseForge API
 */
async function curseforgeFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'x-api-key': CURSEFORGE_API_KEY,
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CurseForge API error [${response.status}]: ${errorText}`);
  }
  return response.json();
}

/**
 * Compute edge CDN fallback URL for CurseForge files if downloadUrl is null
 */
export function getCurseForgeDownloadUrl(file) {
  if (file.downloadUrl) {
    return file.downloadUrl;
  }
  // Edge CDN fallback: https://edge.forgecdn.net/files/{first4}/{last3}/{filename}
  const idStr = String(file.id);
  const part1 = idStr.slice(0, 4);
  const part2 = idStr.slice(4);
  return `https://edge.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(file.fileName)}`;
}

/**
 * Search mods on CurseForge
 */
export async function searchCurseForge({ query = '', mcVersion = '', loader = '', limit = 20, offset = 0, sort = 2 }) {
  const params = new URLSearchParams({
    gameId: '432', // Minecraft
    classId: '6',  // Mods
    pageSize: String(limit),
    index: String(offset),
    sortField: String(sort), // 2 = TotalDownloads, 1 = Featured, 3 = Popularity, 4 = Updated
    sortOrder: 'desc'
  });

  if (query) {
    params.set('searchFilter', query);
  }
  if (mcVersion) {
    params.set('gameVersion', mcVersion);
  }
  const loaderType = getLoaderType(loader);
  if (loaderType > 0) {
    params.set('modLoaderType', String(loaderType));
  }

  const res = await curseforgeFetch(`/mods/search?${params.toString()}`);
  const data = res.data || [];
  const pagination = res.pagination || { totalCount: data.length, index: offset, pageSize: limit };

  return {
    source: 'curseforge',
    total: pagination.totalCount,
    offset: pagination.index,
    limit: pagination.pageSize,
    hits: data.map(mod => ({
      id: mod.id,
      slug: mod.slug,
      title: mod.name,
      description: mod.summary,
      categories: (mod.categories || []).map(c => c.name),
      iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || null,
      downloads: mod.downloadCount,
      latestVersion: mod.latestFilesIndexes?.[0]?.gameVersion || '',
      source: 'curseforge',
      url: mod.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`
    }))
  };
}

/**
 * Get full mod details from CurseForge
 */
export async function getCurseForgeMod(modId) {
  const res = await curseforgeFetch(`/mods/${modId}`);
  const mod = res.data;
  return {
    id: mod.id,
    slug: mod.slug,
    title: mod.name,
    description: mod.summary,
    categories: (mod.categories || []).map(c => c.name),
    iconUrl: mod.logo?.url || null,
    downloads: mod.downloadCount,
    links: mod.links,
    source: 'curseforge',
    url: mod.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`
  };
}

/**
 * Get mod files from CurseForge filtered by game version and loader
 */
export async function getCurseForgeFiles(modId, { mcVersion = '', loader = '' } = {}) {
  const params = new URLSearchParams({
    pageSize: '50'
  });

  if (mcVersion) {
    params.set('gameVersion', mcVersion);
  }
  const loaderType = getLoaderType(loader);
  if (loaderType > 0) {
    params.set('modLoaderType', String(loaderType));
  }

  const res = await curseforgeFetch(`/mods/${modId}/files?${params.toString()}`);
  const files = res.data || [];

  return files.map(f => {
    // Determine release type: 1 = Release, 2 = Beta, 3 = Alpha
    let releaseType = 'release';
    if (f.releaseType === 2) releaseType = 'beta';
    if (f.releaseType === 3) releaseType = 'alpha';

    const downloadUrl = getCurseForgeDownloadUrl(f);

    // Extract hashes (1 = SHA1, 2 = MD5)
    let sha1 = '';
    if (f.hashes) {
      const sha1Obj = f.hashes.find(h => h.algo === 1);
      if (sha1Obj) sha1 = sha1Obj.value;
    }

    return {
      id: f.id,
      modId: f.modId,
      name: f.displayName,
      filename: f.fileName,
      versionType: releaseType,
      datePublished: f.fileDate,
      downloadUrl,
      size: f.fileLength,
      sha1,
      gameVersions: f.gameVersions || [],
      dependencies: (f.dependencies || []).map(d => ({
        modId: d.modId,
        relationType: d.relationType // 1 = embedded, 2 = optional, 3 = required, 4 = tool, 5 = incompatible
      }))
    };
  });
}

/**
 * Check updates for a list of CurseForge mods
 * @param {Array<{ modId: number, currentFileId: number, mcVersion: string, loader: string }>} modEntries
 */
export async function checkCurseForgeUpdates(modEntries) {
  const results = [];

  for (const entry of modEntries) {
    try {
      const files = await getCurseForgeFiles(entry.modId, {
        mcVersion: entry.mcVersion,
        loader: entry.loader
      });

      if (!files || files.length === 0) {
        results.push({
          modId: entry.modId,
          hasUpdate: false,
          reason: 'No files found for current game version/loader'
        });
        continue;
      }

      // Sort files newest first by datePublished
      files.sort((a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime());
      const latest = files[0];

      const hasUpdate = String(latest.id) !== String(entry.currentFileId);
      results.push({
        modId: entry.modId,
        currentFileId: entry.currentFileId,
        latestFileId: latest.id,
        latestFileName: latest.filename,
        latestVersionName: latest.name,
        latestVersionType: latest.versionType,
        hasUpdate,
        datePublished: latest.datePublished,
        downloadUrl: latest.downloadUrl,
        sha1: latest.sha1
      });
    } catch (err) {
      results.push({
        modId: entry.modId,
        hasUpdate: false,
        error: err.message
      });
    }
  }

  return results;
}
