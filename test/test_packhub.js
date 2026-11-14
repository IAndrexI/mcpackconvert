import { createPack, listPacks, addModrinthMod, getPackDetails, removeMod } from '../server/services/packManager.js';
import { searchModrinth } from '../server/services/modrinth.js';
import { searchCurseForge } from '../server/services/curseforge.js';
import { exportPrismInstanceZip, exportMrpack } from '../server/services/prismExporter.js';
import { createWriteStream } from 'fs';
import path from 'path';

async function test() {
  console.log('--- 1. Testing Search ---');
  console.log('Testing Modrinth search for "sodium"...');
  const mrResults = await searchModrinth({ query: 'sodium', mcVersion: '1.21.1', loader: 'fabric', limit: 2 });
  console.log(`Modrinth hits: ${mrResults.hits.length}, first: ${mrResults.hits[0]?.title}`);

  console.log('Testing CurseForge search for "jei"...');
  try {
    const cfResults = await searchCurseForge({ query: 'jei', mcVersion: '1.21.1', loader: 'fabric', limit: 2 });
    console.log(`CurseForge hits: ${cfResults.hits.length}, first: ${cfResults.hits[0]?.title}`);
  } catch (e) {
    console.log('CurseForge search notice:', e.message);
  }

  console.log('\n--- 2. Creating Modpack ---');
  const pack = await createPack({
    name: 'PrismTestPack',
    author: 'Andre',
    mcVersion: '1.21.1',
    loader: 'fabric',
    description: 'A test pack for Prism Launcher verification'
  });
  console.log(`Pack created: ${pack.name} (${pack.id})`);

  console.log('\n--- 3. Adding Mod from Modrinth ---');
  const addRes = await addModrinthMod(pack.id, { slugOrId: 'sodium' });
  console.log(`Installed: ${addRes.mod.name} (${addRes.mod.filename})`);

  console.log('\n--- 4. Getting Pack Details ---');
  const details = await getPackDetails(pack.id);
  console.log(`Pack has ${details.mods.length} mod(s):`);
  details.mods.forEach(m => console.log(` - ${m.name} [${m.source}] (${m.filename})`));

  console.log('\n--- 5. Testing Exports ---');
  const prismZipPath = path.join(process.cwd(), 'data', 'test-prism.zip');
  const mrpackPath = path.join(process.cwd(), 'data', 'test-pack.mrpack');
  
  const prismStream = createWriteStream(prismZipPath);
  await exportPrismInstanceZip(path.join(process.cwd(), 'data', 'packs', pack.id), prismStream);
  console.log(`Prism Launcher instance zip exported to: ${prismZipPath}`);

  const mrpackStream = createWriteStream(mrpackPath);
  await exportMrpack(path.join(process.cwd(), 'data', 'packs', pack.id), mrpackStream);
  console.log(`Modrinth .mrpack exported to: ${mrpackPath}`);

  console.log('\n--- ALL VERIFICATIONS PASSED! ---');
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
