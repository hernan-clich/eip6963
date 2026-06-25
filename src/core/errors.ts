/**
 * Error thrown by connector actions. Preserves the underlying EIP-1193
 * provider error `code` (e.g. `4902` unrecognized chain, `4001` user
 * rejected) and `data`, which a plain `Error` would otherwise drop.
 */
export class WalletError extends Error {
  /** EIP-1193 / JSON-RPC error code, when the provider supplied one. */
  readonly code?: number | string;
  /** Provider-supplied error data, when present. */
  readonly data?: unknown;

  constructor(
    message: string,
    options: { code?: number | string; data?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "WalletError";
    this.code = options.code;
    this.data = options.data;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

const readProp = <T>(value: unknown, key: string): T | undefined =>
  value && typeof value === "object"
    ? ((value as Record<string, unknown>)[key as keyof object] as T | undefined)
    : undefined;

/**
 * Normalize an unknown thrown value into a {@link WalletError}, carrying over
 * the provider's `code`/`message`/`data` whether it arrived as an `Error` or a
 * plain `{ code, message }` object.
 */
export const toWalletError = (
  value: unknown,
  fallback: string
): WalletError => {
  if (value instanceof WalletError) return value;

  const code = readProp<number | string>(value, "code");
  const data = readProp<unknown>(value, "data");

  if (value instanceof Error) {
    return new WalletError(value.message || fallback, {
      cause: value,
      code,
      data,
    });
  }

  const message = readProp<unknown>(value, "message");
  return new WalletError(typeof message === "string" ? message : fallback, {
    cause: value,
    code,
    data,
  });
};
