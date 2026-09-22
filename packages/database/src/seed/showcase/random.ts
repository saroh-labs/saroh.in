/**
 * A seeded random source, so the showcase is the same world on every run.
 *
 * `Math.random` would make each re-run write different orders to different
 * customers, and the idempotency the seed promises would be a lie. mulberry32
 * is small, fast and good enough for picking names and quantities; it is not
 * for anything that has to be unpredictable.
 */
export interface Rng {
    /** 0 ≤ n < 1 */
    next(): number;
    /** An integer in [min, max], both ends included. */
    int(min: number, max: number): number;
    /** True with probability `p`. */
    chance(p: number): boolean;
    pick<T>(items: readonly T[]): T;
    /** One item, chosen in proportion to its weight. */
    weighted<T>(items: readonly T[], weight: (item: T) => number): T;
    /**
     * An index in [0, n), skewed towards the start — so a few regulars account
     * for most of the visits, as they do in any real customer list.
     */
    skewed(n: number, power?: number): number;
}

export function createRng(seed: number): Rng {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min: number, max: number) =>
        min + Math.floor(next() * (max - min + 1));
    return {
        next,
        int,
        chance: (p) => next() < p,
        pick: (items) => {
            if (items.length === 0) throw new Error("pick from an empty list");
            return items[Math.floor(next() * items.length)];
        },
        weighted: (items, weight) => {
            const total = items.reduce((sum, item) => sum + weight(item), 0);
            let r = next() * total;
            for (const item of items) {
                r -= weight(item);
                if (r < 0) return item;
            }
            return items[items.length - 1];
        },
        skewed: (n, power = 2.2) => Math.floor(Math.pow(next(), power) * n),
    };
}
