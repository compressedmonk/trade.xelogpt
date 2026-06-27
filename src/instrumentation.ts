export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureNewsmakerSeed } = await import("@/lib/newsmaker-seed");
    ensureNewsmakerSeed()
      .then((n) => {
        if (n > 0) console.log(`[newsmaker-seed] restored ${n} default newsmakers`);
      })
      .catch((err) => {
        console.error("[newsmaker-seed] startup seed failed:", err);
      });

    const { startKolCopyTraderLoop } = await import("@/lib/kol-copy-trader");
    startKolCopyTraderLoop();
    const { startKolSyncLoop } = await import("@/lib/kol-sync-loop");
    startKolSyncLoop();
    const { startApiHealthAlertLoop } = await import("@/lib/api-health-alerts");
    startApiHealthAlertLoop();

    const { syncAphaTrades } = await import("@/lib/apha-store");
    syncAphaTrades().catch((err) => {
      console.error("[apha] startup sync failed:", err);
    });
  }
}
