#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { 
  createPack, 
  getPackDetails, 
  addModrinthMod, 
  addCurseForgeMod, 
  removeMod, 
  checkAllUpdates, 
  applyUpdate,
  listPacks,
  PACKS_DIR
} from '../server/services/packManager.js';
import { searchModrinth } from '../server/services/modrinth.js';
import { searchCurseForge } from '../server/services/curseforge.js';
import { exportPrismInstanceZip, exportMrpack, exportCurseForgeZip, deployToPrismLauncher } from '../server/services/prismExporter.js';
import { publishToModrinth, publishToCurseForge, publishToAll, getPublisherConfig, savePublisherConfig } from '../server/services/publisher.js';
import { getDefaultPrismInstancesPath, PORT } from '../server/config.js';

function resolvePackDir(packId) {
  const inPacksDir = path.join(PACKS_DIR, packId);
  if (existsSync(inPacksDir)) return inPacksDir;
  const inCwd = path.join(process.cwd(), packId);
  if (existsSync(inCwd)) return inCwd;
  return inPacksDir;
}

const program = new Command();

program
  .name('packhub')
  .description('Self-hosted packwiz-compatible modpack manager with CurseForge, Modrinth, and Prism Launcher integration')
  .version('1.0.0');

// Command: list
program
  .command('list')
  .description('List all modpacks managed by PackHub')
  .action(async () => {
    try {
      const packs = await listPacks();
      if (packs.length === 0) {
        console.log(chalk.yellow('No packs found. Create one with `packhub init`!'));
        return;
      }
      console.log(chalk.cyan.bold('\n📦 Available Modpacks:\n'));
      for (const p of packs) {
        console.log(`  • ${chalk.green.bold(p.name)} [${chalk.white(p.id)}]`);
        console.log(`    Minecraft: ${chalk.yellow(p.mcVersion)} | Loader: ${chalk.magenta(p.loader)} (${p.loaderVersion}) | Mods: ${chalk.cyan(p.modCount)}`);
      }
      console.log();
    } catch (err) {
      console.error(chalk.red('Error listing packs:'), err.message);
    }
  });

// Command: init
program
  .command('init')
  .description('Initialize a new modpack')
  .requiredOption('-n, --name <name>', 'Pack name')
  .requiredOption('-m, --mc-version <version>', 'Minecraft version (e.g. 1.21.1)')
  .option('-l, --loader <loader>', 'Mod loader: fabric, neoforge, forge, quilt', 'fabric')
  .option('-a, --author <author>', 'Author name', 'PackHub')
  .option('-v, --version <version>', 'Pack version', '1.0.0')
  .option('-d, --desc <description>', 'Pack description', '')
  .action(async (opts) => {
    try {
      console.log(chalk.blue(`Creating pack '${opts.name}' for Minecraft ${opts.mcVersion} (${opts.loader})...`));
      const pack = await createPack({
        name: opts.name,
        author: opts.author,
        version: opts.version,
        description: opts.desc,
        mcVersion: opts.mcVersion,
        loader: opts.loader
      });
      console.log(chalk.green.bold(`\n Pack '${pack.name}' initialized successfully! ID: ${pack.id}`));
      console.log(chalk.gray(`Next steps:`));
      console.log(chalk.gray(`  packhub add-modrinth -p ${pack.id} <slug>`));
      console.log(chalk.gray(`  packhub add-curseforge -p ${pack.id} <id>`));
      console.log(chalk.gray(`  packhub export-prism -p ${pack.id}\n`));
    } catch (err) {
      console.error(chalk.red('Failed to initialize pack:'), err.message);
    }
  });

