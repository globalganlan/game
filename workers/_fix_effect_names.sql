-- 修正所有 effect_templates 的通用名稱為有意義的中文
-- 基於各英雄的技能名稱命名

-- === 主動技傷害效果 ===
UPDATE effect_templates SET name = '暗影突襲' WHERE effectId = 'EFF_DAMAGE_SKL_SHADOW_STRIKE_1';
UPDATE effect_templates SET name = '烈焰爆發' WHERE effectId = 'EFF_DAMAGE_SKL_FLAME_BURST_1';
UPDATE effect_templates SET name = '前排粉碎' WHERE effectId = 'EFF_DAMAGE_SKL_FRONT_CRUSH_1';
UPDATE effect_templates SET name = '後排狙擊' WHERE effectId = 'EFF_DAMAGE_SKL_BACK_SNIPE_1';
UPDATE effect_templates SET name = '冰獄傷害' WHERE effectId = 'EFF_DAMAGE_SKL_ICE_PRISON_1';

-- === 主動技附帶減益 ===
UPDATE effect_templates SET name = '烈焰灼傷' WHERE effectId = 'EFF_DEBUFF_SKL_FLAME_BURST_2';
UPDATE effect_templates SET name = '粉碎降防' WHERE effectId = 'EFF_DEBUFF_SKL_FRONT_CRUSH_2';
UPDATE effect_templates SET name = '冰獄凍結' WHERE effectId = 'EFF_DEBUFF_SKL_ICE_PRISON_2';

-- === 主動技治療 ===
UPDATE effect_templates SET name = '治癒之波' WHERE effectId = 'EFF_HEAL_SKL_HEAL_WAVE_1';
UPDATE effect_templates SET name = '集中治療' WHERE effectId = 'EFF_HEAL_SKL_FOCUS_HEAL_1';

-- === Hero 1 女喪屍 被動 ===
UPDATE effect_templates SET name = '殘存保命' WHERE effectId = 'EFF_REVIVE_PAS_1_1_1';
UPDATE effect_templates SET name = '靈巧加速' WHERE effectId = 'EFF_BUFF_PAS_1_2_1';
UPDATE effect_templates SET name = '危機強化' WHERE effectId = 'EFF_BUFF_PAS_1_3_1';
UPDATE effect_templates SET name = '不死保命' WHERE effectId = 'EFF_REVIVE_PAS_1_4_1';
UPDATE effect_templates SET name = '不死回復' WHERE effectId = 'EFF_HEAL_PAS_1_4_2';

-- === Hero 2 異變者 被動 ===
UPDATE effect_templates SET name = '狂暴強化' WHERE effectId = 'EFF_BUFF_PAS_2_1_1';
UPDATE effect_templates SET name = '血腥回復' WHERE effectId = 'EFF_HEAL_PAS_2_2_1';
UPDATE effect_templates SET name = '力量爆發' WHERE effectId = 'EFF_BUFF_PAS_2_3_1';
UPDATE effect_templates SET name = '狂化攻擊' WHERE effectId = 'EFF_BUFF_PAS_2_4_1';
UPDATE effect_templates SET name = '狂化加速' WHERE effectId = 'EFF_BUFF_PAS_2_4_2';
UPDATE effect_templates SET name = '狂化降防' WHERE effectId = 'EFF_DEBUFF_PAS_2_4_3';

-- === Hero 3 詭獸 被動 ===
UPDATE effect_templates SET name = '厚皮減傷' WHERE effectId = 'EFF_BUFF_PAS_3_1_1';
UPDATE effect_templates SET name = '威嚇降攻' WHERE effectId = 'EFF_DEBUFF_PAS_3_2_1';
UPDATE effect_templates SET name = '硬化防禦' WHERE effectId = 'EFF_BUFF_PAS_3_3_1';
UPDATE effect_templates SET name = '鐵壁減傷' WHERE effectId = 'EFF_BUFF_PAS_3_4_1';
UPDATE effect_templates SET name = '鐵壁反彈' WHERE effectId = 'EFF_REFLEC_PAS_3_4_2';

-- === Hero 4 屠宰者 被動 ===
UPDATE effect_templates SET name = '亡者加速' WHERE effectId = 'EFF_BUFF_PAS_4_1_1';
UPDATE effect_templates SET name = '殺意暴擊' WHERE effectId = 'EFF_BUFF_PAS_4_2_1';
UPDATE effect_templates SET name = '狩獵充能' WHERE effectId = 'EFF_ENERGY_PAS_4_3_1';
UPDATE effect_templates SET name = '處決加傷' WHERE effectId = 'EFF_BUFF_PAS_4_4_1';

-- === Hero 5 口器者 被動 ===
UPDATE effect_templates SET name = '寄生吸取' WHERE effectId = 'EFF_HEAL_PAS_5_1_1';
UPDATE effect_templates SET name = '腐蝕降防' WHERE effectId = 'EFF_DEBUFF_PAS_5_2_1';
UPDATE effect_templates SET name = '增殖回復' WHERE effectId = 'EFF_HEAL_PAS_5_3_1';
UPDATE effect_templates SET name = '寄生回復' WHERE effectId = 'EFF_HEAL_PAS_5_4_1';
UPDATE effect_templates SET name = '寄生降攻' WHERE effectId = 'EFF_DEBUFF_PAS_5_4_2';

