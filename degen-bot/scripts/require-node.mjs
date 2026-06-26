const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`\nNode ${process.version} is too old — degen-bot needs Node 18+ (use 20).\n`);
  console.error("In this directory run:");
  console.error("  nvm use          # .nvmrc has 20");
  console.error("  npm run watch\n");
  process.exit(1);
}
