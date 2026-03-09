/** Workers 環境綁定（Hono env 會帶這些） */
export interface Env {
  DB: D1Database;
  PUSHER_APP_ID: string;
  PUSHER_KEY: string;
  PUSHER_SECRET: string;
  PUSHER_CLUSTER: string;
}

/** Hono Variables（中介層注入到 c.var） */
export interface HonoVars {
  playerId: string;
}

// ─── DB Row Types ────────────────────────────────

export interface PlayerRow {
  playerId: string;
  guestToken: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  lastLogin: string;
  isBound: number; // 0 or 1
}

export interface SaveDataRow {
  playerId: string;
  displayName: string;
  diamond: number;
  gold: number;
  stardust: number;
  exp: number;
  resourceTimerStage: string;
  resourceTimerLastCollect: string;
  towerFloor: number;
  storyProgress: string;   // JSON
  formation: string;       // JSON
  lastSaved: string;
  gachaPity: string;       // JSON
  checkinDay: number;
  checkinLastDate: string;
  arenaChallengesLeft: number;
  arenaHighestRank: number;
  arenaLastReset: string;
  lastHeroFreePull: string;
  lastEquipFreePull: string;
  pwaRewardClaimed: number;
  dailyCounts: string;       // JSON
}

export interface HeroInstanceRow {
  instanceId: string;
  playerId: string;
  heroId: number;
  level: number;
  exp: number;
  ascension: number;
  equippedItems: string;   // JSON
  obtainedAt: string;
  stars: number;
}

export interface InventoryRow {
  id: number;
  playerId: string;
  itemId: string;
  quantity: number;
}

export interface EquipmentInstanceRow {
  equipId: string;
  playerId: string;
  templateId: string;
  setId: string;
  slot: string;
  rarity: string;
  mainStat: string;
  mainStatValue: number;
  enhanceLevel: number;
  subStats: string;       // JSON
  equippedBy: string;
  locked: number;         // 0 or 1
  obtainedAt: string;
}

export interface ItemDefinitionRow {
  itemId: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  stackable: number;
  icon: string;
  useAction: string;
}

export interface HeroRow {
  heroId: number;
  name: string;
  type: string;
  element: string;
  rarity: string;
  baseHP: number;
  baseATK: number;
  baseDEF: number;
  baseSPD: number;
  extra: string;          // JSON
}

export interface MailboxRow {
  mailId: string;
  playerId: string;
  title: string;
  body: string;
  rewards: string;        // JSON
  claimed: number;
  read: number;
  createdAt: string;
  expiresAt: string;
  deletedAt: string;
}

export interface ArenaRankingRow {
  rank: number;
  playerId: string;
  displayName: string;
  isNPC: number;          // 0 or 1
  power: number;
  defenseFormation: string; // JSON
  lastUpdated: string;
}

// ─── API request / response helpers ─────────────

export type ApiResponse<T = unknown> =
  | { success: true } & T
  | { success: false; error: string };
