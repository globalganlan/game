/**
 * 屬性名稱中文映射
 *
 * 所有 UI 畫面（英雄面板、裝備詳情、背包、抽卡等）統一使用，
 * 避免各檔案重複定義導致不一致。
 */

/** 屬性 key → 中文標籤 */
export const STAT_ZH: Record<string, string> = {
  HP: '生命',
  ATK: '攻擊',
  DEF: '防禦',
  SPD: '速度',
  CritRate: '暴擊率',
  CritDmg: '暴擊傷害',
  HP_percent: '生命%',
  ATK_percent: '攻擊%',
  DEF_percent: '防禦%',
}

/** 取得屬性中文名稱，找不到時回傳原始 key */
export function statZh(key: string): string {
  return STAT_ZH[key] ?? key
}

/** Buff / Debuff 狀態名稱中文映射 */
export const STATUS_ZH: Record<string, string> = {
  atk_up: '攻擊提升',
  def_up: '防禦提升',
  spd_up: '速度提升',
  crit_rate_up: '暴擊率提升',
  crit_dmg_up: '暴擊傷害提升',
  dmg_reduce: '減傷',
  shield: '護盾',
  regen: '再生',
  energy_boost: '能量提升',
  dodge_up: '閃避提升',
  reflect: '反射',
  taunt: '嘲諷',
  immunity: '免疫',
  atk_down: '攻擊降低',
  def_down: '防禦降低',
  spd_down: '速度降低',
  crit_rate_down: '暴擊率降低',
  dot_burn: '灼燒',
  dot_poison: '中毒',
  dot_bleed: '流血',
  stun: '暈眩',
  freeze: '冰凍',
  silence: '沉默',
  fear: '恐懼',
}

/** 取得狀態中文名稱，找不到時回傳原始 key */
export function statusZh(key: string): string {
  return STATUS_ZH[key] ?? key
}