-- === Hero 6 無名活屍 被動 ===
UPDATE effect_templates SET name = '群聚強化' WHERE effectId = 'EFF_BUFF_PAS_6_1_1';
UPDATE effect_templates SET name = '腐臭降防' WHERE effectId = 'EFF_DEBUFF_PAS_6_2_1';
UPDATE effect_templates SET name = '群聚本能' WHERE effectId = 'EFF_BUFF_PAS_6_3_1';
UPDATE effect_templates SET name = '號令充能' WHERE effectId = 'EFF_ENERGY_PAS_6_4_1';

-- === Hero 7 腐學者 被動 ===
UPDATE effect_templates SET name = '知識回復' WHERE effectId = 'EFF_HEAL_PAS_7_1_1';
UPDATE effect_templates SET name = '知識充能' WHERE effectId = 'EFF_ENERGY_PAS_7_2_1';
UPDATE effect_templates SET name = '腐蝕沉默' WHERE effectId = 'EFF_DEBUFF_PAS_7_3_1';
UPDATE effect_templates SET name = '真理回復' WHERE effectId = 'EFF_HEAL_PAS_7_4_1';
UPDATE effect_templates SET name = '真理淨化' WHERE effectId = 'EFF_DISPEL_PAS_7_4_2';

-- === Hero 8 夜鬼 被動 ===
UPDATE effect_templates SET name = '壓迫降攻' WHERE effectId = 'EFF_DEBUFF_PAS_8_1_1';
UPDATE effect_templates SET name = '暗影閃避' WHERE effectId = 'EFF_BUFF_PAS_8_2_1';
UPDATE effect_templates SET name = '恐懼減速' WHERE effectId = 'EFF_DEBUFF_PAS_8_3_1';
UPDATE effect_templates SET name = '夜之降攻' WHERE effectId = 'EFF_DEBUFF_PAS_8_4_1';
UPDATE effect_templates SET name = '夜之降防' WHERE effectId = 'EFF_DEBUFF_PAS_8_4_2';

-- === Hero 9 倖存者 被動 ===
UPDATE effect_templates SET name = '求生防禦' WHERE effectId = 'EFF_BUFF_PAS_9_1_1';
UPDATE effect_templates SET name = '堅韌防禦' WHERE effectId = 'EFF_BUFF_PAS_9_2_1';
UPDATE effect_templates SET name = '互助回復' WHERE effectId = 'EFF_HEAL_PAS_9_3_1';
UPDATE effect_templates SET name = '逆轉回復' WHERE effectId = 'EFF_HEAL_PAS_9_4_1';

-- === Hero 10 童魘 被動 ===
UPDATE effect_templates SET name = '凝視減速' WHERE effectId = 'EFF_DEBUFF_PAS_10_1_1';
UPDATE effect_templates SET name = '詭笑降攻' WHERE effectId = 'EFF_DEBUFF_PAS_10_2_1';
UPDATE effect_templates SET name = '夢魘暈眩' WHERE effectId = 'EFF_DEBUFF_PAS_10_3_1';
UPDATE effect_templates SET name = '深淵減速' WHERE effectId = 'EFF_DEBUFF_PAS_10_4_1';
UPDATE effect_templates SET name = '深淵暈眩' WHERE effectId = 'EFF_DEBUFF_PAS_10_4_2';

-- === Hero 11 白面鬼 被動 ===
UPDATE effect_templates SET name = '瘋狂演出' WHERE effectId = 'EFF_BUFF_PAS_11_1_1';
UPDATE effect_templates SET name = '中場休息' WHERE effectId = 'EFF_DEBUFF_PAS_11_2_1';
UPDATE effect_templates SET name = '安可再動' WHERE effectId = 'EFF_EXTRA__PAS_11_3_1';
UPDATE effect_templates SET name = '謝幕演出' WHERE effectId = 'EFF_BUFF_PAS_11_4_1';

-- === Hero 12 戰厄 被動 ===
UPDATE effect_templates SET name = '壕溝減傷' WHERE effectId = 'EFF_BUFF_PAS_12_1_1';
UPDATE effect_templates SET name = '嘲諷壁壘' WHERE effectId = 'EFF_BUFF_PAS_12_2_1';
UPDATE effect_templates SET name = '不屈回復' WHERE effectId = 'EFF_HEAL_PAS_12_3_1';
UPDATE effect_templates SET name = '要塞減傷' WHERE effectId = 'EFF_BUFF_PAS_12_4_1';
UPDATE effect_templates SET name = '要塞反彈' WHERE effectId = 'EFF_REFLEC_PAS_12_4_2';

-- === Hero 13 南瓜魔 被動 ===
UPDATE effect_templates SET name = '巨人踐踏' WHERE effectId = 'EFF_BUFF_PAS_13_1_1';
UPDATE effect_templates SET name = '震暈' WHERE effectId = 'EFF_DEBUFF_PAS_13_2_1';
UPDATE effect_templates SET name = '南瓜盛宴' WHERE effectId = 'EFF_BUFF_PAS_13_3_1';
UPDATE effect_templates SET name = '災厄領主' WHERE effectId = 'EFF_BUFF_PAS_13_4_1';

-- === Hero 14 脫逃者 被動 ===
UPDATE effect_templates SET name = '閃避直覺' WHERE effectId = 'EFF_BUFF_PAS_14_1_1';
UPDATE effect_templates SET name = '疾風加速' WHERE effectId = 'EFF_BUFF_PAS_14_2_1';
UPDATE effect_templates SET name = '反擊傷害' WHERE effectId = 'EFF_DAMAGE_PAS_14_3_1';
UPDATE effect_templates SET name = '殘影加速' WHERE effectId = 'EFF_BUFF_PAS_14_4_1';
UPDATE effect_templates SET name = '殘影閃避' WHERE effectId = 'EFF_BUFF_PAS_14_4_2';
