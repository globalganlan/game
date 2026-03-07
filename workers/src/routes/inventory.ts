/**
 * Inventory Routes — 道具/裝備 CRUD、出售、商店、使用、裝卸
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow, InventoryRow, EquipmentInstanceRow, ItemDefinitionRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { upsertItem, upsertItemStmt, getCurrencies } from './save.js';
import { isoNow, safeJsonParse } from '../utils/helpers.js';

const inventory = new Hono<{ Bindings: Env; Variables: HonoVars }>();

// ── 商店目錄 ──
const SHOP_CATALOG: Record<string, {
  price: number; currency: 'gold' | 'diamond' | 'stardust' | 'equip_scrap' | 'arena'; rewards: Array<{ itemId: string; quantity: number }>; dailyLimit: number;
}> = {
  daily_exp_s:      { price: 1000,  currency: 'gold',    rewards: [{ itemId: 'exp', quantity: 500 }], dailyLimit: 10 },
  daily_exp_m:      { price: 5000,  currency: 'gold',    rewards: [{ itemId: 'exp', quantity: 1500 }], dailyLimit: 5 },
  daily_exp_l:      { price: 20,    currency: 'diamond',  rewards: [{ itemId: 'exp', quantity: 2000 }], dailyLimit: 3 },

  mat_class_power:     { price: 10000, currency: 'gold', rewards: [{ itemId: 'asc_class_power', quantity: 1 }], dailyLimit: 0 },
  mat_class_agility:   { price: 10000, currency: 'gold', rewards: [{ itemId: 'asc_class_agility', quantity: 1 }], dailyLimit: 0 },
  mat_class_defense:   { price: 10000, currency: 'gold', rewards: [{ itemId: 'asc_class_defense', quantity: 1 }], dailyLimit: 0 },
  mat_class_universal: { price: 50,    currency: 'diamond', rewards: [{ itemId: 'asc_class_universal', quantity: 1 }], dailyLimit: 0 },
  // ── 星塵兌換 ──
  sd_exp_5000:        { price: 10,  currency: 'stardust', rewards: [{ itemId: 'exp', quantity: 5000 }], dailyLimit: 0 },
  sd_gold_50k:        { price: 15,  currency: 'stardust', rewards: [{ itemId: 'gold', quantity: 50000 }], dailyLimit: 0 },
  sd_class_universal: { price: 20,  currency: 'stardust', rewards: [{ itemId: 'asc_class_universal', quantity: 2 }], dailyLimit: 0 },

  sd_chest_gold:      { price: 50,  currency: 'stardust', rewards: [{ itemId: 'chest_gold', quantity: 1 }], dailyLimit: 3 },
  sd_diamond_100:     { price: 80,  currency: 'stardust', rewards: [{ itemId: 'diamond', quantity: 100 }], dailyLimit: 0 },
  // ── 特殊商店 ──
  special_gold_pack: { price: 30,   currency: 'diamond', rewards: [{ itemId: 'gold', quantity: 10000 }], dailyLimit: 5 },
  special_ticket_hero:  { price: 50,  currency: 'diamond', rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }], dailyLimit: 3 },
  special_ticket_equip: { price: 50,  currency: 'diamond', rewards: [{ itemId: 'gacha_ticket_equip', quantity: 1 }], dailyLimit: 3 },
  sd_ticket_hero:       { price: 30,  currency: 'stardust', rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }], dailyLimit: 0 },
  sd_ticket_equip:      { price: 30,  currency: 'stardust', rewards: [{ itemId: 'gacha_ticket_equip', quantity: 1 }], dailyLimit: 0 },
  // ── 碎片兌換店 ──
  scrap_chest_equip:    { price: 10,  currency: 'equip_scrap', rewards: [{ itemId: 'chest_equipment', quantity: 1 }], dailyLimit: 0 },

  // ── 競技兌換店 ──
  arena_exp_3000:       { price: 5,   currency: 'arena', rewards: [{ itemId: 'exp', quantity: 3000 }], dailyLimit: 0 },
  arena_gold_20k:       { price: 5,   currency: 'arena', rewards: [{ itemId: 'gold', quantity: 20000 }], dailyLimit: 0 },
  arena_diamond_30:     { price: 10,  currency: 'arena', rewards: [{ itemId: 'diamond', quantity: 30 }], dailyLimit: 0 },
  arena_class_universal: { price: 15, currency: 'arena', rewards: [{ itemId: 'asc_class_universal', quantity: 1 }], dailyLimit: 0 },
  arena_chest_equip:    { price: 8,   currency: 'arena', rewards: [{ itemId: 'chest_equipment', quantity: 1 }], dailyLimit: 0 },
  arena_ticket_hero:    { price: 20,  currency: 'arena', rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }], dailyLimit: 0 },
};

// ── 載入道具定義 ──────────────────────────────
inventory.post('/load-item-definitions', async (c) => {
  const items = await c.env.DB.prepare('SELECT * FROM item_definitions').all<ItemDefinitionRow>();
  // 解析 extra JSON，合併 useAction / category 等欄位到回傳結果
  const parsed = items.results.map(row => {
    const extra = safeJsonParse<Record<string, unknown>>(row.extra, {});
    return {
      itemId: row.itemId,
      name: (extra.name as string) || row.name,
      category: (extra.category as string) || row.type || '',
      rarity: (extra.rarity as string) || row.rarity,
      description: (extra.description as string) || row.description,
      icon: (extra.icon as string) || row.icon,
      stackLimit: (extra.stackLimit as number) ?? (row.stackable ? 999 : 1),
      useAction: (extra.useAction as string) || '',
      sellPrice: (extra.sellPrice as number) ?? row.sellPrice,
    };
  });
  return c.json({ success: true, items: parsed });
});

// ── 商店每日購買狀態 ──────────────────────────
inventory.post('/shop-daily-status', async (c) => {
  const playerId = c.get('playerId');
  const today = isoNow().slice(0, 10);
  const rows = await c.env.DB.prepare(
    'SELECT shopItemId, count FROM shop_purchases WHERE playerId = ? AND purchaseDate = ?'
  ).bind(playerId, today).all<{ shopItemId: string; count: number }>();
  const purchases: Record<string, number> = {};
  for (const r of rows.results) {
    purchases[r.shopItemId] = r.count;
  }
  return c.json({ success: true, purchases });
});

// ── 載入完整背包 ──────────────────────────────
inventory.post('/load-inventory', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const items = await db.prepare(
    'SELECT * FROM inventory WHERE playerId = ?'
  ).bind(playerId).all<InventoryRow>();

  const equipment = await db.prepare(
    'SELECT * FROM equipment_instances WHERE playerId = ?'
  ).bind(playerId).all<EquipmentInstanceRow>();

  const saveData = await db.prepare(
    'SELECT equipmentCapacity FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'equipmentCapacity'>>();

  // 自動修復 equippedBy 含 local_ 開頭的陳舊參照
  const heroRows = await db.prepare(
    'SELECT instanceId, heroId FROM hero_instances WHERE playerId = ?'
  ).bind(playerId).all<{ instanceId: string; heroId: number }>();
  const heroIdToInstanceId = new Map<number, string>();
  for (const hr of heroRows.results) {
    heroIdToInstanceId.set(hr.heroId, hr.instanceId);
  }

  const fixStmts: D1PreparedStatement[] = [];
  const fixedEquipment = equipment.results.map((eq: EquipmentInstanceRow) => {
    if (eq.equippedBy && eq.equippedBy.startsWith('local_')) {
      const parts = eq.equippedBy.split('_');
      const heroId = Number(parts[1]);
      const realId = heroIdToInstanceId.get(heroId);
      if (realId) {
        fixStmts.push(db.prepare(
          'UPDATE equipment_instances SET equippedBy = ? WHERE equipId = ? AND playerId = ?'
        ).bind(realId, eq.equipId, playerId));
        return { ...eq, equippedBy: realId };
      } else {
        // 英雄不存在，清除裝備綁定
        fixStmts.push(db.prepare(
          'UPDATE equipment_instances SET equippedBy = \'\' WHERE equipId = ? AND playerId = ?'
        ).bind(eq.equipId, playerId));
        return { ...eq, equippedBy: '' };
      }
    }
    return eq;
  });
  if (fixStmts.length > 0) {
    await db.batch(fixStmts).catch(() => { /* best-effort */ });
  }

  return c.json({
    success: true,
    items: items.results,
    equipment: fixedEquipment,
    equipmentCapacity: saveData?.equipmentCapacity ?? 200,
  });
});

