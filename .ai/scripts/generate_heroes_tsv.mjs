/**
 * generate_heroes_xlsx.mjs
 *
 * 根據 GLB 模型分析結果，生成 heroes.tsv 英雄資料表（Tab 分隔，可直接貼進 Google Sheets）。
 * Usage: node scripts/generate_heroes_xlsx.mjs
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUTPUT = join(ROOT, 'heroes.tsv');

/*
  模型分析摘要 (from analyze_zombies.mjs):
  ──────────────────────────────────────────────────
  zombie_1  — ZombieGirl        | 7,448 tris  | 63 bones | 女性，3層 Mesh（Body/Pants/Top），破爛衣物
  zombie_2  — Mutant            | 11,271 tris | 37 bones | 巨型裸身變異體，單 Mesh，寬肩厚重
  zombie_3  — Warrok (Bear)     | 12,626 tris | 81 bones | 熊形巨獸，四足，bear_ 貼圖
  zombie_4  — SkeletonZombie    | 12,486 tris | 73 bones | 骷髏亡靈，全白自發光 + 半透明斗篷
  zombie_5  — ParasiteZombie    | 10,856 tris | 69 bones | 寄生蟲型，半透明觸手/菌絲
  zombie_6  — Ch10              | 23,766 tris | 65 bones | 高精緻寫實人型，身材最矮瘦
  zombie_7  — FuzZombie         | 9,845 tris  | 67 bones | 4層 Mesh（Eyes/Body/Glass/Hair），戴眼鏡有頭髮
  zombie_8  — Yaku_zombie       | 8,144 tris  | 65 bones | "Yaku" 黑道/暴徒風格，衣服材質 "yifu"
  zombie_9  — Survivor          | 10,969 tris | 69 bones | 倖存者造型，雙材質（實體+半透明）
  zombie_10 — GirlScout         | 14,991 tris | 67 bones | 女童軍，有獨立眼球骨骼（LeftEye/RightEye）
  zombie_11 — WhiteClown        | 9,714 tris  | 67 bones | 白色小丑，單材質，低粗糙度（光滑皮膚）
  zombie_12 — WorldWar_zombie   | 14,934 tris | 72 bones | 世界大戰軍裝喪屍，高面數
  zombie_13 — PumpkinHulk       | 9,620 tris  | 66 bones | 南瓜巨人，寬 294，高粗糙度
  zombie_14 — Prisoner          | 12,128 tris | 47 bones | 囚犯，骨骼最少（47），身材不對稱
*/

