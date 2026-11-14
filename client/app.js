// State management
let packs = [];
let currentPack = null;
let currentUpdates = [];
let activeSearchSource = 'all';

// DOM elements
const packsContainer = document.getElementById('packs-container');
const packCountEl = document.getElementById('pack-count');
const viewPackName = document.getElementById('view-pack-name');
const viewPackDesc = document.getElementById('view-pack-desc');
const tagMc = document.getElementById('tag-mc');
const tagLoader = document.getElementById('tag-loader');
const tagModsCount = document.getElementById('tag-mods-count');
const installedModsTbody = document.getElementById('installed-mods-tbody');
const filterInstalledInput = document.getElementById('filter-installed-mods');

// Modals
const modalNewPack = document.getElementById('modal-new-pack');
const modalSearch = document.getElementById('modal-search');
const modalPrism = document.getElementById('modal-prism');

// Alerts
const updateAlert = document.getElementById('update-alert');
const updateAlertText = document.getElementById('update-alert-text');
const btnApplyAllUpdates = document.getElementById('btn-apply-all-updates');

// Initialize app
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadPacks();
  await loadPrismInfo();
});

function setupEventListeners() {
  document.getElementById('btn-refresh').addEventListener('click', () => loadPacks());

  // Modal open buttons
  document.getElementById('btn-new-pack').addEventListener('click', () => openModal(modalNewPack));
  document.getElementById('btn-open-search').addEventListener('click', () => {
    if (!currentPack) return alert('Select or create a modpack first!');
    openModal(modalSearch);
  });
  document.getElementById('btn-prism-dialog').addEventListener('click', () => {
    if (!currentPack) return alert('Select or create a modpack first!');
    setupPrismDialog();
    openModal(modalPrism);
  });

  // Modal close buttons
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) closeModal(modal);
    });
  });

  // New pack submit
  document.getElementById('btn-submit-new-pack').addEventListener('click', handleCreatePack);

  // Search actions
  document.getElementById('btn-run-search').addEventListener('click', runSearch);
  document.getElementById('search-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  // Search source tabs
  document.querySelectorAll('.source-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSearchSource = btn.dataset.source;
      if (document.getElementById('search-query').value.trim()) {
        runSearch();
      }
    });
  });

  // Filter installed mods
  filterInstalledInput.addEventListener('input', (e) => {
    filterInstalledMods(e.target.value.toLowerCase());
  });

  // Check updates
  document.getElementById('btn-check-updates').addEventListener('click', handleCheckUpdates);

  // Apply all updates
  btnApplyAllUpdates.addEventListener('click', handleApplyAllUpdates);

  // Prism deploy
  document.getElementById('btn-deploy-local-prism').addEventListener('click', handleDeployLocalPrism);
}

function openModal(el) {
  el.classList.add('open');
}

function closeModal(el) {
  el.classList.remove('open');
}

// Load packs list
async function loadPacks() {
  try {
    const res = await fetch('/api/packs');
    const data = await res.json();
    if (data.success) {
      packs = data.packs;
      renderPacksList();
      if (packs.length > 0) {
        if (!currentPack || !packs.find(p => p.id === currentPack.id)) {
          selectPack(packs[0].id);
        } else {
          selectPack(currentPack.id);
        }
      } else {
        showNoPacksView();
      }
    }
  } catch (err) {
    console.error('Failed to load packs:', err);
  }
}

function renderPacksList() {
  packCountEl.textContent = packs.length;
  packsContainer.innerHTML = '';

  if (packs.length === 0) {
    packsContainer.innerHTML = `
      <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1.5rem 0;">
        No modpacks found.<br>Click <strong>New Pack</strong> above to create one.
      </div>
    `;
    return;
  }

  packs.forEach(p => {
    const div = document.createElement('div');
    div.className = `pack-item ${currentPack && currentPack.id === p.id ? 'active' : ''}`;
    div.innerHTML = `
      <div class="pack-item-name">${escapeHtml(p.name)}</div>
      <div class="pack-item-meta">
        <span>${escapeHtml(p.mcVersion)}</span> • 
        <span>${escapeHtml(p.loader)}</span> • 
        <span>${p.modCount} mods</span>
      </div>
    `;
    div.addEventListener('click', () => selectPack(p.id));
    packsContainer.appendChild(div);
  });
}

