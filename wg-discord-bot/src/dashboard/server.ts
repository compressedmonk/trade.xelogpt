import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { TradeStore } from "../db/store.js";
import { executeAlert } from "../executor/alert-actions.js";
import type { ParsedAlert } from "../parser/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const store = new TradeStore(config.dbPath);

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function alertForTrade(
  trade: { trader: string; asset: string },
  type: ParsedAlert["actions"][0]["type"],
  extra: Record<string, unknown> = {},
): ParsedAlert {
  return {
    asset: trade.asset,
    trader: trade.trader,
    actions: [{ type, asset: trade.asset, trader: trade.trader, ...extra } as ParsedAlert["actions"][0]],
    rawText: `manual:${type}`,
  };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (req.method === "GET" && path === "/api/summary") {
    return json(res, 200, { ...store.summary(), dryRun: config.dryRun });
  }

  if (req.method === "GET" && path === "/api/trades") {
    const url = new URL(req.url ?? "/", "http://local");
    const status = url.searchParams.get("status") ?? "all";
    const trades = store.listTrades({
      status: status as "all" | "open",
      limit: 200,
    });
    return json(res, 200, trades);
  }

  if (req.method === "GET" && path === "/api/events") {
    const url = new URL(req.url ?? "/", "http://local");
    const limit = Number(url.searchParams.get("limit") ?? "150");
    const tradeId = url.searchParams.get("tradeId") ?? undefined;
    return json(res, 200, store.listEvents(limit, tradeId));
  }

  const tradeAction = path.match(/^\/api\/trades\/([^/]+)\/(close|cancel|move-be)$/);
  if (req.method === "POST" && tradeAction) {
    const [, tradeId, action] = tradeAction;
    const trade = store.getTradeById(tradeId);
    if (!trade) return json(res, 404, { error: "trade not found" });

    try {
      if (action === "close") {
        const body = (await readBody(req)) as { pct?: number };
        const pct = body.pct ?? 100;
        await executeAlert(
          alertForTrade(trade, "immediate_close", { closePct: pct }),
          store,
        );
      } else if (action === "cancel") {
        await executeAlert(alertForTrade(trade, "cancel_limit"), store);
      } else if (action === "move-be") {
        await executeAlert(alertForTrade(trade, "move_sl", { newSl: "BE" }), store);
      }
      return json(res, 200, { ok: true, trade: store.getTradeById(tradeId) });
    } catch (err) {
      return json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  json(res, 404, { error: "not found" });
}

const html = readFileSync(join(__dirname, "index.html"), "utf8");

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://local").pathname;

  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (path.startsWith("/api/")) {
    void handleApi(req, res, path);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${config.dashboardPort} already in use.`);
    console.error("Either open the existing dashboard:");
    console.error(`  http://localhost:${config.dashboardPort}`);
    console.error("Or stop the old process and retry:");
    console.error(`  fuser -k ${config.dashboardPort}/tcp`);
    console.error(`  # or: DASHBOARD_PORT=3848 npm run dashboard\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(config.dashboardPort, () => {
  console.log(`Dashboard: http://localhost:${config.dashboardPort}`);
  console.log(`DB: ${config.dbPath}  DRY_RUN=${config.dryRun}`);
});

process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});
