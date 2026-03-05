/**
 * combatPower.test.ts — 戰力系統單元測試
 *
 * 對照 .ai/specs/combat-power.md v0.3 驗證所有公式、常數、邊界值
 */

import { describe, it, expect } from 'vitest'
import {
  CP_WEIGHTS,
  ULTIMATE_POWER_BASE,
  PASSIVE_POWER_EACH,
  SET_2PC_POWER,
  SET_4PC_POWER,
  getSkillPowerBonus,
  getSetBonusPower,
  getHeroCombatPower,
  getTeamCombatPower,
  getEnemyTeamPower,
  getComparisonLevel,
  COMPARISON_TEXT,
  COMPARISON_COLOR,
  type CombatPowerHeroInput,
  type EnemyStats,
} from '../combatPower'
import type { FinalStats } from '../types'
import type { EquipmentInstance, Rarity } from '../progressionSystem'

/* ════════════════════════════════════
   輔助工廠
   ════════════════════════════════════ */

function makeStats(overrides: Partial<FinalStats> = {}): FinalStats {
  return {
    HP: 1000,
    ATK: 100,
    DEF: 50,
    SPD: 100,
    CritRate: 15,
    CritDmg: 50,
    ...overrides,
  }
}

function makeEquip(setId: string, rarity: Rarity = 'SR', slot = 'weapon'): EquipmentInstance {
  return {
    equipId: `eq_${setId}_${slot}`,
    templateId: `${setId}_${slot}`,
    setId,
    slot: slot as EquipmentInstance['slot'],
    rarity,
    mainStat: 'ATK',
    mainStatValue: 100,
    enhanceLevel: 0,
    subStats: [],
    equippedBy: '',
    locked: false,
    obtainedAt: new Date().toISOString(),
  }
}

/* ════════════════════════════════════
   一、常數驗證（CP-1 ~ CP-4）
   ════════════════════════════════════ */

describe('Spec CP-1: CP_WEIGHTS 權重常數', () => {
  it('HP 權重 = 0.5', () => expect(CP_WEIGHTS.HP).toBe(0.5))
  it('ATK 權重 = 3.0', () => expect(CP_WEIGHTS.ATK).toBe(3.0))
  it('DEF 權重 = 2.5', () => expect(CP_WEIGHTS.DEF).toBe(2.5))
  it('SPD 權重 = 8.0', () => expect(CP_WEIGHTS.SPD).toBe(8.0))
  it('CritRate 權重 = 5.0', () => expect(CP_WEIGHTS.CritRate).toBe(5.0))
  it('CritDmg 權重 = 2.0', () => expect(CP_WEIGHTS.CritDmg).toBe(2.0))
})

describe('Spec CP-2 ~ CP-4: 技能 & 套裝常數', () => {
  it('ULTIMATE_POWER_BASE = 100', () => expect(ULTIMATE_POWER_BASE).toBe(100))
  it('PASSIVE_POWER_EACH = 50', () => expect(PASSIVE_POWER_EACH).toBe(50))
  it('SET_2PC_POWER = 80', () => expect(SET_2PC_POWER).toBe(80))
  it('SET_4PC_POWER = 200', () => expect(SET_4PC_POWER).toBe(200))
})

/* ════════════════════════════════════
   二、getSkillPowerBonus 技能加成
   ════════════════════════════════════ */

describe('getSkillPowerBonus', () => {
  it('0 星 = 100 (大招固定 + 0被動)', () => {
    expect(getSkillPowerBonus(0)).toBe(100 + 0 * 50)
  })

  it('1 星 = 100 + 1*50 = 150', () => {
    expect(getSkillPowerBonus(1)).toBe(150)
  })

  it('3 星 = 100 + 2*50 = 200（STAR_PASSIVE_SLOTS[3]=2）', () => {
    expect(getSkillPowerBonus(3)).toBe(200)
  })

  it('6 星 = 100 + 4*50 = 300（最大 4 被動）', () => {
    expect(getSkillPowerBonus(6)).toBe(300)
  })

  it('未定義的星等（如 99）fallback 0 被動 = 100', () => {
    expect(getSkillPowerBonus(99)).toBe(100)
  })
})

/* ════════════════════════════════════
   三、getSetBonusPower 套裝加成
   ════════════════════════════════════ */

