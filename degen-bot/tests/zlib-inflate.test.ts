import zlib from "node:zlib";
import { ZlibStream } from "../src/discord/zlib-stream.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Server side: one persistent deflate context, Z_SYNC_FLUSH per message — this
// is exactly how Discord's zlib-stream transport frames payloads.
const deflate = zlib.createDeflate();
const out: Buffer[] = [];
deflate.on("data", (c: Buffer) => out.push(c));

function encode(obj: unknown): Promise<Buffer> {
  return new Promise((resolve) => {
    out.length = 0;
    deflate.write(JSON.stringify(obj));
    deflate.flush(zlib.constants.Z_SYNC_FLUSH, () => resolve(Buffer.concat(out)));
  });
}

async function main(): Promise<void> {
  const received: Array<Record<string, unknown>> = [];
  const stream = new ZlibStream((p) => received.push(p as Record<string, unknown>));

  // 1) Whole frame in one push.
  const hello = await encode({ op: 10, d: { heartbeat_interval: 41250 } });
  stream.push(hello);
  await delay(20);
  assert(received.length === 1, "one message decoded");
  assert(received[0].op === 10, "hello op decoded");

  // 2) A frame split across two websocket pushes (suffix only in the second).
  const dispatch = await encode({
    op: 0,
    t: "MESSAGE_CREATE",
    s: 5,
    d: { id: "1", channel_id: "c", content: "hi" },
  });
  const mid = Math.floor(dispatch.length / 2);
  stream.push(dispatch.subarray(0, mid));
  await delay(10);
  assert(received.length === 1, "no decode before suffix arrives");
  stream.push(dispatch.subarray(mid));
  await delay(20);
  assert(received.length === 2, "split frame decoded after suffix");
  assert(received[1].t === "MESSAGE_CREATE", "dispatch type decoded");

  // 3) Shared dictionary across consecutive messages still decodes.
  const second = await encode({ op: 11 });
  stream.push(second);
  await delay(20);
  assert(received.length === 3, "consecutive message decoded");
  assert(received[2].op === 11, "heartbeat ack op decoded");

  stream.destroy();
  deflate.destroy();
  console.log("All zlib-inflate tests passed.");
}

main();
