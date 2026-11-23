// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    answers,
    armFullLoadCatch,
    resetRouterAfterCatch,
} from "./caught-full-load";

/** A `navigate` event as the Navigation API fires it for a full load. */
function navigate(
    path: string,
    { sameDocument = false, type = "push" } = {},
): Event {
    const e = new Event("navigate", { cancelable: true });
    Object.assign(e, {
        navigationType: type,
        destination: {
            url: new URL(path, window.location.origin).href,
            sameDocument,
        },
    });
    nav.dispatchEvent(e);
    return e;
}
const nav = new EventTarget();

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("armFullLoadCatch", () => {
    it("stops Next's full load to a matching address, once, and says so", () => {
        vi.stubGlobal("navigation", nav);
        const caught = vi.fn();
        armFullLoadCatch((u) => u.pathname === "/sites/s1", caught);
        vi.useFakeTimers();
        expect(navigate("/sites/s1?page=p2").defaultPrevented).toBe(true);
        vi.runAllTimers();
        vi.useRealTimers();
        expect(caught).toHaveBeenCalledTimes(1);
        expect(caught).toHaveBeenCalledWith(
            expect.objectContaining({ search: "?page=p2" }),
        );
        // Disarmed by the catch: the next one goes through.
        expect(navigate("/sites/s1?page=p2").defaultPrevented).toBe(false);
    });

    it("leaves other addresses, reloads and in-page moves alone", () => {
        vi.stubGlobal("navigation", nav);
        const caught = vi.fn();
        const disarm = armFullLoadCatch(
            (u) => u.pathname === "/sites/s1",
            caught,
        );
        expect(navigate("/sites").defaultPrevented).toBe(false);
        expect(navigate("/sites/s1", { type: "reload" }).defaultPrevented).toBe(
            false,
        );
        expect(
            navigate("/sites/s1", { sameDocument: true }).defaultPrevented,
        ).toBe(false);
        disarm();
        expect(navigate("/sites/s1").defaultPrevented).toBe(false);
        expect(caught).not.toHaveBeenCalled();
    });

    it("does nothing without the Navigation API", () => {
        expect(() => armFullLoadCatch(() => true, vi.fn())()).not.toThrow();
    });

    it("puts the router back through Next's bfcache restore", () => {
        const shown = vi.fn();
        window.addEventListener("pageshow", (e) => {
            shown(e.persisted);
        });
        resetRouterAfterCatch();
        expect(shown).toHaveBeenCalledWith(true);
    });

    it("tells a real failure from a load that would work (bug 2, 22 Nov)", async () => {
        const url = new URL("/sites/s1/write/new", window.location.origin);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
        expect(await answers(url)).toBe(true);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, type: "opaqueredirect" }),
        );
        expect(await answers(url)).toBe(true);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, type: "basic" }),
        );
        expect(await answers(url)).toBe(false);
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError()));
        expect(await answers(url)).toBe(false);
    });
});
