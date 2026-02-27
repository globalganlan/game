# Fix the 3 tables that failed due to JSON escaping issues
# Uses ConvertTo-Json for proper escaping
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$API_URL = "https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec"

function Post-Sheet($jsonString) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
    $result = Invoke-RestMethod -Uri $API_URL -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -MaximumRedirection 10
    return $result
}

# ─── 1. equipment_sets (simplest, test first) ────────────
Write-Host "=== Fix: equipment_sets ===" -ForegroundColor Cyan
$esData = @(
    @{setId="berserker"; name="berserker_set"; requiredCount=2; bonusStat="ATK"; bonusValue=15; bonusType="percent"; dropSource="story_ch1"},
    @{setId="iron_wall"; name="iron_wall_set"; requiredCount=2; bonusStat="DEF"; bonusValue=20; bonusType="percent"; dropSource="story_ch2"},
    @{setId="swift"; name="swift_set"; requiredCount=2; bonusStat="SPD"; bonusValue=15; bonusType="flat"; dropSource="story_ch3"},
    @{setId="vampire"; name="vampire_set"; requiredCount=2; bonusStat="lifesteal"; bonusValue=12; bonusType="percent"; dropSource="tower"},
    @{setId="critical"; name="critical_set"; requiredCount=2; bonusStat="CritRate"; bonusValue=12; bonusType="flat"; dropSource="daily_dungeon"},
    @{setId="lethal"; name="lethal_set"; requiredCount=2; bonusStat="CritDmg"; bonusValue=25; bonusType="flat"; dropSource="daily_dungeon"},
    @{setId="vitality"; name="vitality_set"; requiredCount=2; bonusStat="HP"; bonusValue=20; bonusType="percent"; dropSource="boss"},
    @{setId="retaliate"; name="retaliate_set"; requiredCount=2; bonusStat="counter"; bonusValue=20; bonusType="chance"; dropSource="boss"}
)
$esBody = @{
    action = "createSheet"
    sheet = "equipment_sets"
    headers = @("setId","name","requiredCount","bonusStat","bonusValue","bonusType","dropSource")
    data = $esData
}
$esJson = $esBody | ConvertTo-Json -Depth 5 -Compress
try {
    $r = Post-Sheet $esJson
    if ($r.success) { Write-Host "  OK - $($r.rows) rows" -ForegroundColor Green }
    elseif ($r.error) { Write-Host "  WARN: $($r.error)" -ForegroundColor Yellow }
} catch { Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red }

# ─── 2. boss_configs ─────────────────────────────────────
Write-Host "`n=== Fix: boss_configs ===" -ForegroundColor Cyan
$bossData = @(
    @{
        bossId="BOSS_BEAST"; name="Abyss Beast"; heroId=3; hp=50000; atk=120; def=80; speed=8
        turnLimit=30; threshold_S=40000; threshold_A=25000; threshold_B=15000; threshold_C=1
        skills='[{"name":"Shadow Stomp","type":"aoe","triggerCondition":"every_N_turns","triggerValue":3},{"name":"Iron Roar","type":"buff","triggerCondition":"hp_below","triggerValue":50}]'
        staminaCost=20; rewards_exp=500; rewards_gold=2000; rewards_items="equipment_box x1, diamond x100"
    },
    @{
        bossId="BOSS_PUMPKIN"; name="Nightmare Pumpkin King"; heroId=13; hp=60000; atk=150; def=60; speed=6
        turnLimit=30; threshold_S=50000; threshold_A=35000; threshold_B=20000; threshold_C=1
        skills='[{"name":"Pumpkin Bomb","type":"aoe","triggerCondition":"every_N_turns","triggerValue":2},{"name":"Berserk","type":"buff","triggerCondition":"hp_below","triggerValue":30}]'
        staminaCost=20; rewards_exp=600; rewards_gold=2500; rewards_items="equipment_box x2, diamond x150"
    }
)
$bossBody = @{
    action = "createSheet"
    sheet = "boss_configs"
    headers = @("bossId","name","heroId","hp","atk","def","speed","turnLimit","threshold_S","threshold_A","threshold_B","threshold_C","skills","staminaCost","rewards_exp","rewards_gold","rewards_items")
    data = $bossData
}
$bossJson = $bossBody | ConvertTo-Json -Depth 5 -Compress
try {
    $r = Post-Sheet $bossJson
    if ($r.success) { Write-Host "  OK - $($r.rows) rows" -ForegroundColor Green }
    elseif ($r.error) { Write-Host "  WARN: $($r.error)" -ForegroundColor Yellow }
} catch { Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red }

