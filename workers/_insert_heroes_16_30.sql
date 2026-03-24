-- ═══════════════════════════════════════════════════════════════
-- 全球感染 — 15 位新英雄 (heroId 16~30) 完整插入 SQL
-- 日期：2026-03-17
-- 說明：每位英雄對應獨立 zombie_16~30 模型目錄
-- ═══════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════╗
-- ║       PART 1: heroes 表          ║
-- ╚══════════════════════════════════╝

-- N×2
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (16, '荒拳鬥士', '敏捷', 'N', 65, 18, 10, 11, 'zombie_16', 5, 50, '末日荒野中磨練的格鬥家，鐵拳就是最強武器。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (17, '蠠行屍', '力量', 'N', 75, 22, 14, 8, 'zombie_17', 5, 50, '失去頭顱仍蠠動前行的異變體，以血肉感知獵物。');

-- R×4
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (18, '影行者', '敏捷', 'R', 80, 32, 12, 13, 'zombie_18', 8, 55, '穿梭暗影的刺客，以迅雷之勢取敵首級。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (19, '星蝕者', '智慧', 'R', 90, 25, 14, 9, 'zombie_19', 5, 50, '來自深空的異種生物，星光能量護甲覆蓋全身。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (20, '鏽鋼衛士', '力量', 'R', 100, 22, 22, 8, 'zombie_20', 5, 50, '廢墟中鍛造的鐵壁，用身軀護衛同伴。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (21, '暗影弓手', '敏捷', 'R', 78, 35, 10, 12, 'zombie_21', 10, 60, '隱匿暗處的神射手，箭矢無聲卻致命。');

-- SR×5
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (22, '魔瞳領主', '智慧', 'SR', 95, 38, 16, 11, 'zombie_22', 7, 55, '以魔眼統御群魔的異界貴族，綠焰是其力量象徵。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (23, '霜角魔', '力量', 'SR', 105, 42, 18, 9, 'zombie_23', 5, 50, '永凍深淵的惡魔領主，寒氣足以凍結靈魂。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (24, '鏈甲獵兵', '智慧', 'SR', 88, 36, 14, 10, 'zombie_24', 5, 50, '穿戴高科技裝甲的精銳獵人，目標鎖定絕不放手。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (25, '骸骨騎士', '智慧', 'SR', 92, 40, 15, 10, 'zombie_25', 5, 50, '披掛亡者骨甲的暗黑騎士，散發不祥死亡氣息。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (26, '老獵魔人', '平衡', 'SR', 98, 37, 17, 11, 'zombie_26', 6, 52, '歷經百戰的獵魔老手，傷疤就是最好的勳章。');

-- SSR×4
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (27, '末日審判者', '力量', 'SSR', 120, 45, 22, 9, 'zombie_27', 5, 50, '世界末日降臨的裁決者，無人能逃審判之錘。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (28, '末日歌姬', '智慧', 'SSR', 110, 42, 18, 10, 'zombie_28', 5, 50, '末日餘生的妖姬，以歌聲蛀惑人心，美貌下藏致命殺機。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (29, '虛空獵手', '敏捷', 'SSR', 100, 48, 14, 14, 'zombie_29', 12, 65, '維度裂縫的掠食者，獵殺跨越時空。');
INSERT INTO heroes (heroId, name, type, rarity, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, description)
VALUES (30, '傭兵頭子', '力量', 'SSR', 135, 40, 25, 8, 'zombie_30', 5, 50, '叼著雪茄的老兵油子，用經驗而非蠻力統領戰場。');


-- ╔══════════════════════════════════╗
-- ║   PART 2: skill_templates 表     ║
-- ╚══════════════════════════════════╝

-- === Hero 16: 荒拳鬥士 (N) ===
INSERT INTO skill_templates VALUES ('ACT_16','拳風破','active','all_enemies','向全體敵人揮出暴風拳擊，造成傷害','[]','','☠️');
INSERT INTO skill_templates VALUES ('PAS_16_1','衝擊波','passive','self','攻擊時有機率以拳壓產生衝擊使敵人中毒','[]','on_attack','🧪');
INSERT INTO skill_templates VALUES ('PAS_16_2','鬥者之軀','passive','self','千鎚百煉的身軀，永久提升防禦力','[]','always','🛡️');
INSERT INTO skill_templates VALUES ('PAS_16_3','勝者為王','passive','self','擊殺敵人時回復生命','[]','on_kill','💚');
INSERT INTO skill_templates VALUES ('PAS_16_4','破甲拳','passive','single_enemy','攻擊時有機率降低敵人防禦','[]','on_attack','🦠');

-- === Hero 17: 蠠行屍 (N) ===
INSERT INTO skill_templates VALUES ('ACT_17','肉觸鞭擊','active','single_enemy','以血肉觸手猛擊單一敵人，造成高額傷害','[]','','🦴');
INSERT INTO skill_templates VALUES ('PAS_17_1','異化皮膜','passive','self','異變肉體形成的保護膜，永久提升防禦力','[]','always','🛡️');
INSERT INTO skill_templates VALUES ('PAS_17_2','不死軀體','passive','self','受致命傷時復活','[]','on_lethal','💀');
INSERT INTO skill_templates VALUES ('PAS_17_3','肉刺反擊','passive','self','被攻擊時以體表肉刺反擊','[]','on_be_attacked','⚔️');
INSERT INTO skill_templates VALUES ('PAS_17_4','血肉壁壘','passive','self','HP低時以血肉構築護盾','[]','hp_below_pct','🏰');

-- === Hero 18: 影行者 (R) ===
INSERT INTO skill_templates VALUES ('ACT_18','暗影連擊','active','random_enemies_3','隨機攻擊3名敵人','[]','','🗡️');
INSERT INTO skill_templates VALUES ('PAS_18_1','暗影迴避','passive','self','永久提升閃避率','[]','always','👻');
INSERT INTO skill_templates VALUES ('PAS_18_2','致命突襲','passive','single_enemy','暴擊時追加傷害','[]','on_crit','⚡');
INSERT INTO skill_templates VALUES ('PAS_18_3','無影步','passive','self','每2回合提升速度','[]','every_n_turns','🌪️');
INSERT INTO skill_templates VALUES ('PAS_18_4','暗殺','passive','single_enemy','攻擊時斬殺低血量敵人','[]','on_attack','💀');

-- === Hero 19: 星蝕者 (R) ===
INSERT INTO skill_templates VALUES ('ACT_19','星能脈衝','active','all_enemies','對全體敵人釋放星光能量波','[]','','🌟');
INSERT INTO skill_templates VALUES ('PAS_19_1','能量護甲','passive','self','星光能量構成的護甲，永久提升防禦','[]','always','🛡️');
INSERT INTO skill_templates VALUES ('PAS_19_2','離子灼射','passive','single_enemy','攻擊時施加離子灼傷','[]','on_attack','💉');
INSERT INTO skill_templates VALUES ('PAS_19_3','能量共鳴','passive','all_allies','每3回合以星能治療全體隊友','[]','every_n_turns','💚');
INSERT INTO skill_templates VALUES ('PAS_19_4','星蝕干擾','passive','all_enemies','施放大招時有機率以星能干擾暈眩敵人','[]','on_skill_cast','💫');

-- === Hero 20: 鏽鋼衛士 (R) ===
INSERT INTO skill_templates VALUES ('ACT_20','鐵壁衝擊','active','front_row_enemies','衝撞前排敵人造成傷害並降防','[]','','🔨');
INSERT INTO skill_templates VALUES ('PAS_20_1','鐵壁防禦','passive','self','永久大幅提升防禦','[]','always','🛡️');
INSERT INTO skill_templates VALUES ('PAS_20_2','鏽蝕甲','passive','self','被攻擊時反彈傷害','[]','on_be_attacked','🔃');
INSERT INTO skill_templates VALUES ('PAS_20_3','守護決心','passive','self','HP低於50%時獲得護盾','[]','hp_below_pct','🏰');
INSERT INTO skill_templates VALUES ('PAS_20_4','不屈意志','passive','self','受致命傷時復活並提升攻擊','[]','on_lethal','❤️');

-- === Hero 21: 暗影弓手 (R) ===
INSERT INTO skill_templates VALUES ('ACT_21','暗影箭雨','active','random_enemies_3','隨機射擊3名敵人並造成流血','[]','','🏹');
INSERT INTO skill_templates VALUES ('PAS_21_1','銳利之眼','passive','self','永久提升暴擊率','[]','always','👁️');
INSERT INTO skill_templates VALUES ('PAS_21_2','連射','passive','self','暴擊時恢復能量','[]','on_crit','⚡');
INSERT INTO skill_templates VALUES ('PAS_21_3','影射','passive','single_enemy','攻擊時追加傷害','[]','on_attack','🎯');
INSERT INTO skill_templates VALUES ('PAS_21_4','致命射擊','passive','self','擊殺時提升攻速','[]','on_kill','🌟');

-- === Hero 22: 魔瞳領主 (SR) ===
INSERT INTO skill_templates VALUES ('ACT_22','魔瞳風暴','active','all_enemies','以魔眼之力對全體造成傷害並汲取生命','[]','','🩸');
INSERT INTO skill_templates VALUES ('PAS_22_1','魔力汲取','passive','self','攻擊時以魔眼汲取生命回復自身','[]','on_attack','❤️');
INSERT INTO skill_templates VALUES ('PAS_22_2','魔瞳防壁','passive','self','HP低於40%時魔眼激活防禦結界+回復','[]','hp_below_pct','🛡️');
INSERT INTO skill_templates VALUES ('PAS_22_3','暗能覺醒','passive','self','戰鬥開始時魔瞳全開，提升閃避和速度','[]','battle_start','🌙');
INSERT INTO skill_templates VALUES ('PAS_22_4','魔瞳契約','passive','self','隊友死亡時魔瞳吸收殘餘力量，提升攻擊並回復','[]','on_ally_death','💀');

-- === Hero 23: 霜角魔 (SR) ===
INSERT INTO skill_templates VALUES ('ACT_23','極寒吐息','active','all_enemies','對全體敵人吐出極寒氣息，造成傷害並施加凍傷','[]','','❄️');
INSERT INTO skill_templates VALUES ('PAS_23_1','寒霜之軀','passive','self','冰霜構成的身軀，永久提升攻擊力','[]','always','💪');
INSERT INTO skill_templates VALUES ('PAS_23_2','凍氣反擊','passive','self','被攻擊時釋放冰寒之氣反擊並凍傷敵人','[]','on_be_attacked','☄️');
INSERT INTO skill_templates VALUES ('PAS_23_3','冰晶甲','passive','self','冰晶形成的護甲，永久反彈傷害','[]','always','🔃');
INSERT INTO skill_templates VALUES ('PAS_23_4','極寒領域','passive','self','HP低於30%時進入極寒暴走狀態','[]','hp_below_pct','🌊');

-- === Hero 24: 鏈甲獵兵 (SR) ===
INSERT INTO skill_templates VALUES ('ACT_24','制式鎖定','active','single_enemy','以裝甲武裝系統鎖定單體，造成傷害+暈眩+吸能','[]','','⛓️');
INSERT INTO skill_templates VALUES ('PAS_24_1','動力護盾','passive','self','戰鬥開始時啟動動力裝甲護盾','[]','battle_start','🛡️');
INSERT INTO skill_templates VALUES ('PAS_24_2','系統入侵','passive','single_enemy','攻擊時偷取敵方增益效果','[]','on_attack','🖐️');
INSERT INTO skill_templates VALUES ('PAS_24_3','EMP干擾','passive','all_enemies','每3回合發射電磁脈衝驅散全體敵方增益','[]','every_n_turns','🚫');
INSERT INTO skill_templates VALUES ('PAS_24_4','傷害轉移','passive','single_enemy','受傷時將減益效果轉移給敵人','[]','on_take_damage','➡️');

-- === Hero 25: 骸骨騎士 (SR) ===
INSERT INTO skill_templates VALUES ('ACT_25','死亡俯衝','active','all_enemies','以亡者之力俯衝全場，造成傷害並束縛敵人','[]','','⚔️');
INSERT INTO skill_templates VALUES ('PAS_25_1','骨甲防禦','passive','self','亡者骨甲永久提升防禦+反傷','[]','always','🧴');
INSERT INTO skill_templates VALUES ('PAS_25_2','亡者之觸','passive','single_enemy','攻擊時以死亡之力降低敵人速度','[]','on_attack','🌊');
INSERT INTO skill_templates VALUES ('PAS_25_3','死域展開','passive','all_enemies','每4回合展開死亡領域束縛全體敵人','[]','every_n_turns','💫');
INSERT INTO skill_templates VALUES ('PAS_25_4','亡者復甦','passive','self','受致命傷時以亡者之力復活並獲得護盾','[]','on_lethal','💖');

-- === Hero 26: 老獵魔人 (SR) ===
INSERT INTO skill_templates VALUES ('ACT_26','獵魔弩箭','active','back_row_enemies','對後排發射附魔弩箭，造成傷害並削弱屬性','[]','','👁️');
INSERT INTO skill_templates VALUES ('PAS_26_1','老練身手','passive','self','百戰磨練的身手，永久提升攻擊和防禦','[]','always','💪');
INSERT INTO skill_templates VALUES ('PAS_26_2','閃身反擊','passive','self','老練地閃避後立刻反擊','[]','on_dodge','👻');
INSERT INTO skill_templates VALUES ('PAS_26_3','助攻射擊','passive','self','隊友施放大招時配合射擊追擊','[]','on_ally_skill','⚡');
INSERT INTO skill_templates VALUES ('PAS_26_4','致命一擊','passive','single_enemy','HP低於20%的目標會被直接擊殺','[]','on_attack','💀');

-- === Hero 27: 末日審判者 (SSR) ===
INSERT INTO skill_templates VALUES ('ACT_27','審判之錘','active','single_enemy','對單體造成巨額傷害+降防+暈眩','[]','','🔨');
INSERT INTO skill_templates VALUES ('PAS_27_1','威壓','passive','all_enemies','戰鬥開始時降低全體敵人攻擊','[]','battle_start','😨');
INSERT INTO skill_templates VALUES ('PAS_27_2','正義之怒','passive','self','隊友死亡時暴怒','[]','on_ally_death','😤');
INSERT INTO skill_templates VALUES ('PAS_27_3','制裁','passive','single_enemy','攻擊時斬殺低HP目標','[]','on_attack','☠️');
INSERT INTO skill_templates VALUES ('PAS_27_4','不滅意志','passive','self','致命傷復活+護盾+免疫','[]','on_lethal','✨');

-- === Hero 28: 末日歌姬 (SSR) ===
INSERT INTO skill_templates VALUES ('ACT_28','魅音風暴','active','all_enemies','以致命歌聲攻擊全體，造成傷害+中毒+流血','[]','','☠️');
INSERT INTO skill_templates VALUES ('PAS_28_1','弱化歌聲','passive','all_enemies','戰鬥開始時以歌聲削弱全體敵人防禦','[]','battle_start','🦠');
INSERT INTO skill_templates VALUES ('PAS_28_2','魅惑之歌','passive','self','攻擊時以歌聲汲取生命並施加毒素','[]','on_attack','🩸');
INSERT INTO skill_templates VALUES ('PAS_28_3','夢魘低語','passive','single_enemy','回合開始時以低語將自身減益轉移給敵人','[]','turn_start','💨');
INSERT INTO skill_templates VALUES ('PAS_28_4','瘋狂安可','passive','self','擊殺時觀眾瘋狂，大幅提升攻擊','[]','on_kill','🧬');

-- === Hero 29: 虛空獵手 (SSR) ===
INSERT INTO skill_templates VALUES ('ACT_29','維度斬','active','all_enemies','對全體造成傷害+吸取能量','[]','','🌀');
INSERT INTO skill_templates VALUES ('PAS_29_1','相位移動','passive','self','永久提升閃避+速度','[]','always','👻');
INSERT INTO skill_templates VALUES ('PAS_29_2','獵殺本能','passive','self','暴擊時再行動','[]','on_crit','🔄');
INSERT INTO skill_templates VALUES ('PAS_29_3','虛空標記','passive','single_enemy','攻擊時降低全屬性','[]','on_attack','🎯');
INSERT INTO skill_templates VALUES ('PAS_29_4','維度撕裂','passive','single_enemy','攻擊時斬殺+額外傷害','[]','on_attack','💀');

-- === Hero 30: 傭兵頭子 (SSR) ===
INSERT INTO skill_templates VALUES ('ACT_30','老大號令','active','all_allies','全體隊友增攻+加速+護盾','[]','','🏴');
INSERT INTO skill_templates VALUES ('PAS_30_1','老兵壓陣','passive','all_allies','戰鬥開始時以老兵氣場全體提升防禦','[]','battle_start','🛡️');
INSERT INTO skill_templates VALUES ('PAS_30_2','指揮若定','passive','self','隊友施放大招時追擊','[]','on_ally_skill','⚡');
INSERT INTO skill_templates VALUES ('PAS_30_3','身先士卒','passive','self','被攻擊時嘲諷+反傷','[]','on_be_attacked','🗿');
INSERT INTO skill_templates VALUES ('PAS_30_4','九死一生','passive','self','致命傷時憑藉豐富經驗復活+全體回復','[]','on_lethal','✨');


-- ╔══════════════════════════════════╗
-- ║     PART 3: hero_skills 表       ║
-- ╚══════════════════════════════════╝

INSERT INTO hero_skills VALUES (16,'ACT_16','PAS_16_1','PAS_16_2','PAS_16_3','PAS_16_4');
INSERT INTO hero_skills VALUES (17,'ACT_17','PAS_17_1','PAS_17_2','PAS_17_3','PAS_17_4');
INSERT INTO hero_skills VALUES (18,'ACT_18','PAS_18_1','PAS_18_2','PAS_18_3','PAS_18_4');
INSERT INTO hero_skills VALUES (19,'ACT_19','PAS_19_1','PAS_19_2','PAS_19_3','PAS_19_4');
INSERT INTO hero_skills VALUES (20,'ACT_20','PAS_20_1','PAS_20_2','PAS_20_3','PAS_20_4');
INSERT INTO hero_skills VALUES (21,'ACT_21','PAS_21_1','PAS_21_2','PAS_21_3','PAS_21_4');
INSERT INTO hero_skills VALUES (22,'ACT_22','PAS_22_1','PAS_22_2','PAS_22_3','PAS_22_4');
INSERT INTO hero_skills VALUES (23,'ACT_23','PAS_23_1','PAS_23_2','PAS_23_3','PAS_23_4');
INSERT INTO hero_skills VALUES (24,'ACT_24','PAS_24_1','PAS_24_2','PAS_24_3','PAS_24_4');
INSERT INTO hero_skills VALUES (25,'ACT_25','PAS_25_1','PAS_25_2','PAS_25_3','PAS_25_4');
INSERT INTO hero_skills VALUES (26,'ACT_26','PAS_26_1','PAS_26_2','PAS_26_3','PAS_26_4');
INSERT INTO hero_skills VALUES (27,'ACT_27','PAS_27_1','PAS_27_2','PAS_27_3','PAS_27_4');
INSERT INTO hero_skills VALUES (28,'ACT_28','PAS_28_1','PAS_28_2','PAS_28_3','PAS_28_4');
INSERT INTO hero_skills VALUES (29,'ACT_29','PAS_29_1','PAS_29_2','PAS_29_3','PAS_29_4');
INSERT INTO hero_skills VALUES (30,'ACT_30','PAS_30_1','PAS_30_2','PAS_30_3','PAS_30_4');


-- ╔══════════════════════════════════╗
-- ║   PART 4: effect_templates 表    ║
-- ╚══════════════════════════════════╝

-- ────── Hero 16: 腐蝕蟲 (N) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_16_ACT_1','蝕咬傷害','damage','immediate','all_enemies','ATK',0.7);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DOT_16_PAS1_1','毒液中毒','dot','on_attack','single_enemy','dot_poison',0.2,0.08,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_16_PAS2_1','蟲殼防禦','buff','always','self','def_up',0.1,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_HEAL_16_PAS3_1','寄生回復','heal','on_kill','self','ATK',0.3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DEBUFF_16_PAS4_1','侵蝕降防','debuff','on_attack','single_enemy','def_down',0.15,0.1,2);

-- ────── Hero 17: 枯骨兵 (N) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_17_ACT_1','骨矛穿刺','damage','immediate','single_enemy','ATK',1.6);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_17_PAS1_1','白骨堅韌','buff','always','self','def_up',0.15,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier,triggerLimit) VALUES ('EFF_REVIVE_17_PAS2_1','不死軀體','revive','on_lethal','self',0.2,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_17_PAS3_1','骨刺反擊','damage','on_be_attacked','single_enemy','ATK',0.5);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier,triggerParam) VALUES ('EFF_SHIELD_17_PAS4_1','骨牆護盾','shield','hp_below_pct','self','HP',0.15,'0.4');

-- ────── Hero 18: 影行者 (R) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier,hitCount) VALUES ('EFF_DMG_18_ACT_1','暗影連擊','damage','immediate','random_enemies_3','ATK',0.6,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_18_PAS1_1','暗影迴避','buff','always','self','dodge_up',0.1,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_18_PAS2_1','致命突襲','damage','on_crit','single_enemy','ATK',0.4);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration,triggerParam) VALUES ('EFF_BUFF_18_PAS3_1','無影步','buff','every_n_turns','self','spd_up',0.2,2,'2');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,targetHpThreshold,triggerChance) VALUES ('EFF_EXEC_18_PAS4_1','暗殺','execute','on_attack','single_enemy',0.12,0.3);

-- ────── Hero 19: 毒蕈師 (R) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_19_ACT_1','孢子爆破','damage','immediate','all_enemies','ATK',0.9);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,multiplier,statusDuration) VALUES ('EFF_DOT_19_ACT_2','孢子中毒','dot','immediate','all_enemies','dot_poison',0.4,0.02,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_19_PAS1_1','菌絲防禦','buff','always','self','def_up',0.12,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,multiplier,statusDuration) VALUES ('EFF_DOT_19_PAS2_1','毒素中毒','dot','on_attack','single_enemy','dot_poison',0.25,0.02,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier,triggerParam) VALUES ('EFF_HEAL_19_PAS3_1','再生孢子','heal','every_n_turns','all_allies','ATK',0.4,'3');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusDuration) VALUES ('EFF_CC_19_PAS4_1','致幻暈眩','cc','on_skill_cast','all_enemies','stun',0.2,1);

-- ────── Hero 20: 鏽鋼衛士 (R) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_20_ACT_1','鐵壁衝擊','damage','immediate','front_row_enemies','ATK',1.1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DEBUFF_20_ACT_2','衝擊降防','debuff','immediate','front_row_enemies','def_down',0.5,0.15,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_20_PAS1_1','鐵壁防禦','buff','always','self','def_up',0.25,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier) VALUES ('EFF_REFLECT_20_PAS2_1','鏽蝕反彈','reflect','on_be_attacked','self',0.15);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier,triggerParam) VALUES ('EFF_SHIELD_20_PAS3_1','守護護盾','shield','hp_below_pct','self','HP',0.2,'0.5');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier,triggerLimit) VALUES ('EFF_REVIVE_20_PAS4_1','不屈復活','revive','on_lethal','self',0.25,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_20_PAS4_2','不屈強化','buff','on_lethal','self','atk_up',0.3,3);

