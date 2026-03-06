-- rebalance_ch1_ch2.sql
-- 修正：slotToInput bug 修復後，multipliers 終於會被正確套用
-- 第 1 章：重新設計為新手友好漸進曲線
-- 第 2 章：原始 multipliers ×1.5 補償 bug 修復後的難度下降

-- ═══════════════════════════════════════════════════════════
-- 第 1 章 🏙️ 廢墟之城（手動設計平衡數值）
-- ═══════════════════════════════════════════════════════════

-- 1-1: 教學關，1隻弱敵，穩贏
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":0.8,"atkMultiplier":0.5,"defMultiplier":0.3,"speedMultiplier":0.8}]' WHERE stageId = '1-1';

-- 1-2: 簡單，2隻弱敵，Lv.1 可通關
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":0.7,"atkMultiplier":0.5,"defMultiplier":0.3,"speedMultiplier":0.8},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":0.7,"atkMultiplier":0.5,"defMultiplier":0.3,"speedMultiplier":0.8}]' WHERE stageId = '1-2';

-- 1-3: 中等，2隻較強敵，建議 Lv.2-3
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":0.9,"atkMultiplier":0.65,"defMultiplier":0.5,"speedMultiplier":0.9},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":0.9,"atkMultiplier":0.65,"defMultiplier":0.5,"speedMultiplier":0.9}]' WHERE stageId = '1-3';

-- 1-4: 稍難，2隻中強敵，建議 Lv.3-4
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":1.1,"atkMultiplier":0.8,"defMultiplier":0.6,"speedMultiplier":0.9},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":1.1,"atkMultiplier":0.8,"defMultiplier":0.6,"speedMultiplier":0.9}]' WHERE stageId = '1-4';

-- 1-5: 3隻敵人登場，建議 Lv.5-6
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":1.0,"atkMultiplier":0.7,"defMultiplier":0.5,"speedMultiplier":1.0},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":1.0,"atkMultiplier":0.7,"defMultiplier":0.5,"speedMultiplier":1.0},{"heroId":3,"slot":3,"levelMultiplier":1,"hpMultiplier":1.0,"atkMultiplier":0.7,"defMultiplier":0.5,"speedMultiplier":1.0}]' WHERE stageId = '1-5';

-- 1-6: 3隻強敵，建議 Lv.7
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":1.2,"atkMultiplier":0.85,"defMultiplier":0.6,"speedMultiplier":1.0},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":1.2,"atkMultiplier":0.85,"defMultiplier":0.6,"speedMultiplier":1.0},{"heroId":3,"slot":3,"levelMultiplier":1,"hpMultiplier":1.2,"atkMultiplier":0.85,"defMultiplier":0.6,"speedMultiplier":1.0}]' WHERE stageId = '1-6';

-- 1-7: 3隻精英敵，建議 Lv.8
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":1.4,"atkMultiplier":0.95,"defMultiplier":0.7,"speedMultiplier":1.0},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":1.4,"atkMultiplier":0.95,"defMultiplier":0.7,"speedMultiplier":1.0},{"heroId":3,"slot":3,"levelMultiplier":1,"hpMultiplier":1.4,"atkMultiplier":0.95,"defMultiplier":0.7,"speedMultiplier":1.0}]' WHERE stageId = '1-7';

-- 1-8: Boss 關，3隻+Boss，建議 Lv.10
UPDATE stage_configs SET enemies = '[{"heroId":1,"slot":1,"levelMultiplier":1,"hpMultiplier":1.5,"atkMultiplier":1.0,"defMultiplier":0.8,"speedMultiplier":1.0},{"heroId":2,"slot":2,"levelMultiplier":1,"hpMultiplier":1.5,"atkMultiplier":1.0,"defMultiplier":0.8,"speedMultiplier":1.0},{"heroId":3,"slot":3,"levelMultiplier":1,"hpMultiplier":2.5,"atkMultiplier":1.5,"defMultiplier":1.0,"speedMultiplier":0.9}]' WHERE stageId = '1-8';

