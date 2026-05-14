import crypto from "crypto";

function detectAlgorithm(pem: string): "Ed25519" | "RSA-SHA256" {
  const key = crypto.createPrivateKey(pem);
  switch (key.asymmetricKeyType) {
    case "ed25519":
      return "Ed25519";
    case "rsa":
      return "RSA-SHA256";
    default:
      throw new Error(`Unsupported key type: ${key.asymmetricKeyType}`);
  }
}

function buildMessage(
  subPath: string,
  queryParams: Record<string, string | number>,
  body: string,
  timestamp: number,
): string {
  const sortedQs = Object.keys(queryParams)
    .sort()
    .map((k) => `${k}=${queryParams[k]}`)
    .join("&");
  return `${subPath}:${sortedQs}:${body}:${timestamp}`;
}

function signMessage(message: string, privateKeyPem: string, algorithm: string): string {
  const msgBuf = Buffer.from(message, "utf-8");
  if (algorithm === "Ed25519") {
    return crypto.sign(null, msgBuf, privateKeyPem).toString("base64");
  }
  return crypto
    .sign("sha256", msgBuf, {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    })
    .toString("base64");
}

const GMGN_HOST = "https://openapi.gmgn.ai";
const API_KEY = process.env.GMGN_API_KEY!;
const PRIVATE_KEY = process.env.GMGN_PRIVATE_KEY ?? "";

function getPrivateKeyPem(): string {
  if (!PRIVATE_KEY) throw new Error("GMGN_PRIVATE_KEY not configured");
  if (PRIVATE_KEY.includes("BEGIN")) return PRIVATE_KEY;
  try {
    const fs = require("fs");
    return fs.readFileSync(PRIVATE_KEY, "utf-8");
  } catch {
    throw new Error("GMGN_PRIVATE_KEY must be PEM content or a file path");
  }
}

export async function criticalGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const pem = getPrivateKeyPem();
  const algorithm = detectAlgorithm(pem);
  const timestamp = Math.floor(Date.now() / 1000);
  const clientId = crypto.randomUUID();

  const query: Record<string, string | number> = { timestamp, client_id: clientId };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) query[k] = v;
  }

  const bodyStr = "";
  const message = buildMessage(path, query, bodyStr, timestamp);
  const signature = signMessage(message, pem, algorithm);

  const url = new URL(`${GMGN_HOST}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: {
      "X-APIKEY": API_KEY,
      "X-Signature": signature,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = await res.json();
  if (json.code !== 0) throw new Error(`GMGN API: ${json.error ?? json.message ?? JSON.stringify(json)}`);

  let data = json.data;
  if (data && typeof data === "object" && "code" in data && "data" in data && data.code === 0) {
    data = data.data;
  }
  return data as T;
}

export async function criticalPost<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined>,
  body: unknown,
): Promise<T> {
  const pem = getPrivateKeyPem();
  const algorithm = detectAlgorithm(pem);
  const timestamp = Math.floor(Date.now() / 1000);
  const clientId = crypto.randomUUID();

  const query: Record<string, string | number> = { timestamp, client_id: clientId };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) query[k] = v;
  }

  const bodyStr = JSON.stringify(body);
  const message = buildMessage(path, query, bodyStr, timestamp);
  const signature = signMessage(message, pem, algorithm);

  const url = new URL(`${GMGN_HOST}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "X-APIKEY": API_KEY,
      "X-Signature": signature,
      "Content-Type": "application/json",
    },
    body: bodyStr,
    cache: "no-store",
  });

  const json = await res.json();
  if (json.code !== 0) throw new Error(`GMGN API: ${json.error ?? json.message ?? JSON.stringify(json)}`);

  let data = json.data;
  if (data && typeof data === "object" && "code" in data && "data" in data && data.code === 0) {
    data = data.data;
  }
  return data as T;
}

export async function quoteSwap(chain: string, fromAddress: string, inputToken: string, outputToken: string, inputAmount: string, slippage: number) {
  return criticalGet("/v1/trade/quote", {
    chain,
    from_address: fromAddress,
    input_token: inputToken,
    output_token: outputToken,
    input_amount: inputAmount,
    slippage,
  });
}

export async function executeSwap(params: {
  chain: string;
  from_address: string;
  input_token: string;
  output_token: string;
  input_amount: string;
  slippage: number;
  auto_slippage?: boolean;
  anti_mev?: boolean;
  priority_fee?: number;
}) {
  return criticalPost("/v1/trade/swap", {}, params);
}

export async function queryOrder(orderId: string, chain: string) {
  return criticalGet("/v1/trade/query_order", { order_id: orderId, chain });
}

export async function getFollowedWallets(chain: string) {
  return criticalGet("/v1/trade/follow_wallet", { chain });
}