const heroes = [
  {
    HeroID: 1,
    ModelID: 'zombie_1',
    Name: '女喪屍',
    Type: '敏捷',
    Rarity: 2,
    HP: 100,
    ATK: 25,
    Speed: 8,
    Description: '感染初期的年輕女性，衣著破爛，蒼白肌膚下隱約可見撕裂的傷口。尚保留人類的靈活動作，但攻擊力偏低。',
    Passive: '殘存意志',
    PassiveDesc: '初次受到致命傷害時，以 1 HP 存活一次',
  },
  {
    HeroID: 2,
    ModelID: 'zombie_2',
    Name: '異變者',
    Type: '力量',
    Rarity: 3,
    HP: 125,
    ATK: 50,
    Speed: 10,
    Description: '病毒深度異變的產物，全身肌肉暴漲扭曲，皮膚呈暗紅肉色。肢體粗壯厚重，典型的近戰暴力輸出。',
    Passive: '狂暴基因',
    PassiveDesc: 'HP 低於 30% 時，ATK +20%',
  },
  {
    HeroID: 3,
    ModelID: 'zombie_3',
    Name: '詭獸',
    Type: '坦克',
    Rarity: 4,
    HP: 175,
    ATK: 30,
    Speed: 7,
    Description: '被感染的巨型熊形怪獸，皮毛粗糙帶有鱗甲般的硬皮，體型是其他角色的兩三倍。移動笨重但極難擊殺。',
    Passive: '厚皮',
    PassiveDesc: '受到的所有傷害降低 15%',
  },
  {
    HeroID: 4,
    ModelID: 'zombie_4',
    Name: '屠宰者',
    Type: '刺客',
    Rarity: 4,
    HP: 100,
    ATK: 60,
    Speed: 11,
    Description: '只剩骨架的古老亡靈，全身散發白色螢光，身披半透明破爛斗篷。攻擊力與速度最高的玻璃砲。',
    Passive: '亡者之速',
    PassiveDesc: '每次攻擊命中後，下一擊 Speed +2（最多疊 3 層）',
  },
  {
    HeroID: 5,
    ModelID: 'zombie_5',
    Name: '口器者',
    Type: '特殊',
    Rarity: 3,
    HP: 110,
    ATK: 40,
    Speed: 10,
    Description: '寄生型感染體，體表佈滿半透明肉質觸手與菌絲，口部裂開形成捕食器官。兼具輸出與續戰能力。',
    Passive: '寄生吸取',
    PassiveDesc: '攻擊命中時回復自身 10% 傷害值的 HP',
  },
  {
    HeroID: 6,
    ModelID: 'zombie_6',
    Name: '無名活屍',
    Type: '均衡',
    Rarity: 1,
    HP: 100,
    ATK: 30,
    Speed: 8,
    Description: '最接近普通人類的喪屍，高細節寫實皮膚，身材纖瘦矮小。各項數值平庸無突出，人人都有的基礎角色。',
    Passive: '茫然',
    PassiveDesc: '戰鬥開始時隨機獲得一項小幅 buff（ATK / HP / Speed +10%）',
  },
  {
    HeroID: 7,
    ModelID: 'zombie_7',
    Name: '腐學者',
    Type: '輔助',
    Rarity: 3,
    HP: 105,
    ATK: 35,
    Speed: 9,
    Description: '戴著破碎眼鏡的知識分子喪屍，頭髮凌亂殘留，四層分離部件（眼球/身體/眼鏡/頭髮）暗示生前是位學者。',
    Passive: '殘留智識',
    PassiveDesc: '每 3 回合自動為全隊回復 10 HP',
  },
  {
    HeroID: 8,
    ModelID: 'zombie_8',
    Name: '夜鬼',
    Type: '力量',
    Rarity: 3,
    HP: 130,
    ATK: 45,
    Speed: 9,
    Description: '黑道風格的暴徒喪屍，穿著半開的襯衫（"yifu" 材質），身形高大魁梧。生前的暴力本能在死後更加失控。',
    Passive: '威壓',
    PassiveDesc: '戰鬥開始時降低全體敵人 ATK 10%，持續 2 回合',
  },
  {
    HeroID: 9,
    ModelID: 'zombie_9',
    Name: '倖存者',
    Type: '均衡',
    Rarity: 2,
    HP: 115,
    ATK: 35,
    Speed: 9,
    Description: '末日倖存者，在掙扎求生中被感染。身穿破舊戰鬥裝，半透明腐爛組織從裝備縫隙蔓延。全能但無特長。',
    Passive: '求生本能',
    PassiveDesc: 'HP 低於 50% 時，Speed +3',
  },
  {
    HeroID: 10,
    ModelID: 'zombie_10',
    Name: '童魘',
    Type: '敏捷',
    Rarity: 4,
    HP: 95,
    ATK: 45,
    Speed: 12,
    Description: '被感染的女童軍，擁有獨立轉動的眼球，令人不寒而慄。嬌小的身軀蘊含驚人的爆發速度。',
    Passive: '凝視',
    PassiveDesc: '攻擊時有 25% 機率使目標下一回合 Speed -3',
  },
  {
    HeroID: 11,
    ModelID: 'zombie_11',
    Name: '白面鬼',
    Type: '特殊',
    Rarity: 3,
    HP: 100,
    ATK: 40,
    Speed: 10,
    Description: '白色妝面的小丑喪屍，皮膚異常光滑。單一材質的簡潔體表下隱藏著扭曲的笑容與不可預測的行為。',
    Passive: '瘋狂表演',
    PassiveDesc: '每次攻擊傷害隨機在 ×0.5 ~ ×1.8 之間浮動',
  },
  {
    HeroID: 12,
    ModelID: 'zombie_12',
    Name: '戰厄',
    Type: '坦克',
    Rarity: 4,
    HP: 160,
    ATK: 35,
    Speed: 7,
    Description: '身穿破損軍裝的世界大戰亡兵，高面數模型刻畫出斑駁彈痕與鏽蝕裝甲。紀律未死，防線不倒。',
    Passive: '壕溝戰術',
    PassiveDesc: '受到攻擊後，下一次受到的傷害降低 25%',
  },
  {
    HeroID: 13,
    ModelID: 'zombie_13',
    Name: '南瓜魔',
    Type: '力量',
    Rarity: 4,
    HP: 150,
    ATK: 55,
    Speed: 6,
    Description: '頭戴巨型南瓜的異變巨人，體寬近 300，粗糙的外皮堅硬如石。緩慢但每一擊都有毀滅性的重量。',
    Passive: '巨力踐踏',
    PassiveDesc: '攻擊時有 30% 機率對目標造成額外 50% 傷害',
  },
  {
    HeroID: 14,
    ModelID: 'zombie_14',
    Name: '脫逃者',
    Type: '敏捷',
    Rarity: 2,
    HP: 90,
    ATK: 30,
    Speed: 13,
    Description: '穿著囚服的感染者，骨骼結構簡化（僅 47 根），身材不對稱地向一側傾斜。極快的速度彌補了脆弱的身體。',
    Passive: '閃避直覺',
    PassiveDesc: '有 20% 機率完全閃避一次攻擊',
  },
];

// ── 產生 TSV（Tab Separated Values）──
const headers = [
  'HeroID', 'ModelID', 'Name', 'Type', 'Rarity',
  'HP', 'ATK', 'Speed',
  'Description', 'Passive', 'PassiveDesc',
];

const lines = [headers.join('\t')];
for (const h of heroes) {
  lines.push(headers.map(k => h[k]).join('\t'));
}

const tsv = lines.join('\n');
writeFileSync(OUTPUT, tsv, 'utf-8');

console.log(`✓ heroes.tsv generated at: ${OUTPUT}`);
console.log(`  Total heroes: ${heroes.length}`);
console.log('\n── 以下內容可直接複製貼到 Google Sheets ──\n');
console.log(tsv);