-- ═══════════════════════════════════════════════════════════
-- 第 2 章 🌲 暗夜森林（原始 ×1.5 補償）
-- ═══════════════════════════════════════════════════════════

-- 2-1: hp 0.7→1.05, atk 0.5→0.75, def 0.5→0.75
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.05,"atkMultiplier":0.75,"defMultiplier":0.75,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.05,"atkMultiplier":0.75,"defMultiplier":0.75,"speedMultiplier":1.07}]' WHERE stageId = '2-1';

-- 2-2: hp 0.77→1.16, atk 0.54→0.81, def 0.54→0.81
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.16,"atkMultiplier":0.81,"defMultiplier":0.81,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.16,"atkMultiplier":0.81,"defMultiplier":0.81,"speedMultiplier":1.07},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":1.16,"atkMultiplier":0.81,"defMultiplier":0.81,"speedMultiplier":1.07}]' WHERE stageId = '2-2';

-- 2-3: hp 0.84→1.26, atk 0.59→0.89, def 0.59→0.89
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.26,"atkMultiplier":0.89,"defMultiplier":0.89,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.26,"atkMultiplier":0.89,"defMultiplier":0.89,"speedMultiplier":1.07},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":1.26,"atkMultiplier":0.89,"defMultiplier":0.89,"speedMultiplier":1.07}]' WHERE stageId = '2-3';

-- 2-4: hp 0.91→1.37, atk 0.63→0.95, def 0.63→0.95
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.37,"atkMultiplier":0.95,"defMultiplier":0.95,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.37,"atkMultiplier":0.95,"defMultiplier":0.95,"speedMultiplier":1.07},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":1.37,"atkMultiplier":0.95,"defMultiplier":0.95,"speedMultiplier":1.07}]' WHERE stageId = '2-4';

-- 2-5: hp 0.99→1.49, atk 0.67→1.01, def 0.67→1.01
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.49,"atkMultiplier":1.01,"defMultiplier":1.01,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.49,"atkMultiplier":1.01,"defMultiplier":1.01,"speedMultiplier":1.07},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":1.49,"atkMultiplier":1.01,"defMultiplier":1.01,"speedMultiplier":1.07}]' WHERE stageId = '2-5';

-- 2-6: hp 1.06→1.59, atk 0.71→1.07, def 0.71→1.07
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.59,"atkMultiplier":1.07,"defMultiplier":1.07,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.59,"atkMultiplier":1.07,"defMultiplier":1.07,"speedMultiplier":1.07},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":1.59,"atkMultiplier":1.07,"defMultiplier":1.07,"speedMultiplier":1.07}]' WHERE stageId = '2-6';

-- 2-7: hp 1.13→1.70, atk 0.76→1.14, def 0.76→1.14
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.70,"atkMultiplier":1.14,"defMultiplier":1.14,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.70,"atkMultiplier":1.14,"defMultiplier":1.14,"speedMultiplier":1.07},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":1.70,"atkMultiplier":1.14,"defMultiplier":1.14,"speedMultiplier":1.07}]' WHERE stageId = '2-7';

-- 2-8: 普通×1.5, Boss×1.5
UPDATE stage_configs SET enemies = '[{"heroId":2,"slot":1,"levelMultiplier":1,"hpMultiplier":1.8,"atkMultiplier":1.2,"defMultiplier":1.2,"speedMultiplier":1.07},{"heroId":3,"slot":2,"levelMultiplier":1,"hpMultiplier":1.8,"atkMultiplier":1.2,"defMultiplier":1.2,"speedMultiplier":1.07},{"heroId":4,"slot":3,"levelMultiplier":1,"hpMultiplier":1.8,"atkMultiplier":1.2,"defMultiplier":1.2,"speedMultiplier":1.07},{"heroId":5,"slot":4,"levelMultiplier":1,"hpMultiplier":2.7,"atkMultiplier":1.8,"defMultiplier":1.8,"speedMultiplier":0.96}]' WHERE stageId = '2-8';