# ─── 3. skill_templates ─────────────────────────────────
Write-Host "`n=== Fix: skill_templates ===" -ForegroundColor Cyan
# Build data using PowerShell objects so ConvertTo-Json handles escaping correctly
$skillData = @()

# Active skills
$skillData += @{ skillId="SKL_FLAME_BURST"; name="Flame Burst"; type="active"; element="fire"; target="all_enemies"; description="ATK x180% to all enemies, 30% burn 2 turns"; effects='[{"type":"damage","scalingStat":"ATK","multiplier":1.8},{"type":"debuff","status":"dot_burn","statusChance":0.3,"statusDuration":2,"statusValue":0.5}]'; passive_trigger=""; icon="flame_burst" }
$skillData += @{ skillId="SKL_SHADOW_STRIKE"; name="Shadow Strike"; type="active"; element="dark"; target="random_enemies_3"; description="ATK x120% hits 3 random enemies"; effects='[{"type":"damage","scalingStat":"ATK","multiplier":1.2,"hitCount":3}]'; passive_trigger=""; icon="shadow_strike" }
$skillData += @{ skillId="SKL_HEAL_WAVE"; name="Heal Wave"; type="active"; element=""; target="all_allies"; description="Heal all allies maxHP x25%"; effects='[{"type":"heal","scalingStat":"HP","multiplier":0.25}]'; passive_trigger=""; icon="heal_wave" }
$skillData += @{ skillId="SKL_FOCUS_HEAL"; name="Focus Heal"; type="active"; element=""; target="single_ally"; description="Heal single ally ATK x300%"; effects='[{"type":"heal","scalingStat":"ATK","multiplier":3.0}]'; passive_trigger=""; icon="focus_heal" }
$skillData += @{ skillId="SKL_FRONT_CRUSH"; name="Front Crush"; type="active"; element=""; target="front_row_enemies"; description="ATK x220% front row, 50% DEF -20% 2 turns"; effects='[{"type":"damage","scalingStat":"ATK","multiplier":2.2},{"type":"debuff","status":"def_down","statusChance":0.5,"statusValue":0.2,"statusDuration":2}]'; passive_trigger=""; icon="front_crush" }
$skillData += @{ skillId="SKL_BACK_SNIPE"; name="Back Snipe"; type="active"; element=""; target="back_row_enemies"; description="ATK x250% back row"; effects='[{"type":"damage","scalingStat":"ATK","multiplier":2.5}]'; passive_trigger=""; icon="back_snipe" }

# Passive skills - Hero 1
$skillData += @{ skillId="PAS_1_1"; name="Survival Will"; type="passive"; element=""; target="self"; description="Survive lethal hit with 1 HP once per battle"; effects='[{"type":"revive","multiplier":0.01}]'; passive_trigger="on_lethal"; icon="pas_survive" }
$skillData += @{ skillId="PAS_1_2"; name="Agile Movement"; type="passive"; element=""; target="self"; description="SPD +10%"; effects='[{"type":"buff","status":"spd_up","statusValue":0.1}]'; passive_trigger="always"; icon="pas_spd" }
$skillData += @{ skillId="PAS_1_3"; name="Crisis Counter"; type="passive"; element=""; target="self"; description="HP below 30%: ATK +25%"; effects='[{"type":"buff","status":"atk_up","statusValue":0.25}]'; passive_trigger="hp_below_pct"; icon="pas_atk_crisis" }
$skillData += @{ skillId="PAS_1_4"; name="Undying Obsession"; type="passive"; element=""; target="self"; description="Survival triggers 2x, heals 20% HP"; effects='[{"type":"revive","multiplier":0.2},{"type":"heal","scalingStat":"HP","multiplier":0.2}]'; passive_trigger="on_lethal"; icon="pas_undying" }

