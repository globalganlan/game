-- seed_stage_configs.sql
-- 24 個主線關卡配置（3 章 × 8 關）
-- 使用 wrangler d1 execute globalganlan-db --remote --file=scripts/seed_stage_configs.sql

DELETE FROM stage_configs;

-- ══════════════ 第一章：廢墟之城 ══════════════
-- v2 平衡調整：1-2 從 3 敵→2 敵（解決新手死鎖）+ 全面加入 defMultiplier

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-1', 1, 1,
 '[{"heroId":6,"slot":0,"levelMultiplier":1,"hpMultiplier":0.50,"atkMultiplier":0.40,"defMultiplier":0.40,"speedMultiplier":1.0},{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":0.50,"atkMultiplier":0.40,"defMultiplier":0.40,"speedMultiplier":1.0}]',
 '{"exp":45,"gold":80,"diamond":0}',
 '{"chapterName":"廢墟之城","stageName":"城市入口","description":"城市邊緣的入口已被低階喪屍佔據，小心前進。","bgTheme":"city","difficulty":1,"recommendedLevel":1,"isBoss":false,"chapterIcon":"🏙️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-2', 1, 2,
 '[{"heroId":7,"slot":0,"levelMultiplier":1,"hpMultiplier":0.62,"atkMultiplier":0.48,"defMultiplier":0.48,"speedMultiplier":1.02},{"heroId":14,"slot":1,"levelMultiplier":1,"hpMultiplier":0.62,"atkMultiplier":0.48,"defMultiplier":0.48,"speedMultiplier":1.02}]',
 '{"exp":60,"gold":110,"diamond":0,"items":[{"itemId":"exp_core_s","quantity":1,"dropRate":1.0}]}',
 '{"chapterName":"廢墟之城","stageName":"廢棄商場","description":"倒塌的商場裡遊蕩著腐爛的購物者，貨架成了掩體。","bgTheme":"city","difficulty":1,"recommendedLevel":2,"isBoss":false,"chapterIcon":"🏙️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-3', 1, 3,
 '[{"heroId":5,"slot":0,"levelMultiplier":1,"hpMultiplier":0.74,"atkMultiplier":0.56,"defMultiplier":0.56,"speedMultiplier":1.03},{"heroId":11,"slot":1,"levelMultiplier":1,"hpMultiplier":0.74,"atkMultiplier":0.56,"defMultiplier":0.56,"speedMultiplier":1.03},{"heroId":9,"slot":2,"levelMultiplier":1,"hpMultiplier":0.74,"atkMultiplier":0.56,"defMultiplier":0.56,"speedMultiplier":1.03}]',
 '{"exp":75,"gold":140,"diamond":0,"items":[{"itemId":"exp_core_s","quantity":1,"dropRate":0.6}]}',
 '{"chapterName":"廢墟之城","stageName":"地下車庫","description":"漆黑的地下停車場，引擎聲會引來更多喪屍。","bgTheme":"city","difficulty":2,"recommendedLevel":5,"isBoss":false,"chapterIcon":"🏙️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-4', 1, 4,
 '[{"heroId":7,"slot":0,"levelMultiplier":1,"hpMultiplier":0.86,"atkMultiplier":0.64,"defMultiplier":0.64,"speedMultiplier":1.05},{"heroId":6,"slot":1,"levelMultiplier":1,"hpMultiplier":0.86,"atkMultiplier":0.64,"defMultiplier":0.64,"speedMultiplier":1.05},{"heroId":14,"slot":2,"levelMultiplier":1,"hpMultiplier":0.86,"atkMultiplier":0.64,"defMultiplier":0.64,"speedMultiplier":1.05},{"heroId":1,"slot":3,"levelMultiplier":1,"hpMultiplier":0.86,"atkMultiplier":0.64,"defMultiplier":0.64,"speedMultiplier":1.05}]',
 '{"exp":90,"gold":170,"diamond":0}',
 '{"chapterName":"廢墟之城","stageName":"斷橋殘垣","description":"斷裂的天橋上滿是殘骸，退路已被切斷。","bgTheme":"city","difficulty":2,"recommendedLevel":8,"isBoss":false,"chapterIcon":"🏙️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-5', 1, 5,
 '[{"heroId":9,"slot":0,"levelMultiplier":1,"hpMultiplier":0.98,"atkMultiplier":0.72,"defMultiplier":0.72,"speedMultiplier":1.06},{"heroId":11,"slot":1,"levelMultiplier":1,"hpMultiplier":0.98,"atkMultiplier":0.72,"defMultiplier":0.72,"speedMultiplier":1.06},{"heroId":5,"slot":2,"levelMultiplier":1,"hpMultiplier":0.98,"atkMultiplier":0.72,"defMultiplier":0.72,"speedMultiplier":1.06},{"heroId":7,"slot":3,"levelMultiplier":1,"hpMultiplier":0.98,"atkMultiplier":0.72,"defMultiplier":0.72,"speedMultiplier":1.06}]',
 '{"exp":105,"gold":200,"diamond":0}',
 '{"chapterName":"廢墟之城","stageName":"醫院廢墟","description":"急診室的燈還在閃爍，手術台上的「患者」似乎還在動。","bgTheme":"city","difficulty":2,"recommendedLevel":10,"isBoss":false,"chapterIcon":"🏙️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-6', 1, 6,
 '[{"heroId":14,"slot":0,"levelMultiplier":1,"hpMultiplier":1.10,"atkMultiplier":0.80,"defMultiplier":0.80,"speedMultiplier":1.08},{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":1.10,"atkMultiplier":0.80,"defMultiplier":0.80,"speedMultiplier":1.08},{"heroId":6,"slot":2,"levelMultiplier":1,"hpMultiplier":1.10,"atkMultiplier":0.80,"defMultiplier":0.80,"speedMultiplier":1.08},{"heroId":9,"slot":3,"levelMultiplier":1,"hpMultiplier":1.10,"atkMultiplier":0.80,"defMultiplier":0.80,"speedMultiplier":1.08},{"heroId":11,"slot":4,"levelMultiplier":1,"hpMultiplier":1.10,"atkMultiplier":0.80,"defMultiplier":0.80,"speedMultiplier":1.08}]',
 '{"exp":120,"gold":230,"diamond":0,"items":[{"itemId":"exp_core_s","quantity":1,"dropRate":0.6}]}',
 '{"chapterName":"廢墟之城","stageName":"警察局","description":"武器庫已被洗劫一空，但裡面的喪屍依然凶猛。","bgTheme":"city","difficulty":3,"recommendedLevel":13,"isBoss":false,"chapterIcon":"🏙️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-7', 1, 7,
 '[{"heroId":5,"slot":0,"levelMultiplier":1,"hpMultiplier":1.22,"atkMultiplier":0.88,"defMultiplier":0.88,"speedMultiplier":1.09},{"heroId":7,"slot":1,"levelMultiplier":1,"hpMultiplier":1.22,"atkMultiplier":0.88,"defMultiplier":0.88,"speedMultiplier":1.09},{"heroId":11,"slot":2,"levelMultiplier":1,"hpMultiplier":1.22,"atkMultiplier":0.88,"defMultiplier":0.88,"speedMultiplier":1.09},{"heroId":14,"slot":3,"levelMultiplier":1,"hpMultiplier":1.22,"atkMultiplier":0.88,"defMultiplier":0.88,"speedMultiplier":1.09},{"heroId":9,"slot":4,"levelMultiplier":1,"hpMultiplier":1.22,"atkMultiplier":0.88,"defMultiplier":0.88,"speedMultiplier":1.09}]',
 '{"exp":135,"gold":260,"diamond":0}',
 '{"chapterName":"廢墟之城","stageName":"市政廳","description":"曾經的權力中心，如今是屍群的巢穴。","bgTheme":"city","difficulty":3,"recommendedLevel":15,"isBoss":false,"chapterIcon":"🏙️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('1-8', 1, 8,
 '[{"heroId":5,"slot":0,"levelMultiplier":1,"hpMultiplier":1.50,"atkMultiplier":1.10,"defMultiplier":1.00,"speedMultiplier":1.12},{"heroId":9,"slot":1,"levelMultiplier":1,"hpMultiplier":1.50,"atkMultiplier":1.10,"defMultiplier":1.00,"speedMultiplier":1.12},{"heroId":7,"slot":2,"levelMultiplier":1,"hpMultiplier":1.50,"atkMultiplier":1.10,"defMultiplier":1.00,"speedMultiplier":1.12},{"heroId":11,"slot":3,"levelMultiplier":1,"hpMultiplier":1.50,"atkMultiplier":1.10,"defMultiplier":1.00,"speedMultiplier":1.12},{"heroId":14,"slot":4,"levelMultiplier":1,"hpMultiplier":1.50,"atkMultiplier":1.10,"defMultiplier":1.00,"speedMultiplier":1.12},{"heroId":6,"slot":5,"levelMultiplier":1,"hpMultiplier":2.00,"atkMultiplier":1.50,"defMultiplier":1.00,"speedMultiplier":1.15}]',
 '{"exp":150,"gold":290,"diamond":20}',
 '{"chapterName":"廢墟之城","stageName":"鐘樓之巔","description":"城市最高點的鐘聲再次響起，吸引了所有喪屍聯集。首領在此等候。","bgTheme":"city","difficulty":4,"recommendedLevel":18,"isBoss":true,"chapterIcon":"🏙️"}');