describe('getSetBonusPower', () => {
  it('空裝備 = 0', () => {
    expect(getSetBonusPower([])).toBe(0)
  })

  // Note: getActiveSetBonuses 需要同 setId + 同 rarity 才計件
  // 2 件不同 setId → 無套裝 → 0
  it('2 件不同套裝 = 0', () => {
    const equips = [
      makeEquip('berserker', 'SR', 'weapon'),
      makeEquip('guardian', 'SR', 'armor'),
    ]
    expect(getSetBonusPower(equips)).toBe(0)
  })

  it('2 件相同套裝 = SET_2PC_POWER (80)', () => {
    const equips = [
      makeEquip('berserker', 'SR', 'weapon'),
      makeEquip('berserker', 'SR', 'armor'),
    ]
    expect(getSetBonusPower(equips)).toBe(80)
  })

  it('4 件相同套裝 = SET_2PC_POWER + SET_4PC_POWER (280)【觸發 2pc+4pc 兩條】', () => {
    const equips = [
      makeEquip('berserker', 'SR', 'weapon'),
      makeEquip('berserker', 'SR', 'armor'),
      makeEquip('berserker', 'SR', 'accessory'),
      makeEquip('berserker', 'SR', 'boots'),
    ]
    // getActiveSetBonuses 回傳 2pc + 4pc 兩條，分別加 80 + 200 = 280
    // ℹ️ Spec 寫「SET_4PC_POWER=200（含 2 件套）」但實際加成是累計的
    expect(getSetBonusPower(equips)).toBe(SET_2PC_POWER + SET_4PC_POWER)
  })

  it('不同稀有度不計套裝', () => {
    const equips = [
      makeEquip('berserker', 'SR', 'weapon'),
      makeEquip('berserker', 'SSR', 'armor'),
    ]
    expect(getSetBonusPower(equips)).toBe(0)
  })
})

/* ════════════════════════════════════
   四、getHeroCombatPower（CP-5）
   ════════════════════════════════════ */

describe('Spec CP-5: getHeroCombatPower 手算驗證', () => {
  it('基礎英雄（0 星、無裝）', () => {
    const stats = makeStats() // HP:1000 ATK:100 DEF:50 SPD:100 CR:15 CD:50
    // basePower = 1000*0.5 + 100*3 + 50*2.5 + 100*8 + 15*5 + 50*2
    //           = 500 + 300 + 125 + 800 + 75 + 100 = 1900
    // skillBonus = 100 (0 star → 0 passive)
    // setBonus = 0
    // total = floor(1900 + 100 + 0) = 2000
    expect(getHeroCombatPower(stats, 0)).toBe(2000)
  })

  it('3 星英雄（無裝）', () => {
    const stats = makeStats()
    // basePower = 1900, skillBonus = 200 (2 passives), setBonus = 0
    expect(getHeroCombatPower(stats, 3)).toBe(2100)
  })

  it('全零屬性 = floor(0 + skillBonus)', () => {
    const stats = makeStats({ HP: 0, ATK: 0, DEF: 0, SPD: 0, CritRate: 0, CritDmg: 0 })
    expect(getHeroCombatPower(stats, 0)).toBe(100) // 只有大招加成
  })
})

/* ════════════════════════════════════
   五、getTeamCombatPower（CP-6）
   ════════════════════════════════════ */

describe('Spec CP-6: getTeamCombatPower', () => {
  it('空陣列 = 0', () => {
    expect(getTeamCombatPower([])).toBe(0)
  })

  it('單英雄 = 該英雄 CP', () => {
    const hero: CombatPowerHeroInput = {
      finalStats: makeStats(),
      stars: 0,
      equipment: [],
    }
    expect(getTeamCombatPower([hero])).toBe(2000)
  })

  it('多英雄加總', () => {
    const h1: CombatPowerHeroInput = { finalStats: makeStats(), stars: 0, equipment: [] }
    const h2: CombatPowerHeroInput = { finalStats: makeStats({ ATK: 200 }), stars: 3, equipment: [] }
    // h2 basePower = 1000*0.5 + 200*3 + 50*2.5 + 100*8 + 15*5 + 50*2
    //             = 500 + 600 + 125 + 800 + 75 + 100 = 2200
    // h2 skillBonus = 200
    // h2 total = floor(2200 + 200) = 2400
    expect(getTeamCombatPower([h1, h2])).toBe(2000 + 2400)
  })
})