// Command: search
program
  .command('search <query>')
  .description('Search mods on both Modrinth and CurseForge')
  .option('-m, --mc-version <version>', 'Filter by Minecraft version')
  .option('-l, --loader <loader>', 'Filter by mod loader')
  .option('-s, --source <source>', 'Search source: all, modrinth, curseforge', 'all')
  .action(async (query, opts) => {
    try {
      console.log(chalk.blue(`🔍 Searching for "${query}" across ${opts.source}...`));
      
      const promises = [];
      if (opts.source === 'all' || opts.source === 'modrinth') {
        promises.push(searchModrinth({ query, mcVersion: opts.mcVersion, loader: opts.loader, limit: 5 }));
      }
      if (opts.source === 'all' || opts.source === 'curseforge') {
        promises.push(searchCurseForge({ query, mcVersion: opts.mcVersion, loader: opts.loader, limit: 5 }));
      }

      const results = await Promise.all(promises);
      let hits = [];
      for (const r of results) {
        if (r.hits) hits = hits.concat(r.hits);
      }

      if (hits.length === 0) {
        console.log(chalk.yellow('No mods found.'));
        return;
      }

      console.log(chalk.cyan.bold(`\nFound ${hits.length} matches:\n`));
      for (const hit of hits) {
        const sourceBadge = hit.source === 'modrinth' 
          ? chalk.bgGreen.black(' MODRINTH ') 
          : chalk.bgRed.black(' CURSEFORGE ');
        console.log(`${sourceBadge} ${chalk.bold.white(hit.title)} (${chalk.yellow(hit.slug || hit.id)})`);
        console.log(`  ${chalk.gray(hit.description?.slice(0, 100) + '...')}`);
        console.log(`  Downloads: ${chalk.cyan(hit.downloads.toLocaleString())} | Link: ${chalk.blue(hit.url)}\n`);
      }
    } catch (err) {
      console.error(chalk.red('Search error:'), err.message);
    }
  });

// Command: add-modrinth
program
  .command('add-modrinth <slug>')
  .description('Add a mod from Modrinth')
  .requiredOption('-p, --pack <packId>', 'Target pack ID')
  .option('--side <side>', 'Side: both, client, server', 'both')
  .action(async (slug, opts) => {
    try {
      console.log(chalk.blue(`Fetching Modrinth mod '${slug}'...`));
      const res = await addModrinthMod(opts.pack, { slugOrId: slug, side: opts.side });
      console.log(chalk.green.bold(` Installed ${res.mod.name} (${res.mod.filename})`));
      if (res.mod.dependenciesInstalled?.length > 0) {
        console.log(chalk.magenta(`  Auto-installed dependencies: ${res.mod.dependenciesInstalled.join(', ')}`));
      }
    } catch (err) {
      console.error(chalk.red('Failed to add mod:'), err.message);
    }
  });

// Command: add-curseforge
program
  .command('add-curseforge <modId>')
  .description('Add a mod from CurseForge by Project ID')
  .requiredOption('-p, --pack <packId>', 'Target pack ID')
  .option('--side <side>', 'Side: both, client, server', 'both')
  .action(async (modId, opts) => {
    try {
      console.log(chalk.blue(`Fetching CurseForge mod '${modId}'...`));
      const res = await addCurseForgeMod(opts.pack, { modId, side: opts.side });
      console.log(chalk.green.bold(` Installed ${res.mod.name} (${res.mod.filename})`));
      if (res.mod.dependenciesInstalled?.length > 0) {
        console.log(chalk.magenta(`  Auto-installed dependencies: ${res.mod.dependenciesInstalled.join(', ')}`));
      }
    } catch (err) {
      console.error(chalk.red('Failed to add mod:'), err.message);
    }
  });

// Command: update
program
  .command('update')
  .description('Check and apply updates for mods in a pack')
  .requiredOption('-p, --pack <packId>', 'Target pack ID')
  .option('--apply', 'Automatically apply all available updates')
  .action(async (opts) => {
    try {
      console.log(chalk.blue(`Checking updates for pack '${opts.pack}'...`));
      const updates = await checkAllUpdates(opts.pack);
      const outdated = updates.filter(u => u.hasUpdate);

      console.log(`\nChecked ${updates.length} mods. Available updates: ${chalk.yellow(outdated.length)}\n`);

      for (const item of updates) {
        if (item.hasUpdate) {
          console.log(`  ${chalk.green('↑')} ${chalk.bold(item.title)}: ${chalk.gray(item.currentVersionId)} -> ${chalk.yellow.bold(item.latestVersionName)} (${item.source})`);
        } else {
          console.log(`    ${chalk.gray(item.title)}: up to date`);
        }
      }

      if (opts.apply && outdated.length > 0) {
        console.log(chalk.cyan(`\nApplying updates...`));
        for (const item of outdated) {
          await applyUpdate(opts.pack, {
            slug: item.slug,
            source: item.source,
            latestVersionId: item.latestVersionId
          });
          console.log(chalk.green(` Updated ${item.title} to ${item.latestVersionName}`));
        }
        console.log(chalk.green.bold('\nAll updates applied successfully!'));
      }
    } catch (err) {
      console.error(chalk.red('Update check failed:'), err.message);
    }
  });

