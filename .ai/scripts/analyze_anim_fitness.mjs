/**
 * 分析每個模型的角色特徵（mesh 名稱、配件）和動畫名稱
 * 判斷動畫是否適合該角色類型
 */
import fs from 'fs';
import path from 'path';

const MODELS_DIR = 'D:\\GlobalGanLan\\public\\models';
const ANIM_TYPES = ['idle', 'attack', 'hurt', 'dying'];

function parseGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const chunk0Length = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf-8', 20, 20 + chunk0Length);
  return JSON.parse(jsonStr);
}

// 從 Mixamo 角色名推斷角色類型
const CHARACTER_MAP = {
  1: { char: 'Zombiegirl', type: '殭屍少女', style: 'zombie' },
  2: { char: 'Mutant', type: '突變體（大型）', style: 'brute' },
  3: { char: 'Warrok', type: '獸人戰士', style: 'warrior' },
  4: { char: 'SkeletonZombie', type: '骷髏殭屍', style: 'zombie' },
  5: { char: 'Parasite', type: '寄生殭屍', style: 'zombie' },
  6: { char: 'Ch10', type: '一般人型', style: 'humanoid' },
  7: { char: 'FuzZombie', type: '毛茸殭屍', style: 'zombie' },
  8: { char: 'Yaku', type: '夜叉殭屍', style: 'zombie' },
  9: { char: 'Survivor', type: '倖存者', style: 'humanoid' },
  10: { char: 'GirlScout', type: '女童軍', style: 'humanoid' },
  11: { char: 'WhiteClown', type: '白色小丑', style: 'humanoid' },
  12: { char: 'WorldWarZombie', type: '二戰殭屍', style: 'zombie' },
  13: { char: 'PumpkinHulk', type: '南瓜巨人', style: 'brute' },
  14: { char: 'Prisoner', type: '囚犯', style: 'humanoid' },
  15: { char: 'Vampire', type: '吸血鬼', style: 'vampire' },
  // 新角色 zombie_16~30
  16: { char: 'Brute', type: '蠻族戰士（持戰斧）', style: 'warrior' },
  17: { char: 'SkeletonZombie', type: '骷髏殭屍（另一隻）', style: 'zombie' },
  18: { char: 'Ch24 (Ninja)', type: '忍者', style: 'ninja' },
  19: { char: 'Copzombie (FuzZombie mesh)', type: '警察殭屍', style: 'zombie' },
  20: { char: 'Vanguard', type: '先鋒戰士', style: 'warrior' },
  21: { char: 'Erika Archer', type: '弓箭手', style: 'archer' },
  22: { char: 'Nightshade', type: '夜影刺客', style: 'assassin' },
  23: { char: 'Demon', type: '惡魔', style: 'demon' },
  24: { char: 'Exo Gray', type: '外星人', style: 'alien' },
  25: { char: 'Ganfaul', type: '法師', style: 'mage' },
  26: { char: 'Goblin', type: '哥布林', style: 'goblin' },
  27: { char: 'Paladin', type: '聖騎士', style: 'paladin' },
  28: { char: 'Medea', type: '女巫', style: 'mage' },
  29: { char: 'Ch44 (Alien Soldier)', type: '外星戰士', style: 'soldier' },
  30: { char: 'The Boss', type: 'BOSS（黑幫老大）', style: 'boss' },
};

// 適配性規則：哪些動畫風格適合哪些角色類型
const STYLE_IDEAL_ANIMS = {
  zombie: ['zombie', 'mutant', 'creature'],
  brute: ['zombie', 'mutant', 'creature', 'punch', 'smash'],
  warrior: ['sword', 'slash', 'swing', 'melee', 'attack'],
  ninja: ['kick', 'punch', 'martial', 'combo'],
  archer: ['bow', 'shoot', 'arrow'],
  assassin: ['stab', 'slash', 'sneak', 'kick'],
  demon: ['magic', 'claw', 'creature', 'zombie'],
  alien: ['punch', 'kick', 'shoot'],
  mage: ['magic', 'cast', 'spell'],
  goblin: ['creature', 'zombie', 'claw', 'bite'],
  paladin: ['sword', 'slash', 'shield', 'holy'],
  boss: ['punch', 'kick', 'melee'],
  vampire: ['claw', 'bite', 'magic'],
  humanoid: ['zombie', 'punch', 'kick', 'melee'],
  soldier: ['shoot', 'punch', 'kick', 'melee'],
};

console.log('='.repeat(80));
console.log('角色模型 vs 動畫適配性分析報告');
console.log('='.repeat(80));

