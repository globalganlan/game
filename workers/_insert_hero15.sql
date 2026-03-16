-- ═══════════════════════════════════════════════
-- Hero #15 — 瘟疫醫生 (SR, 特殊)
-- ═══════════════════════════════════════════════

-- 1) 英雄基礎數值
INSERT OR IGNORE INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (15, '瘟疫醫生', '特殊', 'SR', 115, 42, 18, 10, 'zombie_15', 5, 50, '精通毒藥與疫病的末日醫者，以瘟疫為武器削弱敵人');

-- 2) 主動技能：瘟疫蔓延 — 全體傷害 + 中毒 + 降防
INSERT OR IGNORE INTO skill_templates (skillId, name, type, target, description, effects, passive_trigger, icon)
VALUES (
  'SKL_PLAGUE_SPREAD', '瘟疫蔓延', 'active', 'all_enemies',
  '向全體敵人釋放致命瘟疫，造成傷害並施加中毒與降防',
  '[{"type":"damage","scalingStat":"ATK","multiplier":1.0},{"type":"debuff","status":"dot_poison","statusChance":0.5,"statusValue":0.4,"statusDuration":2},{"type":"debuff","status":"def_down","statusChance":0.4,"statusValue":0.15,"statusDuration":2}]',
  '', ''
);

-- 3) 被動1：瘴氣體質 — 永久自身 DEF+10%
INSERT OR IGNORE INTO skill_templates (skillId, name, type, target, description, effects, passive_trigger, icon)
VALUES (
  'PAS_15_1', '瘴氣體質', 'passive', 'self',
  '長期接觸毒物的身體產生了抗性，永久提升防禦力',
  '[{"type":"buff","status":"def_up","statusValue":0.1}]',
  'always', ''
);

-- 4) 被動2：劇毒調配 — 攻擊時 25% 機率施加中毒
INSERT OR IGNORE INTO skill_templates (skillId, name, type, target, description, effects, passive_trigger, icon)
VALUES (
  'PAS_15_2', '劇毒調配', 'passive', 'single_enemy',
  '精心調配的毒藥附著在攻擊上，有機率使敵人中毒',
  '[{"type":"debuff","status":"dot_poison","statusChance":0.25,"statusValue":0.35,"statusDuration":2}]',
  'on_attack', ''
);

-- 5) 被動3：疫病研究 — 每2回合全隊回血 + 淨化
INSERT OR IGNORE INTO skill_templates (skillId, name, type, target, description, effects, passive_trigger, icon)
VALUES (
  'PAS_15_3', '疫病研究', 'passive', 'all_allies',
  '深入研究疫病的知識讓醫生能定期為隊友治療並淨化毒素',
  '[{"type":"heal","scalingStat":"HP","multiplier":0.05},{"type":"dispel_debuff"}]',
  'every_n_turns', ''
);

-- 6) 被動4：終末瘟疫 — 攻擊時 35% 流血 + 15% 降攻
INSERT OR IGNORE INTO skill_templates (skillId, name, type, target, description, effects, passive_trigger, icon)
VALUES (
  'PAS_15_4', '終末瘟疫', 'passive', 'single_enemy',
  '瘟疫的終極形態，攻擊時使敵人流血並削弱其攻擊力',
  '[{"type":"debuff","status":"dot_bleed","statusChance":0.35,"statusValue":0.4,"statusDuration":2},{"type":"debuff","status":"atk_down","statusChance":0.15,"statusValue":0.12,"statusDuration":2}]',
  'on_attack', ''
);

-- 7) 英雄技能配置
INSERT OR IGNORE INTO hero_skills (heroId, activeSkillId, passive1_skillId, passive2_skillId, passive3_skillId, passive4_skillId)
VALUES (15, 'SKL_PLAGUE_SPREAD', 'PAS_15_1', 'PAS_15_2', 'PAS_15_3', 'PAS_15_4');
