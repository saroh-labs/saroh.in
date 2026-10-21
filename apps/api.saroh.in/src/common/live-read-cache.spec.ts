import { LiveReadCache } from "./live-read-cache";

describe("LiveReadCache (review #4)", () => {
    it("works an answer out once per key while it is fresh", async () => {
        const cache = new LiveReadCache<number>(30_000);
        const load = jest.fn().mockResolvedValue(7);
        expect(await cache.get("site-a", load, 1_000)).toBe(7);
        expect(await cache.get("site-a", load, 30_999)).toBe(7);
        expect(load).toHaveBeenCalledTimes(1);
        // 30s on, it is read again.
        await cache.get("site-a", load, 31_000);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("keeps each key apart", async () => {
        const cache = new LiveReadCache<string>();
        await cache.get("a", async () => "A", 0);
        expect(await cache.get("b", async () => "B", 0)).toBe("B");
    });

    it("sends every caller who asks while a read is on its way to that one read", async () => {
        const cache = new LiveReadCache<number>();
        let finish: (n: number) => void = () => {};
        const load = jest.fn(
            () => new Promise<number>((resolve) => (finish = resolve)),
        );
        const asks = Array.from({ length: 50 }, () =>
            cache.get("site-a", load, 0),
        );
        finish(3);
        expect(await Promise.all(asks)).toEqual(Array(50).fill(3));
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("never keeps a failure: the next caller tries again", async () => {
        const cache = new LiveReadCache<number>();
        await expect(
            cache.get("a", () => Promise.reject(new Error("db down")), 0),
        ).rejects.toThrow("db down");
        expect(await cache.get("a", async () => 1, 0)).toBe(1);
    });

    it("reads again when the answer is no longer good, or the clock went back", async () => {
        const cache = new LiveReadCache<number>();
        const load = jest.fn().mockResolvedValue(1);
        await cache.get("a", load, 10_000);
        await cache.get("a", load, 11_000, () => false);
        expect(load).toHaveBeenCalledTimes(2);
        await cache.get("a", load, 5_000);
        expect(load).toHaveBeenCalledTimes(3);
    });

    it("holds at most maxKeys answers, dropping the oldest", async () => {
        const cache = new LiveReadCache<number>(30_000, 2);
        const load = jest.fn().mockResolvedValue(1);
        await cache.get("a", load, 0);
        await cache.get("b", load, 0);
        await cache.get("c", load, 0);
        await cache.get("b", load, 0);
        await cache.get("c", load, 0);
        expect(load).toHaveBeenCalledTimes(3);
        await cache.get("a", load, 0);
        expect(load).toHaveBeenCalledTimes(4);
    });
});

describe("LiveReadCache.secondsLeft", () => {
    it("is what is left of the window, so an edge copy is never older than it", async () => {
        const cache = new LiveReadCache<number>(30_000);
        expect(cache.secondsLeft("a", 0)).toBe(0);
        await cache.get("a", async () => 1, 10_000);
        expect(cache.secondsLeft("a", 10_000)).toBe(30);
        expect(cache.secondsLeft("a", 22_500)).toBe(17);
        expect(cache.secondsLeft("a", 40_000)).toBe(0);
    });
});
