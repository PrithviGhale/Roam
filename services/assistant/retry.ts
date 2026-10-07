export type RetryKind = "conversation" | "failed-action" | "executed-action";
// Store one failed request in session memory. Never replay a completed mutation,
// expired reference, or a request grounded in a trip that has since changed.
export class AssistantRetry<T> {
  private slot: {
    input: string;
    kind: RetryKind;
    context: T;
    expires: number;
  } | null = null;
  constructor(private now = Date.now) {}
  record(input: string, kind: RetryKind, context: T, error: boolean) {
    this.slot =
      error && kind !== "executed-action"
        ? { input, kind, context, expires: this.now() + 60000 }
        : null;
  }
  status(context: T) {
    return this.slot &&
      this.slot.context === context &&
      this.slot.expires > this.now()
      ? this.slot.kind
      : null;
  }
  take(context: T) {
    const input = this.status(context) ? this.slot!.input : null;
    this.slot = null;
    return input;
  }
}
