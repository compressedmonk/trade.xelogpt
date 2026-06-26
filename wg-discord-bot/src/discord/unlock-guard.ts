let unlockInProgress = false;

export function setUnlockInProgress(value: boolean): void {
  unlockInProgress = value;
}

export function isUnlockInProgress(): boolean {
  return unlockInProgress;
}
