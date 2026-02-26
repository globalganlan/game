# 抽卡系統 Spec

> 版本：v0.1 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

定義英雄招募（抽卡/Gacha）的機率、保底機制、卡池類型與經濟成本。

## 依賴

- `specs/hero-schema.md` — Rarity 列舉、HeroTemplate

## 介面契約

```typescript
interface GachaBanner {
  id: string;
  name: string;                      // "焰之意志"
  type: 'standard' | 'limited' | 'element';
  featuredHeroes: string[];          // hero_id[]（UP 角色）
  startDate: string;                 // ISO date
  endDate?: string;                  // 常駐池無結束
  rateTable: RateTable;
  pityCounter: PityConfig;
}

interface RateTable {
  SSR: number;    // 0.015 = 1.5%
  SR: number;     // 0.10  = 10%
  R: number;      // 0.35  = 35%
  N: number;      // 0.535 = 53.5%
}

interface PityConfig {
  softPity: number;     // 75（從第 75 抽起 SSR 機率遞增）
  hardPity: number;     // 90（第 90 抽保底 SSR）
  softPityBoost: number; // 每抽增加的 SSR 機率（+5%）
  featured5050: number;  // UP 角色的機率（0.5 = 50/50）
  guaranteedFeatured: boolean; // 歪一次後下次保底 UP
}

interface GachaPull {
  heroId: string;
  rarity: Rarity;
  isNew: boolean;        // 首次獲得
  isFeatured: boolean;   // 是否 UP 角色
}
```

## 詳細規格

### 基礎機率
| 稀有度 | 機率 |
|--------|------|
| SSR | 1.5% |
| SR | 10% |
| R | 35% |
| N | 53.5% |

### 保底機制
- **軟保底**：第 75 抽起，每抽 SSR 機率 +5%（第 75 抽 = 6.5%, 第 76 = 11.5%...）
- **硬保底**：第 90 抽必出 SSR
- **UP 保底**：SSR 有 50% 機率為 UP 角色；若本次不是 UP，下次 SSR 必為 UP
- **保底計數器跨 banner 繼承**（限定池獨立計算）

### 抽卡成本
| 操作 | 消耗 |
|------|------|
| 單抽 | 160 鑽石 |
| 十連 | 1,440 鑽石（九折） |
| 每日免費 | 常駐池 1 次 |

### 重複角色處理
- 重複獲得 → 轉換為「星塵」
- SSR 重複 → 25 星塵 ｜ SR → 5 ｜ R → 1 ｜ N → 0.2
- 星塵可在商店兌換指定角色碎片（不可直接換 SSR）

## 擴展點

- [ ] **武器池**：獨立的裝備 gacha
- [ ] **友情抽**：用友情點抽 N/R
- [ ] **選擇券**：週年慶自選 SSR
- [ ] **碎片系統**：累積碎片合成特定角色

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版草案：機率表、保底機制、成本、重複處理 |