-- ══════════════ 第二章：暗夜森林 ══════════════

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-1', 2, 1,
 '[{"heroId":10,"slot":0,"levelMultiplier":1,"hpMultiplier":1.40,"atkMultiplier":1.10,"speedMultiplier":1.14},{"heroId":8,"slot":1,"levelMultiplier":1,"hpMultiplier":1.40,"atkMultiplier":1.10,"speedMultiplier":1.14},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.40,"atkMultiplier":1.10,"speedMultiplier":1.14}]',
 '{"exp":165,"gold":320,"diamond":0}',
 '{"chapterName":"暗夜森林","stageName":"森林邊緣","description":"踏入暗夜森林的邊界，樹影間有異形的身影在移動。","bgTheme":"forest","difficulty":2,"recommendedLevel":20,"isBoss":false,"chapterIcon":"🌲"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-2', 2, 2,
 '[{"heroId":2,"slot":0,"levelMultiplier":1,"hpMultiplier":1.60,"atkMultiplier":1.20,"speedMultiplier":1.17},{"heroId":8,"slot":1,"levelMultiplier":1,"hpMultiplier":1.60,"atkMultiplier":1.20,"speedMultiplier":1.17},{"heroId":13,"slot":2,"levelMultiplier":1,"hpMultiplier":1.60,"atkMultiplier":1.20,"speedMultiplier":1.17},{"heroId":6,"slot":3,"levelMultiplier":1,"hpMultiplier":1.60,"atkMultiplier":1.20,"speedMultiplier":1.17}]',
 '{"exp":180,"gold":350,"diamond":0}',
 '{"chapterName":"暗夜森林","stageName":"毒沼濕地","description":"有毒的沼澤冒出綠色氣泡，突變喪屍在泥漿中潛伏。","bgTheme":"forest","difficulty":3,"recommendedLevel":22,"isBoss":false,"chapterIcon":"🌲"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-3', 2, 3,
 '[{"heroId":4,"slot":0,"levelMultiplier":1,"hpMultiplier":1.80,"atkMultiplier":1.40,"speedMultiplier":1.19},{"heroId":13,"slot":1,"levelMultiplier":1,"hpMultiplier":1.80,"atkMultiplier":1.40,"speedMultiplier":1.19},{"heroId":10,"slot":2,"levelMultiplier":1,"hpMultiplier":1.80,"atkMultiplier":1.40,"speedMultiplier":1.19},{"heroId":2,"slot":3,"levelMultiplier":1,"hpMultiplier":1.80,"atkMultiplier":1.40,"speedMultiplier":1.19}]',
 '{"exp":195,"gold":380,"diamond":0,"items":[{"itemId":"exp_core_s","quantity":1,"dropRate":0.6}]}',
 '{"chapterName":"暗夜森林","stageName":"蟲巢洞穴","description":"地底洞穴裡回響著不明生物的嘶吼，牆壁上爬滿了蟲卵。","bgTheme":"forest","difficulty":3,"recommendedLevel":25,"isBoss":false,"chapterIcon":"🌲"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-4', 2, 4,
 '[{"heroId":12,"slot":0,"levelMultiplier":1,"hpMultiplier":2.00,"atkMultiplier":1.50,"speedMultiplier":1.21},{"heroId":3,"slot":1,"levelMultiplier":1,"hpMultiplier":2.00,"atkMultiplier":1.50,"speedMultiplier":1.21},{"heroId":8,"slot":2,"levelMultiplier":1,"hpMultiplier":2.00,"atkMultiplier":1.50,"speedMultiplier":1.21},{"heroId":10,"slot":3,"levelMultiplier":1,"hpMultiplier":2.00,"atkMultiplier":1.50,"speedMultiplier":1.21},{"heroId":4,"slot":4,"levelMultiplier":1,"hpMultiplier":2.00,"atkMultiplier":1.50,"speedMultiplier":1.21}]',
 '{"exp":210,"gold":410,"diamond":0}',
 '{"chapterName":"暗夜森林","stageName":"古老神木","description":"千年神木散發著幽光，受感染的根系正在蔓延。","bgTheme":"forest","difficulty":3,"recommendedLevel":28,"isBoss":false,"chapterIcon":"🌲"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-5', 2, 5,
 '[{"heroId":11,"slot":0,"levelMultiplier":1,"hpMultiplier":2.20,"atkMultiplier":1.60,"speedMultiplier":1.24},{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":2.20,"atkMultiplier":1.60,"speedMultiplier":1.24},{"heroId":13,"slot":2,"levelMultiplier":1,"hpMultiplier":2.20,"atkMultiplier":1.60,"speedMultiplier":1.24},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":2.20,"atkMultiplier":1.60,"speedMultiplier":1.24},{"heroId":8,"slot":4,"levelMultiplier":1,"hpMultiplier":2.20,"atkMultiplier":1.60,"speedMultiplier":1.24}]',
 '{"exp":225,"gold":440,"diamond":0}',
 '{"chapterName":"暗夜森林","stageName":"迷霧深處","description":"濃霧遮蔽視線，低沉的嚎叫從四面八方傳來。","bgTheme":"forest","difficulty":4,"recommendedLevel":30,"isBoss":false,"chapterIcon":"🌲"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-6', 2, 6,
 '[{"heroId":10,"slot":0,"levelMultiplier":1,"hpMultiplier":2.40,"atkMultiplier":1.80,"speedMultiplier":1.26},{"heroId":12,"slot":1,"levelMultiplier":1,"hpMultiplier":2.40,"atkMultiplier":1.80,"speedMultiplier":1.26},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":2.40,"atkMultiplier":1.80,"speedMultiplier":1.26},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":2.40,"atkMultiplier":1.80,"speedMultiplier":1.26},{"heroId":13,"slot":4,"levelMultiplier":1,"hpMultiplier":2.40,"atkMultiplier":1.80,"speedMultiplier":1.26}]',
 '{"exp":240,"gold":470,"diamond":0,"items":[{"itemId":"exp_core_m","quantity":1,"dropRate":0.5}]}',
 '{"chapterName":"暗夜森林","stageName":"狼嚎峽谷","description":"峽谷間的狼嚎與屍嘯交織，敵人速度極快。","bgTheme":"forest","difficulty":4,"recommendedLevel":33,"isBoss":false,"chapterIcon":"🌲"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-7', 2, 7,
 '[{"heroId":2,"slot":0,"levelMultiplier":1,"hpMultiplier":2.60,"atkMultiplier":1.90,"speedMultiplier":1.28},{"heroId":8,"slot":1,"levelMultiplier":1,"hpMultiplier":2.60,"atkMultiplier":1.90,"speedMultiplier":1.28},{"heroId":12,"slot":2,"levelMultiplier":1,"hpMultiplier":2.60,"atkMultiplier":1.90,"speedMultiplier":1.28},{"heroId":10,"slot":3,"levelMultiplier":1,"hpMultiplier":2.60,"atkMultiplier":1.90,"speedMultiplier":1.28},{"heroId":3,"slot":4,"levelMultiplier":1,"hpMultiplier":2.60,"atkMultiplier":1.90,"speedMultiplier":1.28},{"heroId":4,"slot":5,"levelMultiplier":1,"hpMultiplier":2.60,"atkMultiplier":1.90,"speedMultiplier":1.28}]',
 '{"exp":255,"gold":500,"diamond":0}',
 '{"chapterName":"暗夜森林","stageName":"廢棄營地","description":"倖存者的營地早已淪陷，散落的補給品旁是大量喪屍。","bgTheme":"forest","difficulty":4,"recommendedLevel":35,"isBoss":false,"chapterIcon":"🌲"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('2-8', 2, 8,
 '[{"heroId":4,"slot":0,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.32},{"heroId":12,"slot":1,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.32},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.32},{"heroId":10,"slot":3,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.32},{"heroId":8,"slot":4,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.32},{"heroId":3,"slot":5,"levelMultiplier":1,"hpMultiplier":4.00,"atkMultiplier":3.00,"speedMultiplier":1.40}]',
 '{"exp":270,"gold":530,"diamond":20}',
 '{"chapterName":"暗夜森林","stageName":"暗影領域","description":"森林深處的黑暗源頭，暗影領主統治著這片被詛咒的土地。","bgTheme":"forest","difficulty":5,"recommendedLevel":38,"isBoss":true,"chapterIcon":"🌲"}');

