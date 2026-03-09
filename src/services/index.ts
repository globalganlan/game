/**
 * Services 模組統一匯出
 */

// Sheet API
export { readSheet, listSheets, clearCache } from './sheetApi'

// 資料服務
export {
  loadRawHeroes,
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
  completeStage,
  completeTower,
  completeDaily,
  gachaPull,
  type UpgradeHeroResult,
  type AscendHeroResult,
  type StarUpResult,
  type EnhanceEquipmentResult,
  type StageCompleteResult,
} from './progressionService'

// localStorage 遷移引擎
export {
  runMigrations,
  CURRENT_SCHEMA_VERSION,
} from './localStorageMigration'

// 後端戰鬥引擎
export { runBattleRemote } from './battleService'
export type { BattleResult as RemoteBattleResult } from './battleService'
