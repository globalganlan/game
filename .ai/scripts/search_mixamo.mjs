/**
 * search_mixamo.mjs — 搜索 Mixamo 動畫
 * 用法: node .ai/scripts/search_mixamo.mjs "query1" "query2" ...
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIXAMO_API = 'https://www.mixamo.com/api/v1';

function loadToken() {
  const text = fs.readFileSync(path.join(__dirname, 'hero-gen.env'), 'utf-8');
  return text.match(/MIXAMO_TOKEN=(.+)/)[1].trim();
}

async function search(token, query) {
  const params = new URLSearchParams({ page: '1', limit: '20', order: '', type: 'Motion', query });
  const r = await fetch(`${MIXAMO_API}/products?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Api-Key': 'mixamo2',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`search ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const queries = process.argv.slice(2);
  if (!queries.length) {
    console.log('Usage: node search_mixamo.mjs "query1" "query2" ...');
    process.exit(1);
  }

  const token = loadToken();

  for (const q of queries) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 "${q}"`);
    console.log('='.repeat(60));
    const data = await search(token, q);
    const results = data.results || [];
    if (!results.length) {
      console.log('  (no results)');
      continue;
    }
    for (const r of results) {
      const mid = r.thumbnail?.match(/motions\/(\d+)\//)?.[1] || '?';
      console.log(`  ${mid} — ${r.description}`);
    }
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });
