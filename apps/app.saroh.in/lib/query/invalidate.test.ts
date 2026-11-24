/**
 * A switch or a sign-out drops the tab's cache and tells the other tabs;
 * a change to the business list marks it stale (DEC-259). The server never
 * touches a browser cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserQueryClient } from "@/lib/query/client";
import {
    afterSignOut,
    afterSwitch,
    clearAll,
    invalidateOrganizations,
} from "@/lib/query/invalidate";
import { domainKey, ORGANIZATIONS_KEY } from "@/lib/query/keys";

const announce = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query/broadcast", () => ({ announce }));

beforeEach(() => {
    vi.stubGlobal("window", {});
    announce.mockReset();
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

    it("a switch clears and tells the other tabs", () => {
        afterSwitch();
        expect(held()).toBe(0);
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

describe("invalidateOrganizations", () => {
    it("marks the list stale and leaves the business's data alone", () => {
        invalidateOrganizations();
        const qc = getBrowserQueryClient();
        expect(qc.getQueryState(ORGANIZATIONS_KEY)?.isInvalidated).toBe(true);
        expect(
            qc.getQueryState(domainKey("orders", "o1", "list"))?.isInvalidated,
        ).toBe(false);
    });
});