-- ────── Hero 21: 亡靈弓手 (R) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier,hitCount) VALUES ('EFF_DMG_21_ACT_1','穿心箭雨','damage','immediate','random_enemies_3','ATK',0.7,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DOT_21_ACT_2','箭雨流血','dot','immediate','random_enemies_3','dot_bleed',0.3,0.2,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_21_PAS1_1','銳利之眼','buff','always','self','crit_rate_up',0.1,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue) VALUES ('EFF_ENERGY_21_PAS2_1','連射充能','energy','on_crit','self',150);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier,triggerChance) VALUES ('EFF_DMG_21_PAS3_1','影射追加','damage','on_attack','single_enemy','ATK',0.3,0.25);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_21_PAS4_1','致命加速','buff','on_kill','self','spd_up',0.2,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_21_PAS4_2','致命強攻','buff','on_kill','self','atk_up',0.15,2);

-- ────── Hero 22: 血族伯爵 (SR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_22_ACT_1','鮮血風暴','damage','immediate','all_enemies','ATK',1.2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_HEAL_22_ACT_2','吸血回復','heal','immediate','self','ATK',0.5);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_HEAL_22_PAS1_1','吸血本能','heal','on_attack','self','ATK',0.15);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration,triggerParam) VALUES ('EFF_BUFF_22_PAS2_1','血族韌性','buff','hp_below_pct','self','def_up',0.2,3,'0.4');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration,triggerParam) VALUES ('EFF_BUFF_22_PAS2_2','血族再生','buff','hp_below_pct','self','regen',0.05,3,'0.4');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_22_PAS3_1','夜行閃避','buff','battle_start','self','dodge_up',0.15,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_22_PAS3_2','夜行加速','buff','battle_start','self','spd_up',0.15,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_22_PAS4_1','契約強攻','buff','on_ally_death','self','atk_up',0.3,99);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_HEAL_22_PAS4_2','契約回復','heal','on_ally_death','self','HP',0.2);