-- ══════════════ 第三章：死寂荒原 ══════════════

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-1', 3, 1,
 '[{"heroId":13,"slot":0,"levelMultiplier":1,"hpMultiplier":2.80,"atkMultiplier":2.00,"speedMultiplier":1.34},{"heroId":4,"slot":1,"levelMultiplier":1,"hpMultiplier":2.80,"atkMultiplier":2.00,"speedMultiplier":1.34},{"heroId":12,"slot":2,"levelMultiplier":1,"hpMultiplier":2.80,"atkMultiplier":2.00,"speedMultiplier":1.34},{"heroId":2,"slot":3,"levelMultiplier":1,"hpMultiplier":2.80,"atkMultiplier":2.00,"speedMultiplier":1.34}]',
 '{"exp":285,"gold":560,"diamond":0}',
 '{"chapterName":"死寂荒原","stageName":"荒漠公路","description":"龜裂的柏油路延伸至地平線，路邊的車輛殘骸中傳來聲響。","bgTheme":"wasteland","difficulty":3,"recommendedLevel":40,"isBoss":false,"chapterIcon":"🏜️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-2', 3, 2,
 '[{"heroId":3,"slot":0,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.36},{"heroId":12,"slot":1,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.36},{"heroId":4,"slot":2,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.36},{"heroId":13,"slot":3,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.36},{"heroId":2,"slot":4,"levelMultiplier":1,"hpMultiplier":3.00,"atkMultiplier":2.20,"speedMultiplier":1.36}]',
 '{"exp":300,"gold":590,"diamond":0}',
 '{"chapterName":"死寂荒原","stageName":"廢棄礦坑","description":"礦坑深處的黑暗中閃著詭異的光芒，被礦石污染的喪屍更加頑強。","bgTheme":"wasteland","difficulty":4,"recommendedLevel":43,"isBoss":false,"chapterIcon":"🏜️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-3', 3, 3,
 '[{"heroId":8,"slot":0,"levelMultiplier":1,"hpMultiplier":3.30,"atkMultiplier":2.40,"speedMultiplier":1.38},{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":3.30,"atkMultiplier":2.40,"speedMultiplier":1.38},{"heroId":10,"slot":2,"levelMultiplier":1,"hpMultiplier":3.30,"atkMultiplier":2.40,"speedMultiplier":1.38},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":3.30,"atkMultiplier":2.40,"speedMultiplier":1.38},{"heroId":12,"slot":4,"levelMultiplier":1,"hpMultiplier":3.30,"atkMultiplier":2.40,"speedMultiplier":1.38}]',
 '{"exp":315,"gold":620,"diamond":0,"items":[{"itemId":"exp_core_m","quantity":1,"dropRate":0.5}]}',
 '{"chapterName":"死寂荒原","stageName":"輻射區域","description":"蓋革計數器瘋狂作響，輻射催生了更恐怖的變異體。","bgTheme":"wasteland","difficulty":4,"recommendedLevel":45,"isBoss":false,"chapterIcon":"🏜️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-4', 3, 4,
 '[{"heroId":11,"slot":0,"levelMultiplier":1,"hpMultiplier":3.50,"atkMultiplier":2.60,"speedMultiplier":1.40},{"heroId":3,"slot":1,"levelMultiplier":1,"hpMultiplier":3.50,"atkMultiplier":2.60,"speedMultiplier":1.40},{"heroId":10,"slot":2,"levelMultiplier":1,"hpMultiplier":3.50,"atkMultiplier":2.60,"speedMultiplier":1.40},{"heroId":8,"slot":3,"levelMultiplier":1,"hpMultiplier":3.50,"atkMultiplier":2.60,"speedMultiplier":1.40},{"heroId":13,"slot":4,"levelMultiplier":1,"hpMultiplier":3.50,"atkMultiplier":2.60,"speedMultiplier":1.40}]',
 '{"exp":330,"gold":650,"diamond":0}',
 '{"chapterName":"死寂荒原","stageName":"骨塚墓地","description":"堆疊如山的白骨突然開始重組，亡者再次站了起來。","bgTheme":"wasteland","difficulty":4,"recommendedLevel":48,"isBoss":false,"chapterIcon":"🏜️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-5', 3, 5,
 '[{"heroId":12,"slot":0,"levelMultiplier":1,"hpMultiplier":3.80,"atkMultiplier":2.80,"speedMultiplier":1.42},{"heroId":4,"slot":1,"levelMultiplier":1,"hpMultiplier":3.80,"atkMultiplier":2.80,"speedMultiplier":1.42},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":3.80,"atkMultiplier":2.80,"speedMultiplier":1.42},{"heroId":2,"slot":3,"levelMultiplier":1,"hpMultiplier":3.80,"atkMultiplier":2.80,"speedMultiplier":1.42},{"heroId":10,"slot":4,"levelMultiplier":1,"hpMultiplier":3.80,"atkMultiplier":2.80,"speedMultiplier":1.42},{"heroId":13,"slot":5,"levelMultiplier":1,"hpMultiplier":3.80,"atkMultiplier":2.80,"speedMultiplier":1.42}]',
 '{"exp":345,"gold":680,"diamond":0}',
 '{"chapterName":"死寂荒原","stageName":"軍事基地","description":"戒嚴的軍事基地已被攻陷，穿著防護服的喪屍手持武器。","bgTheme":"wasteland","difficulty":5,"recommendedLevel":50,"isBoss":false,"chapterIcon":"🏜️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-6', 3, 6,
 '[{"heroId":2,"slot":0,"levelMultiplier":1,"hpMultiplier":4.00,"atkMultiplier":3.00,"speedMultiplier":1.44},{"heroId":8,"slot":1,"levelMultiplier":1,"hpMultiplier":4.00,"atkMultiplier":3.00,"speedMultiplier":1.44},{"heroId":12,"slot":2,"levelMultiplier":1,"hpMultiplier":4.00,"atkMultiplier":3.00,"speedMultiplier":1.44},{"heroId":3,"slot":3,"levelMultiplier":1,"hpMultiplier":4.00,"atkMultiplier":3.00,"speedMultiplier":1.44},{"heroId":4,"slot":4,"levelMultiplier":1,"hpMultiplier":4.00,"atkMultiplier":3.00,"speedMultiplier":1.44},{"heroId":10,"slot":5,"levelMultiplier":1,"hpMultiplier":4.00,"atkMultiplier":3.00,"speedMultiplier":1.44}]',
 '{"exp":360,"gold":710,"diamond":0,"items":[{"itemId":"exp_core_l","quantity":1,"dropRate":0.3}]}',
 '{"chapterName":"死寂荒原","stageName":"生化實驗室","description":"瓶瓶罐罐中冒出綠色液體，失敗的實驗品掙脫了束縛。","bgTheme":"wasteland","difficulty":5,"recommendedLevel":53,"isBoss":false,"chapterIcon":"🏜️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-7', 3, 7,
 '[{"heroId":4,"slot":0,"levelMultiplier":1,"hpMultiplier":4.30,"atkMultiplier":3.20,"speedMultiplier":1.46},{"heroId":12,"slot":1,"levelMultiplier":1,"hpMultiplier":4.30,"atkMultiplier":3.20,"speedMultiplier":1.46},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":4.30,"atkMultiplier":3.20,"speedMultiplier":1.46},{"heroId":8,"slot":3,"levelMultiplier":1,"hpMultiplier":4.30,"atkMultiplier":3.20,"speedMultiplier":1.46},{"heroId":3,"slot":4,"levelMultiplier":1,"hpMultiplier":4.30,"atkMultiplier":3.20,"speedMultiplier":1.46},{"heroId":10,"slot":5,"levelMultiplier":1,"hpMultiplier":4.30,"atkMultiplier":3.20,"speedMultiplier":1.46}]',
 '{"exp":375,"gold":740,"diamond":0}',
 '{"chapterName":"死寂荒原","stageName":"核電廠遺址","description":"熔毀的反應爐散發致命輻射，周圍的喪屍吸收了核能而變異。","bgTheme":"wasteland","difficulty":5,"recommendedLevel":55,"isBoss":false,"chapterIcon":"🏜️"}');

