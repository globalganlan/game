/**
 * append_skills_batch.mjs
 * Appends skill data in batches of 10 to avoid payload issues
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POST_URL = 'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec';

async function post(body) {
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  return res.json();
}

async function main() {
  const data = JSON.parse(readFileSync(resolve(__dirname, 'skill_data_zh.json'), 'utf-8'));
  const BATCH = 10;
  let total = 0;

  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    const body = {
      action: 'appendRows',
      sheet: 'skill_templates',
      data: batch
    };
    const res = await post(body);
    if (res.success) {
      total += res.appended || batch.length;
      console.log(`  Batch ${Math.floor(i/BATCH)+1}: +${batch.length} rows (total: ${total})`);
    } else {
      console.error(`  Batch ${Math.floor(i/BATCH)+1} FAILED:`, JSON.stringify(res));
      process.exit(1);
    }
  }
  console.log(`Done! ${total} rows appended.`);
}

main().catch(e => { console.error(e); process.exit(1); });