-- ────── Hero 23: 炎魔 (SR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_23_ACT_1','地獄火焰','damage','immediate','all_enemies','ATK',1.3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DOT_23_ACT_2','地獄灼燒','dot','immediate','all_enemies','dot_burn',0.5,0.35,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_23_PAS1_1','烈焰強攻','buff','always','self','atk_up',0.2,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_23_PAS2_1','灼燒反擊','damage','on_be_attacked','single_enemy','ATK',0.4);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DOT_23_PAS2_2','灼燒觸發','dot','on_be_attacked','single_enemy','dot_burn',0.3,0.25,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier) VALUES ('EFF_REFLECT_23_PAS3_1','熔岩反彈','reflect','always','self',0.1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration,triggerParam) VALUES ('EFF_BUFF_23_PAS4_1','末日攻擊','buff','hp_below_pct','self','atk_up',0.4,99,'0.3');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,multiplier,statusDuration,triggerParam) VALUES ('EFF_DOT_23_PAS4_2','末日灶燒','dot','hp_below_pct','all_enemies','dot_burn',0.5,0.03,2,'0.3');

-- ────── Hero 24: 魂縛者 (SR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_24_ACT_1','鎖鏈傷害','damage','immediate','single_enemy','ATK',1.8);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusDuration) VALUES ('EFF_CC_24_ACT_2','鎖鏈暈眩','cc','immediate','single_enemy','stun',0.6,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue) VALUES ('EFF_ENERGY_24_ACT_3','鎖鏈吸能','energy','immediate','single_enemy',-200);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_SHIELD_24_PAS1_1','靈魂護盾','shield','battle_start','self','HP',0.2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue,triggerChance) VALUES ('EFF_STEAL_24_PAS2_1','魂力偷取','steal_buff','on_attack','single_enemy',1,0.2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue,triggerParam) VALUES ('EFF_DISPEL_24_PAS3_1','幽冥驅散','dispel_buff','every_n_turns','all_enemies',1,'3');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue,triggerChance) VALUES ('EFF_TRANSFER_24_PAS4_1','靈體轉移','transfer_debuff','on_take_damage','single_enemy',1,0.3);

