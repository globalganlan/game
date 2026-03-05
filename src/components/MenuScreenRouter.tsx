/**
 * MenuScreenRouter — 主選單子畫面路由
 *
 * 根據 menuScreen 值渲染對應的面板元件。
 * 從 App.tsx 抽取，減少主元件的 JSX 體積。
 */

import type { MenuScreen, RawHeroData, SlotHero } from '../types'
import type { SkillTemplate } from '../domain'
import type { HeroSkillConfig } from '../domain'
import type { MailItem } from '../services/mailService'
import type { AcquireItem } from '../hooks/useAcquireToast'
import type { SaveData } from '../services/saveService'

import { HeroListPanel } from './HeroListPanel'
import { InventoryPanel } from './InventoryPanel'
import { GachaScreen } from './GachaScreen'
import { StageSelect } from './StageSelect'
import { SettingsPanel } from './SettingsPanel'
import { MailboxPanel } from './MailboxPanel'
import { ShopPanel } from './ShopPanel'
import { CheckinPanel } from './CheckinPanel'
import { ArenaPanel } from './ArenaPanel'
import { addHeroesLocally, getSaveState, updateProgress } from '../services/saveService'
import { addItemsLocally } from '../services/inventoryService'
import { getItemName } from '../constants/rarity'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface MenuScreenRouterProps {
  menuScreen: MenuScreen
  onBack: () => void

  /* 資料 */
  heroesList: RawHeroData[]
  saveData: SaveData | null
  heroInstances: import('../services/saveService').HeroInstance[]

  /* Skills（英雄面板需要） */
  skills: Map<string, SkillTemplate>
  heroSkills: Map<number, HeroSkillConfig>

  /* 抽卡 */
  diamond: number
  gold: number
  gachaPity: number
  onDiamondChange: (delta: number) => void
  onGoldChange: (delta: number) => void

  /* 關卡 */
  storyProgress: { chapter: number; stage: number }
  towerFloor: number
  onSelectStage: (mode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss', sid: string) => Promise<void>

  /* 設定 */
  displayName: string
  isBound: boolean
  pwaRewardClaimed: boolean
  onLogout: () => void

  /* 信箱 */
  mailItems: MailItem[]
  mailLoaded: boolean
  onMailItemsChange: (items: MailItem[]) => void
  onRefreshMail: () => Promise<void>

  /* Toast */
  showAcquire: (items: AcquireItem[]) => void

  /* 簽到 */
  onCheckin: () => Promise<import('../services/saveService').DailyCheckinResult>

  /* 競技場 */
  formation: (string | null)[]
  onArenaStartBattle: (targetRank: number, defender: { displayName: string; power: number; isNPC: boolean }) => Promise<void>
  onArenaDefenseSetup: () => Promise<void>

  /* 關卡每日次數（快取） */
  initialDailyCounts?: { daily: number; pvp: number; boss: number; date: string } | null
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function MenuScreenRouter(props: MenuScreenRouterProps) {
  const {
    menuScreen, onBack,
    heroesList, saveData, heroInstances,
    skills, heroSkills,
    diamond, gold, gachaPity,
    onDiamondChange, onGoldChange,
    storyProgress, towerFloor, onSelectStage,
    displayName, isBound, pwaRewardClaimed, onLogout,
    mailItems, mailLoaded, onMailItemsChange, onRefreshMail,
    showAcquire,
    onCheckin,
    formation, onArenaStartBattle, onArenaDefenseSetup,
    initialDailyCounts,
  } = props

  switch (menuScreen) {
    case 'heroes':
      return (
        <HeroListPanel
          heroesList={heroesList}
          heroInstances={heroInstances}
          onBack={onBack}
          skills={skills}
          heroSkills={heroSkills}
        />
      )

    case 'inventory':
      return <InventoryPanel onBack={onBack} heroesList={heroesList} heroInstances={heroInstances} />

    case 'gacha':
      return (
        <GachaScreen
          diamond={diamond}
          gold={gold}
          heroesList={heroesList}
          onBack={onBack}
          onDiamondChange={onDiamondChange}
          onGoldChange={onGoldChange}
          onPullSuccess={(newHeroes) => addHeroesLocally(newHeroes)}
          initialPity={gachaPity}
        />
      )

    case 'stages':
      return (
        <StageSelect
          storyProgress={storyProgress}
          towerFloor={towerFloor}
          onBack={onBack}
          onSelectStage={onSelectStage}
          initialDailyCounts={initialDailyCounts ?? null}
        />
      )

    case 'settings':
      return (
        <SettingsPanel
          onBack={onBack}
          onLogout={onLogout}
          displayName={displayName}
          isBound={isBound}
          onRefreshMail={onRefreshMail}
          pwaRewardClaimed={pwaRewardClaimed}
        />
      )

    case 'mailbox':
      return (
        <MailboxPanel
          onBack={onBack}
          onRewardsClaimed={(rewards) => {
            // 道具類寫入本地背包（貨幣已由 MailboxPanel 透過 applyCurrenciesFromServer 同步）
            const inventoryItems: { itemId: string; quantity: number }[] = []
            for (const r of rewards) {
              if (r.itemId !== 'diamond' && r.itemId !== 'gold' && r.itemId !== 'exp') {
                inventoryItems.push({ itemId: r.itemId, quantity: r.quantity })
              }
            }
            if (inventoryItems.length > 0) addItemsLocally(inventoryItems)
            const toastItems: AcquireItem[] = rewards.map(r => ({
              type: r.itemId === 'diamond' || r.itemId === 'gold' || r.itemId === 'exp' ? 'currency' as const : 'item' as const,
              id: r.itemId,
              name: getItemName(r.itemId),
              quantity: r.quantity,
            }))
            if (toastItems.length > 0) showAcquire(toastItems)
          }}
          mailItems={mailItems}
          mailLoaded={mailLoaded}
          onMailItemsChange={onMailItemsChange}
          onRefreshMail={onRefreshMail}
        />
      )

    case 'shop':
      return <ShopPanel onBack={onBack} />

    case 'checkin':
      return (
        <CheckinPanel
          onBack={onBack}
          saveData={saveData}
          onCheckin={onCheckin}
        />
      )

    case 'arena':
      return (
        <ArenaPanel
          onBack={onBack}
          onStartBattle={onArenaStartBattle}
          onSetupDefense={onArenaDefenseSetup}
          saveData={saveData}
          heroesList={heroesList}
          heroInstances={heroInstances}
          formation={formation}
        />
      )

    default:
      return null
  }
}
