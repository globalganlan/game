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

-- ═══════════════════════════════════════════════
-- v2.0 效果模組化（effect_templates + skill_effects）
-- ═══════════════════════════════════════════════

-- 8) effect_templates（9 筆效果）

-- 主動技：瘟疫蔓延
INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, scalingStat, multiplier)
VALUES ('EFF_DAMAGE_SKL_PLAGUE_SPREAD_1', '瘟疫傷害', 'damage', 'immediate', 'all_enemies', 'ATK', 1.0);

INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, status, statusChance, statusValue, statusDuration)
VALUES ('EFF_DEBUFF_SKL_PLAGUE_SPREAD_2', '瘟疫中毒', 'debuff', 'immediate', 'all_enemies', 'dot_poison', 0.5, 0.4, 2);

INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, status, statusChance, statusValue, statusDuration)
VALUES ('EFF_DEBUFF_SKL_PLAGUE_SPREAD_3', '瘟疫降防', 'debuff', 'immediate', 'all_enemies', 'def_down', 0.4, 0.15, 2);

-- 被動1：瘴氣體質
INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, status, statusValue)
VALUES ('EFF_BUFF_PAS_15_1_1', '瘴氣體質防禦', 'buff', 'always', 'self', 'def_up', 0.1);

-- 被動2：劇毒調配
INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, status, statusChance, statusValue, statusDuration)
VALUES ('EFF_DEBUFF_PAS_15_2_1', '劇毒調配中毒', 'debuff', 'on_attack', 'single_enemy', 'dot_poison', 0.25, 0.35, 2);

-- 被動3：疫病研究
INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, scalingStat, multiplier, triggerParam)
VALUES ('EFF_HEAL_PAS_15_3_1', '疫病研究治療', 'heal', 'every_n_turns', 'all_allies', 'HP', 0.05, '2');

INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, triggerParam)
VALUES ('EFF_DISPEL_PAS_15_3_2', '疫病研究淨化', 'dispel_debuff', 'every_n_turns', 'all_allies', '2');

-- 被動4：終末瘟疫
INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, status, statusChance, statusValue, statusDuration)
VALUES ('EFF_DEBUFF_PAS_15_4_1', '終末瘟疫流血', 'debuff', 'on_attack', 'single_enemy', 'dot_bleed', 0.35, 0.4, 2);

INSERT OR IGNORE INTO effect_templates (effectId, name, category, trigger_type, target, status, statusChance, statusValue, statusDuration)
VALUES ('EFF_DEBUFF_PAS_15_4_2', '終末瘟疫降攻', 'debuff', 'on_attack', 'single_enemy', 'atk_down', 0.15, 0.12, 2);

-- 9) skill_effects 關聯表（9 筆）

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('SKL_PLAGUE_SPREAD', 'EFF_DAMAGE_SKL_PLAGUE_SPREAD_1', 1, '{}', NULL);

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('SKL_PLAGUE_SPREAD', 'EFF_DEBUFF_SKL_PLAGUE_SPREAD_2', 2, '{}', 'EFF_DAMAGE_SKL_PLAGUE_SPREAD_1');

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('SKL_PLAGUE_SPREAD', 'EFF_DEBUFF_SKL_PLAGUE_SPREAD_3', 3, '{}', 'EFF_DAMAGE_SKL_PLAGUE_SPREAD_1');

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('PAS_15_1', 'EFF_BUFF_PAS_15_1_1', 1, '{}', NULL);

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('PAS_15_2', 'EFF_DEBUFF_PAS_15_2_1', 1, '{}', NULL);

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('PAS_15_3', 'EFF_HEAL_PAS_15_3_1', 1, '{}', NULL);

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('PAS_15_3', 'EFF_DISPEL_PAS_15_3_2', 2, '{}', NULL);

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('PAS_15_4', 'EFF_DEBUFF_PAS_15_4_1', 1, '{}', NULL);

INSERT OR IGNORE INTO skill_effects (skillId, effectId, sortOrder, overrideParams, dependsOn)
VALUES ('PAS_15_4', 'EFF_DEBUFF_PAS_15_4_2', 2, '{}', NULL);