-- ────── Hero 25: 冰霜巫妖 (SR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_25_ACT_1','冰封傷害','damage','immediate','all_enemies','ATK',1.2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusDuration) VALUES ('EFF_CC_25_ACT_2','冰封冰凍','cc','immediate','all_enemies','freeze',0.35,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_25_PAS1_1','寒冰防禦','buff','always','self','def_up',0.15,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier) VALUES ('EFF_REFLECT_25_PAS1_2','寒冰反傷','reflect','always','self',0.08);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DEBUFF_25_PAS2_1','冰結減速','debuff','on_attack','single_enemy','spd_down',0.3,0.15,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusDuration,triggerParam) VALUES ('EFF_CC_25_PAS3_1','絕對零度','cc','every_n_turns','all_enemies','freeze',0.4,1,'4');
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier,triggerLimit) VALUES ('EFF_REVIVE_25_PAS4_1','冰棺復甦','revive','on_lethal','self',0.3,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_SHIELD_25_PAS4_2','冰棺護盾','shield','on_lethal','self','HP',0.2);

-- ────── Hero 26: 深淵使徒 (SR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_26_ACT_1','深淵傷害','damage','immediate','back_row_enemies','ATK',1.4);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DEBUFF_26_ACT_2','深淵降攻','debuff','immediate','back_row_enemies','atk_down',0.5,0.15,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_26_PAS1_1','深淵攻擊','buff','always','self','atk_up',0.12,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_26_PAS1_2','深淵防禦','buff','always','self','def_up',0.12,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_26_PAS2_1','虛空反擊','damage','on_dodge','single_enemy','ATK',0.6);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_26_PAS3_1','暗影追擊','chase_attack','on_ally_skill','single_enemy','ATK',0.5);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,targetHpThreshold,triggerChance) VALUES ('EFF_EXEC_26_PAS4_1','末日斬殺','execute','on_attack','single_enemy',0.18,0.25);

