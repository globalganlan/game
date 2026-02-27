# ═══════════════════════════════════════════════════════════
# populate_sheets.ps1 — 根據 specs 建立所有 Google Sheets 表
# 使用 JSON here-strings 避免 PS5.1 解析問題
# ═══════════════════════════════════════════════════════════
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$API_URL = "https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec"

function Post-Sheet($jsonString) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
    $result = Invoke-RestMethod -Uri $API_URL -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -MaximumRedirection 10
    return $result
}

function Safe-CreateSheet($name, $jsonString) {
    Write-Host "Creating sheet: $name ..." -ForegroundColor Cyan
    try {
        $r = Post-Sheet $jsonString
        if ($r.success) {
            Write-Host "  OK - $($r.rows) rows" -ForegroundColor Green
        } elseif ($r.error) {
            Write-Host "  WARN: $($r.error)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ─── 0. Rename ──────────────────────────────────────────
Write-Host "`n=== Step 0: Rename ===" -ForegroundColor White
try {
    $renameJson = '{"action":"renameSheet","sheet":"\u5de5\u4f5c\u88681","newName":"heroes"}'
    $r = Post-Sheet $renameJson
    Write-Host "  Renamed OK" -ForegroundColor Green
} catch {
    Write-Host "  SKIP (maybe already renamed)" -ForegroundColor Yellow
}

# ─── 1. skill_templates ─────────────────────────────────
Write-Host "`n=== Step 1: skill_templates ===" -ForegroundColor White
$skillJson = @'
{"action":"createSheet","sheet":"skill_templates","headers":["skillId","name","type","element","target","description","effects","passive_trigger","icon"],"data":[
{"skillId":"SKL_FLAME_BURST","name":"烈焰爆發","type":"active","element":"fire","target":"all_enemies","description":"對敵方全體造成 ATK×180% 傷害，30% 機率施加燃燒 2 回合","effects":"[{\"type\":\"damage\",\"scalingStat\":\"ATK\",\"multiplier\":1.8},{\"type\":\"debuff\",\"status\":\"dot_burn\",\"statusChance\":0.3,\"statusDuration\":2,\"statusValue\":0.5}]","passive_trigger":"","icon":"flame_burst"},
{"skillId":"SKL_SHADOW_STRIKE","name":"暗影連擊","type":"active","element":"dark","target":"random_enemies_3","description":"隨機攻擊 3 個敵人，每次造成 ATK×120% 傷害","effects":"[{\"type\":\"damage\",\"scalingStat\":\"ATK\",\"multiplier\":1.2,\"hitCount\":3}]","passive_trigger":"","icon":"shadow_strike"},
{"skillId":"SKL_HEAL_WAVE","name":"治癒波動","type":"active","element":"","target":"all_allies","description":"回復我方全體 max HP×25%","effects":"[{\"type\":\"heal\",\"scalingStat\":\"HP\",\"multiplier\":0.25}]","passive_trigger":"","icon":"heal_wave"},
{"skillId":"SKL_FOCUS_HEAL","name":"集中治療","type":"active","element":"","target":"single_ally","description":"回復單體隊友 ATK×300% HP","effects":"[{\"type\":\"heal\",\"scalingStat\":\"ATK\",\"multiplier\":3.0}]","passive_trigger":"","icon":"focus_heal"},
{"skillId":"SKL_FRONT_CRUSH","name":"前排碾壓","type":"active","element":"","target":"front_row_enemies","description":"對敵方前排造成 ATK×220% 傷害，50% 機率降低 DEF 20% 持續 2 回合","effects":"[{\"type\":\"damage\",\"scalingStat\":\"ATK\",\"multiplier\":2.2},{\"type\":\"debuff\",\"status\":\"def_down\",\"statusChance\":0.5,\"statusValue\":0.2,\"statusDuration\":2}]","passive_trigger":"","icon":"front_crush"},
{"skillId":"SKL_BACK_SNIPE","name":"後排狙擊","type":"active","element":"","target":"back_row_enemies","description":"對敵方後排造成 ATK×250% 傷害","effects":"[{\"type\":\"damage\",\"scalingStat\":\"ATK\",\"multiplier\":2.5}]","passive_trigger":"","icon":"back_snipe"},
{"skillId":"PAS_1_1","name":"殘存意志","type":"passive","element":"","target":"self","description":"首次致命傷保留 1 HP（每場一次）","effects":"[{\"type\":\"revive\",\"multiplier\":0.01}]","passive_trigger":"on_lethal","icon":"pas_survive"},
{"skillId":"PAS_1_2","name":"敏捷身法","type":"passive","element":"","target":"self","description":"SPD +10%","effects":"[{\"type\":\"buff\",\"status\":\"spd_up\",\"statusValue\":0.1,\"statusDuration\":0}]","passive_trigger":"always","icon":"pas_spd"},
{"skillId":"PAS_1_3","name":"逆境反擊","type":"passive","element":"","target":"self","description":"HP<30% 時 ATK +25% 持續到戰鬥結束","effects":"[{\"type\":\"buff\",\"status\":\"atk_up\",\"statusValue\":0.25,\"statusDuration\":0}]","passive_trigger":"hp_below_pct","icon":"pas_atk_crisis"},
{"skillId":"PAS_1_4","name":"不死執念","type":"passive","element":"","target":"self","description":"殘存意志可觸發 2 次 觸發時回復 20% HP","effects":"[{\"type\":\"revive\",\"multiplier\":0.2},{\"type\":\"heal\",\"scalingStat\":\"HP\",\"multiplier\":0.2}]","passive_trigger":"on_lethal","icon":"pas_undying"},
{"skillId":"PAS_2_1","name":"狂暴基因","type":"passive","element":"","target":"self","description":"HP<30% 時 ATK +20%","effects":"[{\"type\":\"buff\",\"status\":\"atk_up\",\"statusValue\":0.2,\"statusDuration\":0}]","passive_trigger":"hp_below_pct","icon":"pas_rage"},
{"skillId":"PAS_2_2","name":"嗜血本能","type":"passive","element":"","target":"self","description":"擊殺時回復 15% max HP","effects":"[{\"type\":\"heal\",\"scalingStat\":\"HP\",\"multiplier\":0.15}]","passive_trigger":"on_kill","icon":"pas_leech"},
{"skillId":"PAS_2_3","name":"力量爆發","type":"passive","element":"","target":"self","description":"15% 機率造成 150% 傷害","effects":"[{\"type\":\"damage\",\"scalingStat\":\"ATK\",\"multiplier\":1.5,\"statusChance\":0.15}]","passive_trigger":"on_attack","icon":"pas_power"},
{"skillId":"PAS_2_4","name":"狂化覺醒","type":"passive","element":"","target":"self","description":"HP<15% 時 ATK+50% SPD+30% DEF-30%","effects":"[{\"type\":\"buff\",\"status\":\"atk_up\",\"statusValue\":0.5},{\"type\":\"buff\",\"status\":\"spd_up\",\"statusValue\":0.3},{\"type\":\"debuff\",\"status\":\"def_down\",\"statusValue\":0.3}]","passive_trigger":"hp_below_pct","icon":"pas_berserk"},
{"skillId":"PAS_3_1","name":"厚皮","type":"passive","element":"","target":"self","description":"受傷減少 15%","effects":"[{\"type\":\"buff\",\"status\":\"dmg_reduce\",\"statusValue\":0.15,\"statusDuration\":0}]","passive_trigger":"always","icon":"pas_thick_skin"},
{"skillId":"PAS_3_2","name":"威嚇","type":"passive","element":"","target":"all_enemies","description":"敵方全體 ATK -8% 2 回合","effects":"[{\"type\":\"debuff\",\"status\":\"atk_down\",\"statusValue\":0.08,\"statusDuration\":2}]","passive_trigger":"battle_start","icon":"pas_intimidate"},
{"skillId":"PAS_3_3","name":"硬化","type":"passive","element":"","target":"self","description":"被攻擊後 DEF +10% 疊加 最多 3 層","effects":"[{\"type\":\"buff\",\"status\":\"def_up\",\"statusValue\":0.1,\"statusDuration\":0,\"statusMaxStacks\":3}]","passive_trigger":"on_be_attacked","icon":"pas_harden"},
{"skillId":"PAS_3_4","name":"鐵壁","type":"passive","element":"","target":"self","description":"HP<50% 時受傷減少翻倍至 30%","effects":"[{\"type\":\"buff\",\"status\":\"dmg_reduce\",\"statusValue\":0.3,\"statusDuration\":0}]","passive_trigger":"hp_below_pct","icon":"pas_iron_wall"},
{"skillId":"PAS_4_1","name":"亡者之速","type":"passive","element":"","target":"self","description":"攻擊時 SPD +2 疊加 最多 3 層","effects":"[{\"type\":\"buff\",\"status\":\"spd_up\",\"statusValue\":2,\"statusMaxStacks\":3}]","passive_trigger":"on_attack","icon":"pas_death_speed"},
{"skillId":"PAS_4_2","name":"殺意","type":"passive","element":"","target":"self","description":"CritRate +15%","effects":"[{\"type\":\"buff\",\"status\":\"crit_rate_up\",\"statusValue\":0.15,\"statusDuration\":0}]","passive_trigger":"always","icon":"pas_killing_intent"},
{"skillId":"PAS_4_3","name":"追獵","type":"passive","element":"","target":"self","description":"擊殺時能量 +300","effects":"[{\"type\":\"energy\",\"flatValue\":300}]","passive_trigger":"on_kill","icon":"pas_hunt"},
{"skillId":"PAS_4_4","name":"處決","type":"passive","element":"","target":"single_enemy","description":"目標 HP<30% 時傷害 +50%","effects":"[{\"type\":\"damage\",\"multiplier\":1.5}]","passive_trigger":"on_attack","icon":"pas_execute"},
{"skillId":"PAS_5_1","name":"寄生吸取","type":"passive","element":"","target":"self","description":"攻擊時回復造成傷害的 10%","effects":"[{\"type\":\"heal\",\"multiplier\":0.1}]","passive_trigger":"on_attack","icon":"pas_parasite"},
{"skillId":"PAS_5_2","name":"腐蝕體液","type":"passive","element":"","target":"single_enemy","description":"20% 機率 DEF -15% 2 回合","effects":"[{\"type\":\"debuff\",\"status\":\"def_down\",\"statusChance\":0.2,\"statusValue\":0.15,\"statusDuration\":2}]","passive_trigger":"on_attack","icon":"pas_corrosion"},
{"skillId":"PAS_5_3","name":"增殖","type":"passive","element":"","target":"self","description":"每 3 回合回復 15% max HP","effects":"[{\"type\":\"heal\",\"scalingStat\":\"HP\",\"multiplier\":0.15}]","passive_trigger":"every_n_turns","icon":"pas_regen"},
{"skillId":"PAS_5_4","name":"完全寄生","type":"passive","element":"","target":"self","description":"吸取提升至 20% 降低目標 10% 同屬性","effects":"[{\"type\":\"heal\",\"multiplier\":0.2},{\"type\":\"debuff\",\"statusValue\":0.1}]","passive_trigger":"on_attack","icon":"pas_full_parasite"},
{"skillId":"PAS_6_1","name":"茫然","type":"passive","element":"","target":"self","description":"戰鬥開始時隨機一項屬性 +10%","effects":"[{\"type\":\"buff\",\"statusValue\":0.1,\"statusDuration\":0}]","passive_trigger":"battle_start","icon":"pas_daze"},
{"skillId":"PAS_6_2","name":"適應力","type":"passive","element":"","target":"self","description":"每 5 回合隨機一項屬性再 +5%","effects":"[{\"type\":\"buff\",\"statusValue\":0.05,\"statusDuration\":0}]","passive_trigger":"every_n_turns","icon":"pas_adapt"},
{"skillId":"PAS_6_3","name":"群聚本能","type":"passive","element":"","target":"self","description":"每有一名存活隊友 ATK +3%","effects":"[{\"type\":\"buff\",\"status\":\"atk_up\",\"statusValue\":0.03,\"statusDuration\":0}]","passive_trigger":"always","icon":"pas_horde"},
{"skillId":"PAS_6_4","name":"進化","type":"passive","element":"","target":"self","description":"每回合隨機一項屬性永久 +1% 上限 +20%","effects":"[{\"type\":\"buff\",\"statusValue\":0.01,\"statusDuration\":0}]","passive_trigger":"turn_end","icon":"pas_evolve"},
{"skillId":"PAS_7_1","name":"殘留智識","type":"passive","element":"","target":"all_allies","description":"每 3 回合全隊回復 10 HP","effects":"[{\"type\":\"heal\",\"flatValue\":10}]","passive_trigger":"every_n_turns","icon":"pas_knowledge"},
{"skillId":"PAS_7_2","name":"知識結晶","type":"passive","element":"","target":"all_allies","description":"回合開始全隊能量 +20","effects":"[{\"type\":\"energy\",\"flatValue\":20}]","passive_trigger":"turn_start","icon":"pas_crystal"},
{"skillId":"PAS_7_3","name":"腐蝕智慧","type":"passive","element":"","target":"single_enemy","description":"25% 機率沉默目標 1 回合","effects":"[{\"type\":\"debuff\",\"status\":\"silence\",\"statusChance\":0.25,\"statusDuration\":1}]","passive_trigger":"on_attack","icon":"pas_silence"},
{"skillId":"PAS_7_4","name":"蘊藏真理","type":"passive","element":"","target":"all_allies","description":"回復量提升至 max HP 8% 淨化一個 debuff","effects":"[{\"type\":\"heal\",\"scalingStat\":\"HP\",\"multiplier\":0.08},{\"type\":\"dispel_debuff\"}]","passive_trigger":"every_n_turns","icon":"pas_truth"},
{"skillId":"PAS_8_1","name":"威壓","type":"passive","element":"","target":"all_enemies","description":"戰鬥開始敵全 ATK -10% 2 回合","effects":"[{\"type\":\"debuff\",\"status\":\"atk_down\",\"statusValue\":0.1,\"statusDuration\":2}]","passive_trigger":"battle_start","icon":"pas_pressure"},
{"skillId":"PAS_8_2","name":"暗影步","type":"passive","element":"","target":"self","description":"閃避率 +10%","effects":"[{\"type\":\"buff\",\"status\":\"dodge_up\",\"statusValue\":0.1,\"statusDuration\":0}]","passive_trigger":"always","icon":"pas_shadow_step"},
{"skillId":"PAS_8_3","name":"恐懼蔓延","type":"passive","element":"","target":"all_enemies","description":"擊殺時敵方全體 SPD -15% 1 回合","effects":"[{\"type\":\"debuff\",\"status\":\"spd_down\",\"statusValue\":0.15,\"statusDuration\":1}]","passive_trigger":"on_kill","icon":"pas_fear"},
{"skillId":"PAS_8_4","name":"夜之霸主","type":"passive","element":"","target":"all_enemies","description":"威壓升級 ATK -15% DEF -10% 3 回合","effects":"[{\"type\":\"debuff\",\"status\":\"atk_down\",\"statusValue\":0.15,\"statusDuration\":3},{\"type\":\"debuff\",\"status\":\"def_down\",\"statusValue\":0.1,\"statusDuration\":3}]","passive_trigger":"battle_start","icon":"pas_night_lord"},
{"skillId":"PAS_9_1","name":"求生本能","type":"passive","element":"","target":"self","description":"HP<50% 時 SPD +3","effects":"[{\"type\":\"buff\",\"status\":\"spd_up\",\"statusValue\":3,\"statusDuration\":0}]","passive_trigger":"hp_below_pct","icon":"pas_survival"},
{"skillId":"PAS_9_2","name":"堅韌","type":"passive","element":"","target":"self","description":"DEF +10%","effects":"[{\"type\":\"buff\",\"status\":\"def_up\",\"statusValue\":0.1,\"statusDuration\":0}]","passive_trigger":"always","icon":"pas_tenacity"},
{"skillId":"PAS_9_3","name":"破釜沉舟","type":"passive","element":"","target":"self","description":"HP<30% 時 ATK +20% CritRate +20%","effects":"[{\"type\":\"buff\",\"status\":\"atk_up\",\"statusValue\":0.2},{\"type\":\"buff\",\"status\":\"crit_rate_up\",\"statusValue\":0.2}]","passive_trigger":"hp_below_pct","icon":"pas_desperate"},
{"skillId":"PAS_9_4","name":"絕境逆轉","type":"passive","element":"","target":"self","description":"50% 機率回復 30% HP 每場一次","effects":"[{\"type\":\"heal\",\"scalingStat\":\"HP\",\"multiplier\":0.3,\"statusChance\":0.5}]","passive_trigger":"on_lethal","icon":"pas_reversal"},
{"skillId":"PAS_10_1","name":"凝視","type":"passive","element":"","target":"single_enemy","description":"25% 使目標 SPD -3","effects":"[{\"type\":\"debuff\",\"status\":\"spd_down\",\"statusValue\":3,\"statusChance\":0.25}]","passive_trigger":"on_attack","icon":"pas_gaze"},
{"skillId":"PAS_10_2","name":"詭笑","type":"passive","element":"","target":"single_enemy","description":"被攻擊時 20% 使攻擊者 ATK -10% 2 回合","effects":"[{\"type\":\"debuff\",\"status\":\"atk_down\",\"statusValue\":0.1,\"statusChance\":0.2,\"statusDuration\":2}]","passive_trigger":"on_be_attacked","icon":"pas_grin"},
{"skillId":"PAS_10_3","name":"惡夢纏繞","type":"passive","element":"","target":"single_enemy","description":"15% 機率使目標恐懼 跳過下一回合","effects":"[{\"type\":\"debuff\",\"status\":\"fear\",\"statusChance\":0.15,\"statusDuration\":1}]","passive_trigger":"on_attack","icon":"pas_nightmare"},
{"skillId":"PAS_10_4","name":"深淵注視","type":"passive","element":"","target":"single_enemy","description":"凝視升級 SPD -5 15% 暈眩 1 回合","effects":"[{\"type\":\"debuff\",\"status\":\"spd_down\",\"statusValue\":5},{\"type\":\"debuff\",\"status\":\"stun\",\"statusChance\":0.15,\"statusDuration\":1}]","passive_trigger":"on_attack","icon":"pas_abyss_gaze"},
{"skillId":"PAS_11_1","name":"瘋狂表演","type":"passive","element":"","target":"self","description":"傷害 x0.5~1.8 隨機","effects":"[{\"type\":\"damage\",\"multiplier\":0.5}]","passive_trigger":"on_attack","icon":"pas_madness"},
{"skillId":"PAS_11_2","name":"幕間","type":"passive","element":"","target":"single_enemy","description":"每 2 回合隨機對一敵施加隨機 debuff 1 回合","effects":"[{\"type\":\"debuff\",\"statusDuration\":1}]","passive_trigger":"every_n_turns","icon":"pas_intermission"},
{"skillId":"PAS_11_3","name":"安可","type":"passive","element":"","target":"self","description":"擊殺時立即再行動一次 每回合限一次","effects":"[{\"type\":\"extra_turn\"}]","passive_trigger":"on_kill","icon":"pas_encore"},
{"skillId":"PAS_11_4","name":"謝幕","type":"passive","element":"","target":"self","description":"傷害隨機範圍改為 x0.8~2.5","effects":"[{\"type\":\"damage\",\"multiplier\":0.8}]","passive_trigger":"on_attack","icon":"pas_curtain_call"},
{"skillId":"PAS_12_1","name":"壕溝戰術","type":"passive","element":"","target":"self","description":"受傷後下次受傷 -25%","effects":"[{\"type\":\"buff\",\"status\":\"dmg_reduce\",\"statusValue\":0.25,\"statusDuration\":1}]","passive_trigger":"on_take_damage","icon":"pas_trench"},
{"skillId":"PAS_12_2","name":"嘲諷壁壘","type":"passive","element":"","target":"self","description":"戰鬥開始嘲諷 2 回合","effects":"[{\"type\":\"buff\",\"status\":\"taunt\",\"statusDuration\":2}]","passive_trigger":"battle_start","icon":"pas_taunt"},
{"skillId":"PAS_12_3","name":"不屈","type":"passive","element":"","target":"self","description":"被攻擊時回復 5% max HP","effects":"[{\"type\":\"heal\",\"scalingStat\":\"HP\",\"multiplier\":0.05}]","passive_trigger":"on_take_damage","icon":"pas_unyield"},
{"skillId":"PAS_12_4","name":"要塞化","type":"passive","element":"","target":"self","description":"壕溝升級 -40% 反彈 10% 傷害","effects":"[{\"type\":\"buff\",\"status\":\"dmg_reduce\",\"statusValue\":0.4,\"statusDuration\":1},{\"type\":\"reflect\",\"multiplier\":0.1}]","passive_trigger":"always","icon":"pas_fortress"},
{"skillId":"PAS_13_1","name":"巨力踐踏","type":"passive","element":"","target":"single_enemy","description":"30% 機率額外 50% 傷害","effects":"[{\"type\":\"damage\",\"multiplier\":1.5,\"statusChance\":0.3}]","passive_trigger":"on_attack","icon":"pas_stomp"},
{"skillId":"PAS_13_2","name":"震懾","type":"passive","element":"","target":"single_enemy","description":"巨力觸發時 40% 暈眩目標 1 回合","effects":"[{\"type\":\"debuff\",\"status\":\"stun\",\"statusChance\":0.4,\"statusDuration\":1}]","passive_trigger":"on_attack","icon":"pas_stun"},
{"skillId":"PAS_13_3","name":"南瓜盛宴","type":"passive","element":"","target":"self","description":"擊殺時 ATK +15% 持續 2 回合","effects":"[{\"type\":\"buff\",\"status\":\"atk_up\",\"statusValue\":0.15,\"statusDuration\":2}]","passive_trigger":"on_kill","icon":"pas_feast"},
{"skillId":"PAS_13_4","name":"災厄之主","type":"passive","element":"","target":"single_enemy","description":"巨力機率提升至 45% 額外傷害提升至 80%","effects":"[{\"type\":\"damage\",\"multiplier\":1.8,\"statusChance\":0.45}]","passive_trigger":"on_attack","icon":"pas_calamity"},
{"skillId":"PAS_14_1","name":"閃避直覺","type":"passive","element":"","target":"self","description":"被攻擊時 20% 完全閃避","effects":"[{\"type\":\"buff\",\"status\":\"dodge_up\",\"statusValue\":0.2}]","passive_trigger":"on_be_attacked","icon":"pas_dodge"},
{"skillId":"PAS_14_2","name":"疾風","type":"passive","element":"","target":"self","description":"SPD +15%","effects":"[{\"type\":\"buff\",\"status\":\"spd_up\",\"statusValue\":0.15,\"statusDuration\":0}]","passive_trigger":"always","icon":"pas_gale"},
{"skillId":"PAS_14_3","name":"反擊姿態","type":"passive","element":"","target":"single_enemy","description":"閃避成功時 100% 反擊 ATK x80%","effects":"[{\"type\":\"damage\",\"scalingStat\":\"ATK\",\"multiplier\":0.8}]","passive_trigger":"on_be_attacked","icon":"pas_counter"},
{"skillId":"PAS_14_4","name":"殘影","type":"passive","element":"","target":"self","description":"閃避率提升至 35%","effects":"[{\"type\":\"buff\",\"status\":\"dodge_up\",\"statusValue\":0.35,\"statusDuration\":0}]","passive_trigger":"on_be_attacked","icon":"pas_afterimage"}
]}
'@
Safe-CreateSheet "skill_templates" $skillJson

# ─── 2. hero_skills ──────────────────────────────────────
Write-Host "`n=== Step 2: hero_skills ===" -ForegroundColor White
$heroSkillsJson = @'
{"action":"createSheet","sheet":"hero_skills","headers":["heroId","activeSkillId","passive1_skillId","passive2_skillId","passive3_skillId","passive4_skillId"],"data":[
{"heroId":1,"activeSkillId":"SKL_SHADOW_STRIKE","passive1_skillId":"PAS_1_1","passive2_skillId":"PAS_1_2","passive3_skillId":"PAS_1_3","passive4_skillId":"PAS_1_4"},
{"heroId":2,"activeSkillId":"SKL_FLAME_BURST","passive1_skillId":"PAS_2_1","passive2_skillId":"PAS_2_2","passive3_skillId":"PAS_2_3","passive4_skillId":"PAS_2_4"},
{"heroId":3,"activeSkillId":"SKL_FRONT_CRUSH","passive1_skillId":"PAS_3_1","passive2_skillId":"PAS_3_2","passive3_skillId":"PAS_3_3","passive4_skillId":"PAS_3_4"},
{"heroId":4,"activeSkillId":"SKL_BACK_SNIPE","passive1_skillId":"PAS_4_1","passive2_skillId":"PAS_4_2","passive3_skillId":"PAS_4_3","passive4_skillId":"PAS_4_4"},
{"heroId":5,"activeSkillId":"SKL_SHADOW_STRIKE","passive1_skillId":"PAS_5_1","passive2_skillId":"PAS_5_2","passive3_skillId":"PAS_5_3","passive4_skillId":"PAS_5_4"},
{"heroId":6,"activeSkillId":"SKL_FLAME_BURST","passive1_skillId":"PAS_6_1","passive2_skillId":"PAS_6_2","passive3_skillId":"PAS_6_3","passive4_skillId":"PAS_6_4"},
{"heroId":7,"activeSkillId":"SKL_HEAL_WAVE","passive1_skillId":"PAS_7_1","passive2_skillId":"PAS_7_2","passive3_skillId":"PAS_7_3","passive4_skillId":"PAS_7_4"},
{"heroId":8,"activeSkillId":"SKL_FRONT_CRUSH","passive1_skillId":"PAS_8_1","passive2_skillId":"PAS_8_2","passive3_skillId":"PAS_8_3","passive4_skillId":"PAS_8_4"},
{"heroId":9,"activeSkillId":"SKL_FOCUS_HEAL","passive1_skillId":"PAS_9_1","passive2_skillId":"PAS_9_2","passive3_skillId":"PAS_9_3","passive4_skillId":"PAS_9_4"},
{"heroId":10,"activeSkillId":"SKL_SHADOW_STRIKE","passive1_skillId":"PAS_10_1","passive2_skillId":"PAS_10_2","passive3_skillId":"PAS_10_3","passive4_skillId":"PAS_10_4"},
{"heroId":11,"activeSkillId":"SKL_FLAME_BURST","passive1_skillId":"PAS_11_1","passive2_skillId":"PAS_11_2","passive3_skillId":"PAS_11_3","passive4_skillId":"PAS_11_4"},
{"heroId":12,"activeSkillId":"SKL_FRONT_CRUSH","passive1_skillId":"PAS_12_1","passive2_skillId":"PAS_12_2","passive3_skillId":"PAS_12_3","passive4_skillId":"PAS_12_4"},
{"heroId":13,"activeSkillId":"SKL_FLAME_BURST","passive1_skillId":"PAS_13_1","passive2_skillId":"PAS_13_2","passive3_skillId":"PAS_13_3","passive4_skillId":"PAS_13_4"},
{"heroId":14,"activeSkillId":"SKL_BACK_SNIPE","passive1_skillId":"PAS_14_1","passive2_skillId":"PAS_14_2","passive3_skillId":"PAS_14_3","passive4_skillId":"PAS_14_4"}
]}
'@
Safe-CreateSheet "hero_skills" $heroSkillsJson

# ─── 3. element_matrix ───────────────────────────────────
Write-Host "`n=== Step 3: element_matrix ===" -ForegroundColor White
$elementJson = @'
{"action":"createSheet","sheet":"element_matrix","headers":["attacker","defender","multiplier"],"data":[
{"attacker":"fire","defender":"fire","multiplier":0.9},{"attacker":"fire","defender":"water","multiplier":0.7},{"attacker":"fire","defender":"wind","multiplier":1.3},{"attacker":"fire","defender":"thunder","multiplier":1.0},{"attacker":"fire","defender":"earth","multiplier":1.0},{"attacker":"fire","defender":"light","multiplier":1.0},{"attacker":"fire","defender":"dark","multiplier":1.0},
{"attacker":"water","defender":"fire","multiplier":1.3},{"attacker":"water","defender":"water","multiplier":0.9},{"attacker":"water","defender":"wind","multiplier":1.0},{"attacker":"water","defender":"thunder","multiplier":0.7},{"attacker":"water","defender":"earth","multiplier":1.0},{"attacker":"water","defender":"light","multiplier":1.0},{"attacker":"water","defender":"dark","multiplier":1.0},
{"attacker":"wind","defender":"fire","multiplier":0.7},{"attacker":"wind","defender":"water","multiplier":1.0},{"attacker":"wind","defender":"wind","multiplier":0.9},{"attacker":"wind","defender":"thunder","multiplier":1.0},{"attacker":"wind","defender":"earth","multiplier":1.3},{"attacker":"wind","defender":"light","multiplier":1.0},{"attacker":"wind","defender":"dark","multiplier":1.0},
{"attacker":"thunder","defender":"fire","multiplier":1.0},{"attacker":"thunder","defender":"water","multiplier":1.3},{"attacker":"thunder","defender":"wind","multiplier":1.0},{"attacker":"thunder","defender":"thunder","multiplier":0.9},{"attacker":"thunder","defender":"earth","multiplier":0.7},{"attacker":"thunder","defender":"light","multiplier":1.0},{"attacker":"thunder","defender":"dark","multiplier":1.0},
{"attacker":"earth","defender":"fire","multiplier":1.0},{"attacker":"earth","defender":"water","multiplier":1.0},{"attacker":"earth","defender":"wind","multiplier":0.7},{"attacker":"earth","defender":"thunder","multiplier":1.3},{"attacker":"earth","defender":"earth","multiplier":0.9},{"attacker":"earth","defender":"light","multiplier":1.0},{"attacker":"earth","defender":"dark","multiplier":1.0},
{"attacker":"light","defender":"fire","multiplier":1.0},{"attacker":"light","defender":"water","multiplier":1.0},{"attacker":"light","defender":"wind","multiplier":1.0},{"attacker":"light","defender":"thunder","multiplier":1.0},{"attacker":"light","defender":"earth","multiplier":1.0},{"attacker":"light","defender":"light","multiplier":0.9},{"attacker":"light","defender":"dark","multiplier":1.3},
{"attacker":"dark","defender":"fire","multiplier":1.0},{"attacker":"dark","defender":"water","multiplier":1.0},{"attacker":"dark","defender":"wind","multiplier":1.0},{"attacker":"dark","defender":"thunder","multiplier":1.0},{"attacker":"dark","defender":"earth","multiplier":1.0},{"attacker":"dark","defender":"light","multiplier":1.3},{"attacker":"dark","defender":"dark","multiplier":0.9}
]}
'@
Safe-CreateSheet "element_matrix" $elementJson

# ─── 4. stage_configs ────────────────────────────────────
Write-Host "`n=== Step 4: stage_configs ===" -ForegroundColor White
$stages = @()
$chapterConfigs = @(
    @{ ch=1; name="廢墟之城"; baseLvl=1;  hpM=1.0; atkM=1.0; baseEnemy=3 },
    @{ ch=2; name="暗夜森林"; baseLvl=10; hpM=1.5; atkM=1.3; baseEnemy=4 },
    @{ ch=3; name="死寂荒原"; baseLvl=20; hpM=2.2; atkM=1.7; baseEnemy=5 }
)
foreach ($cfg in $chapterConfigs) {
    for ($s = 1; $s -le 8; $s++) {
        $isBoss = ($s -eq 8)
        $ec = [Math]::Min(6, $cfg.baseEnemy + [Math]::Floor(($s - 1) / 2))
        if ($isBoss) { $ec = 1 }
        $recLvl = $cfg.baseLvl + ($s - 1)
        $spdM = [Math]::Round(1.0 + ($cfg.ch - 1) * 0.05, 2)
        $hpV = if ($isBoss) { [Math]::Round($cfg.hpM * 3, 2) } else { [Math]::Round($cfg.hpM + ($s - 1) * 0.1, 2) }
        $atkV = if ($isBoss) { [Math]::Round($cfg.atkM * 2, 2) } else { [Math]::Round($cfg.atkM + ($s - 1) * 0.05, 2) }
        $nm = if ($isBoss) { "$($cfg.name) Boss" } else { "$($cfg.name) $s" }
        $stages += @{
            stageId = "$($cfg.ch)-$s"; chapter = $cfg.ch; stage = $s; name = $nm
            recommendedLevel = $recLvl; staminaCost = 8; enemyCount = $ec
            enemyHpMult = $hpV; enemyAtkMult = $atkV; enemySpdMult = $spdM; isBoss = $isBoss
            rewards_exp = 50 + $cfg.ch * 20 + $s * 10; rewards_gold = 100 + $cfg.ch * 50 + $s * 20
            rewards_diamond = $(if ($isBoss) { 30 } else { 0 })
            firstClear_diamond = $(if ($isBoss) { 100 } else { 30 })
        }
    }
}
$stgHeaders = @("stageId","chapter","stage","name","recommendedLevel","staminaCost","enemyCount","enemyHpMult","enemyAtkMult","enemySpdMult","isBoss","rewards_exp","rewards_gold","rewards_diamond","firstClear_diamond")
$stgBody = @{ action = "createSheet"; sheet = "stage_configs"; headers = $stgHeaders; data = $stages }
$stgJson = $stgBody | ConvertTo-Json -Depth 5 -Compress
Safe-CreateSheet "stage_configs" $stgJson

# ─── 5. daily_dungeons ───────────────────────────────────
Write-Host "`n=== Step 5: daily_dungeons ===" -ForegroundColor White
$ddJson = @'
{"action":"createSheet","sheet":"daily_dungeons","headers":["dungeonId","name","availableDays","tier","requiredChapter","staminaCost","enemyCount","enemyHpMult","enemyAtkMult","rewards_exp","rewards_gold","rewards_items"],"data":[
{"dungeonId":"power_trial","name":"力量試煉","availableDays":"1,4","tier":"easy","requiredChapter":1,"staminaCost":15,"enemyCount":4,"enemyHpMult":1.0,"enemyAtkMult":1.0,"rewards_exp":100,"rewards_gold":200,"rewards_items":"power_stone_s x3"},
{"dungeonId":"power_trial","name":"力量試煉","availableDays":"1,4","tier":"normal","requiredChapter":2,"staminaCost":15,"enemyCount":5,"enemyHpMult":1.8,"enemyAtkMult":1.5,"rewards_exp":200,"rewards_gold":400,"rewards_items":"power_stone_m x2, power_stone_s x3"},
{"dungeonId":"power_trial","name":"力量試煉","availableDays":"1,4","tier":"hard","requiredChapter":3,"staminaCost":15,"enemyCount":6,"enemyHpMult":3.0,"enemyAtkMult":2.2,"rewards_exp":400,"rewards_gold":800,"rewards_items":"power_stone_l x1, power_stone_m x3"},
{"dungeonId":"agility_trial","name":"敏捷試煉","availableDays":"2,5","tier":"easy","requiredChapter":1,"staminaCost":15,"enemyCount":4,"enemyHpMult":1.0,"enemyAtkMult":1.0,"rewards_exp":100,"rewards_gold":200,"rewards_items":"agility_stone_s x3"},
{"dungeonId":"agility_trial","name":"敏捷試煉","availableDays":"2,5","tier":"normal","requiredChapter":2,"staminaCost":15,"enemyCount":5,"enemyHpMult":1.8,"enemyAtkMult":1.5,"rewards_exp":200,"rewards_gold":400,"rewards_items":"agility_stone_m x2, agility_stone_s x3"},
{"dungeonId":"agility_trial","name":"敏捷試煉","availableDays":"2,5","tier":"hard","requiredChapter":3,"staminaCost":15,"enemyCount":6,"enemyHpMult":3.0,"enemyAtkMult":2.2,"rewards_exp":400,"rewards_gold":800,"rewards_items":"agility_stone_l x1, agility_stone_m x3"},
{"dungeonId":"defense_trial","name":"防禦試煉","availableDays":"3,6","tier":"easy","requiredChapter":1,"staminaCost":15,"enemyCount":4,"enemyHpMult":1.0,"enemyAtkMult":1.0,"rewards_exp":100,"rewards_gold":200,"rewards_items":"defense_stone_s x3"},
{"dungeonId":"defense_trial","name":"防禦試煉","availableDays":"3,6","tier":"normal","requiredChapter":2,"staminaCost":15,"enemyCount":5,"enemyHpMult":1.8,"enemyAtkMult":1.5,"rewards_exp":200,"rewards_gold":400,"rewards_items":"defense_stone_m x2, defense_stone_s x3"},
{"dungeonId":"defense_trial","name":"防禦試煉","availableDays":"3,6","tier":"hard","requiredChapter":3,"staminaCost":15,"enemyCount":6,"enemyHpMult":3.0,"enemyAtkMult":2.2,"rewards_exp":400,"rewards_gold":800,"rewards_items":"defense_stone_l x1, defense_stone_m x3"}
]}
'@
Safe-CreateSheet "daily_dungeons" $ddJson

# ─── 6. boss_configs ─────────────────────────────────────
Write-Host "`n=== Step 6: boss_configs ===" -ForegroundColor White
$bossJson = @'
{"action":"createSheet","sheet":"boss_configs","headers":["bossId","name","heroId","hp","atk","def","speed","turnLimit","threshold_S","threshold_A","threshold_B","threshold_C","skills","staminaCost","rewards_exp","rewards_gold","rewards_items"],"data":[
{"bossId":"BOSS_BEAST","name":"深淵詭獸","heroId":3,"hp":50000,"atk":120,"def":80,"speed":8,"turnLimit":30,"threshold_S":40000,"threshold_A":25000,"threshold_B":15000,"threshold_C":1,"skills":"[{\"name\":\"暗影踐踏\",\"type\":\"aoe\",\"triggerCondition\":\"every_N_turns\",\"triggerValue\":3},{\"name\":\"鋼鐵咆哮\",\"type\":\"buff\",\"triggerCondition\":\"hp_below\",\"triggerValue\":50}]","staminaCost":20,"rewards_exp":500,"rewards_gold":2000,"rewards_items":"equipment_box x1, diamond x100"},
{"bossId":"BOSS_PUMPKIN","name":"噩夢南瓜王","heroId":13,"hp":60000,"atk":150,"def":60,"speed":6,"turnLimit":30,"threshold_S":50000,"threshold_A":35000,"threshold_B":20000,"threshold_C":1,"skills":"[{\"name\":\"南瓜炸彈\",\"type\":\"aoe\",\"triggerCondition\":\"every_N_turns\",\"triggerValue\":2},{\"name\":\"狂暴\",\"type\":\"buff\",\"triggerCondition\":\"hp_below\",\"triggerValue\":30}]","staminaCost":20,"rewards_exp":600,"rewards_gold":2500,"rewards_items":"equipment_box x2, diamond x150"}
]}
'@
Safe-CreateSheet "boss_configs" $bossJson

# ─── 7. equipment_templates ──────────────────────────────
Write-Host "`n=== Step 7: equipment_templates ===" -ForegroundColor White
$eqJson = @'
{"action":"createSheet","sheet":"equipment_templates","headers":["templateId","slot","rarity","mainStat","mainStatBase","subStatCount","enhanceMaxLevel"],"data":[
{"templateId":"EQ_WPN_N","slot":"weapon","rarity":"N","mainStat":"ATK","mainStatBase":10,"subStatCount":0,"enhanceMaxLevel":5},
{"templateId":"EQ_WPN_R","slot":"weapon","rarity":"R","mainStat":"ATK","mainStatBase":20,"subStatCount":1,"enhanceMaxLevel":10},
{"templateId":"EQ_WPN_SR","slot":"weapon","rarity":"SR","mainStat":"ATK","mainStatBase":35,"subStatCount":2,"enhanceMaxLevel":15},
{"templateId":"EQ_WPN_SSR","slot":"weapon","rarity":"SSR","mainStat":"ATK","mainStatBase":50,"subStatCount":3,"enhanceMaxLevel":20},
{"templateId":"EQ_ARM_N","slot":"armor","rarity":"N","mainStat":"HP","mainStatBase":100,"subStatCount":0,"enhanceMaxLevel":5},
{"templateId":"EQ_ARM_R","slot":"armor","rarity":"R","mainStat":"HP","mainStatBase":200,"subStatCount":1,"enhanceMaxLevel":10},
{"templateId":"EQ_ARM_SR","slot":"armor","rarity":"SR","mainStat":"HP","mainStatBase":350,"subStatCount":2,"enhanceMaxLevel":15},
{"templateId":"EQ_ARM_SSR","slot":"armor","rarity":"SSR","mainStat":"HP","mainStatBase":500,"subStatCount":3,"enhanceMaxLevel":20},
{"templateId":"EQ_RNG_N","slot":"ring","rarity":"N","mainStat":"CritRate","mainStatBase":2,"subStatCount":0,"enhanceMaxLevel":5},
{"templateId":"EQ_RNG_R","slot":"ring","rarity":"R","mainStat":"CritRate","mainStatBase":4,"subStatCount":1,"enhanceMaxLevel":10},
{"templateId":"EQ_RNG_SR","slot":"ring","rarity":"SR","mainStat":"CritRate","mainStatBase":6,"subStatCount":2,"enhanceMaxLevel":15},
{"templateId":"EQ_RNG_SSR","slot":"ring","rarity":"SSR","mainStat":"CritRate","mainStatBase":8,"subStatCount":3,"enhanceMaxLevel":20},
{"templateId":"EQ_SHO_N","slot":"shoes","rarity":"N","mainStat":"SPD","mainStatBase":2,"subStatCount":0,"enhanceMaxLevel":5},
{"templateId":"EQ_SHO_R","slot":"shoes","rarity":"R","mainStat":"SPD","mainStatBase":4,"subStatCount":1,"enhanceMaxLevel":10},
{"templateId":"EQ_SHO_SR","slot":"shoes","rarity":"SR","mainStat":"SPD","mainStatBase":6,"subStatCount":2,"enhanceMaxLevel":15},
{"templateId":"EQ_SHO_SSR","slot":"shoes","rarity":"SSR","mainStat":"SPD","mainStatBase":8,"subStatCount":3,"enhanceMaxLevel":20}
]}
'@
Safe-CreateSheet "equipment_templates" $eqJson

# ─── 8. equipment_sets ───────────────────────────────────
Write-Host "`n=== Step 8: equipment_sets ===" -ForegroundColor White
$esJson = @'
{"action":"createSheet","sheet":"equipment_sets","headers":["setId","name","requiredCount","bonusStat","bonusValue","bonusType","dropSource"],"data":[
{"setId":"berserker","name":"狂戰士","requiredCount":2,"bonusStat":"ATK","bonusValue":15,"bonusType":"percent","dropSource":"主線 Ch.1"},
{"setId":"iron_wall","name":"鐵壁","requiredCount":2,"bonusStat":"DEF","bonusValue":20,"bonusType":"percent","dropSource":"主線 Ch.2"},
{"setId":"swift","name":"疾風","requiredCount":2,"bonusStat":"SPD","bonusValue":15,"bonusType":"flat","dropSource":"主線 Ch.3"},
{"setId":"vampire","name":"吸血","requiredCount":2,"bonusStat":"lifesteal","bonusValue":12,"bonusType":"percent","dropSource":"爬塔"},
{"setId":"critical","name":"暴擊","requiredCount":2,"bonusStat":"CritRate","bonusValue":12,"bonusType":"flat","dropSource":"每日副本"},
{"setId":"lethal","name":"致命","requiredCount":2,"bonusStat":"CritDmg","bonusValue":25,"bonusType":"flat","dropSource":"每日副本"},
{"setId":"vitality","name":"生命","requiredCount":2,"bonusStat":"HP","bonusValue":20,"bonusType":"percent","dropSource":"Boss 戰"},
{"setId":"retaliate","name":"反擊","requiredCount":2,"bonusStat":"counter","bonusValue":20,"bonusType":"chance","dropSource":"Boss 戰"}
]}
'@
Safe-CreateSheet "equipment_sets" $esJson

# ─── 9. gacha_banners ────────────────────────────────────
Write-Host "`n=== Step 9: gacha_banners ===" -ForegroundColor White
$gbJson = @'
{"action":"createSheet","sheet":"gacha_banners","headers":["bannerId","name","type","featuredHeroes","rateSSR","rateSR","rateR","rateN","softPity","hardPity","softPityBoost","featured5050","guaranteedFeatured","singleCost","tenPullCost","startDate","endDate"],"data":[
{"bannerId":"BANNER_STANDARD","name":"常駐招募","type":"standard","featuredHeroes":"","rateSSR":0.015,"rateSR":0.10,"rateR":0.35,"rateN":0.535,"softPity":75,"hardPity":90,"softPityBoost":0.05,"featured5050":0,"guaranteedFeatured":false,"singleCost":160,"tenPullCost":1440,"startDate":"2026-01-01","endDate":""},
{"bannerId":"BANNER_FIRE_UP","name":"烈焰之心","type":"limited","featuredHeroes":"4,13","rateSSR":0.015,"rateSR":0.10,"rateR":0.35,"rateN":0.535,"softPity":75,"hardPity":90,"softPityBoost":0.05,"featured5050":0.5,"guaranteedFeatured":true,"singleCost":160,"tenPullCost":1440,"startDate":"2026-03-01","endDate":"2026-03-15"},
{"bannerId":"BANNER_DARK_UP","name":"暗影降臨","type":"limited","featuredHeroes":"3,8","rateSSR":0.015,"rateSR":0.10,"rateR":0.35,"rateN":0.535,"softPity":75,"hardPity":90,"softPityBoost":0.05,"featured5050":0.5,"guaranteedFeatured":true,"singleCost":160,"tenPullCost":1440,"startDate":"2026-03-16","endDate":"2026-03-31"}
]}
'@
Safe-CreateSheet "gacha_banners" $gbJson

# ─── 10. progression_config ──────────────────────────────
Write-Host "`n=== Step 10: progression_config ===" -ForegroundColor White
$pgJson = @'
{"action":"createSheet","sheet":"progression_config","headers":["configType","tier","requirement","levelCap","statBonus","materials","goldCost"],"data":[
{"configType":"ascension","tier":0,"requirement":"","levelCap":20,"statBonus":"","materials":"","goldCost":0},
{"configType":"ascension","tier":1,"requirement":"Lv20","levelCap":30,"statBonus":"全屬性+5%","materials":"碎片x5,職業石x3","goldCost":5000},
{"configType":"ascension","tier":2,"requirement":"Lv30","levelCap":40,"statBonus":"全屬性+10%","materials":"碎片x10,職業石x8","goldCost":15000},
{"configType":"ascension","tier":3,"requirement":"Lv40","levelCap":50,"statBonus":"全屬性+15%","materials":"碎片x20,職業石x15","goldCost":40000},
{"configType":"ascension","tier":4,"requirement":"Lv50","levelCap":60,"statBonus":"全屬性+20%","materials":"碎片x40,職業石x25","goldCost":80000},
{"configType":"ascension","tier":5,"requirement":"Lv60","levelCap":60,"statBonus":"全屬性+30%","materials":"碎片x60,職業石x40","goldCost":150000},
{"configType":"star","tier":1,"requirement":"初始","levelCap":"","statBonus":"被動1","materials":"","goldCost":0},
{"configType":"star","tier":2,"requirement":"碎片x10","levelCap":"","statBonus":"被動2,全屬性+5%","materials":"碎片x10","goldCost":0},
{"configType":"star","tier":3,"requirement":"碎片x20","levelCap":"","statBonus":"全屬性+10%","materials":"碎片x20","goldCost":0},
{"configType":"star","tier":4,"requirement":"碎片x40","levelCap":"","statBonus":"被動3,全屬性+15%","materials":"碎片x40","goldCost":0},
{"configType":"star","tier":5,"requirement":"碎片x80","levelCap":"","statBonus":"全屬性+20%","materials":"碎片x80","goldCost":0},
{"configType":"star","tier":6,"requirement":"碎片x160","levelCap":"","statBonus":"被動4,全屬性+30%","materials":"碎片x160","goldCost":0},
{"configType":"exp_material","tier":1,"requirement":"","levelCap":"","statBonus":"100 EXP","materials":"小型經驗核心","goldCost":0},
{"configType":"exp_material","tier":2,"requirement":"","levelCap":"","statBonus":"500 EXP","materials":"中型經驗核心","goldCost":0},
{"configType":"exp_material","tier":3,"requirement":"","levelCap":"","statBonus":"2000 EXP","materials":"大型經驗核心","goldCost":0},
{"configType":"energy","tier":0,"requirement":"","levelCap":"","statBonus":"maxEnergy=1000","materials":"onAttack=200,onBeAttacked=150,onKill=100,perTurn=50","goldCost":0},
{"configType":"gacha_dup","tier":1,"requirement":"稀有度1~2","levelCap":"","statBonus":"5 碎片","materials":"","goldCost":0},
{"configType":"gacha_dup","tier":2,"requirement":"稀有度3","levelCap":"","statBonus":"15 碎片","materials":"","goldCost":0},
{"configType":"gacha_dup","tier":3,"requirement":"稀有度4","levelCap":"","statBonus":"40 碎片","materials":"","goldCost":0},
{"configType":"stardust","tier":1,"requirement":"SSR 重複","levelCap":"","statBonus":"25 星塵","materials":"","goldCost":0},
{"configType":"stardust","tier":2,"requirement":"SR 重複","levelCap":"","statBonus":"5 星塵","materials":"","goldCost":0},
{"configType":"stardust","tier":3,"requirement":"R 重複","levelCap":"","statBonus":"1 星塵","materials":"","goldCost":0},
{"configType":"stardust","tier":4,"requirement":"N 重複","levelCap":"","statBonus":"0.2 星塵","materials":"","goldCost":0}
]}
'@
Safe-CreateSheet "progression_config" $pgJson

# ─── 11. tower_configs ────────────────────────────────────
Write-Host "`n=== Step 11: tower_configs ===" -ForegroundColor White
$towerData = @()
for ($f = 1; $f -le 50; $f++) {
    $isBoss = ($f % 10 -eq 0)
    $ec = [Math]::Min(6, 3 + [Math]::Floor($f / 5))
    if ($isBoss) { $ec = 1 }
    $hpM = [Math]::Round(1.0 + $f * 0.15, 2)
    $atkM = [Math]::Round(1.0 + $f * 0.10, 2)
    $spdM = [Math]::Round(1.0 + $f * 0.02, 2)
    if ($isBoss) { $hpM = [Math]::Round($hpM * 3, 2); $atkM = [Math]::Round($atkM * 2, 2) }
    $towerData += @{
        floor = $f; enemyCount = $ec; hpMult = $hpM; atkMult = $atkM; spdMult = $spdM
        isBoss = $isBoss; rewards_exp = 50 + $f * 10; rewards_gold = 100 + $f * 20
        rewards_diamond = $(if ($isBoss) { 50 } else { 0 })
        rewards_items = $(if ($isBoss) { "equipment_box x1" } else { "" })
    }
}
$twHeaders = @("floor","enemyCount","hpMult","atkMult","spdMult","isBoss","rewards_exp","rewards_gold","rewards_diamond","rewards_items")
$twBody = @{ action = "createSheet"; sheet = "tower_configs"; headers = $twHeaders; data = $towerData }
$twJson = $twBody | ConvertTo-Json -Depth 5 -Compress
Safe-CreateSheet "tower_configs" $twJson

# ─── Final: List all sheets ──────────────────────────────
Write-Host "`n=== Final: List all sheets ===" -ForegroundColor White
$r = Post-Sheet '{"action":"listSheets"}'
$r.sheets | ForEach-Object { Write-Host "  $($_.name) ($($_.rows) rows x $($_.cols) cols)" -ForegroundColor Cyan }

Write-Host "`n DONE! All tables created." -ForegroundColor Green
