/** The browser's gate epoch: a new value each save, readable by the server. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { bumpGateEpoch, GATE_EPOCH_COOKIE } from "./gate-epoch";

afterEach(() => vi.unstubAllGlobals());

describe("bumpGateEpoch", () => {
    it("sets the cookie for every path, and a new value each time", () => {
        const doc = { cookie: "" };
        vi.stubGlobal("document", doc);
        bumpGateEpoch();
        expect(doc.cookie).toMatch(
            new RegExp(
                `^${GATE_EPOCH_COOKIE}=[0-9a-z]+; path=/; samesite=lax; secure$`,
            ),
        );
    });

    it("on the server, does nothing", () => {
        expect(() => bumpGateEpoch()).not.toThrow();
    });
});