// ── 批量增加道具 ──────────────────────────────
inventory.post('/add-items', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const items = body.items as Array<{ itemId: string; quantity: number }>;
  if (!items?.length) return c.json({ success: false, error: 'missing items' });

  const stmts = items.map(item => upsertItemStmt(c.env.DB, playerId, item.itemId, Number(item.quantity) || 0));
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  const updated = await c.env.DB.prepare(
    'SELECT * FROM inventory WHERE playerId = ?'
  ).bind(playerId).all<InventoryRow>();

  return c.json({ success: true, inventory: updated.results });
});

// ── 批量消耗道具 ──────────────────────────────
inventory.post('/remove-items', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const items = body.items as Array<{ itemId: string; quantity: number }>;
  if (!items?.length) return c.json({ success: false, error: 'missing items' });

  // 先檢查是否全部足夠
  for (const item of items) {
    const row = await c.env.DB.prepare(
      'SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?'
    ).bind(playerId, item.itemId).first<{ quantity: number }>();
    const have = row?.quantity ?? 0;
    if (have < Number(item.quantity)) {
      return c.json({ success: false, error: `insufficient_${item.itemId} (have=${have},need=${item.quantity})` });
    }
  }

  const rmStmts = items.map(item => upsertItemStmt(c.env.DB, playerId, item.itemId, -(Number(item.quantity) || 0)));
  if (rmStmts.length > 0) await c.env.DB.batch(rmStmts);
  const updated = await c.env.DB.prepare(
    'SELECT * FROM inventory WHERE playerId = ?'
  ).bind(playerId).all<InventoryRow>();

  return c.json({ success: true, inventory: updated.results });
});

