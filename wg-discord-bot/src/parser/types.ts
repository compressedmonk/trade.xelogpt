export interface ParsedLimitSignal {
  trader: string;
  asset: string;
  side: "long" | "short";
  entryMax: number;
  entryMin: number;
  stopLoss: number;
  riskPct: number;
  status: "valid_limit" | "other";
  sourceMessageId: string;
  rawText: string;
}

export type AlertAction =
  | { type: "cancel_limit"; asset: string; trader: string }
  | { type: "limit_filled"; asset: string; trader: string }
  | { type: "move_sl"; asset: string; trader: string; newSl: "BE" | number }
  | { type: "immediate_close"; asset: string; trader: string; closePct: number }
  | { type: "skip"; asset: string; trader: string; reason: string };

export interface ParsedAlert {
  asset: string;
  trader: string;
  actions: AlertAction[];
  rawText: string;
  /** Discord snowflake of the alert message (for posted-at time). */
  sourceMessageId?: string;
}

export interface SanitizedUnlock {
  lines: string[];
  embedLine?: string;
  contentLine?: string;
  statusLine?: string;
  trader?: string;
}
