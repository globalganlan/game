-- ═══════════════════════════════════════════════════════════════
-- 全球感染 — 英雄名稱/描述改名遷移 (17 位英雄 + 技能)
-- 日期：2026-03-20
-- 原因：3D 模型外觀與原名稱不匹配，混合處理方案
-- ═══════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════╗
-- ║    PART 1: heroes 表 — 名稱/描述  ║
-- ╚══════════════════════════════════╝

-- #2 異變者 — 補充描述（模型是岩甲巨獸+青色晶體）
UPDATE heroes SET description = '受病毒深度侵蝕的岩甲巨獸，晶化突變賦予刀槍不入的外殼' WHERE heroId = 2;

-- #7 腐學者 → 屍警（模型是警察喪屍+POLICE防彈衣）
UPDATE heroes SET name = '屍警', description = '末日前的執法者，防彈衣下是早已腐爛的軀體' WHERE heroId = 7;

-- #8 夜鬼 → 怨武者（模型是日式武士喪屍+髻髮+背刀）
UPDATE heroes SET name = '怨武者', description = '戰國武士亡魂，至死不鬆手中刀，以怨念驅動腐朽身軀' WHERE heroId = 8;

-- #9 倖存者 → 噬骨者（模型是完全喪屍+暴露骷髏+發光眼）
UPDATE heroes SET name = '噬骨者', description = '失去理智的亡者，啃食一切骨肉維生' WHERE heroId = 9;

-- #13 南瓜魔 → 狂暴巨獸（模型是巨大肌肉怪獸，無南瓜元素）
UPDATE heroes SET name = '狂暴巨獸', description = '末日催生的肌肉怪物，蠻力足以撕裂鋼鐵' WHERE heroId = 13;

-- #15 瘟疫醫生 → 暗焰祭司（模型是紅袍+骷髏臉+藍色冷光）
UPDATE heroes SET name = '暗焰祭司', description = '操控暗焰的亡靈祭司，冥藍火焰燒盡一切生機' WHERE heroId = 15;

-- #16 腐蝕蟲 → 荒拳鬥士（模型是肌肉壯漢+刺青+耳環）
UPDATE heroes SET name = '荒拳鬥士', description = '末日荒野中磨練的格鬥家，鐵拳就是最強武器' WHERE heroId = 16;

-- #17 枯骨兵 → 蠕行屍（模型是無頭肉體怪物+細長四肢）
UPDATE heroes SET name = '蠕行屍', description = '失去頭顱仍蠕動前行的異變體，以血肉感知獵物' WHERE heroId = 17;

-- #19 毒蕈師 → 星蝕者（模型是藍紫色科幻外星人+霓虹電路線）
UPDATE heroes SET name = '星蝕者', description = '來自深空的異種生物，星光能量護甲覆蓋全身' WHERE heroId = 19;

-- #21 亡靈弓手 → 暗影弓手（模型是人類女弓手，非骸骨）
UPDATE heroes SET name = '暗影弓手', description = '隱匿暗處的神射手，箭矢無聲卻致命' WHERE heroId = 21;

-- #22 血族伯爵 → 魔瞳領主（模型是巨角王冠+紫袍+綠光魔眼）
UPDATE heroes SET name = '魔瞳領主', description = '以魔眼統御群魔的異界貴族，綠焰是其力量象徵' WHERE heroId = 22;

-- #23 炎魔 → 霜角魔（模型是冰藍色惡魔+彎角+蒼白膚色）
UPDATE heroes SET name = '霜角魔', description = '永凍深淵的惡魔領主，寒氣足以凍結靈魂' WHERE heroId = 23;

-- #24 魂縛者 → 鏈甲獵兵（模型是科技裝甲+六角電路紋）
UPDATE heroes SET name = '鏈甲獵兵', description = '穿戴高科技裝甲的精銳獵人，目標鎖定絕不放手' WHERE heroId = 24;

-- #25 冰霜巫妖 → 骸骨騎士（模型是黑甲戰士+骷髏肩甲+灰髮紅眼）
UPDATE heroes SET name = '骸骨騎士', description = '披掛亡者骨甲的暗黑騎士，散發不祥死亡氣息' WHERE heroId = 25;

-- #26 深淵使徒 → 老獵魔人（模型是尖耳老者+灰髮+傷疤）
UPDATE heroes SET name = '老獵魔人', description = '歷經百戰的獵魔老手，傷疤就是最好的勳章' WHERE heroId = 26;

