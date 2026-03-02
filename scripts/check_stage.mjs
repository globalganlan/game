#!/usr/bin/env node
// Quick script to verify stage configs via API
import { execSync } from 'child_process'

try {
  const result = execSync(
    'npx wrangler d1 execute globalganlan-db --remote --json --command "SELECT stageId, enemies FROM stage_configs WHERE chapter=1 ORDER BY stage"',
    { encoding: 'utf-8', cwd: 'd:/GlobalGanLan', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
  )
  const data = JSON.parse(result)
  for (const row of data[0].results) {
    const enemies = JSON.parse(row.enemies)
    console.log(`${row.stageId}: ${enemies.length} enemies, heroIds=[${enemies.map(e => e.heroId).join(',')}], defMult=${enemies[0]?.defMultiplier ?? 'N/A'}`)
  }
} catch (e) {
  console.error('Error:', e.stderr || e.message)
}