// Command: export-prism
program
  .command('export-prism')
  .description('Export pack into Prism Launcher instance zip or directly to local Prism instances directory')
  .requiredOption('-p, --pack <packId>', 'Target pack ID')
  .option('-o, --output <file>', 'Output zip file path (default: <packId>-prism.zip)')
  .option('--deploy', 'Directly deploy/sync into local Prism Launcher directory')
  .option('--prism-path <path>', 'Custom Prism Launcher instances directory path')
  .action(async (opts) => {
    try {
      const packDir = resolvePackDir(opts.pack);
      
      if (opts.deploy) {
        console.log(chalk.blue(`Deploying pack directly into Prism Launcher instances...`));
        const res = await deployToPrismLauncher(packDir, {
          targetInstancesPath: opts.prismPath,
          autoSync: true
        });
        console.log(chalk.green.bold(` Successfully deployed into Prism Launcher!`));
        console.log(chalk.cyan(`Instance folder: ${res.instancePath}`));
        console.log(chalk.gray(`You can now open Prism Launcher and launch the pack directly!`));
      } else {
        const outPath = opts.output || `${opts.pack}-prism-instance.zip`;
        const writeStream = createWriteStream(outPath);
        console.log(chalk.blue(`Exporting Prism Launcher instance to ${outPath}...`));
        await exportPrismInstanceZip(packDir, writeStream);
        console.log(chalk.green.bold(` Exported: ${outPath}`));
        console.log(chalk.gray(`In Prism Launcher: Click "Add Instance" -> "Import from zip" -> Select this file.`));
      }
    } catch (err) {
      console.error(chalk.red('Export failed:'), err.message);
    }
  });

// Command: export-mrpack
program
  .command('export-mrpack')
  .description('Export pack as Modrinth .mrpack format (drag-and-drop into Prism Launcher)')
  .requiredOption('-p, --pack <packId>', 'Target pack ID')
  .option('-o, --output <file>', 'Output .mrpack path')
  .action(async (opts) => {
    try {
      const packDir = resolvePackDir(opts.pack);
      const outPath = opts.output || `${opts.pack}.mrpack`;
      const writeStream = createWriteStream(outPath);
      console.log(chalk.blue(`Exporting Modrinth .mrpack to ${outPath}...`));
      await exportMrpack(packDir, writeStream);
      console.log(chalk.green.bold(` Exported: ${outPath}`));
      console.log(chalk.gray(`In Prism Launcher: Drag-and-drop ${outPath} directly into the launcher window!`));
    } catch (err) {
      console.error(chalk.red('Export failed:'), err.message);
    }
  });

// Command: export-curseforge
program
  .command('export-curseforge')
  .description('Export pack as CurseForge modpack zip (manifest.json + overrides)')
  .requiredOption('-p, --pack <packId>', 'Target pack ID')
  .option('-o, --output <file>', 'Output zip path')
  .action(async (opts) => {
    try {
      const packDir = resolvePackDir(opts.pack);
      const outPath = opts.output || `${opts.pack}-curseforge.zip`;
      const writeStream = createWriteStream(outPath);
      console.log(chalk.blue(`Exporting CurseForge modpack zip to ${outPath}...`));
      await exportCurseForgeZip(packDir, writeStream);
      console.log(chalk.green.bold(` Exported: ${outPath}`));
    } catch (err) {
      console.error(chalk.red('Export failed:'), err.message);
    }
  });

// Command: config-tokens
program
  .command('config-tokens')
  .description('Configure API tokens for auto-publishing to Modrinth and CurseForge')
  .option('--mr-token <token>', 'Modrinth API Token')
  .option('--cf-token <token>', 'CurseForge API Token')
  .action(async (opts) => {
    try {
      const updates = {};
      if (opts.mrToken) updates.modrinthToken = opts.mrToken;
      if (opts.cfToken) updates.curseforgeToken = opts.cfToken;

      await savePublisherConfig(updates);
      console.log(chalk.green.bold(' Publisher tokens saved successfully!'));
      const cfg = await getPublisherConfig();
      console.log(`  Modrinth Token: ${cfg.modrinthToken ? chalk.green('Configured') : chalk.gray('Not set')}`);
      console.log(`  CurseForge Token: ${cfg.curseforgeToken ? chalk.green('Configured') : chalk.gray('Not set')}`);
    } catch (err) {
      console.error(chalk.red('Failed to save tokens:'), err.message);
    }
  });

// Command: publish
program
  .command('publish')
  .description('Auto-publish modpack directly to Modrinth and/or CurseForge')
  .requiredOption('-p, --pack <packId>', 'Target pack ID')
  .option('--all', 'Push to both Modrinth and CurseForge simultaneously', false)
  .option('--modrinth', 'Push to Modrinth', false)
  .option('--curseforge', 'Push to CurseForge', false)
  .option('--mr-project <id>', 'Modrinth Project ID or Slug')
  .option('--cf-project <id>', 'CurseForge Project ID')
  .option('--mr-token <token>', 'Modrinth API Token (overrides saved token)')
  .option('--cf-token <token>', 'CurseForge API Token (overrides saved token)')
  .option('-v, --version-name <name>', 'Release version name')
  .option('-n, --version-num <num>', 'Version number (e.g. 1.0.1)')
  .option('-c, --changelog <text>', 'Changelog text')
  .option('-t, --type <type>', 'Release type: release, beta, alpha', 'release')
  .action(async (opts) => {
    try {
      const config = await getPublisherConfig();
      const mrProject = opts.mrProject || config.projects?.[opts.pack]?.modrinthProjectId;
      const cfProject = opts.cfProject || config.projects?.[opts.pack]?.curseforgeProjectId;
      const mrToken = opts.mrToken || config.modrinthToken;
      const cfToken = opts.cfToken || config.curseforgeToken;

      const pushMr = opts.all || opts.modrinth || (!opts.curseforge && Boolean(mrProject));
      const pushCf = opts.all || opts.curseforge || (!opts.modrinth && Boolean(cfProject));

      if (!pushMr && !pushCf) {
        console.log(chalk.yellow('Please specify a platform: --modrinth, --curseforge, or --all'));
        console.log(chalk.gray('Example: packhub publish -p mypack --modrinth --mr-project my-modpack-slug'));
        return;
      }

      console.log(chalk.cyan.bold(`\n🚀 Auto-Publishing Pack: ${opts.pack}...\n`));

      if (pushMr) {
        if (!mrProject) {
          console.log(chalk.red('Missing Modrinth Project ID/Slug. Use --mr-project <slug>'));
        } else if (!mrToken) {
          console.log(chalk.red('Missing Modrinth Token. Configure with `packhub config-tokens --mr-token <token>` or use --mr-token'));
        } else {
          console.log(chalk.blue(`[Modrinth] Building .mrpack and pushing to project '${mrProject}'...`));
          try {
            const res = await publishToModrinth({
              packId: opts.pack,
              projectId: mrProject,
              token: mrToken,
              versionName: opts.versionName,
              versionNumber: opts.versionNum,
              changelog: opts.changelog,
              versionType: opts.type
            });
            console.log(chalk.green.bold(` [Modrinth] Released version ${res.versionNumber} successfully!`));
            console.log(chalk.cyan(`  URL: ${res.url}\n`));
          } catch (err) {
            console.log(chalk.red(` [Modrinth] Upload failed: ${err.message}\n`));
          }
        }
      }

      if (pushCf) {
        if (!cfProject) {
          console.log(chalk.red('Missing CurseForge Project ID. Use --cf-project <id>'));
        } else if (!cfToken) {
          console.log(chalk.red('Missing CurseForge Token. Configure with `packhub config-tokens --cf-token <token>` or use --cf-token'));
        } else {
          console.log(chalk.blue(`[CurseForge] Building modpack zip and pushing to project '${cfProject}'...`));
          try {
            const res = await publishToCurseForge({
              packId: opts.pack,
              projectId: cfProject,
              token: cfToken,
              displayName: opts.versionName,
              changelog: opts.changelog,
              releaseType: opts.type
            });
            console.log(chalk.green.bold(` [CurseForge] File uploaded successfully (ID: ${res.fileId})!`));
            console.log(chalk.cyan(`  URL: ${res.url}\n`));
          } catch (err) {
            console.log(chalk.red(` [CurseForge] Upload failed: ${err.message}\n`));
          }
        }
      }
    } catch (err) {
      console.error(chalk.red('Publish failed:'), err.message);
    }
  });

// Command: serve
program
  .command('serve')
  .description('Start the self-hosted web server & pack distribution service')
  .option('-p, --port <port>', 'Preferred port to listen on', '8080')
  .option('--open', 'Automatically open default browser to dashboard', false)
  .action(async (opts) => {
    const { startServer } = await import('../server/index.js');
    if (opts.open) process.env.AUTO_OPEN_BROWSER = 'true';
    await startServer(parseInt(opts.port, 10));
  });

program.parse(process.argv);