// ── 出售道具 ──────────────────────────────────
inventory.post('/sell-items', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const items = body.items as Array<{ itemId: string; quantity: number }>;
  if (!items?.length) return c.json({ success: false, error: 'missing items' });

  // 載入定義
  const defs = await db.prepare('SELECT itemId, sellPrice FROM item_definitions').all<Pick<ItemDefinitionRow, 'itemId' | 'sellPrice'>>();
  const defMap = new Map(defs.results.map((d) => [d.itemId, d.sellPrice]));

  let totalGold = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const row = await db.prepare(
      'SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?'
    ).bind(playerId, item.itemId).first<{ quantity: number }>();
    if ((row?.quantity ?? 0) < qty) return c.json({ success: false, error: `insufficient_${item.itemId}` });
    const price = defMap.get(item.itemId) ?? 0;
    totalGold += price * qty;
    stmts.push(upsertItemStmt(db, playerId, item.itemId, -qty));
  }

  if (totalGold > 0) {
    stmts.push(db.prepare(
      'UPDATE save_data SET gold = gold + ? WHERE playerId = ?'
    ).bind(totalGold, playerId));
  }

  if (stmts.length > 0) await db.batch(stmts);

  const currencies = await getCurrencies(db, playerId);
  return c.json({ success: true, goldGained: totalGold, currencies });
});

