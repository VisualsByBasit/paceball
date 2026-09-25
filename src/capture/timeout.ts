/**
 * Rejects if `promise` has not settled in `ms`. The original promise is left to
 * its fate: a native call cannot be cancelled from here, only stopped waiting on.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}