-- ────── Hero 27: 末日審判者 (SSR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_27_ACT_1','審判傷害','damage','immediate','single_enemy','ATK',2.5);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DEBUFF_27_ACT_2','審判降防','debuff','immediate','single_enemy','def_down',0.7,0.2,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusDuration) VALUES ('EFF_CC_27_ACT_3','審判暈眩','cc','immediate','single_enemy','stun',0.5,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_DEBUFF_27_PAS1_1','威壓降攻','debuff','battle_start','all_enemies','atk_down',0.12,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_27_PAS2_1','怒火攻擊','buff','on_ally_death','self','atk_up',0.35,99);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue) VALUES ('EFF_ENERGY_27_PAS2_2','怒火充能','energy','on_ally_death','self',500);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,targetHpThreshold,triggerChance) VALUES ('EFF_EXEC_27_PAS3_1','制裁斬殺','execute','on_attack','single_enemy',0.2,0.3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier,triggerLimit) VALUES ('EFF_REVIVE_27_PAS4_1','不滅復活','revive','on_lethal','self',0.35,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_SHIELD_27_PAS4_2','不滅護盾','shield','on_lethal','self','HP',0.25);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_27_PAS4_3','不滅免疫','buff','on_lethal','self','immunity',1,2);

-- ────── Hero 28: 瘟疫女王 (SSR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_28_ACT_1','瘟疫傷害','damage','immediate','all_enemies','ATK',1.3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,multiplier,statusDuration) VALUES ('EFF_DOT_28_ACT_2','瘟疫中毒','dot','immediate','all_enemies','dot_poison',0.5,0.03,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,multiplier,statusDuration) VALUES ('EFF_DOT_28_ACT_3','瘟疫流血','dot','immediate','all_enemies','dot_bleed',0.4,0.02,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_DEBUFF_28_PAS1_1','疫病降防','debuff','battle_start','all_enemies','def_down',0.1,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_HEAL_28_PAS2_1','毒血吸血','heal','on_attack','self','ATK',0.12);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,multiplier,statusDuration) VALUES ('EFF_DOT_28_PAS2_2','毒血施毒','dot','on_attack','single_enemy','dot_poison',0.2,0.02,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue,triggerChance) VALUES ('EFF_TRANSFER_28_PAS3_1','瘴氣轉移','transfer_debuff','turn_start','single_enemy',1,0.4);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_28_PAS4_1','突變強攻','buff','on_kill','self','atk_up',0.25,99);

