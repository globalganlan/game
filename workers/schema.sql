-- GlobalGanLan D1 Schema
-- 從 GAS + Google Sheets 遷移而來

-- ═══════════════════════════════════════════════
-- 1. players — 帳號/認證
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS players (
  playerId     TEXT PRIMARY KEY,
  guestToken   TEXT UNIQUE NOT NULL,
  email        TEXT DEFAULT '',
  passwordHash TEXT DEFAULT '',
  displayName  TEXT NOT NULL DEFAULT '倖存者',
  createdAt    TEXT NOT NULL,
  lastLogin    TEXT NOT NULL,
  isBound      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_players_guestToken ON players(guestToken);
CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);

-- ═══════════════════════════════════════════════
-- 2. save_data — 玩家存檔（一人一行）
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS save_data (
  playerId                TEXT PRIMARY KEY REFERENCES players(playerId),
  displayName             TEXT NOT NULL DEFAULT '倖存者',
  diamond                 INTEGER NOT NULL DEFAULT 0,
  gold                    INTEGER NOT NULL DEFAULT 0,
  stardust                INTEGER NOT NULL DEFAULT 0,
  exp                     INTEGER NOT NULL DEFAULT 0,
  resourceTimerStage      TEXT NOT NULL DEFAULT '1-1',
  resourceTimerLastCollect TEXT NOT NULL,
  towerFloor              INTEGER NOT NULL DEFAULT 0,
  storyProgress           TEXT NOT NULL DEFAULT '{"chapter":1,"stage":1}',
  formation               TEXT NOT NULL DEFAULT '[null,null,null,null,null,null]',
  lastSaved               TEXT NOT NULL,
  -- Gacha 欄位
  gachaPity               TEXT NOT NULL DEFAULT '{"pullsSinceLastSSR":0,"guaranteedFeatured":false}',
  lastHeroFreePull        TEXT NOT NULL DEFAULT '',
  lastEquipFreePull       TEXT NOT NULL DEFAULT '',
  -- 每日簽到
  checkinDay              INTEGER NOT NULL DEFAULT 0,
  checkinLastDate         TEXT NOT NULL DEFAULT '',
  -- 競技場
  arenaChallengesLeft     INTEGER NOT NULL DEFAULT 5,
  arenaHighestRank        INTEGER NOT NULL DEFAULT 500,
  arenaLastReset          TEXT NOT NULL DEFAULT '',
  arenaOpponents          TEXT NOT NULL DEFAULT '[]',
  arenaRefreshCount       INTEGER NOT NULL DEFAULT 0,
  -- PWA 獎勵
  pwaRewardClaimed        INTEGER NOT NULL DEFAULT 0,
  -- 改名次數（第一次免費，之後每次 200 鑽石）
  nameChangeCount         INTEGER NOT NULL DEFAULT 0,
  -- 每日次數計數 (JSON: {"daily":0,"pvp":0,"boss":0,"date":"2026-03-04"})
  dailyCounts             TEXT NOT NULL DEFAULT '{}'
);

-- ═══════════════════════════════════════════════
-- 3. hero_instances — 玩家擁有的英雄
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hero_instances (
  instanceId    TEXT PRIMARY KEY,
  playerId      TEXT NOT NULL REFERENCES players(playerId),
  heroId        INTEGER NOT NULL,
  level         INTEGER NOT NULL DEFAULT 1,
  exp           INTEGER NOT NULL DEFAULT 0,
  ascension     INTEGER NOT NULL DEFAULT 0,
  equippedItems TEXT NOT NULL DEFAULT '{}',
  obtainedAt    TEXT NOT NULL,
  stars         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hero_instances_playerId ON hero_instances(playerId);

-- ═══════════════════════════════════════════════
-- 4. inventory — 玩家道具
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  playerId  TEXT NOT NULL REFERENCES players(playerId),
  itemId    TEXT NOT NULL,
  quantity  INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL DEFAULT '',
  UNIQUE(playerId, itemId)
);

CREATE INDEX IF NOT EXISTS idx_inventory_playerId ON inventory(playerId);

