/**
 * Run `fn` over `items` with at most `limit` in flight, keeping the
 * results in the items' order. For a batch of independent writes or reads
 * that would otherwise run one after another (Remind many, review #17)
 * without opening a connection per item at once.
 *
 * A rejection rejects the whole run, as `Promise.all` does; a caller that
 * wants each item's own outcome catches inside `fn`.
 */
export async function mapLimit<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const lanes = Math.max(1, Math.min(limit, items.length));
    async function lane(): Promise<void> {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: lanes }, lane));
    return results;
}
