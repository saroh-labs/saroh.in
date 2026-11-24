/**
 * The other tabs hear a switch or a sign-out (DEC-259), and a browser
 * without BroadcastChannel carries on without it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { announce, listen } from "@/lib/query/broadcast";

afterEach(() => vi.unstubAllGlobals());

describe("broadcast", () => {
    it("another tab hears switch and signout", async () => {
        const heard: string[] = [];
        const stop = listen((kind) => heard.push(kind));
        announce("switch");
        announce("signout");
        await vi.waitFor(() => expect(heard).toEqual(["switch", "signout"]));
        stop();
    });

    it("ignores what it doesn't know", async () => {
        const heard: string[] = [];
        const stop = listen((kind) => heard.push(kind));
        const other = new BroadcastChannel("saroh-query");
        other.postMessage({ kind: "nonsense" });
        other.postMessage("switch");
        announce("switch");
        await vi.waitFor(() => expect(heard).toEqual(["switch"]));
        other.close();
        stop();
    });

    it("without BroadcastChannel, does nothing and throws nothing", () => {
        vi.stubGlobal("BroadcastChannel", undefined);
        expect(() => announce("switch")).not.toThrow();
        expect(() => listen(() => undefined)()).not.toThrow();
    });
});