-- #28 瘟疫女王 → 末日歌姬（模型是精緻人類女性+束腰洋裝）
UPDATE heroes SET name = '末日歌姬', description = '末日餘生的妖姬，以歌聲蠱惑人心，美貌下藏致命殺機' WHERE heroId = 28;

-- #30 不朽將軍 → 傭兵頭子（模型是叼雪茄矮胖老頭+小帽）
UPDATE heroes SET name = '傭兵頭子', description = '叼著雪茄的老兵油子，用經驗而非蠻力統領戰場' WHERE heroId = 30;


-- ╔══════════════════════════════════════════════╗
-- ║  PART 2: skill_templates — Heroes 1-14 技能   ║
-- ╚══════════════════════════════════════════════╝

-- === Hero 7 (屍警) ===
UPDATE skill_templates SET name = '殘存紀律', description = '依循執法本能，每3回合為全隊施加急救' WHERE skillId = 'PAS_7_1';
UPDATE skill_templates SET name = '命令鏈', description = '貫徹指揮系統，回合開始時全隊能量+20' WHERE skillId = 'PAS_7_2';
UPDATE skill_templates SET name = '鎮壓喝令', description = '以執法威嚴壓制目標，25%機率沉默1回合' WHERE skillId = 'PAS_7_3';
UPDATE skill_templates SET name = '最後防線', description = '每回合回復最大HP的8%，淨化1個減益' WHERE skillId = 'PAS_7_4';

-- === Hero 8 (怨武者) ===
UPDATE skill_templates SET name = '武者殺氣', description = '戰鬥開始時全體敵人ATK-10%（2回合）' WHERE skillId = 'PAS_8_1';
UPDATE skill_templates SET name = '殘影', description = '殘留的劍道記憶，閃避率+10%' WHERE skillId = 'PAS_8_2';
UPDATE skill_templates SET name = '斬殺威壓', description = '擊殺敵人時全體敵人SPD-15%（1回合）' WHERE skillId = 'PAS_8_3';
UPDATE skill_templates SET name = '武者之魂', description = '殺氣全開：ATK-15% DEF-10%（3回合）' WHERE skillId = 'PAS_8_4';

-- === Hero 9 (噬骨者) ===
UPDATE skill_templates SET name = '骨甲構造', description = '啃食骨骼構成的外殼，戰鬥開始時全隊DEF+8%（3回合）' WHERE skillId = 'PAS_9_1';
UPDATE skill_templates SET name = '啃噬再生', description = '持續啃食維生，每回合全隊回復3%最大HP' WHERE skillId = 'PAS_9_3';
UPDATE skill_templates SET name = '骨中求生', description = 'HP低於30%時50%機率回復30%HP' WHERE skillId = 'PAS_9_4';

-- === Hero 13 (狂暴巨獸) ===
UPDATE skill_templates SET name = '嗜殺狂熱', description = '擊殺敵人時ATK+25%（2回合）' WHERE skillId = 'PAS_13_3';
UPDATE skill_templates SET name = '狂暴覺醒', description = '踐踏機率提升至55%，額外傷害提升至100%' WHERE skillId = 'PAS_13_4';


-- ╔══════════════════════════════════════════════╗
-- ║  PART 3: skill_templates — Heroes 15-30 技能  ║
-- ╚══════════════════════════════════════════════╝

-- === Hero 15 (暗焰祭司) ===
UPDATE skill_templates SET name = '暗焰爆發', description = '向全體敵人釋放暗焰，造成傷害並施加灼燒與降防' WHERE skillId = 'SKL_PLAGUE_SPREAD';
UPDATE skill_templates SET name = '冥火護體', description = '暗焰包覆全身產生抗性，永久提升防禦力' WHERE skillId = 'PAS_15_1';
UPDATE skill_templates SET name = '暗焰灼蝕', description = '冥藍火焰附著在攻擊上，有機率使敵人中毒' WHERE skillId = 'PAS_15_2';
UPDATE skill_templates SET name = '冥焰淨化', description = '暗焰燒盡體內毒素，每2回合全隊回血+淨化' WHERE skillId = 'PAS_15_3';
UPDATE skill_templates SET name = '暗焰終焉', description = '暗焰的終極形態，攻擊時使敵人流血並削弱攻擊力' WHERE skillId = 'PAS_15_4';

