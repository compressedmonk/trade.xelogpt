import { runWatcher } from "./discord/watcher.js";

runWatcher().catch((err) => {
  console.error(err);
  process.exit(1);
});
