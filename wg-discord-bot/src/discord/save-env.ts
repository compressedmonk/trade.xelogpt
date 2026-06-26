import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export async function setEnvValue(key: string, value: string): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  let content = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  await writeFile(envPath, content);
}
