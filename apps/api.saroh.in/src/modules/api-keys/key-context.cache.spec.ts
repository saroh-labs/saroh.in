import type { ApiKey } from "@saroh/database";

import type { KeyContext } from "./key-context.cache";
import { KeyContextCache } from "./key-context.cache";

const T0 = 1_800_000_000_000;

const entry = (organizationId: string): KeyContext => ({
    key: { id: `k-${organizationId}`, organizationId } as ApiKey,
    context: { organizationId, userId: "u", role: "OWNER" },
});

describe("KeyContextCache", () => {
    it("reuses a context for the TTL, then reads again", async () => {
        const cache = new KeyContextCache(5_000);
        const load = jest.fn().mockResolvedValue(entry("a"));
        await cache.get("d", load, T0);
        await cache.get("d", load, T0 + 4_999);
        expect(load).toHaveBeenCalledTimes(1);
        await cache.get("d", load, T0 + 5_000);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("never keeps a miss or a failure", async () => {
        const cache = new KeyContextCache();
        const miss = jest.fn().mockResolvedValue(null);
        await cache.get("d", miss, T0);
        await cache.get("d", miss, T0);
        expect(miss).toHaveBeenCalledTimes(2);
        const fail = jest.fn().mockRejectedValue(new Error("left"));
        await expect(cache.get("e", fail, T0)).rejects.toThrow("left");
        await expect(cache.get("e", fail, T0)).rejects.toThrow("left");
        expect(fail).toHaveBeenCalledTimes(2);
    });

    it("forgets one business's keys and keeps the rest", async () => {
        const cache = new KeyContextCache();
        const a = jest.fn().mockResolvedValue(entry("a"));
        const b = jest.fn().mockResolvedValue(entry("b"));
        await cache.get("da", a, T0);
        await cache.get("db", b, T0);
        cache.forgetOrganization("a");
        await cache.get("da", a, T0);
        await cache.get("db", b, T0);
        expect(a).toHaveBeenCalledTimes(2);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it("holds at most maxKeys, dropping the oldest", async () => {
        const cache = new KeyContextCache(60_000, 2);
        const load = jest.fn().mockResolvedValue(entry("a"));
        for (const d of ["1", "2", "3"]) await cache.get(d, load, T0);
        await cache.get("1", load, T0);
        expect(load).toHaveBeenCalledTimes(4);
    });
});
