/** A pending intent keeps its key even when another command is attempted meanwhile.
 * Scoped by PetConnected's organization, authenticated user and permit lifetime. */
export class PetCommandIntents {
  private pending = new Map<string, string>();
  key(payload: unknown): string {
    const identity = JSON.stringify(payload);
    let key = this.pending.get(identity);
    if (!key) {
      key = crypto.randomUUID();
      this.pending.set(identity, key);
    }
    return key;
  }
  confirmed(payload: unknown) {
    this.pending.delete(JSON.stringify(payload));
  }
}
