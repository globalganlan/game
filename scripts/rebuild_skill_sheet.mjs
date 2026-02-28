/**
 * rebuild_skill_sheet.mjs
 * 用 Node.js 原生 fetch 重建 skill_templates Google Sheet（UTF-8 安全）
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POST_URL = 'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec';
const GET_URL  = 'https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec';

async function post(body) {
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  return res.json();
}

async function get(params) {
  const u = new URL(GET_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { redirect: 'follow' });
  return res.json();
}

async function main() {
  // 1. Delete existing sheet (ignore error if not exists)
  console.log('[1/4] Deleting old skill_templates...');
  try {
    const delRes = await post({ action: 'deleteSheet', sheet: 'skill_templates' });
    console.log('  →', JSON.stringify(delRes));
  } catch (e) {
    console.log('  → (not found, skip)');
  }

  // 2. Read Chinese skill data
  const data = JSON.parse(readFileSync(resolve(__dirname, 'skill_data_zh.json'), 'utf-8'));
  console.log(`[2/4] Loaded ${data.length} skills from skill_data_zh.json`);

  // 3. Create sheet
  console.log('[3/4] Creating skill_templates with Chinese data...');
  const createRes = await post({
    action: 'createSheet',
    sheet: 'skill_templates',
    headers: ['skillId', 'name', 'type', 'element', 'target', 'description', 'effects', 'passive_trigger', 'icon'],
    data: data,
    textColumns: ['skillId', 'effects']  // prevent auto-format
  });
  console.log('  →', JSON.stringify(createRes));

  // 4. Verify (read back + check Chinese)
  console.log('[4/4] Verifying sheet data...');
  const verify = await get({ action: 'readSheet', sheet: 'skill_templates' });
  if (!verify.data || !verify.data.length) {
    console.error('  ✖ EMPTY SHEET — create failed!');
    process.exit(1);
  }
  console.log(`  → ${verify.data.length} rows returned`);

  // Spot check Chinese
  const first = verify.data[0];
  console.log(`  → Row 1: name="${first.name}" icon="${first.icon}" desc="${first.description?.substring(0, 30)}..."`);
  
  const garbled = verify.data.filter(r =>
    /[\ufffd]|撠|璉|銋|蝒/.test(r.name || '') ||
    /[\ufffd]|撠|璉|銋|蝒/.test(r.description || '')
  );
  if (garbled.length > 0) {
    console.error(`  ✖ GARBLED: ${garbled.length} rows have encoding issues!`);
    garbled.slice(0, 3).forEach(r => console.error(`    ${r.skillId}: ${r.name}`));
    process.exit(1);
  }

  // Check hero 14 passive 4
  const pas144 = verify.data.find(r => r.skillId === 'PAS_14_4');
  console.log(`  → PAS_14_4: ${pas144 ? pas144.name : 'NOT FOUND'}`);

  console.log('✔ skill_templates rebuilt successfully with Chinese data!');
}

main().catch(e => { console.error(e); process.exit(1); });