-- ────── Hero 29: 虛空獵手 (SSR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_29_ACT_1','維度斬傷害','damage','immediate','all_enemies','ATK',1.5);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,flatValue) VALUES ('EFF_ENERGY_29_ACT_2','維度吸能','energy','immediate','all_enemies',-150);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_29_PAS1_1','相位閃避','buff','always','self','dodge_up',0.12,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_29_PAS1_2','相位加速','buff','always','self','spd_up',0.1,0);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,triggerChance,triggerLimit) VALUES ('EFF_EXTRA_29_PAS2_1','獵殺再動','extra_turn','on_crit','self',0.2,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DEBUFF_29_PAS3_1','虛空攻降','debuff','on_attack','single_enemy','atk_down',0.2,0.1,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusChance,statusValue,statusDuration) VALUES ('EFF_DEBUFF_29_PAS3_2','虛空速降','debuff','on_attack','single_enemy','spd_down',0.2,0.1,2);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,targetHpThreshold,triggerChance) VALUES ('EFF_EXEC_29_PAS4_1','維度斬殺','execute','on_attack','single_enemy',0.15,0.25);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier,triggerChance) VALUES ('EFF_DMG_29_PAS4_2','維度追加','damage','on_attack','single_enemy','ATK',0.3,0.3);

