import { prisma } from "@/lib/prisma";
import { getPerpSymbols } from "@/lib/apha-binance";
import {
  type AphaTrade,
  type AphaStats,
  buildOutcomePool,
  computeStats,
  GENERATION_VERSION,
  generateDayTrades,
  getCompletedDayIndices,
  getGlobalOutcomeIndexForDay,
  planDay,
} from "@/lib/apha-bot";

function rowToTrade(row: {
  id: string;
  symbol: string;
  side: string;
  leverage: number;
  outcome: string;
  entryTime: Date;
  exitTime: Date;
  entryPrice: number;
  exitPrice: number;
  priceMovePct: number;
  pnlPct: number;
  pnlUsdt: number;
  marginUsdt: number;
  dayIndex: number;
}): AphaTrade {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side as AphaTrade["side"],
    leverage: row.leverage,
    outcome: row.outcome as AphaTrade["outcome"],
    entryTime: row.entryTime.getTime(),
    exitTime: row.exitTime.getTime(),
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    priceMovePct: row.priceMovePct,
    pnlPct: row.pnlPct,
    pnlUsdt: row.pnlUsdt,
    marginUsdt: row.marginUsdt,
    dayIndex: row.dayIndex,
  };
}

function tradeToRow(trade: AphaTrade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    leverage: trade.leverage,
    outcome: trade.outcome,
    entryTime: new Date(trade.entryTime),
    exitTime: new Date(trade.exitTime),
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    priceMovePct: trade.priceMovePct,
    pnlPct: trade.pnlPct,
    pnlUsdt: trade.pnlUsdt,
    marginUsdt: trade.marginUsdt,
    dayIndex: trade.dayIndex,
  };
}

async function needsFullRegeneration(): Promise<boolean> {
  const meta = await prisma.aphaBotMeta.findUnique({ where: { id: 1 } });
  return !meta || meta.generationVersion !== GENERATION_VERSION;
}

async function wipeAphaData(): Promise<void> {
  await prisma.aphaBotTrade.deleteMany();
  await prisma.aphaBotDay.deleteMany();
}

async function markGenerationCurrent(): Promise<void> {
  await prisma.aphaBotMeta.upsert({
    where: { id: 1 },
    create: { id: 1, generationVersion: GENERATION_VERSION },
    update: { generationVersion: GENERATION_VERSION },
  });
}

export async function syncAphaTrades(now = Date.now()): Promise<void> {
  const fullRegen = await needsFullRegeneration();
  if (fullRegen) await wipeAphaData();

  const completedDays = getCompletedDayIndices(now);
  if (completedDays.length === 0) return;

  const synced = await prisma.aphaBotDay.findMany({ select: { dayIndex: true } });
  const syncedSet = new Set(synced.map((d) => d.dayIndex));
  const daysToSync = fullRegen
    ? completedDays
    : completedDays.filter((d) => !syncedSet.has(d));

  if (daysToSync.length === 0) {
    if (fullRegen) await markGenerationCurrent();
    return;
  }

  const allSymbols = (await getPerpSymbols()).map((s) => s.symbol);
  const outcomePool = buildOutcomePool();

  for (const dayIndex of daysToSync) {
    const { symbols } = planDay(allSymbols, dayIndex);
    const outcomeStart = getGlobalOutcomeIndexForDay(dayIndex);
    const dayOutcomes = outcomePool.slice(outcomeStart, outcomeStart + symbols.length);
    const batch = await generateDayTrades(symbols, dayIndex, dayOutcomes);

    if (batch.length > 0) {
      await prisma.aphaBotTrade.createMany({
        data: batch.map(tradeToRow),
      });
    }

    await prisma.aphaBotDay.create({ data: { dayIndex } });
  }

  if (fullRegen) await markGenerationCurrent();
}

export async function getAphaTrackRecord(opts?: {
  symbol?: string;
  now?: number;
}): Promise<{ trades: AphaTrade[]; stats: AphaStats; symbols: string[] }> {
  const now = opts?.now ?? Date.now();
  await syncAphaTrades(now);

  const allSymbols = (await getPerpSymbols()).map((s) => s.symbol);
  const rows = await prisma.aphaBotTrade.findMany({
    where: opts?.symbol ? { symbol: opts.symbol } : undefined,
    orderBy: { exitTime: "desc" },
  });

  const trades = rows.map(rowToTrade);
  return {
    trades,
    stats: computeStats(trades),
    symbols: allSymbols,
  };
}
