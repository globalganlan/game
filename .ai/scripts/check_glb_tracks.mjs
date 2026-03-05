// Quick script to check GLB animation track names
// Run: node --experimental-vm-modules scripts/check_glb_tracks.mjs

import { readFileSync } from 'fs'

const buf = readFileSync('D:/GlobalGanLan/public/models/zombie_1/zombie_1_idle.glb')

// Parse GLB
const jsonLen = buf.readUInt32LE(12)
const jsonStr = buf.toString('utf8', 20, 20 + jsonLen)
const data = JSON.parse(jsonStr)

const nodes = data.nodes || []
const anims = data.animations || []

if (anims.length > 0) {
  const anim = anims[0]
  console.log(`Animation: ${anim.name}`)
  console.log(`Channels: ${anim.channels.length}`)
  
  // Show first 5 channels with target node names
  for (let i = 0; i < Math.min(5, anim.channels.length); i++) {
    const ch = anim.channels[i]
    const nodeIdx = ch.target.node
    const nodeName = nodes[nodeIdx]?.name || '?'
    console.log(`  ch[${i}]: node=${nodeIdx} (${nodeName}) path=${ch.target.path}`)
  }
}