INSERT INTO stage_configs (stageId, chapter, stage, enemies, rewards, extra) VALUES
('3-8', 3, 8,
 '[{"heroId":4,"slot":0,"levelMultiplier":1,"hpMultiplier":5.00,"atkMultiplier":3.50,"speedMultiplier":1.50},{"heroId":12,"slot":1,"levelMultiplier":1,"hpMultiplier":5.00,"atkMultiplier":3.50,"speedMultiplier":1.50},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":5.00,"atkMultiplier":3.50,"speedMultiplier":1.50},{"heroId":8,"slot":3,"levelMultiplier":1,"hpMultiplier":5.00,"atkMultiplier":3.50,"speedMultiplier":1.50},{"heroId":3,"slot":4,"levelMultiplier":1,"hpMultiplier":5.00,"atkMultiplier":3.50,"speedMultiplier":1.50},{"heroId":10,"slot":5,"levelMultiplier":1,"hpMultiplier":7.00,"atkMultiplier":5.00,"speedMultiplier":1.60}]',
 '{"exp":390,"gold":770,"diamond":50}',
 '{"chapterName":"死寂荒原","stageName":"末日祭壇","description":"一切災難的起源，末日審判者在祭壇上等待最後的挑戰者。擊敗它，結束這場浩劫。","bgTheme":"wasteland","difficulty":5,"recommendedLevel":60,"isBoss":true,"chapterIcon":"🏜️"}');
