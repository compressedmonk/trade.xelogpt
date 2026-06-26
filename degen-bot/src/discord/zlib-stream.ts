import zlib from "node:zlib";

/**
 * Discord's `zlib-stream` transport appends this sync-flush marker to the end of
 * every complete message. A single frame may be split across several WebSocket
 * messages, so we only inflate once the suffix is seen.
 */
const ZLIB_SUFFIX = 0x0000ffff;

/**
 * Streaming inflate for the Discord gateway. One shared inflate context is kept
 * for the whole connection because the compression dictionary carries across
 * messages — you cannot inflate each frame in isolation.
 */
export class ZlibStream {
  private inflate: zlib.Inflate;
  private chunks: Buffer[] = [];

  constructor(private readonly onMessage: (payload: unknown) => void) {
    this.inflate = zlib.createInflate({ chunkSize: 64 * 1024 });
    this.inflate.on("data", (c: Buffer) => this.chunks.push(c));
    this.inflate.on("error", () => {
      this.chunks = [];
    });
  }

  push(data: Buffer): void {
    const flush =
      data.length >= 4 && data.readUInt32BE(data.length - 4) === ZLIB_SUFFIX;

    this.inflate.write(data);
    if (!flush) return;

    this.inflate.flush(zlib.constants.Z_SYNC_FLUSH, () => {
      if (this.chunks.length === 0) return;
      const text = Buffer.concat(this.chunks).toString("utf8");
      this.chunks = [];
      try {
        this.onMessage(JSON.parse(text));
      } catch {
        // partial / non-JSON frame — ignore
      }
    });
  }

  destroy(): void {
    this.inflate.removeAllListeners();
    this.inflate.close();
    this.chunks = [];
  }
}
