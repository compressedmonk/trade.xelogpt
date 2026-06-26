import { config } from "../src/config.js";
import { DegenStore } from "../src/journal/store.js";

function main(): void {
  const store = new DegenStore(config.dbPath);
  const buys = store.listBuys(50);

  console.log(`degen-bot journal: ${config.dbPath}`);
  console.log(`mode: ${config.dryRun ? "DRY_RUN" : "LIVE"}  buys logged: ${buys.length}\n`);

  if (buys.length === 0) {
    console.log("No triggers recorded yet.");
    store.close();
    return;
  }

  for (const b of buys) {
    const tx = b.txSignature ? ` tx=${b.txSignature}` : "";
    const reason = b.reason ? ` (${b.reason})` : "";
    const latency = b.latencyMs != null ? ` ${b.latencyMs}ms` : "";
    console.log(
      `${b.createdAt}  ${b.status.padEnd(8)} ${b.mint}  ${b.solSpent} SOL${latency}${tx}${reason}`,
    );
  }
  store.close();
}

main();
