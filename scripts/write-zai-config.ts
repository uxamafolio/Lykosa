import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }
}


loadLocalEnv();

const baseUrl = process.env.ZAI_BASE_URL;
const apiKey = process.env.ZAI_API_KEY;

if (!baseUrl || !apiKey) {
  console.error("ZAI_BASE_URL and ZAI_API_KEY are required.");
  process.exit(1);
}

const config: Record<string, string> = {
  baseUrl,
  apiKey,
};


if (process.env.ZAI_CHAT_ID) config.chatId = process.env.ZAI_CHAT_ID;
if (process.env.ZAI_USER_ID) config.userId = process.env.ZAI_USER_ID;

writeFileSync(".z-ai-config", `${JSON.stringify(config, null, 2)}\n`, {
  mode: 0o600,
});

console.log(".z-ai-config written");