# Hero 2
$skillData += @{ skillId="PAS_2_1"; name="Rage Gene"; type="passive"; element=""; target="self"; description="HP below 30%: ATK +20%"; effects='[{"type":"buff","status":"atk_up","statusValue":0.2}]'; passive_trigger="hp_below_pct"; icon="pas_rage" }
$skillData += @{ skillId="PAS_2_2"; name="Blood Instinct"; type="passive"; element=""; target="self"; description="On kill: heal 15% maxHP"; effects='[{"type":"heal","scalingStat":"HP","multiplier":0.15}]'; passive_trigger="on_kill"; icon="pas_leech" }
$skillData += @{ skillId="PAS_2_3"; name="Power Burst"; type="passive"; element=""; target="self"; description="15% chance 150% damage"; effects='[{"type":"damage","scalingStat":"ATK","multiplier":1.5,"statusChance":0.15}]'; passive_trigger="on_attack"; icon="pas_power" }
$skillData += @{ skillId="PAS_2_4"; name="Berserk Awakening"; type="passive"; element=""; target="self"; description="HP below 15%: ATK+50% SPD+30% DEF-30%"; effects='[{"type":"buff","status":"atk_up","statusValue":0.5},{"type":"buff","status":"spd_up","statusValue":0.3},{"type":"debuff","status":"def_down","statusValue":0.3}]'; passive_trigger="hp_below_pct"; icon="pas_berserk" }

# Hero 3
$skillData += @{ skillId="PAS_3_1"; name="Thick Skin"; type="passive"; element=""; target="self"; description="Damage taken -15%"; effects='[{"type":"buff","status":"dmg_reduce","statusValue":0.15}]'; passive_trigger="always"; icon="pas_thick_skin" }
$skillData += @{ skillId="PAS_3_2"; name="Intimidate"; type="passive"; element=""; target="all_enemies"; description="All enemies ATK -8% 2 turns"; effects='[{"type":"debuff","status":"atk_down","statusValue":0.08,"statusDuration":2}]'; passive_trigger="battle_start"; icon="pas_intimidate" }
$skillData += @{ skillId="PAS_3_3"; name="Harden"; type="passive"; element=""; target="self"; description="On hit: DEF +10%, max 3 stacks"; effects='[{"type":"buff","status":"def_up","statusValue":0.1,"statusMaxStacks":3}]'; passive_trigger="on_be_attacked"; icon="pas_harden" }
$skillData += @{ skillId="PAS_3_4"; name="Iron Wall"; type="passive"; element=""; target="self"; description="HP below 50%: damage reduce doubles to 30%"; effects='[{"type":"buff","status":"dmg_reduce","statusValue":0.3}]'; passive_trigger="hp_below_pct"; icon="pas_iron_wall" }

# Hero 4
$skillData += @{ skillId="PAS_4_1"; name="Death Speed"; type="passive"; element=""; target="self"; description="On attack: SPD +2, max 3 stacks"; effects='[{"type":"buff","status":"spd_up","statusValue":2,"statusMaxStacks":3}]'; passive_trigger="on_attack"; icon="pas_death_speed" }
$skillData += @{ skillId="PAS_4_2"; name="Killing Intent"; type="passive"; element=""; target="self"; description="CritRate +15%"; effects='[{"type":"buff","status":"crit_rate_up","statusValue":0.15}]'; passive_trigger="always"; icon="pas_killing_intent" }
$skillData += @{ skillId="PAS_4_3"; name="Hunt"; type="passive"; element=""; target="self"; description="On kill: energy +300"; effects='[{"type":"energy","flatValue":300}]'; passive_trigger="on_kill"; icon="pas_hunt" }
$skillData += @{ skillId="PAS_4_4"; name="Execute"; type="passive"; element=""; target="single_enemy"; description="Target HP below 30%: damage +50%"; effects='[{"type":"damage","multiplier":1.5}]'; passive_trigger="on_attack"; icon="pas_execute" }

# Hero 5
$skillData += @{ skillId="PAS_5_1"; name="Parasite Drain"; type="passive"; element=""; target="self"; description="On attack: heal 10% of damage dealt"; effects='[{"type":"heal","multiplier":0.1}]'; passive_trigger="on_attack"; icon="pas_parasite" }
$skillData += @{ skillId="PAS_5_2"; name="Corrosive Fluid"; type="passive"; element=""; target="single_enemy"; description="20% chance DEF -15% 2 turns"; effects='[{"type":"debuff","status":"def_down","statusChance":0.2,"statusValue":0.15,"statusDuration":2}]'; passive_trigger="on_attack"; icon="pas_corrosion" }
$skillData += @{ skillId="PAS_5_3"; name="Proliferate"; type="passive"; element=""; target="self"; description="Every 3 turns: heal 15% maxHP"; effects='[{"type":"heal","scalingStat":"HP","multiplier":0.15}]'; passive_trigger="every_n_turns"; icon="pas_regen" }
$skillData += @{ skillId="PAS_5_4"; name="Full Parasite"; type="passive"; element=""; target="self"; description="Drain up to 20%, reduce target 10%"; effects='[{"type":"heal","multiplier":0.2},{"type":"debuff","statusValue":0.1}]'; passive_trigger="on_attack"; icon="pas_full_parasite" }