-- === Hero 16 (荒拳鬥士) ===
UPDATE skill_templates SET name = '拳風破', description = '向全體敵人揮出暴風拳擊，造成傷害' WHERE skillId = 'ACT_16';
UPDATE skill_templates SET name = '衝擊波', description = '攻擊時有機率以拳壓產生衝擊使敵人中毒' WHERE skillId = 'PAS_16_1';
UPDATE skill_templates SET name = '鬥者之軀', description = '千錘百鍊的身軀，永久提升防禦力' WHERE skillId = 'PAS_16_2';
UPDATE skill_templates SET name = '勝者為王', description = '擊殺敵人時回復生命' WHERE skillId = 'PAS_16_3';
UPDATE skill_templates SET name = '破甲拳', description = '攻擊時有機率降低敵人防禦' WHERE skillId = 'PAS_16_4';

-- === Hero 17 (蠕行屍) ===
UPDATE skill_templates SET name = '肉觸鞭擊', description = '以血肉觸手猛擊單一敵人，造成高額傷害' WHERE skillId = 'ACT_17';
UPDATE skill_templates SET name = '異化皮膜', description = '異變肉體形成的保護膜，永久提升防禦力' WHERE skillId = 'PAS_17_1';
UPDATE skill_templates SET name = '肉刺反擊', description = '被攻擊時以體表肉刺反擊' WHERE skillId = 'PAS_17_3';
UPDATE skill_templates SET name = '血肉壁壘', description = 'HP低時以血肉構築護盾' WHERE skillId = 'PAS_17_4';

-- === Hero 19 (星蝕者) ===
UPDATE skill_templates SET name = '星能脈衝', description = '對全體敵人釋放星光能量波' WHERE skillId = 'ACT_19';
UPDATE skill_templates SET name = '能量護甲', description = '星光能量構成的護甲，永久提升防禦' WHERE skillId = 'PAS_19_1';
UPDATE skill_templates SET name = '離子灼射', description = '攻擊時施加離子灼傷（類似中毒）' WHERE skillId = 'PAS_19_2';
UPDATE skill_templates SET name = '能量共鳴', description = '每3回合以星能治療全體隊友' WHERE skillId = 'PAS_19_3';
UPDATE skill_templates SET name = '星蝕干擾', description = '施放大招時有機率以星能干擾暈眩敵人' WHERE skillId = 'PAS_19_4';

-- === Hero 21 (暗影弓手) — 保留大部分，僅調整亡靈相關 ===
UPDATE skill_templates SET name = '暗影箭雨', description = '隨機射擊3名敵人並造成流血' WHERE skillId = 'ACT_21';

-- === Hero 22 (魔瞳領主) ===
UPDATE skill_templates SET name = '魔瞳風暴', description = '以魔眼之力對全體造成傷害並汲取生命' WHERE skillId = 'ACT_22';
UPDATE skill_templates SET name = '魔力汲取', description = '攻擊時以魔眼汲取敵人生命回復自身' WHERE skillId = 'PAS_22_1';
UPDATE skill_templates SET name = '魔瞳防壁', description = 'HP低於40%時魔眼激活防禦結界+回復' WHERE skillId = 'PAS_22_2';
UPDATE skill_templates SET name = '暗能覺醒', description = '戰鬥開始時魔瞳全開，提升閃避和速度' WHERE skillId = 'PAS_22_3';
UPDATE skill_templates SET name = '魔瞳契約', description = '隊友死亡時魔瞳吸收殘餘力量，提升攻擊並回復' WHERE skillId = 'PAS_22_4';

-- === Hero 23 (霜角魔) — 火→冰主題翻轉 ===
UPDATE skill_templates SET name = '極寒吐息', description = '對全體敵人吐出極寒氣息，造成傷害並施加凍傷' WHERE skillId = 'ACT_23';
UPDATE skill_templates SET name = '寒霜之軀', description = '冰霜構成的身軀，永久提升攻擊力' WHERE skillId = 'PAS_23_1';
UPDATE skill_templates SET name = '凍氣反擊', description = '被攻擊時釋放冰寒之氣反擊並凍傷敵人' WHERE skillId = 'PAS_23_2';
UPDATE skill_templates SET name = '冰晶甲', description = '冰晶形成的護甲，永久反彈傷害' WHERE skillId = 'PAS_23_3';
UPDATE skill_templates SET name = '極寒領域', description = 'HP低於30%時進入極寒暴走狀態' WHERE skillId = 'PAS_23_4';

