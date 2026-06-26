export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startKolCopyTraderLoop } = await import("@/lib/kol-copy-trader");
    startKolCopyTraderLoop();
    const { startKolSyncLoop } = await import("@/lib/kol-sync-loop");
    startKolSyncLoop();
  }
}