# Hero 6
$skillData += @{ skillId="PAS_6_1"; name="Daze"; type="passive"; element=""; target="self"; description="Battle start: random stat +10%"; effects='[{"type":"buff","statusValue":0.1}]'; passive_trigger="battle_start"; icon="pas_daze" }
$skillData += @{ skillId="PAS_6_2"; name="Adaptability"; type="passive"; element=""; target="self"; description="Every 5 turns: random stat +5%"; effects='[{"type":"buff","statusValue":0.05}]'; passive_trigger="every_n_turns"; icon="pas_adapt" }
$skillData += @{ skillId="PAS_6_3"; name="Horde Instinct"; type="passive"; element=""; target="self"; description="Per surviving ally: ATK +3%"; effects='[{"type":"buff","status":"atk_up","statusValue":0.03}]'; passive_trigger="always"; icon="pas_horde" }
$skillData += @{ skillId="PAS_6_4"; name="Evolution"; type="passive"; element=""; target="self"; description="Each turn: random stat permanent +1% cap 20%"; effects='[{"type":"buff","statusValue":0.01}]'; passive_trigger="turn_end"; icon="pas_evolve" }

# Hero 7
$skillData += @{ skillId="PAS_7_1"; name="Residual Knowledge"; type="passive"; element=""; target="all_allies"; description="Every 3 turns: team heal 10 HP"; effects='[{"type":"heal","flatValue":10}]'; passive_trigger="every_n_turns"; icon="pas_knowledge" }
$skillData += @{ skillId="PAS_7_2"; name="Knowledge Crystal"; type="passive"; element=""; target="all_allies"; description="Turn start: team energy +20"; effects='[{"type":"energy","flatValue":20}]'; passive_trigger="turn_start"; icon="pas_crystal" }
$skillData += @{ skillId="PAS_7_3"; name="Corrosive Wisdom"; type="passive"; element=""; target="single_enemy"; description="25% chance silence 1 turn"; effects='[{"type":"debuff","status":"silence","statusChance":0.25,"statusDuration":1}]'; passive_trigger="on_attack"; icon="pas_silence" }
$skillData += @{ skillId="PAS_7_4"; name="Hidden Truth"; type="passive"; element=""; target="all_allies"; description="Heal up to 8% maxHP, cleanse 1 debuff"; effects='[{"type":"heal","scalingStat":"HP","multiplier":0.08},{"type":"dispel_debuff"}]'; passive_trigger="every_n_turns"; icon="pas_truth" }

# Hero 8
$skillData += @{ skillId="PAS_8_1"; name="Pressure"; type="passive"; element=""; target="all_enemies"; description="Battle start: all enemies ATK -10% 2 turns"; effects='[{"type":"debuff","status":"atk_down","statusValue":0.1,"statusDuration":2}]'; passive_trigger="battle_start"; icon="pas_pressure" }
$skillData += @{ skillId="PAS_8_2"; name="Shadow Step"; type="passive"; element=""; target="self"; description="Dodge +10%"; effects='[{"type":"buff","status":"dodge_up","statusValue":0.1}]'; passive_trigger="always"; icon="pas_shadow_step" }
$skillData += @{ skillId="PAS_8_3"; name="Fear Spread"; type="passive"; element=""; target="all_enemies"; description="On kill: all enemies SPD -15% 1 turn"; effects='[{"type":"debuff","status":"spd_down","statusValue":0.15,"statusDuration":1}]'; passive_trigger="on_kill"; icon="pas_fear" }
$skillData += @{ skillId="PAS_8_4"; name="Night Lord"; type="passive"; element=""; target="all_enemies"; description="Pressure upgrade: ATK -15% DEF -10% 3 turns"; effects='[{"type":"debuff","status":"atk_down","statusValue":0.15,"statusDuration":3},{"type":"debuff","status":"def_down","statusValue":0.1,"statusDuration":3}]'; passive_trigger="battle_start"; icon="pas_night_lord" }

