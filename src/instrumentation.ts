export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startKolCopyTraderLoop } = await import("@/lib/kol-copy-trader");
    startKolCopyTraderLoop();
  }
}
