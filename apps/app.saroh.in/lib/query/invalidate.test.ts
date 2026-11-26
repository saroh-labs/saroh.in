/**
 * A switch keeps every business's cache and tells the other tabs; a
 * sign-out drops it all; a business gone from the list is dropped; a change
 * to the business list marks it stale (DEC-259). The server never
 * touches a browser cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserQueryClient } from "@/lib/query/client";
import {
    afterSettingsSave,
    afterSignOut,
    afterSwitch,
    clearAll,
    dropLeftBusinesses,
    invalidateOrganizations,
} from "@/lib/query/invalidate";
import { domainKey, ORGANIZATIONS_KEY } from "@/lib/query/keys";

const announce = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query/broadcast", () => ({ announce }));
const bumpGateEpoch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/access/gate-epoch", () => ({ bumpGateEpoch }));

beforeEach(() => {
    vi.stubGlobal("window", {});
    announce.mockReset();
    bumpGateEpoch.mockReset();
    const qc = getBrowserQueryClient();
    qc.clear();
    qc.setQueryData(domainKey("orders", "o1", "list"), [1]);
    qc.setQueryData(ORGANIZATIONS_KEY, [{ id: "o1" }]);
});
afterEach(() => vi.unstubAllGlobals());

const held = () => getBrowserQueryClient().getQueryCache().getAll().length;

describe("clearing", () => {
    it("clearAll drops everything", () => {
        clearAll();
        expect(held()).toBe(0);
        expect(announce).not.toHaveBeenCalled();
    });

    it("a switch keeps every business's cache and tells the other tabs", () => {
        afterSwitch();
        expect(held()).toBe(2);
        expect(announce).toHaveBeenCalledWith("switch");
    });

    it("a sign-out clears and tells the other tabs", () => {
        afterSignOut();
        expect(held()).toBe(0);
        expect(announce).toHaveBeenCalledWith("signout");
    });

    it("on the server, nothing is touched", () => {
        vi.unstubAllGlobals();
        expect(() => clearAll()).not.toThrow();
        vi.stubGlobal("window", {});
        expect(held()).toBe(2);
    });
});

describe("dropLeftBusinesses", () => {
    it("drops a business no longer on the list, keeps the rest and the list", () => {
        const qc = getBrowserQueryClient();
        qc.setQueryData(domainKey("orders", "o2", "list"), [2]);
        qc.setQueryData(domainKey("bookings", "o2", "day", "x"), [3]);
        dropLeftBusinesses(qc, [{ id: "o1" }]);
        expect(qc.getQueryData(domainKey("orders", "o1", "list"))).toEqual([1]);
        expect(qc.getQueryData(domainKey("orders", "o2", "list"))).toBe(
            undefined,
        );
        expect(qc.getQueryData(domainKey("bookings", "o2", "day", "x"))).toBe(
            undefined,
        );
        expect(qc.getQueryData(ORGANIZATIONS_KEY)).toEqual([{ id: "o1" }]);
    });
});

describe("invalidateOrganizations", () => {
    it("marks the list stale and leaves the business's data alone", () => {
        invalidateOrganizations();
        const qc = getBrowserQueryClient();
        expect(qc.getQueryState(ORGANIZATIONS_KEY)?.isInvalidated).toBe(true);
        expect(
            qc.getQueryState(domainKey("orders", "o1", "list"))?.isInvalidated,
        ).toBe(false);
    });

    it("a role or membership may have changed: a new gate epoch", () => {
        invalidateOrganizations();
        expect(bumpGateEpoch).toHaveBeenCalledTimes(1);
    });
});

describe("afterSettingsSave", () => {
    it("sets a new gate epoch before the settings are read again", () => {
        const qc = getBrowserQueryClient();
        const order: string[] = [];
        bumpGateEpoch.mockImplementation(() => order.push("epoch"));
        const spy = vi.spyOn(qc, "invalidateQueries").mockImplementation(() => {
            order.push("read");
            return Promise.resolve();
        });
        afterSettingsSave();
        expect(order).toEqual(["epoch", "read"]);
        spy.mockRestore();
    });

    it("reads this tab's settings again, leaves records alone, tells the other tabs", () => {
        const qc = getBrowserQueryClient();
        const shell = domainKey("shell", "o1", "settings");
        qc.getQueryCache().build(qc, {
            queryKey: shell,
            meta: { tier: "settings" },
        });
        qc.setQueryData(shell, { moduleKeys: [] });
        afterSettingsSave();
        expect(qc.getQueryState(shell)?.isInvalidated).toBe(true);
        expect(
            qc.getQueryState(domainKey("orders", "o1", "list"))?.isInvalidated,
        ).toBe(false);
        expect(announce).toHaveBeenCalledWith("settings");
    });
});