for (let i = 1; i <= 30; i++) {
  const zombieId = `zombie_${i}`;
  const modelDir = path.join(MODELS_DIR, zombieId);
  const meshPath = path.join(modelDir, `${zombieId}.glb`);
  
  if (!fs.existsSync(meshPath)) continue;
  
  const info = CHARACTER_MAP[i] || { char: 'Unknown', type: '未知', style: 'unknown' };
  
  // 取得 mesh 資訊
  const meshGltf = parseGlb(meshPath);
  const meshNodes = (meshGltf.nodes || []).filter(n => n.mesh !== undefined).map(n => n.name);
  const meshSize = fs.statSync(meshPath).size;
  
  console.log(`\n  ${zombieId} | ${info.char} | ${info.type} | style: ${info.style}`);
  console.log(`  mesh: ${meshNodes.join(', ')} (${(meshSize/1024).toFixed(0)} KB)`);
  
  for (const animType of ANIM_TYPES) {
    const animPath = path.join(modelDir, `${zombieId}_${animType}.glb`);
    if (!fs.existsSync(animPath)) {
      console.log(`  ${animType}: ❌ FILE MISSING`);
      continue;
    }
    
    const animGltf = parseGlb(animPath);
    const anims = (animGltf.animations || []);
    const animNames = anims.map(a => a.name);
    
    // 計算動畫長度（取第一個 sampler 的 input accessor 的 max）
    let duration = 0;
    if (anims.length > 0 && anims[0].samplers?.length > 0) {
      const samplerIdx = anims[0].samplers[0].input;
      const accessor = animGltf.accessors?.[samplerIdx];
      if (accessor?.max) {
        duration = accessor.max[0];
      }
    }
    
    const animSize = fs.statSync(animPath).size;
    console.log(`  ${animType}: ${animNames.join(', ')} | ${duration.toFixed(2)}s | ${(animSize/1024).toFixed(0)} KB`);
  }
}

// 分析問題
console.log('\n\n' + '='.repeat(80));
console.log('潛在不適配問題分析');
console.log('='.repeat(80));

const issues = [];

// 手持武器的角色用殭屍動畫 → 手會穿過武器
if (CHARACTER_MAP[16].style === 'warrior') {
  issues.push({
    id: 'zombie_16',
    severity: '⚠️ 高',
    desc: '蠻族戰士持戰斧(BattleAxe_GEO)，但如果用殭屍動畫，手臂不會做揮斧動作 → 戰斧會懸空/穿模'
  });
}

// 弓箭手用殭屍動畫 → 完全不適合
if (CHARACTER_MAP[21].style === 'archer') {
  issues.push({
    id: 'zombie_21',
    severity: '⚠️ 高',
    desc: '弓箭手(Erika_Archer)，如果攻擊動畫不是拉弓射箭而是肉搏 → 嚴重不匹配'
  });
}

// 法師用肉搏動畫
if (CHARACTER_MAP[25].style === 'mage') {
  issues.push({
    id: 'zombie_25',
    severity: '⚠️ 中',
    desc: '法師(Ganfaul)用殭屍攻擊動畫 → 法師應該是施法而非肉搏'
  });
}
if (CHARACTER_MAP[28].style === 'mage') {
  issues.push({
    id: 'zombie_28',
    severity: '⚠️ 中',
    desc: '女巫(Medea)用殭屍攻擊動畫 → 應該是施法動作'
  });
}

// 聖騎士用殭屍動畫
if (CHARACTER_MAP[27].style === 'paladin') {
  issues.push({
    id: 'zombie_27',
    severity: '⚠️ 中',
    desc: '聖騎士(Paladin)用殭屍動畫 → 應該是持劍/持盾戰鬥動作'
  });
}

// 忍者用殭屍動畫
if (CHARACTER_MAP[18].style === 'ninja') {
  issues.push({
    id: 'zombie_18',
    severity: '⚠️ 中',
    desc: '忍者(Ch24)用殭屍動畫 → 應該是武術/忍術動作'
  });
}

// BOSS 用殭屍動畫
if (CHARACTER_MAP[30].style === 'boss') {
  issues.push({
    id: 'zombie_30',
    severity: '⚠️ 低',
    desc: 'BOSS(The Boss)用殭屍動畫 → 黑幫老大應該是拳擊/踢擊'
  });
}

for (const issue of issues) {
  console.log(`  ${issue.severity} ${issue.id}: ${issue.desc}`);
}

console.log('\n建議：需要視覺化驗證來確認實際效果');