function showNoPacksView() {
  currentPack = null;
  viewPackName.textContent = 'No Modpacks';
  viewPackDesc.textContent = 'Create your first modpack to begin.';
  tagMc.textContent = '-';
  tagLoader.textContent = '-';
  tagModsCount.textContent = '0 mods';
  installedModsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No packs created yet.</td></tr>`;
}

// Select and load pack details
async function selectPack(packId) {
  try {
    const res = await fetch(`/api/packs/${packId}`);
    const data = await res.json();
    if (data.success) {
      currentPack = data.pack;
      currentUpdates = [];
      updateAlert.style.display = 'none';
      renderPacksList();
      renderCurrentPack();
    }
  } catch (err) {
    console.error('Error selecting pack:', err);
  }
}

function renderCurrentPack() {
  if (!currentPack) return;

  viewPackName.textContent = currentPack.name;
  viewPackDesc.textContent = currentPack.description || `Modpack for Minecraft ${currentPack.mcVersion} using ${currentPack.loader}`;
  tagMc.textContent = `MC ${currentPack.mcVersion}`;
  tagLoader.textContent = `${currentPack.loader.toUpperCase()} ${currentPack.loaderVersion || ''}`;
  tagModsCount.textContent = `${currentPack.mods.length} mods`;

  renderInstalledMods(currentPack.mods);
}

function renderInstalledMods(modsList) {
  installedModsTbody.innerHTML = '';

  if (modsList.length === 0) {
    installedModsTbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No mods installed yet. Click <strong>➕ Add Mods</strong> above to search Modrinth & CurseForge!
        </td>
      </tr>
    `;
    return;
  }

  modsList.forEach(m => {
    const tr = document.createElement('tr');
    tr.dataset.slug = m.slug;

    const sourceBadge = m.source === 'modrinth'
      ? `<span class="badge badge-modrinth">Modrinth</span>`
      : `<span class="badge badge-curseforge">CurseForge</span>`;

    // Check if update is available for this mod
    const updateInfo = currentUpdates.find(u => u.slug === m.slug);
    let statusHtml = `<span class="badge badge-uptodate">Installed</span>`;
    if (updateInfo) {
      if (updateInfo.hasUpdate) {
        statusHtml = `<span class="badge badge-update" onclick="handleApplySingleUpdate('${m.slug}', '${m.source}', '${updateInfo.latestVersionId}')" title="Click to update to ${updateInfo.latestVersionName}">Update Available ➔ ${updateInfo.latestVersionName}</span>`;
      } else {
        statusHtml = `<span class="badge badge-uptodate" style="color: #4ade80;">Up to date</span>`;
      }
    }

    tr.innerHTML = `
      <td>
        <div style="font-weight: 600;">${escapeHtml(m.name)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(m.slug)}</div>
      </td>
      <td>${sourceBadge}</td>
      <td><span class="tag" style="font-size: 0.7rem;">${escapeHtml(m.side)}</span></td>
      <td>
        <div style="font-size: 0.8rem; word-break: break-all;">${escapeHtml(m.filename)}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted);">${m.hashFormat?.toUpperCase()}: ${m.hash ? m.hash.slice(0, 10) + '...' : 'none'}</div>
      </td>
      <td>${statusHtml}</td>
      <td style="text-align: right;">
        <button class="btn btn-danger btn-sm" onclick="handleRemoveMod('${m.slug}')">🗑️</button>
      </td>
    `;
    installedModsTbody.appendChild(tr);
  });
}

function filterInstalledMods(query) {
  const rows = installedModsTbody.querySelectorAll('tr');
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    r.style.display = text.includes(query) ? '' : 'none';
  });
}

// Create new pack
async function handleCreatePack(e) {
  e.preventDefault();
  const name = document.getElementById('new-pack-name').value.trim();
  const mcVersion = document.getElementById('new-pack-mc').value.trim();
  const loader = document.getElementById('new-pack-loader').value;
  const author = document.getElementById('new-pack-author').value.trim();
  const description = document.getElementById('new-pack-desc').value.trim();

  if (!name || !mcVersion) {
    return alert('Please fill in Pack Name and Minecraft Version');
  }

  try {
    const res = await fetch('/api/packs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mcVersion, loader, author, description })
    });
    const data = await res.json();
    if (data.success) {
      closeModal(modalNewPack);
      await loadPacks();
      selectPack(data.pack.id);
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Failed to create pack: ' + err.message);
  }
}

