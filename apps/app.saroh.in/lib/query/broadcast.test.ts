/**
 * The other tabs hear a switch or a sign-out (DEC-259), and a browser
 * without BroadcastChannel carries on without it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { announce, listen } from "@/lib/query/broadcast";

afterEach(() => vi.unstubAllGlobals());

describe("broadcast", () => {
    it("another tab hears switch, signout and settings", async () => {
        const heard: string[] = [];
        const stop = listen((kind) => heard.push(kind));
        const other = new BroadcastChannel("saroh-query");
        const sent: unknown[] = [];
        other.onmessage = (e) => sent.push(e.data);
        announce("switch");
        announce("signout");
        announce("settings");
        // What another tab receives carries a sender id; replay it as theirs.
        await vi.waitFor(() => expect(sent).toHaveLength(3));
        for (const m of sent) {
            other.postMessage({ ...(m as object), from: "other-tab" });
        }
        await vi.waitFor(() =>
            expect(heard).toEqual(["switch", "signout", "settings"]),
        );
        other.close();
        stop();
    });

    it("a tab never hears its own message", async () => {
        const heard: string[] = [];
        const stop = listen((kind) => heard.push(kind));
        const other = new BroadcastChannel("saroh-query");
        const sent: unknown[] = [];
        other.onmessage = (e) => sent.push(e.data);
        announce("switch");
        // The message went out (another tab gets it), and this tab let it by.
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        await new Promise((r) => setTimeout(r, 20));
        expect(heard).toEqual([]);
        other.close();
        stop();
    });

    it("ignores what it doesn't know", async () => {
        const heard: string[] = [];
        const stop = listen((kind) => heard.push(kind));
        const other = new BroadcastChannel("saroh-query");
        other.postMessage({ kind: "nonsense" });
        other.postMessage("switch");
        other.postMessage({ kind: "switch", from: "other-tab" });
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