-- ────── Hero 30: 不朽將軍 (SSR) ──────
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_30_ACT_1','軍令攻擊','buff','immediate','all_allies','atk_up',0.25,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_30_ACT_2','軍令加速','buff','immediate','all_allies','spd_up',0.2,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_SHIELD_30_ACT_3','軍令護盾','shield','immediate','all_allies','HP',0.15);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_30_PAS1_1','鐵軍防禦','buff','battle_start','all_allies','def_up',0.15,3);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_DMG_30_PAS2_1','指揮追擊','chase_attack','on_ally_skill','single_enemy','ATK',0.6);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,status,statusValue,statusDuration) VALUES ('EFF_BUFF_30_PAS3_1','嘲諷','buff','on_be_attacked','self','taunt',1,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier) VALUES ('EFF_REFLECT_30_PAS3_2','身先反傷','reflect','on_be_attacked','self',0.12);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,multiplier,triggerLimit) VALUES ('EFF_REVIVE_30_PAS4_1','不朽復活','revive','on_lethal','self',0.4,1);
INSERT INTO effect_templates (effectId,name,category,trigger_type,target,scalingStat,multiplier) VALUES ('EFF_HEAL_30_PAS4_2','不朽回復','heal','on_lethal','all_allies','HP',0.15);


-- ╔══════════════════════════════════╗
-- ║     PART 5: skill_effects 表     ║
-- ╚══════════════════════════════════╝

-- Hero 16
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_16','EFF_DMG_16_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_16_1','EFF_DOT_16_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_16_2','EFF_BUFF_16_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_16_3','EFF_HEAL_16_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_16_4','EFF_DEBUFF_16_PAS4_1',1,1);

-- Hero 17
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_17','EFF_DMG_17_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_17_1','EFF_BUFF_17_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_17_2','EFF_REVIVE_17_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_17_3','EFF_DMG_17_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_17_4','EFF_SHIELD_17_PAS4_1',1,1);

-- Hero 18
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_18','EFF_DMG_18_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_18_1','EFF_BUFF_18_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_18_2','EFF_DMG_18_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_18_3','EFF_BUFF_18_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_18_4','EFF_EXEC_18_PAS4_1',1,1);

-- Hero 19
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_19','EFF_DMG_19_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_19','EFF_DOT_19_ACT_2',2,1,'EFF_DMG_19_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_19_1','EFF_BUFF_19_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_19_2','EFF_DOT_19_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_19_3','EFF_HEAL_19_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_19_4','EFF_CC_19_PAS4_1',1,1);

