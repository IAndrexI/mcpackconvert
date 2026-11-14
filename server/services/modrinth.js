import { USER_AGENT } from '../config.js';

const BASE_URL = 'https://api.modrinth.com/v2';

/**
 * Helper to fetch from Modrinth API
 */
async function modrinthFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Modrinth API error [${response.status}]: ${errorText}`);
  }
  return response.json();
}

/**
 * Search mods on Modrinth
 */
export async function searchModrinth({ query = '', mcVersion = '', loader = '', limit = 20, offset = 0, sort = 'relevance' }) {
  const facets = [
    ['project_type:mod']
  ];

  if (mcVersion) {
    facets.push([`versions:${mcVersion}`]);
  }
  if (loader) {
    facets.push([`categories:${loader.toLowerCase()}`]);
  }

  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    limit: String(limit),
    offset: String(offset),
    index: sort // 'relevance', 'downloads', 'follows', 'newest', 'updated'
  });

  const data = await modrinthFetch(`/search?${params.toString()}`);
  return {
    source: 'modrinth',
    total: data.total_hits,
    offset: data.offset,
    limit: data.limit,
    hits: (data.hits || []).map(hit => ({
      id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      categories: hit.categories,
      clientSide: hit.client_side,
      serverSide: hit.server_side,
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      follows: hit.follows,
      latestVersion: hit.latest_version,
      source: 'modrinth',
      url: `https://modrinth.com/mod/${hit.slug}`
    }))
  };
}

/**
 * Get full project details
 */
export async function getModrinthProject(slugOrId) {
  const data = await modrinthFetch(`/project/${encodeURIComponent(slugOrId)}`);
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    description: data.description,
    body: data.body,
    categories: data.categories,
    loaders: data.loaders,
    gameVersions: data.game_versions,
    iconUrl: data.icon_url,
    issuesUrl: data.issues_url,
    sourceUrl: data.source_url,
    wikiUrl: data.wiki_url,
    discordUrl: data.discord_url,
    donationUrls: data.donation_urls,
    downloads: data.downloads,
    source: 'modrinth',
    url: `https://modrinth.com/mod/${data.slug}`
  };
}

/**
 * Get versions of a project, filtered by mcVersion and loader
 */
export async function getModrinthVersions(slugOrId, { mcVersion = '', loader = '' } = {}) {
  const params = new URLSearchParams();
  if (mcVersion) {
    params.set('game_versions', JSON.stringify([mcVersion]));
  }
  if (loader) {
    params.set('loaders', JSON.stringify([loader.toLowerCase()]));
  }

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const versions = await modrinthFetch(`/project/${encodeURIComponent(slugOrId)}/version${queryStr}`);

  return versions.map(v => {
    const primaryFile = v.files.find(f => f.primary) || v.files[0];
    return {
      id: v.id,
      projectId: v.project_id,
      name: v.name,
      versionNumber: v.version_number,
      versionType: v.version_type, // 'release', 'beta', 'alpha'
      changelog: v.changelog,
      datePublished: v.date_published,
      downloads: v.downloads,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      dependencies: (v.dependencies || []).map(d => ({
        projectId: d.project_id,
        versionId: d.version_id,
        dependencyType: d.dependency_type // 'required', 'optional', 'incompatible', 'embedded'
      })),
      file: primaryFile ? {
        filename: primaryFile.filename,
        url: primaryFile.url,
        size: primaryFile.size,
        hashes: primaryFile.hashes // { sha1, sha512 }
      } : null,
      allFiles: v.files.map(f => ({
        filename: f.filename,
        url: f.url,
        size: f.size,
        hashes: f.hashes,
        primary: f.primary
      }))
    };
  });
}

/**
 * Check updates for a list of Modrinth mods
 * @param {Array<{ projectId: string, currentVersionId: string, mcVersion: string, loader: string }>} modEntries
 */
export async function checkModrinthUpdates(modEntries) {
  const results = [];

  for (const entry of modEntries) {
    try {
      const versions = await getModrinthVersions(entry.projectId, {
        mcVersion: entry.mcVersion,
        loader: entry.loader
      });

      if (!versions || versions.length === 0) {
        results.push({
          projectId: entry.projectId,
          hasUpdate: false,
          reason: 'No versions found for current game version/loader'
        });
        continue;
      }

      // Sort versions newest first by datePublished
      versions.sort((a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime());
      const latest = versions[0];

      const hasUpdate = latest.id !== entry.currentVersionId;
      results.push({
        projectId: entry.projectId,
        currentVersionId: entry.currentVersionId,
        latestVersionId: latest.id,
        latestVersionNumber: latest.versionNumber,
        latestVersionName: latest.name,
        latestVersionType: latest.versionType,
        hasUpdate,
        datePublished: latest.datePublished,
        file: latest.file,
        changelog: latest.changelog
      });
    } catch (err) {
      results.push({
        projectId: entry.projectId,
        hasUpdate: false,
        error: err.message
      });
    }
  }

  return results;
}
