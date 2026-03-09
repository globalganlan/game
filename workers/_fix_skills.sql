-- ═══════════════════════════════════════════════════
-- 技能 Bug 修復 SQL
-- ═══════════════════════════════════════════════════

-- 🔴 Bug #1: PAS_4_1 亡者之速 — SPD statusValue 3 被當作 300%，改為 0.03 (3%)
UPDATE skill_templates SET effects = '[{"type":"buff","status":"spd_up","statusValue":0.03,"statusMaxStacks":4}]'
WHERE skillId = 'PAS_4_1';

-- 🔴 Bug #2: PAS_4_4 處決 — 無條件 ×1.8 改為需目標 HP<40% 才生效
UPDATE skill_templates SET effects = '[{"type":"damage_mult","multiplier":1.8,"targetHpThreshold":0.4}]'
WHERE skillId = 'PAS_4_4';

-- 🔴 Bug #3: PAS_5_1 寄生吸取 — 應基於 ATK 而非 HP 治療
UPDATE skill_templates SET effects = '[{"type":"heal","scalingStat":"ATK","multiplier":0.1}]'
WHERE skillId = 'PAS_5_1';

-- 🔴 Bug #4: PAS_5_4 完全寄生 — 治療部分應基於 ATK
UPDATE skill_templates SET effects = '[{"type":"heal","scalingStat":"ATK","multiplier":0.2},{"type":"debuff","status":"atk_down","statusValue":0.1,"statusDuration":2}]'
WHERE skillId = 'PAS_5_4';

-- 🔴 Bug #5: PAS_10_1 凝視 — SPD statusValue 4 被當作 400%，改為 0.04 (4%)
UPDATE skill_templates SET effects = '[{"type":"debuff","status":"spd_down","statusChance":0.35,"statusValue":0.04}]'
WHERE skillId = 'PAS_10_1';

-- 🔴 Bug #6: PAS_10_4 深淵凝視 — SPD statusValue 6 被當作 600%，改為 0.06 (6%)
UPDATE skill_templates SET effects = '[{"type":"debuff","status":"spd_down","statusValue":0.06},{"type":"debuff","status":"stun","statusChance":0.25,"statusDuration":1}]'
WHERE skillId = 'PAS_10_4';

-- 🔴 Bug #7: PAS_14_4 殘影步法 — SPD statusValue 3 被當作 300%，改為 0.03 (3%)
UPDATE skill_templates SET effects = '[{"type":"buff","status":"spd_up","statusValue":0.03,"statusMaxStacks":5},{"type":"buff","status":"dodge_up","statusValue":0.05}]'
WHERE skillId = 'PAS_14_4';

-- 🔴 Bug #8: PAS_14_1 閃避直覺 — on_be_attacked 在命中後才觸發，閃避無效，改為 always
UPDATE skill_templates SET passive_trigger = 'always'
WHERE skillId = 'PAS_14_1';

-- 🟡 Bug #9: PAS_11_2 中場休息 — 缺少 status 欄位導致完全無效，改為 random_debuff
UPDATE skill_templates SET effects = '[{"type":"random_debuff","statusValue":0.15,"statusDuration":1}]'
WHERE skillId = 'PAS_11_2';

-- 🟡 Bug #10: PAS_9_4 逆轉 — 缺少 50% 機率條件，改為加上 statusChance
UPDATE skill_templates SET effects = '[{"type":"heal","scalingStat":"HP","multiplier":0.3,"statusChance":0.5}]'
WHERE skillId = 'PAS_9_4';

-- 🟡 Bug #11: PAS_6_3 群聚本能 — 固定 5% 而非按存活隊友倍增，加上 perAlly 標記
UPDATE skill_templates SET effects = '[{"type":"buff","status":"atk_up","statusValue":0.05,"perAlly":true}]'
WHERE skillId = 'PAS_6_3';

-- 🟡 Bug #12: PAS_10_3 夢魘 — 描述寫「恐懼」但效果是暈眩，更新描述為暈眩
UPDATE skill_templates SET description = '普攻時 20% 機率暈眩目標 1 回合'
WHERE skillId = 'PAS_10_3';