# Hero 9
$skillData += @{ skillId="PAS_9_1"; name="Survival Instinct"; type="passive"; element=""; target="self"; description="HP below 50%: SPD +3"; effects='[{"type":"buff","status":"spd_up","statusValue":3}]'; passive_trigger="hp_below_pct"; icon="pas_survival" }
$skillData += @{ skillId="PAS_9_2"; name="Tenacity"; type="passive"; element=""; target="self"; description="DEF +10%"; effects='[{"type":"buff","status":"def_up","statusValue":0.1}]'; passive_trigger="always"; icon="pas_tenacity" }
$skillData += @{ skillId="PAS_9_3"; name="Desperate"; type="passive"; element=""; target="self"; description="HP below 30%: ATK +20% CritRate +20%"; effects='[{"type":"buff","status":"atk_up","statusValue":0.2},{"type":"buff","status":"crit_rate_up","statusValue":0.2}]'; passive_trigger="hp_below_pct"; icon="pas_desperate" }
$skillData += @{ skillId="PAS_9_4"; name="Reversal"; type="passive"; element=""; target="self"; description="50% chance heal 30% HP once per battle"; effects='[{"type":"heal","scalingStat":"HP","multiplier":0.3,"statusChance":0.5}]'; passive_trigger="on_lethal"; icon="pas_reversal" }

# Hero 10
$skillData += @{ skillId="PAS_10_1"; name="Gaze"; type="passive"; element=""; target="single_enemy"; description="25% chance target SPD -3"; effects='[{"type":"debuff","status":"spd_down","statusValue":3,"statusChance":0.25}]'; passive_trigger="on_attack"; icon="pas_gaze" }
$skillData += @{ skillId="PAS_10_2"; name="Eerie Grin"; type="passive"; element=""; target="single_enemy"; description="On hit: 20% attacker ATK -10% 2 turns"; effects='[{"type":"debuff","status":"atk_down","statusValue":0.1,"statusChance":0.2,"statusDuration":2}]'; passive_trigger="on_be_attacked"; icon="pas_grin" }
$skillData += @{ skillId="PAS_10_3"; name="Nightmare"; type="passive"; element=""; target="single_enemy"; description="15% chance fear: skip next turn"; effects='[{"type":"debuff","status":"fear","statusChance":0.15,"statusDuration":1}]'; passive_trigger="on_attack"; icon="pas_nightmare" }
$skillData += @{ skillId="PAS_10_4"; name="Abyss Gaze"; type="passive"; element=""; target="single_enemy"; description="Gaze upgrade: SPD -5, 15% stun 1 turn"; effects='[{"type":"debuff","status":"spd_down","statusValue":5},{"type":"debuff","status":"stun","statusChance":0.15,"statusDuration":1}]'; passive_trigger="on_attack"; icon="pas_abyss_gaze" }

# Hero 11
$skillData += @{ skillId="PAS_11_1"; name="Mad Performance"; type="passive"; element=""; target="self"; description="Damage x0.5~1.8 random"; effects='[{"type":"damage","multiplier":0.5}]'; passive_trigger="on_attack"; icon="pas_madness" }
$skillData += @{ skillId="PAS_11_2"; name="Intermission"; type="passive"; element=""; target="single_enemy"; description="Every 2 turns: random debuff 1 turn on random enemy"; effects='[{"type":"debuff","statusDuration":1}]'; passive_trigger="every_n_turns"; icon="pas_intermission" }
$skillData += @{ skillId="PAS_11_3"; name="Encore"; type="passive"; element=""; target="self"; description="On kill: extra turn once per round"; effects='[{"type":"extra_turn"}]'; passive_trigger="on_kill"; icon="pas_encore" }
$skillData += @{ skillId="PAS_11_4"; name="Curtain Call"; type="passive"; element=""; target="self"; description="Random damage range x0.8~2.5"; effects='[{"type":"damage","multiplier":0.8}]'; passive_trigger="on_attack"; icon="pas_curtain_call" }

