const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`\nNode ${process.version} is too old — LiqWick Bot needs Node 18+ (use 20).\n`);
  console.error("In this directory run:");
  console.error("  nvm use          # .nvmrc has 20");
  console.error("  npm install");
  console.error("  npm start\n");
  process.exit(1);
}

import { accessSync } from "node:fs";
import { join } from "node:path";

try {
  accessSync(join(process.cwd(), "node_modules", "tsx", "package.json"));
} catch {
  console.error("\nDependencies missing. Run:\n  npm install\n");
  process.exit(1);
}