-- === Hero 24 (鏈甲獵兵) ===
UPDATE skill_templates SET name = '制式鎖定', description = '以裝甲武裝系統鎖定單體，造成傷害+暈眩+吸能' WHERE skillId = 'ACT_24';
UPDATE skill_templates SET name = '動力護盾', description = '戰鬥開始時啟動動力裝甲護盾' WHERE skillId = 'PAS_24_1';
UPDATE skill_templates SET name = '系統入侵', description = '攻擊時偷取敵方增益效果' WHERE skillId = 'PAS_24_2';
UPDATE skill_templates SET name = 'EMP干擾', description = '每3回合發射電磁脈衝驅散全體敵方增益' WHERE skillId = 'PAS_24_3';
UPDATE skill_templates SET name = '傷害轉移', description = '受傷時將減益效果轉移給敵人' WHERE skillId = 'PAS_24_4';

-- === Hero 25 (骸骨騎士) ===
UPDATE skill_templates SET name = '死亡俯衝', description = '以亡者之力俯衝全場，造成傷害並束縛敵人' WHERE skillId = 'ACT_25';
UPDATE skill_templates SET name = '骨甲防禦', description = '亡者骨甲永久提升防禦+反傷' WHERE skillId = 'PAS_25_1';
UPDATE skill_templates SET name = '亡者之觸', description = '攻擊時以死亡之力降低敵人速度' WHERE skillId = 'PAS_25_2';
UPDATE skill_templates SET name = '死域展開', description = '每4回合展開死亡領域束縛全體敵人' WHERE skillId = 'PAS_25_3';
UPDATE skill_templates SET name = '亡者復甦', description = '受致命傷時以亡者之力復活並獲得護盾' WHERE skillId = 'PAS_25_4';

-- === Hero 26 (老獵魔人) ===
UPDATE skill_templates SET name = '獵魔弩箭', description = '對後排發射附魔弩箭，造成傷害並削弱屬性' WHERE skillId = 'ACT_26';
UPDATE skill_templates SET name = '老練身手', description = '百戰磨練的身手，永久提升攻擊和防禦' WHERE skillId = 'PAS_26_1';
UPDATE skill_templates SET name = '閃身反擊', description = '老練地閃避後立刻反擊' WHERE skillId = 'PAS_26_2';
UPDATE skill_templates SET name = '助攻射擊', description = '隊友施放大招時配合射擊追擊' WHERE skillId = 'PAS_26_3';
UPDATE skill_templates SET name = '致命一擊', description = 'HP低於20%的目標會被直接擊殺' WHERE skillId = 'PAS_26_4';

-- === Hero 28 (末日歌姬) ===
UPDATE skill_templates SET name = '魅音風暴', description = '以致命歌聲攻擊全體，造成傷害+中毒+流血' WHERE skillId = 'ACT_28';
UPDATE skill_templates SET name = '弱化歌聲', description = '戰鬥開始時以歌聲削弱全體敵人防禦' WHERE skillId = 'PAS_28_1';
UPDATE skill_templates SET name = '魅惑之歌', description = '攻擊時以歌聲汲取生命並施加毒素' WHERE skillId = 'PAS_28_2';
UPDATE skill_templates SET name = '夢魘低語', description = '回合開始時以低語將自身減益轉移給敵人' WHERE skillId = 'PAS_28_3';
UPDATE skill_templates SET name = '瘋狂安可', description = '擊殺時觀眾瘋狂，大幅提升攻擊' WHERE skillId = 'PAS_28_4';

-- === Hero 30 (傭兵頭子) ===
UPDATE skill_templates SET name = '老大號令', description = '全體隊友增攻+加速+護盾' WHERE skillId = 'ACT_30';
UPDATE skill_templates SET name = '老兵壓陣', description = '戰鬥開始時以老兵氣場全體提升防禦' WHERE skillId = 'PAS_30_1';
UPDATE skill_templates SET name = '九死一生', description = '致命傷時憑藉豐富經驗復活+全體回復' WHERE skillId = 'PAS_30_4';

-- ═══════════════════════════════════════════════
-- 完成！共更新 17 位英雄名稱/描述 + 約 60 個技能名稱
-- ═══════════════════════════════════════════════