// ── 商店購買 ──────────────────────────────────
inventory.post('/shop-buy', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const shopItemId = body.shopItemId as string;
  const buyQty = Math.max(1, Math.min(999, Math.floor(Number(body.quantity) || 1)));
  if (!shopItemId) return c.json({ success: false, error: 'missing shopItemId' });

  const catalog = SHOP_CATALOG[shopItemId];
  if (!catalog) return c.json({ success: false, error: 'invalid_shop_item' });

  const totalPrice = catalog.price * buyQty;

  // 餘額檢查 — 星塵/碎片/競技幣從 inventory，其他從 save_data
  let currentBalance = 0;
  if (catalog.currency === 'stardust' || catalog.currency === 'equip_scrap' || catalog.currency === 'arena') {
    const invItemId = catalog.currency === 'stardust' ? 'currency_stardust' : catalog.currency === 'arena' ? 'pvp_coin' : 'equip_scrap';
    const row = await db.prepare(
      'SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?'
    ).bind(playerId, invItemId).first<{ quantity: number }>();
    currentBalance = row?.quantity ?? 0;
  } else {
    const saveData = await db.prepare(
      'SELECT gold, diamond FROM save_data WHERE playerId = ?'
    ).bind(playerId).first<Pick<SaveDataRow, 'gold' | 'diamond'>>();
    if (!saveData) return c.json({ success: false, error: 'save_not_found' });
    currentBalance = saveData[catalog.currency as 'gold' | 'diamond'];
  }

  if (currentBalance < totalPrice) return c.json({ success: false, error: `insufficient_${catalog.currency}` });

  // 每日購買上限檢查
  const today = isoNow().slice(0, 10); // YYYY-MM-DD
  let remainingToday = Infinity;
  if (catalog.dailyLimit > 0) {
    const row = await db.prepare(
      'SELECT count FROM shop_purchases WHERE playerId = ? AND shopItemId = ? AND purchaseDate = ?'
    ).bind(playerId, shopItemId, today).first<{ count: number }>();
    const bought = row?.count ?? 0;
    remainingToday = Math.max(0, catalog.dailyLimit - bought);
    if (remainingToday <= 0) {
      return c.json({ success: false, error: 'daily_limit_reached' });
    }
    if (buyQty > remainingToday) {
      return c.json({ success: false, error: 'exceeds_daily_limit', remaining: remainingToday });
    }
  }

  // ── 原子交易：扣款 + 發獎 + 購買計數 ──
  const stmts: D1PreparedStatement[] = [];

  // 購買計數 upsert
  if (catalog.dailyLimit > 0) {
    stmts.push(db.prepare(
      `INSERT INTO shop_purchases (playerId, shopItemId, purchaseDate, count)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(playerId, shopItemId, purchaseDate) DO UPDATE SET count = count + ?`
    ).bind(playerId, shopItemId, today, buyQty, buyQty));
  }

  // 扣款
  if (catalog.currency === 'stardust' || catalog.currency === 'equip_scrap' || catalog.currency === 'arena') {
    const invItemId = catalog.currency === 'stardust' ? 'currency_stardust' : catalog.currency === 'arena' ? 'pvp_coin' : 'equip_scrap';
    stmts.push(upsertItemStmt(db, playerId, invItemId, -totalPrice));
  } else {
    stmts.push(db.prepare(
      `UPDATE save_data SET ${catalog.currency} = ${catalog.currency} - ? WHERE playerId = ?`
    ).bind(totalPrice, playerId));
  }

  // 發放獎勵（乘以購買數量）
  const resDelta: Record<string, number> = {};
  for (const reward of catalog.rewards) {
    const totalReward = reward.quantity * buyQty;
    if (reward.itemId === 'gold' || reward.itemId === 'diamond' || reward.itemId === 'exp') {
      resDelta[reward.itemId] = (resDelta[reward.itemId] || 0) + totalReward;
    } else {
      stmts.push(upsertItemStmt(db, playerId, reward.itemId, totalReward));
    }
  }
  const resCols = Object.keys(resDelta);
  if (resCols.length > 0) {
    const sets = resCols.map(col => `${col} = ${col} + ?`).join(', ');
    stmts.push(db.prepare(
      `UPDATE save_data SET ${sets} WHERE playerId = ?`
    ).bind(...resCols.map(col => resDelta[col]), playerId));
  }

  await db.batch(stmts);

  const currencies = await getCurrencies(db, playerId);

  return c.json({
    success: true,
    quantity: buyQty,
    spent: totalPrice,
    currency: catalog.currency,
    rewards: catalog.rewards.map(r => ({ ...r, quantity: r.quantity * buyQty })),
    newBalance: currentBalance - totalPrice,
    currencies,
  });
});

// ── 使用道具 ──────────────────────────────────
inventory.post('/use-item', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const itemId = body.itemId as string;
  const qty = Number(body.quantity) || 1;

  const row = await db.prepare(
    'SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?'
  ).bind(playerId, itemId).first<{ quantity: number }>();
  if ((row?.quantity ?? 0) < qty) return c.json({ success: false, error: 'insufficient_item' });

  // 裝備寶箱
  if (itemId === 'chest_equipment') {
    const equipment = body.equipment;
    const chestStmts: D1PreparedStatement[] = [upsertItemStmt(db, playerId, itemId, -qty)];
    if (equipment) {
      const saveData = await db.prepare(
        'SELECT equipment FROM save_data WHERE playerId = ?'
      ).bind(playerId).first<Pick<SaveDataRow, 'equipment'>>();
      const equipArr = safeJsonParse<unknown[]>(saveData?.equipment, []);
      const newEquips = Array.isArray(equipment) ? equipment : [equipment];
      equipArr.push(...newEquips);
      chestStmts.push(db.prepare(
        'UPDATE save_data SET equipment = ? WHERE playerId = ?'
      ).bind(JSON.stringify(equipArr), playerId));
    }
    await db.batch(chestStmts);
    return c.json({ success: true, result: { used: itemId, quantity: qty, type: 'equipment', equipment } });
  }

  // 寶箱（bronze / silver / gold）
  if (itemId === 'chest_bronze' || itemId === 'chest_silver' || itemId === 'chest_gold') {
    const chestRewards = generateChestRewards(itemId, qty);
    const chestStmts: D1PreparedStatement[] = [upsertItemStmt(db, playerId, itemId, -qty)];

    // 合併 save_data 資源更新為單條
    const resDelta: Record<string, number> = {};
    if (chestRewards.gold > 0) resDelta.gold = chestRewards.gold;
    if (chestRewards.diamond > 0) resDelta.diamond = chestRewards.diamond;
    if (chestRewards.exp > 0) resDelta.exp = chestRewards.exp;
    const resCols = Object.keys(resDelta);
    if (resCols.length > 0) {
      const sets = resCols.map(col => `${col} = ${col} + ?`).join(', ');
      chestStmts.push(db.prepare(
        `UPDATE save_data SET ${sets} WHERE playerId = ?`
      ).bind(...resCols.map(col => resDelta[col]), playerId));
    }
    for (const ri of chestRewards.items) {
      chestStmts.push(upsertItemStmt(db, playerId, ri.itemId, ri.quantity));
    }
    await db.batch(chestStmts);
    const currencies = await getCurrencies(db, playerId);
    return c.json({
      success: true,
      result: { used: itemId, quantity: qty, type: 'chest', ...chestRewards },
      currencies,
    });
  }

  // 一般道具
  await upsertItemStmt(db, playerId, itemId, -qty).run();

  return c.json({ success: true, result: { used: itemId, quantity: qty } });
});

