import { createServer, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type { BotStore, JournalFilter } from "../db/store.js";
import type { BotStatus } from "../strategy/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseJournalFilter(url: URL): JournalFilter {
  const filter: JournalFilter = {};
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const symbol = url.searchParams.get("symbol");
  const outcome = url.searchParams.get("outcome");
  const side = url.searchParams.get("side");
  if (since) filter.since = since;
  if (until) filter.until = until;
  if (symbol) filter.symbol = symbol;
  if (outcome) filter.outcome = outcome;
  if (side) filter.side = side;
  return filter;
}

function parseLimit(url: URL, fallback = 100, max = 5000): number {
  const raw = Number(url.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), max);
}

export function startDashboard(
  store: BotStore,
  getStatus: () => BotStatus,
): ReturnType<typeof createServer> {
  const html = readFileSync(join(__dirname, "index.html"), "utf8");

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;

    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && path === "/api/status") {
      return json(res, 200, getStatus());
    }
    if (req.method === "GET" && path === "/api/summary") {
      return json(res, 200, { ...store.summary(), dryRun: config.dryRun });
    }
    if (req.method === "GET" && path === "/api/positions") {
      return json(res, 200, store.listPositions());
    }
    if (req.method === "GET" && path === "/api/signals") {
      return json(res, 200, store.listSignals());
    }
    if (req.method === "GET" && path === "/api/events") {
      return json(res, 200, store.listEvents());
    }
    if (req.method === "GET" && path === "/api/sweep-journal") {
      const filter = parseJournalFilter(url);
      const limit = parseLimit(url);
      return json(res, 200, store.listSweepJournal(limit, filter));
    }
    if (req.method === "GET" && path === "/api/optimization") {
      const filter = parseJournalFilter(url);
      return json(res, 200, store.getOptimizationStats(filter));
    }
    if (req.method === "GET" && path === "/api/optimization/weekly") {
      const filter = parseJournalFilter(url);
      return json(res, 200, store.getOptimizationWeekly(filter));
    }

    json(res, 404, { error: "not found" });
  });

  server.listen(config.dashboardPort, config.dashboardHost, () => {
    console.log(`LiqWick dashboard: http://${config.dashboardHost}:${config.dashboardPort}`);
  });

  return server;
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { BotStore } = await import("../db/store.js");
  const store = new BotStore();
  startDashboard(store, () => store.getStatus(config.symbolWhitelist));
  process.on("SIGINT", () => {
    store.close();
    process.exit(0);
  });
}