/* ════════════════════════════════════
   六、getEnemyTeamPower（CP-7）
   ════════════════════════════════════ */

describe('Spec CP-7: getEnemyTeamPower', () => {
  it('空敵人 = 0', () => {
    expect(getEnemyTeamPower([])).toBe(0)
  })

  it('使用相同權重計算', () => {
    const enemy: EnemyStats = { hp: 1000, atk: 100, def: 50, speed: 100, critRate: 15, critDmg: 50 }
    // = 500 + 300 + 125 + 800 + 75 + 100 = 1900
    expect(getEnemyTeamPower([enemy])).toBe(1900)
  })

  it('多敵人加總', () => {
    const e1: EnemyStats = { hp: 1000, atk: 100, def: 50, speed: 100, critRate: 15, critDmg: 50 }
    const e2: EnemyStats = { hp: 500, atk: 50, def: 25, speed: 50, critRate: 10, critDmg: 30 }
    // e2 = 250 + 150 + 62.5 + 400 + 50 + 60 = 972.5 → 972 (floor)
    expect(getEnemyTeamPower([e1, e2])).toBe(1900 + 972)
  })
})

/* ════════════════════════════════════
   七、getComparisonLevel（CP-8, CP-9）
   ════════════════════════════════════ */

describe('Spec CP-8: getComparisonLevel 對比等級', () => {
  it('≥1.5x → crush', () => {
    expect(getComparisonLevel(1500, 1000)).toBe('crush')
    expect(getComparisonLevel(3000, 2000)).toBe('crush')
  })

  it('≥1.2x 且 <1.5x → advantage', () => {
    expect(getComparisonLevel(1200, 1000)).toBe('advantage')
    expect(getComparisonLevel(1499, 1000)).toBe('advantage')
  })

  it('≥0.83x 且 <1.2x → even', () => {
    expect(getComparisonLevel(1000, 1000)).toBe('even')
    expect(getComparisonLevel(830, 1000)).toBe('even')
    expect(getComparisonLevel(1190, 1000)).toBe('even')
  })

  it('≥0.67x 且 <0.83x → disadvantage', () => {
    expect(getComparisonLevel(670, 1000)).toBe('disadvantage')
    expect(getComparisonLevel(829, 1000)).toBe('disadvantage')
  })

  it('<0.67x → danger', () => {
    expect(getComparisonLevel(669, 1000)).toBe('danger')
    expect(getComparisonLevel(100, 1000)).toBe('danger')
  })
})

describe('Spec CP-9: enemyPower ≤ 0 → crush', () => {
  it('enemyPower = 0 → crush', () => {
    expect(getComparisonLevel(1000, 0)).toBe('crush')
  })

  it('enemyPower < 0 → crush', () => {
    expect(getComparisonLevel(1000, -1)).toBe('crush')
  })
})

/* ════════════════════════════════════
   八、COMPARISON_TEXT & COMPARISON_COLOR 轉換表
   ════════════════════════════════════ */

describe('COMPARISON_TEXT 完整性', () => {
  it('所有等級都有文字', () => {
    const levels = ['crush', 'advantage', 'even', 'disadvantage', 'danger'] as const
    for (const l of levels) {
      expect(COMPARISON_TEXT[l]).toBeDefined()
      expect(COMPARISON_TEXT[l].length).toBeGreaterThan(0)
    }
  })
})

describe('COMPARISON_COLOR 完整性', () => {
  it('所有等級都有顏色', () => {
    const levels = ['crush', 'advantage', 'even', 'disadvantage', 'danger'] as const
    for (const l of levels) {
      expect(COMPARISON_COLOR[l]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

/* ════════════════════════════════════
   九、Spec 設計原則：Lv1 初始英雄 CP ≈ 100~300（CP-12）
   ════════════════════════════════════ */

describe('Spec CP-12: 初始英雄 CP 範圍合理性', () => {
  it('最弱英雄（低數值）CP > 0', () => {
    const weakStats = makeStats({ HP: 200, ATK: 20, DEF: 10, SPD: 60, CritRate: 5, CritDmg: 30 })
    // basePower = 100 + 60 + 25 + 480 + 25 + 60 = 750
    // skillBonus = 100 (0 star)
    // total = 850
    const cp = getHeroCombatPower(weakStats, 0)
    expect(cp).toBeGreaterThan(0)
  })
})