// Search Mods (CurseForge + Modrinth)
async function runSearch() {
  if (!currentPack) return;
  const query = document.getElementById('search-query').value.trim();
  const resultsContainer = document.getElementById('search-results');
  const statusEl = document.getElementById('search-status');

  if (!query) {
    resultsContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Please enter a search query.</div>`;
    return;
  }

  statusEl.style.display = 'block';
  statusEl.textContent = `Searching ${activeSearchSource === 'all' ? 'Modrinth & CurseForge' : activeSearchSource} for "${query}" (MC ${currentPack.mcVersion}, ${currentPack.loader})...`;
  resultsContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Fetching matches...</div>`;

  try {
    const params = new URLSearchParams({
      q: query,
      mcVersion: currentPack.mcVersion,
      loader: currentPack.loader,
      source: activeSearchSource,
      limit: '15'
    });

    const res = await fetch(`/api/mods/search?${params.toString()}`);
    const data = await res.json();

    if (!data.success || !data.hits || data.hits.length === 0) {
      statusEl.textContent = 'No matching mods found.';
      resultsContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No results found matching your criteria. Try another search keyword.</div>`;
      return;
    }

    statusEl.textContent = `Found ${data.hits.length} matching mods.`;
    resultsContainer.innerHTML = '';

    data.hits.forEach(hit => {
      const card = document.createElement('div');
      card.className = 'mod-card';

      const isInstalled = currentPack.mods.some(m => m.slug === hit.slug || (m.projectId && String(m.projectId) === String(hit.id)));
      const sourceBadge = hit.source === 'modrinth' 
        ? `<span class="badge badge-modrinth">Modrinth</span>`
        : `<span class="badge badge-curseforge">CurseForge</span>`;

      const iconSrc = hit.iconUrl || 'https://raw.githubusercontent.com/FabricMC/fabric/master/fabric-logo.png';

      card.innerHTML = `
        <img class="mod-icon" src="${escapeHtml(iconSrc)}" alt="" onerror="this.style.display='none'">
        <div class="mod-details">
          <div class="mod-title">
            <span>${escapeHtml(hit.title)}</span>
            ${sourceBadge}
          </div>
          <div class="mod-desc">${escapeHtml(hit.description || 'No description provided')}</div>
          <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-muted);">
            <span>⬇️ ${(hit.downloads || 0).toLocaleString()} downloads</span>
            <a href="${hit.url}" target="_blank" style="color: #818cf8; text-decoration: none;">View on ${hit.source} ↗</a>
          </div>
        </div>
        <div>
          ${isInstalled 
            ? `<button class="btn btn-secondary btn-sm" disabled>Installed</button>`
            : `<button class="btn btn-primary btn-sm" onclick="handleAddMod('${hit.source}', '${hit.id || hit.slug}')">➕ Install</button>`
          }
        </div>
      `;
      resultsContainer.appendChild(card);
    });
  } catch (err) {
    statusEl.textContent = 'Search failed: ' + err.message;
  }
}

// Add mod to pack
window.handleAddMod = async function(source, idOrSlug) {
  if (!currentPack) return;
  const side = document.getElementById('mod-side-select').value;

  try {
    let endpoint = '';
    let payload = {};

    if (source === 'modrinth') {
      endpoint = `/api/mods/packs/${currentPack.id}/modrinth`;
      payload = { slugOrId: idOrSlug, side };
    } else {
      endpoint = `/api/mods/packs/${currentPack.id}/curseforge`;
      payload = { modId: idOrSlug, side };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      let msg = `Installed ${data.mod.name}!`;
      if (data.mod.dependenciesInstalled && data.mod.dependenciesInstalled.length > 0) {
        msg += `\nAuto-installed dependencies: ${data.mod.dependenciesInstalled.join(', ')}`;
      }
      alert(msg);
      await selectPack(currentPack.id);
      runSearch(); // Refresh search list button states
    } else {
      alert('Failed to install mod: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

// Remove mod
window.handleRemoveMod = async function(slug) {
  if (!confirm(`Are you sure you want to remove ${slug}?`)) return;

  try {
    const res = await fetch(`/api/mods/packs/${currentPack.id}/${slug}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      await selectPack(currentPack.id);
    } else {
      alert('Failed to remove: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

// Check for updates
async function handleCheckUpdates() {
  if (!currentPack) return;
  const btn = document.getElementById('btn-check-updates');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  try {
    const res = await fetch(`/api/updates/${currentPack.id}`);
    const data = await res.json();
    if (data.success) {
      currentUpdates = data.updates;
      renderInstalledMods(currentPack.mods);

      if (data.availableUpdates > 0) {
        updateAlert.style.display = 'flex';
        updateAlertText.textContent = `${data.availableUpdates} mod(s) have updates available!`;
      } else {
        updateAlert.style.display = 'none';
        alert('All mods are up to date! 🎉');
      }
    }
  } catch (err) {
    alert('Update check failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Check Updates';
  }
}

// Single mod update
window.handleApplySingleUpdate = async function(slug, source, latestVersionId) {
  try {
    const res = await fetch(`/api/updates/${currentPack.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, source, latestVersionId })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Updated ${data.mod.name} to ${data.mod.version}!`);
      await selectPack(currentPack.id);
    } else {
      alert('Update failed: ' + data.error);
    }
  } catch (err) {
    alert('Error updating mod: ' + err.message);
  }
};

// Apply all updates
async function handleApplyAllUpdates() {
  if (!confirm('Update all outdated mods now?')) return;
  btnApplyAllUpdates.disabled = true;
  btnApplyAllUpdates.textContent = 'Updating...';

  try {
    const res = await fetch(`/api/updates/${currentPack.id}/apply-all`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      alert(`Successfully updated ${data.updatedCount} mods!`);
      await selectPack(currentPack.id);
      await handleCheckUpdates();
    } else {
      alert('Error updating all: ' + data.error);
    }
  } catch (err) {
    alert('Update failed: ' + err.message);
  } finally {
    btnApplyAllUpdates.disabled = false;
    btnApplyAllUpdates.textContent = 'Update All Outdated';
  }
}

// Setup Prism Launcher dialog
function setupPrismDialog() {
  if (!currentPack) return;
  document.getElementById('btn-dl-prism-zip').href = `/api/export/${currentPack.id}/prism`;
  document.getElementById('btn-dl-mrpack').href = `/api/export/${currentPack.id}/mrpack`;
  
  const host = window.location.host;
  const protocol = window.location.protocol;
  document.getElementById('packwiz-sync-url').textContent = `${protocol}//${host}/api/packs/${currentPack.id}/pack.toml`;
}

// Load default Prism Launcher configuration from server
async function loadPrismInfo() {
  try {
    const res = await fetch('/api/export/config/prism-info');
    const data = await res.json();
    if (data.defaultPath) {
      document.getElementById('prism-local-path').value = data.defaultPath;
    }
  } catch {}
}

// Direct Deploy to local Prism folder
async function handleDeployLocalPrism() {
  if (!currentPack) return;
  const pathInput = document.getElementById('prism-local-path').value.trim();
  const resultDiv = document.getElementById('deploy-result');
  resultDiv.style.display = 'block';
  resultDiv.style.color = 'var(--text-muted)';
  resultDiv.textContent = 'Deploying instance to Prism Launcher...';

  try {
    const res = await fetch(`/api/export/${currentPack.id}/prism/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPath: pathInput, autoSync: true })
    });
    const data = await res.json();
    if (data.success) {
      resultDiv.style.color = '#4ade80';
      resultDiv.innerHTML = `✅ Successfully created Prism Launcher instance: <strong>${escapeHtml(data.instanceName)}</strong> at <code>${escapeHtml(data.instancePath)}</code>.<br>Open Prism Launcher now and your pack is ready to play!`;
    } else {
      resultDiv.style.color = 'var(--accent-danger)';
      resultDiv.textContent = 'Deploy error: ' + data.error;
    }
  } catch (err) {
    resultDiv.style.color = 'var(--accent-danger)';
    resultDiv.textContent = 'Error: ' + err.message;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
