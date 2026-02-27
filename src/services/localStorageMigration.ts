/**
 * localStorageMigration — localStorage Schema 版本遷移引擎
 *
 * 在 React 渲染前同步執行，確保 localStorage 資料結構
 * 與當前程式碼版本一致。
 *
 * 對應 Spec: specs/local-storage-migration.md v1.0
 */

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

/** 當前 schema 版本。每次 localStorage 結構 breaking change 時 +1 */
export const CURRENT_SCHEMA_VERSION = 1

const VERSION_KEY = 'globalganlan_schema_version'

/** 可遷移的 key（排除 guest_token 和 schema_version） */
const MIGRATABLE_KEYS = [
  'globalganlan_save_cache',
  'globalganlan_pending_ops',
  'globalganlan_gacha_pool',
  'globalganlan_gacha_pity',
  'globalganlan_owned_heroes',
  'globalganlan_pending_pulls',
] as const

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

/** 同步遷移函式，可拋例外 */
type MigrationFn = () => void

/* ════════════════════════════════════
   Migration 函式
   ════════════════════════════════════ */

/**
 * Version 0 → 1
 *
 * 問題：GAS 回傳的 JSON 欄位被 localStorage 存為字串（雙重序列化）。
 * 修正：對 save_cache 內的 storyProgress / formation / gachaPity
 *       以及獨立的 gacha_pity key 做 defensive parse。
 */
function migrate_0_to_1(): void {
  // ── 修正 save_cache ──
  const saveRaw = localStorage.getItem('globalganlan_save_cache')
  if (saveRaw) {
    try {
      const data = JSON.parse(saveRaw)
      let dirty = false

      if (data?.save) {
        // storyProgress
        if (typeof data.save.storyProgress === 'string') {
          try {
            data.save.storyProgress = JSON.parse(data.save.storyProgress)
          } catch {
            data.save.storyProgress = { chapter: 1, stage: 1 }
          }
          dirty = true
        }
        if (!data.save.storyProgress || typeof data.save.storyProgress !== 'object') {
          data.save.storyProgress = { chapter: 1, stage: 1 }
          dirty = true
        }

        // formation
        if (typeof data.save.formation === 'string') {
          try {
            data.save.formation = JSON.parse(data.save.formation)
          } catch {
            data.save.formation = [null, null, null, null, null, null]
          }
          dirty = true
        }
        if (!Array.isArray(data.save.formation)) {
          data.save.formation = [null, null, null, null, null, null]
          dirty = true
        }

        // gachaPity
        if (typeof data.save.gachaPity === 'string') {
          try {
            data.save.gachaPity = JSON.parse(data.save.gachaPity)
          } catch {
            data.save.gachaPity = { pullsSinceLastSSR: 0, guaranteedFeatured: false }
          }
          dirty = true
        }
        if (data.save.gachaPity && typeof data.save.gachaPity !== 'object') {
          data.save.gachaPity = { pullsSinceLastSSR: 0, guaranteedFeatured: false }
          dirty = true
        }
      }

      if (dirty) {
        localStorage.setItem('globalganlan_save_cache', JSON.stringify(data))
      }
    } catch {
      // save_cache 格式不合法 → 直接刪除，登入會重載
      localStorage.removeItem('globalganlan_save_cache')
    }
  }

  // ── 修正獨立的 gacha_pity ──
  const pityRaw = localStorage.getItem('globalganlan_gacha_pity')
  if (pityRaw) {
    try {
      let pity = JSON.parse(pityRaw)
      // 如果 parse 出來還是 string → 再 parse 一次
      if (typeof pity === 'string') {
        pity = JSON.parse(pity)
      }
      // 驗證結構
      if (
        typeof pity !== 'object' || pity === null ||
        typeof pity.pullsSinceLastSSR !== 'number' ||
        typeof pity.guaranteedFeatured !== 'boolean'
      ) {
        pity = { pullsSinceLastSSR: 0, guaranteedFeatured: false }
      }
      // 範圍修正：pullsSinceLastSSR 不應超過 90（硬保底上限）
      if (pity.pullsSinceLastSSR < 0 || pity.pullsSinceLastSSR > 90) {
        pity.pullsSinceLastSSR = 0
      }
      localStorage.setItem('globalganlan_gacha_pity', JSON.stringify(pity))
    } catch {
      localStorage.removeItem('globalganlan_gacha_pity')
    }
  }

  console.log('[migration] 0 → 1 完成：defensive parse localStorage JSON 欄位')
}

/* ════════════════════════════════════
   Migration 登記表
   ════════════════════════════════════ */

/**
 * key = fromVersion, value = 遷移到 fromVersion + 1 的函式。
 * 新增 breaking change 時在這裡註冊。
 */
const MIGRATIONS: Record<number, MigrationFn> = {
  0: migrate_0_to_1,
  // 未來: 1: migrate_1_to_2, ...
}

/* ════════════════════════════════════
   核心引擎
   ════════════════════════════════════ */

/** 清除所有可遷移 key（保留 guest_token + version） */
function nukeMigratableKeys(): void {
  for (const key of MIGRATABLE_KEYS) {
    localStorage.removeItem(key)
  }
  console.warn('[migration] 已清除所有可遷移的 localStorage key（安全降級）')
}

/**
 * 執行 localStorage 遷移（同步、阻塞）。
 * 必須在 React 渲染前呼叫。
 */
export function runMigrations(): void {
  try {
    const stored = localStorage.getItem(VERSION_KEY)
    let currentVersion = stored !== null ? parseInt(stored, 10) : 0
    if (isNaN(currentVersion) || currentVersion < 0) currentVersion = 0

    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      // 已是最新版本，無需遷移
      return
    }

    console.log(
      `[migration] localStorage schema: v${currentVersion} → v${CURRENT_SCHEMA_VERSION}`,
    )

    // 逐版遷移
    while (currentVersion < CURRENT_SCHEMA_VERSION) {
      const migrationFn = MIGRATIONS[currentVersion]
      if (!migrationFn) {
        // 缺少遷移函式 → 安全降級
        console.error(
          `[migration] 缺少 migrate_${currentVersion}_to_${currentVersion + 1}，執行安全降級`,
        )
        nukeMigratableKeys()
        break
      }

      try {
        migrationFn()
        currentVersion++
      } catch (err) {
        console.error(
          `[migration] migrate_${currentVersion}_to_${currentVersion + 1} 失敗：`,
          err,
        )
        nukeMigratableKeys()
        currentVersion = CURRENT_SCHEMA_VERSION // 跳到最新版避免重跑
        break
      }
    }

    // 寫入最新版本號
    localStorage.setItem(VERSION_KEY, String(CURRENT_SCHEMA_VERSION))
    console.log(`[migration] 完成，schema version = ${CURRENT_SCHEMA_VERSION}`)
  } catch (err) {
    // localStorage 完全不可用 → 忽略，後續服務會各自 catch
    console.error('[migration] localStorage 無法存取:', err)
  }
}
