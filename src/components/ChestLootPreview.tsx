/**
 * ChestLootPreview — 寶箱可開出內容物 & 機率預覽
 *
 * 根據寶箱 ID 顯示完整獎勵表。
 * 可嵌入 ItemDetail（背包）或 ItemInfoPopup（商店/簽到預覽）。
 */

import { getChestRates } from '../domain/equipmentGacha'
import { ItemIcon } from './CurrencyIcon'

/* ────────────────────────────
   獎勵表資料定義
   ──────────────────────────── */

interface LootEntry {
  icon: React.ReactNode
  name: string
  amount: string
  /** 機率 0~1；1 = 必得 */
  chance: number
  /** 稀有度標識（用於顏色） */
  rarity?: 'N' | 'R' | 'SR' | 'SSR'
}

/** 四種寶箱的掉落表（與後端 generateChestRewards 同步） */
const CHEST_LOOT_TABLES: Record<string, LootEntry[]> = {
  chest_bronze: [
    { icon: <ItemIcon itemId="gold" />,               name: '金幣',     amount: '1,000~2,999', chance: 1 },
    { icon: <ItemIcon itemId="exp" />,                name: '經驗',     amount: '200',         chance: 0.5 },
    { icon: <ItemIcon itemId="diamond" />,            name: '鑽石',     amount: '3~7',         chance: 0.15 },
  ],
  chest_silver: [
    { icon: <ItemIcon itemId="gold" />,               name: '金幣',     amount: '3,000~6,999', chance: 1 },
    { icon: <ItemIcon itemId="diamond" />,            name: '鑽石',     amount: '10~29',       chance: 1 },
    { icon: <ItemIcon itemId="exp" />,                name: '經驗',     amount: '1,000',       chance: 0.8 },
    { icon: <ItemIcon itemId="chest_equipment" />,    name: '裝備寶箱',  amount: '×1',         chance: 0.25, rarity: 'SR' },
  ],
  chest_gold: [
    { icon: <ItemIcon itemId="gold" />,               name: '金幣',     amount: '8,000~14,999', chance: 1 },
    { icon: <ItemIcon itemId="diamond" />,            name: '鑽石',     amount: '30~79',        chance: 1 },
    { icon: <ItemIcon itemId="exp" />,                name: '經驗',     amount: '4,000',        chance: 1 },
    { icon: <ItemIcon itemId="chest_equipment" />,    name: '裝備寶箱',  amount: '×1',          chance: 0.4, rarity: 'SR' },
    { icon: <ItemIcon itemId="gacha_ticket_hero" />,  name: '英雄召喚券', amount: '×1',          chance: 0.2, rarity: 'SR' },
  ],
  chest_equipment: [], // 由下方動態建立
}

/** 機率轉百分比文字 */
function fmtChance(c: number): string {
  if (c >= 1) return '必得'
  return `${Math.round(c * 100)}%`
}

/** 機率對應顏色 */
function chanceColor(c: number): string {
  if (c >= 1) return '#51cf66'
  if (c >= 0.6) return '#94d82d'
  if (c >= 0.3) return '#ffd43b'
  return '#ff922b'
}

const RARITY_COLORS: Record<string, string> = {
  N: '#aaa', R: '#4dabf7', SR: '#da77f2', SSR: '#ffd43b',
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function ChestLootPreview({ chestId }: { chestId: string }) {
  // 裝備寶箱：動態取得機率
  if (chestId === 'chest_equipment') {
    const rates = getChestRates()
    const entries: { rarity: string; chance: number }[] = [
      { rarity: 'SSR', chance: rates.SSR },
      { rarity: 'SR',  chance: rates.SR },
      { rarity: 'R',   chance: rates.R },
      { rarity: 'N',   chance: rates.N },
    ]

    return (
      <div className="chest-loot-preview">
        <div className="chest-loot-title">📋 可開出內容</div>
        <div className="chest-loot-subtitle">隨機獲得一件裝備（武器/護甲/戒指/鞋子）</div>
        <table className="chest-loot-table">
          <thead>
            <tr>
              <th>稀有度</th>
              <th>機率</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.rarity}>
                <td>
                  <span className="chest-loot-rarity" style={{ color: RARITY_COLORS[e.rarity] }}>
                    {e.rarity === 'SSR' ? '⭐ ' : ''}{e.rarity}
                  </span>
                </td>
                <td>
                  <span className="chest-loot-chance" style={{ color: chanceColor(e.chance) }}>
                    {fmtChance(e.chance)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // 銅/銀/金寶箱
  const entries = CHEST_LOOT_TABLES[chestId]
  if (!entries || entries.length === 0) return null

  return (
    <div className="chest-loot-preview">
      <div className="chest-loot-title">📋 可開出內容</div>
      <table className="chest-loot-table">
        <thead>
          <tr>
            <th>獎勵</th>
            <th>數量</th>
            <th>機率</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td className="chest-loot-item">
                <span className="chest-loot-icon">{e.icon}</span>
                <span style={e.rarity ? { color: RARITY_COLORS[e.rarity] } : undefined}>
                  {e.name}
                </span>
              </td>
              <td className="chest-loot-amount">{e.amount}</td>
              <td>
                <span className="chest-loot-chance" style={{ color: chanceColor(e.chance) }}>
                  {fmtChance(e.chance)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
