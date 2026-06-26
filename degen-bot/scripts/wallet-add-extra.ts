function usage(): never {
  console.error("Usage: npm run wallet:add-extra -- <discordUserId> <buyFraction>");
  console.error("  buyFraction: 0-1 fraction of spendable balance (e.g. 0.3 = 30%)");
  console.error("  Appends userId:fraction to DEGEN_EXTRA_WATCH (shared extra wallet).");
  process.exit(1);
}

async function main(): Promise<void> {
  const userId = process.argv[2]?.trim();
  const fractionRaw = process.argv[3]?.trim();
  if (!userId || !fractionRaw) usage();

  const buyFraction = Number(fractionRaw);
  if (!Number.isFinite(buyFraction) || buyFraction <= 0 || buyFraction > 1) {
    console.error("buyFraction must be a number in (0, 1] (e.g. 0.3 for 30%)");
    process.exit(1);
  }

  const entry = `${userId}:${buyFraction}`;

  console.log("Add extra watch user (shared extra wallet):");
  console.log(`  Discord user: ${userId}`);
  console.log(`  Buy size:     ${(buyFraction * 100).toFixed(0)}% of spendable balance`);
  console.log("");
  console.log("Append to .env DEGEN_EXTRA_WATCH (use | between entries):");
  console.log(`  ${entry}`);
  console.log("");
  console.log("Ensure DEGEN_EXTRA_WALLET_PRIVATE_KEY is set and funded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