-- ═══════════════════════════════════════════════
-- 5. equipment_instances — 玩家裝備
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS equipment_instances (
  equipId       TEXT PRIMARY KEY,
  playerId      TEXT NOT NULL REFERENCES players(playerId),
  templateId    TEXT NOT NULL DEFAULT '',
  setId         TEXT NOT NULL DEFAULT '',
  slot          TEXT NOT NULL DEFAULT '',
  rarity        TEXT NOT NULL DEFAULT 'N',
  mainStat      TEXT NOT NULL DEFAULT '',
  mainStatValue REAL NOT NULL DEFAULT 0,
  enhanceLevel  INTEGER NOT NULL DEFAULT 0,
  subStats      TEXT NOT NULL DEFAULT '[]',
  equippedBy    TEXT NOT NULL DEFAULT '',
  locked        INTEGER NOT NULL DEFAULT 0,
  obtainedAt    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_playerId ON equipment_instances(playerId);

-- ═══════════════════════════════════════════════
-- 6. item_definitions — 道具定義表（靜態）
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS item_definitions (
  itemId      TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT '',
  rarity      TEXT NOT NULL DEFAULT 'N',
  stackable   INTEGER NOT NULL DEFAULT 999,
  icon        TEXT NOT NULL DEFAULT '',
  useAction   TEXT NOT NULL DEFAULT ''
);

-- ═══════════════════════════════════════════════
-- 7. heroes — 英雄定義表（靜態）
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS heroes (
  heroId      INTEGER PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT '',
  rarity      TEXT NOT NULL DEFAULT 'N',
  baseHP      INTEGER NOT NULL DEFAULT 0,
  baseATK     INTEGER NOT NULL DEFAULT 0,
  baseDEF     INTEGER NOT NULL DEFAULT 0,
  baseSPD     INTEGER NOT NULL DEFAULT 0,
  modelId     TEXT NOT NULL DEFAULT '',
  critRate    REAL NOT NULL DEFAULT 5,
  critDmg     REAL NOT NULL DEFAULT 50,
  description TEXT NOT NULL DEFAULT ''
);

-- ═══════════════════════════════════════════════
-- 7b. skill_templates — 技能模板（靜態）
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS skill_templates (
  skillId         TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT '',
  target          TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  effects         TEXT NOT NULL DEFAULT '[]',
  passive_trigger TEXT NOT NULL DEFAULT '',
  icon            TEXT NOT NULL DEFAULT ''
);

-- ═══════════════════════════════════════════════
-- 7c. hero_skills — 英雄技能配置（靜態）
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hero_skills (
  heroId           INTEGER PRIMARY KEY,
  activeSkillId    TEXT NOT NULL DEFAULT '',
  passive1_skillId TEXT NOT NULL DEFAULT '',
  passive2_skillId TEXT NOT NULL DEFAULT '',
  passive3_skillId TEXT NOT NULL DEFAULT '',
  passive4_skillId TEXT NOT NULL DEFAULT ''
);

-- ═══════════════════════════════════════════════
-- 8. stage_configs — 關卡配置（靜態）
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stage_configs (
  stageId  TEXT PRIMARY KEY,
  chapter  INTEGER NOT NULL DEFAULT 1,
  stage    INTEGER NOT NULL DEFAULT 1,
  enemies  TEXT NOT NULL DEFAULT '[]',
  rewards  TEXT NOT NULL DEFAULT '{}',
  extra    TEXT NOT NULL DEFAULT '{}'
);

-- ═══════════════════════════════════════════════
-- 9. mailbox — 信件
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mailbox (
  mailId    TEXT PRIMARY KEY,
  playerId  TEXT NOT NULL,
  title     TEXT NOT NULL DEFAULT '',
  body      TEXT NOT NULL DEFAULT '',
  rewards   TEXT NOT NULL DEFAULT '[]',
  claimed   INTEGER NOT NULL DEFAULT 0,
  read      INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL DEFAULT '',
  deletedAt TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_mailbox_playerId ON mailbox(playerId);

-- ═══════════════════════════════════════════════
-- 10. arena_rankings — 競技場排名
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS arena_rankings (
  rank             INTEGER PRIMARY KEY,
  playerId         TEXT NOT NULL DEFAULT '',
  displayName      TEXT NOT NULL DEFAULT '',
  isNPC            INTEGER NOT NULL DEFAULT 1,
  power            INTEGER NOT NULL DEFAULT 0,
  defenseFormation TEXT NOT NULL DEFAULT '[]',
  lastUpdated      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_arena_playerId ON arena_rankings(playerId);


-- ═══════════════════════════════════════════════
-- 12. shop_purchases — 商店每日購買計數
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shop_purchases (
  playerId     TEXT NOT NULL,
  shopItemId   TEXT NOT NULL,
  purchaseDate TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playerId, shopItemId, purchaseDate)
);

CREATE INDEX IF NOT EXISTS idx_shop_purchases_player ON shop_purchases(playerId, purchaseDate);

-- ═══════════════════════════════════════════════
-- 13. effect_templates — 效果模板（靜態）
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS effect_templates (
  effectId        TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL,
  trigger_type    TEXT NOT NULL DEFAULT 'immediate',
  triggerParam    TEXT,
  triggerChance   REAL NOT NULL DEFAULT 1.0,
  triggerLimit    INTEGER NOT NULL DEFAULT 0,
  target          TEXT NOT NULL DEFAULT 'single_enemy',
  scalingStat     TEXT,
  multiplier      REAL,
  flatValue       REAL,
  hitCount        INTEGER,
  min             REAL,
  max             REAL,
  status          TEXT,
  statusChance    REAL,
  statusValue     REAL,
  statusDuration  INTEGER,
  statusMaxStacks INTEGER,
  targetHpThreshold REAL,
  perAlly         INTEGER NOT NULL DEFAULT 0,
  targetOverride  TEXT,
  applyTo         TEXT
);

-- ═══════════════════════════════════════════════
-- 14. skill_effects — 技能效果關聯表
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS skill_effects (
  skillId        TEXT NOT NULL,
  effectId       TEXT NOT NULL,
  sortOrder      INTEGER NOT NULL DEFAULT 0,
  overrideParams TEXT NOT NULL DEFAULT '{}',
  dependsOn      TEXT,
  skillLevel     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (skillId, effectId, skillLevel)
);
