/**
 * Services 模組統一匯出
 */

// Sheet API
export { readSheet, listSheets, clearCache } from './sheetApi'

// 資料服務
export {
  loadHeroes,
  loadSkillTemplates,
  loadHeroSkills,
  loadElements,
  loadAllGameData,
  getHeroSkillSet,
  clearGameDataCache,
  toElement,
} from './dataService'

// 認證服務
export {
  autoLogin,
  loginWithEmail,
  bindAccount,
  changeName,
  logout,
  getAuthState,
  onAuthChange,
  type AuthState,
} from './authService'

// 存檔服務
export {
  loadSave,
  getSaveState,
  onSaveChange,
  updateProgress,
  updateStoryProgress,
  saveFormation,
  addHero,
  collectResources,
  flushPendingChanges,
  getTimerYield,
  getAccumulatedResources,
  clearLocalSaveCache,
  type SaveData,
  type HeroInstance,
  type InventoryItem,
  type PlayerData,
  type AccumulatedResources,
  type ResourceTimerYield,
} from './saveService'

// 背包服務
export {
  loadItemDefinitions,
  getItemDefinition,
  loadInventory,
  addItems,
  removeItems,
  sellItems,
  useItem,
  equipItem,
  unequipItem,
  lockEquipment,
  expandInventory,
  getItemQuantity,
  getHeroEquipment,
  getUnequippedEquipment,
  filterItemsByCategory,
  onInventoryChange,
  getInventoryState,
  type ItemCategory,
  type ItemDefinition,
  type InventoryState,
} from './inventoryService'

// 養成服務
export {
  upgradeHero,
  ascendHero,
  starUpHero,
  enhanceEquipment,
  forgeEquipment,
  dismantleEquipment,
  completeStage,
  completeTower,
  completeDaily,
  gachaPull,
  getGachaPoolStatus,
  type UpgradeHeroResult,
  type AscendHeroResult,
  type StarUpResult,
  type EnhanceEquipmentResult,
  type ForgeResult,
  type StageCompleteResult,
} from './progressionService'

// 樂觀更新佇列
export {
  fireOptimistic,
  fireOptimisticAsync,
  generateOpId,
  reconcilePendingOps,
  getPendingOps,
  hasPendingOps,
  clearPendingOps,
  onQueueChange,
  getInflightCount,
  type PendingOp,
} from './optimisticQueue'

// localStorage 遷移引擎
export {
  runMigrations,
  CURRENT_SCHEMA_VERSION,
} from './localStorageMigration'

// 本地抽卡池
export {
  initLocalPool,
  localPull,
  getPoolRemaining,
  getPityState,
  getOwnedHeroIds,
  onPoolChange,
  clearLocalPool,
  tryRestoreFromStorage,
  type PoolEntry,
  type LocalPullResult,
  type LocalPullResponse,
} from './gachaLocalPool'

// 後端戰鬥引擎
export { runBattleRemote } from './battleService'
export type { BattleResult as RemoteBattleResult } from './battleService'