function generateChestRewards(chestId: string, qty: number) {
  let gold = 0, diamond = 0, exp = 0;
  const itemMap: Record<string, number> = {};
  for (let q = 0; q < qty; q++) {
    if (chestId === 'chest_bronze') {
      gold += 1000 + Math.floor(Math.random() * 2000);
      if (Math.random() < 0.5) exp += 200;
      if (Math.random() < 0.15) diamond += 3 + Math.floor(Math.random() * 5);
    } else if (chestId === 'chest_silver') {
      gold += 3000 + Math.floor(Math.random() * 4000);
      diamond += 10 + Math.floor(Math.random() * 20);
      if (Math.random() < 0.8) exp += 1000;
      if (Math.random() < 0.25) itemMap['chest_equipment'] = (itemMap['chest_equipment'] || 0) + 1;
    } else if (chestId === 'chest_gold') {
      gold += 8000 + Math.floor(Math.random() * 7000);
      diamond += 30 + Math.floor(Math.random() * 50);
      exp += 4000;
      if (Math.random() < 0.4) itemMap['chest_equipment'] = (itemMap['chest_equipment'] || 0) + 1;
      if (Math.random() < 0.2) itemMap['gacha_ticket_hero'] = (itemMap['gacha_ticket_hero'] || 0) + 1;
    }
  }
  const items = Object.entries(itemMap).map(([itemId, quantity]) => ({ itemId, name: itemId, quantity }));
  return { gold, diamond, exp, items };
}

// ── 裝備到英雄 ──────────────────────────────
inventory.post('/equip-item', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const equipId = body.equipId as string;
  let heroInstanceId = body.heroInstanceId as string;
  if (!equipId || !heroInstanceId) return c.json({ success: false, error: 'missing params' });

  const db = c.env.DB;

  // 解析 local_ 開頭的前端暫時 ID → 查找真正的 server instanceId
  if (heroInstanceId.startsWith('local_')) {
    const parts = heroInstanceId.split('_');
    const heroId = Number(parts[1]);
    if (heroId > 0) {
      const realHero = await db.prepare(
        'SELECT instanceId FROM hero_instances WHERE playerId = ? AND heroId = ? LIMIT 1'
      ).bind(playerId, heroId).first<{ instanceId: string }>();
      if (realHero) {
        heroInstanceId = realHero.instanceId;
      } else {
        return c.json({ success: false, error: 'hero_not_found' });
      }
    }
  }
  const equip = await db.prepare(
    'SELECT slot FROM equipment_instances WHERE equipId = ? AND playerId = ?'
  ).bind(equipId, playerId).first<Pick<EquipmentInstanceRow, 'slot'>>();
  if (!equip) return c.json({ success: false, error: 'equip_not_found' });

  // 卸下同格位舊裝 + 穿上新裝 — 原子批次
  await db.batch([
    db.prepare(
      'UPDATE equipment_instances SET equippedBy = \'\' WHERE playerId = ? AND equippedBy = ? AND slot = ? AND equipId != ?'
    ).bind(playerId, heroInstanceId, equip.slot, equipId),
    db.prepare(
      'UPDATE equipment_instances SET equippedBy = ? WHERE equipId = ? AND playerId = ?'
    ).bind(heroInstanceId, equipId, playerId),
  ]);

  return c.json({ success: true, heroInstanceId });
});