-- Hero 20
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_20','EFF_DMG_20_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_20','EFF_DEBUFF_20_ACT_2',2,1,'EFF_DMG_20_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_20_1','EFF_BUFF_20_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_20_2','EFF_REFLECT_20_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_20_3','EFF_SHIELD_20_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_20_4','EFF_REVIVE_20_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_20_4','EFF_BUFF_20_PAS4_2',2,1);

-- Hero 21
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_21','EFF_DMG_21_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_21','EFF_DOT_21_ACT_2',2,1,'EFF_DMG_21_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_21_1','EFF_BUFF_21_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_21_2','EFF_ENERGY_21_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_21_3','EFF_DMG_21_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_21_4','EFF_BUFF_21_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_21_4','EFF_BUFF_21_PAS4_2',2,1);

-- Hero 22
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_22','EFF_DMG_22_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_22','EFF_HEAL_22_ACT_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_22_1','EFF_HEAL_22_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_22_2','EFF_BUFF_22_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_22_2','EFF_BUFF_22_PAS2_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_22_3','EFF_BUFF_22_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_22_3','EFF_BUFF_22_PAS3_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_22_4','EFF_BUFF_22_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_22_4','EFF_HEAL_22_PAS4_2',2,1);

-- Hero 23
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_23','EFF_DMG_23_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_23','EFF_DOT_23_ACT_2',2,1,'EFF_DMG_23_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_23_1','EFF_BUFF_23_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_23_2','EFF_DMG_23_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_23_2','EFF_DOT_23_PAS2_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_23_3','EFF_REFLECT_23_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_23_4','EFF_BUFF_23_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_23_4','EFF_DOT_23_PAS4_2',2,1);

-- Hero 24
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_24','EFF_DMG_24_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_24','EFF_CC_24_ACT_2',2,1,'EFF_DMG_24_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_24','EFF_ENERGY_24_ACT_3',3,1,'EFF_DMG_24_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_24_1','EFF_SHIELD_24_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_24_2','EFF_STEAL_24_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_24_3','EFF_DISPEL_24_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_24_4','EFF_TRANSFER_24_PAS4_1',1,1);

-- Hero 25
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_25','EFF_DMG_25_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_25','EFF_CC_25_ACT_2',2,1,'EFF_DMG_25_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_25_1','EFF_BUFF_25_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_25_1','EFF_REFLECT_25_PAS1_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_25_2','EFF_DEBUFF_25_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_25_3','EFF_CC_25_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_25_4','EFF_REVIVE_25_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_25_4','EFF_SHIELD_25_PAS4_2',2,1);

-- Hero 26
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_26','EFF_DMG_26_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_26','EFF_DEBUFF_26_ACT_2',2,1,'EFF_DMG_26_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_26_1','EFF_BUFF_26_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_26_1','EFF_BUFF_26_PAS1_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_26_2','EFF_DMG_26_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_26_3','EFF_DMG_26_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_26_4','EFF_EXEC_26_PAS4_1',1,1);

-- Hero 27
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_27','EFF_DMG_27_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_27','EFF_DEBUFF_27_ACT_2',2,1,'EFF_DMG_27_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_27','EFF_CC_27_ACT_3',3,1,'EFF_DMG_27_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_27_1','EFF_DEBUFF_27_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_27_2','EFF_BUFF_27_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_27_2','EFF_ENERGY_27_PAS2_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_27_3','EFF_EXEC_27_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_27_4','EFF_REVIVE_27_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_27_4','EFF_SHIELD_27_PAS4_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_27_4','EFF_BUFF_27_PAS4_3',3,1);

-- Hero 28
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_28','EFF_DMG_28_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_28','EFF_DOT_28_ACT_2',2,1,'EFF_DMG_28_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel,dependsOn) VALUES ('ACT_28','EFF_DOT_28_ACT_3',3,1,'EFF_DMG_28_ACT_1');
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_28_1','EFF_DEBUFF_28_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_28_2','EFF_HEAL_28_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_28_2','EFF_DOT_28_PAS2_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_28_3','EFF_TRANSFER_28_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_28_4','EFF_BUFF_28_PAS4_1',1,1);

-- Hero 29
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_29','EFF_DMG_29_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_29','EFF_ENERGY_29_ACT_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_29_1','EFF_BUFF_29_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_29_1','EFF_BUFF_29_PAS1_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_29_2','EFF_EXTRA_29_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_29_3','EFF_DEBUFF_29_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_29_3','EFF_DEBUFF_29_PAS3_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_29_4','EFF_EXEC_29_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_29_4','EFF_DMG_29_PAS4_2',2,1);

-- Hero 30
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_30','EFF_BUFF_30_ACT_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_30','EFF_BUFF_30_ACT_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('ACT_30','EFF_SHIELD_30_ACT_3',3,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_30_1','EFF_BUFF_30_PAS1_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_30_2','EFF_DMG_30_PAS2_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_30_3','EFF_BUFF_30_PAS3_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_30_3','EFF_REFLECT_30_PAS3_2',2,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_30_4','EFF_REVIVE_30_PAS4_1',1,1);
INSERT INTO skill_effects (skillId,effectId,sortOrder,skillLevel) VALUES ('PAS_30_4','EFF_HEAL_30_PAS4_2',2,1);