# Hero 12
$skillData += @{ skillId="PAS_12_1"; name="Trench Tactics"; type="passive"; element=""; target="self"; description="After taking damage: next damage -25%"; effects='[{"type":"buff","status":"dmg_reduce","statusValue":0.25,"statusDuration":1}]'; passive_trigger="on_take_damage"; icon="pas_trench" }
$skillData += @{ skillId="PAS_12_2"; name="Taunt Barrier"; type="passive"; element=""; target="self"; description="Battle start: taunt 2 turns"; effects='[{"type":"buff","status":"taunt","statusDuration":2}]'; passive_trigger="battle_start"; icon="pas_taunt" }
$skillData += @{ skillId="PAS_12_3"; name="Unyielding"; type="passive"; element=""; target="self"; description="On hit: heal 5% maxHP"; effects='[{"type":"heal","scalingStat":"HP","multiplier":0.05}]'; passive_trigger="on_take_damage"; icon="pas_unyield" }
$skillData += @{ skillId="PAS_12_4"; name="Fortification"; type="passive"; element=""; target="self"; description="Trench upgrade: -40%, reflect 10%"; effects='[{"type":"buff","status":"dmg_reduce","statusValue":0.4,"statusDuration":1},{"type":"reflect","multiplier":0.1}]'; passive_trigger="always"; icon="pas_fortress" }

# Hero 13
$skillData += @{ skillId="PAS_13_1"; name="Giant Stomp"; type="passive"; element=""; target="single_enemy"; description="30% chance extra 50% damage"; effects='[{"type":"damage","multiplier":1.5,"statusChance":0.3}]'; passive_trigger="on_attack"; icon="pas_stomp" }
$skillData += @{ skillId="PAS_13_2"; name="Stun"; type="passive"; element=""; target="single_enemy"; description="On stomp: 40% stun 1 turn"; effects='[{"type":"debuff","status":"stun","statusChance":0.4,"statusDuration":1}]'; passive_trigger="on_attack"; icon="pas_stun" }
$skillData += @{ skillId="PAS_13_3"; name="Pumpkin Feast"; type="passive"; element=""; target="self"; description="On kill: ATK +15% 2 turns"; effects='[{"type":"buff","status":"atk_up","statusValue":0.15,"statusDuration":2}]'; passive_trigger="on_kill"; icon="pas_feast" }
$skillData += @{ skillId="PAS_13_4"; name="Calamity Lord"; type="passive"; element=""; target="single_enemy"; description="Stomp 45% chance, 80% extra damage"; effects='[{"type":"damage","multiplier":1.8,"statusChance":0.45}]'; passive_trigger="on_attack"; icon="pas_calamity" }

# Hero 14
$skillData += @{ skillId="PAS_14_1"; name="Dodge Intuition"; type="passive"; element=""; target="self"; description="On hit: 20% full dodge"; effects='[{"type":"buff","status":"dodge_up","statusValue":0.2}]'; passive_trigger="on_be_attacked"; icon="pas_dodge" }
$skillData += @{ skillId="PAS_14_2"; name="Gale"; type="passive"; element=""; target="self"; description="SPD +15%"; effects='[{"type":"buff","status":"spd_up","statusValue":0.15}]'; passive_trigger="always"; icon="pas_gale" }
$skillData += @{ skillId="PAS_14_3"; name="Counter Stance"; type="passive"; element=""; target="single_enemy"; description="On dodge: 100% counter ATK x80%"; effects='[{"type":"damage","scalingStat":"ATK","multiplier":0.8}]'; passive_trigger="on_be_attacked"; icon="pas_counter" }
$skillData += @{ skillId="PAS_14_4"; name="Afterimage"; type="passive"; element=""; target="self"; description="Dodge rate up to 35%"; effects='[{"type":"buff","status":"dodge_up","statusValue":0.35}]'; passive_trigger="on_be_attacked"; icon="pas_afterimage" }

$skBody = @{
    action = "createSheet"
    sheet = "skill_templates"
    headers = @("skillId","name","type","element","target","description","effects","passive_trigger","icon")
    data = $skillData
}
$skJson = $skBody | ConvertTo-Json -Depth 5 -Compress
try {
    $r = Post-Sheet $skJson
    if ($r.success) { Write-Host "  OK - $($r.rows) rows" -ForegroundColor Green }
    elseif ($r.error) { Write-Host "  WARN: $($r.error)" -ForegroundColor Yellow }
} catch { Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red }

# ─── Final: List all sheets ──────────────────────────────
Write-Host "`n=== Final: List all sheets ===" -ForegroundColor White
$r = Post-Sheet '{"action":"listSheets"}'
$r.sheets | ForEach-Object { Write-Host "  $($_.name) ($($_.rows) rows x $($_.cols) cols)" -ForegroundColor Cyan }
Write-Host "`nDONE!" -ForegroundColor Green