// ── 卸下裝備 ──────────────────────────────
inventory.post('/unequip-item', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const equipId = body.equipId as string;
  if (!equipId) return c.json({ success: false, error: 'missing equipId' });

  const res = await c.env.DB.prepare(
    'UPDATE equipment_instances SET equippedBy = \'\' WHERE equipId = ? AND playerId = ?'
  ).bind(equipId, playerId).run();

  if (!res.meta.changes) return c.json({ success: false, error: 'equip_not_found' });
  return c.json({ success: true });
});

// ── 鎖定/解鎖裝備 ──────────────────────────
inventory.post('/lock-equipment', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const equipId = body.equipId as string;
  const locked = body.locked ? 1 : 0;

  await c.env.DB.prepare(
    'UPDATE equipment_instances SET locked = ? WHERE equipId = ? AND playerId = ?'
  ).bind(locked, equipId, playerId).run();

  return c.json({ success: true });
});

// ── 擴展背包容量（格數 = 道具種類 + 裝備件數）──────────────────────────────
inventory.post('/expand-inventory', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const saveData = await db.prepare(
    'SELECT diamond, equipmentCapacity FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'diamond' | 'equipmentCapacity'>>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  const cost = 100;
  if (saveData.diamond < cost) return c.json({ success: false, error: 'insufficient_diamond' });

  const currentCap = saveData.equipmentCapacity || 200;
  if (currentCap >= 500) return c.json({ success: false, error: 'max_capacity_reached' });

  const newCap = Math.min(500, currentCap + 50);
  await db.prepare(
    'UPDATE save_data SET diamond = diamond - ?, equipmentCapacity = ? WHERE playerId = ?'
  ).bind(cost, newCap, playerId).run();

  return c.json({ success: true, newCapacity: newCap });
});

// ── 分解裝備 ──────────────────────────────
const DECOMPOSE_REWARDS: Record<string, { gold: number; scrap: number }> = {
  N:   { gold: 100,  scrap: 1 },
  R:   { gold: 300,  scrap: 2 },
  SR:  { gold: 800,  scrap: 5 },
  SSR: { gold: 2000, scrap: 10 },
};

inventory.post('/decompose-equipment', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const equipIds = body.equipIds as string[];
  if (!equipIds?.length) return c.json({ success: false, error: 'missing equipIds' });

  // 查詢所有待分解裝備
  const placeholders = equipIds.map(() => '?').join(',');
  const equipRows = await db.prepare(
    `SELECT equipId, rarity, equippedBy, enhanceLevel FROM equipment_instances WHERE playerId = ? AND equipId IN (${placeholders})`
  ).bind(playerId, ...equipIds).all<{ equipId: string; rarity: string; equippedBy: string; enhanceLevel: number }>();

  if (equipRows.results.length === 0) return c.json({ success: false, error: 'no_valid_equipment' });

  // 不能分解穿戴中的裝備
  const wearing = equipRows.results.find(e => e.equippedBy);
  if (wearing) return c.json({ success: false, error: 'cannot_decompose_equipped' });

  let totalGold = 0;
  let totalScrap = 0;
  const stmts: D1PreparedStatement[] = [];

  for (const eq of equipRows.results) {
    const reward = DECOMPOSE_REWARDS[eq.rarity] || DECOMPOSE_REWARDS['N'];
    // 強化等級額外金幣
    totalGold += reward.gold + eq.enhanceLevel * 50;
    totalScrap += reward.scrap;
    stmts.push(db.prepare(
      'DELETE FROM equipment_instances WHERE equipId = ? AND playerId = ?'
    ).bind(eq.equipId, playerId));
  }

  // 金幣 + 碎片材料
  stmts.push(db.prepare(
    'UPDATE save_data SET gold = gold + ? WHERE playerId = ?'
  ).bind(totalGold, playerId));
  stmts.push(upsertItemStmt(db, playerId, 'equip_scrap', totalScrap));

  await db.batch(stmts);
  const currencies = await getCurrencies(db, playerId);

  return c.json({
    success: true,
    decomposed: equipRows.results.length,
    goldGained: totalGold,
    scrapGained: totalScrap,
    currencies,
  });
});

export default inventory;
