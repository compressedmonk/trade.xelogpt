export interface QueuePumpDeps {
  isReady: () => boolean;
  hasWork: () => boolean;
  drainUrgent: () => Promise<void>;
  drainTrade: () => Promise<void>;
}

export interface QueuePump {
  pump: () => Promise<void>;
  isPumping: () => boolean;
}

/**
 * Serializes alert (urgent) and trade processing: urgent is always drained
 * first, the two never run concurrently, and a re-entrant request during a run
 * triggers another loop so nothing is stranded. The `pumping` flag is reset in a
 * `finally`, so a throwing drain cannot permanently wedge the pump.
 */
export function createQueuePump(deps: QueuePumpDeps): QueuePump {
  let pumping = false;
  let pumpRequested = false;

  async function pump(): Promise<void> {
    if (!deps.isReady()) return;
    if (pumping) {
      pumpRequested = true;
      return;
    }
    pumping = true;
    try {
      do {
        pumpRequested = false;
        await deps.drainUrgent();
        await deps.drainTrade();
      } while (pumpRequested && deps.hasWork());
    } finally {
      pumping = false;
    }
  }

  return { pump, isPumping: () => pumping };
}
