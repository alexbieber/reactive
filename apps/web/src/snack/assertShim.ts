/** Minimal `assert` for browser builds — snack-sdk's web player imports Node's `assert`. */
export default function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? "Assertion failed");
}
