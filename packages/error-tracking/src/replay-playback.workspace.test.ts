// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
    FULL_SNAPSHOT,
    interact,
    META,
    page,
    tracker,
    until,
    wordsOf,
} from "./replay-playback.testing";

// One page per file: posthog-js keeps its instances, and the recorder its
// patches, for as long as the page lives.
describe("what the workspace's recorder sends (the real SDK)", () => {
    it("the workspace: a recording that can be played, with the business's words masked", async () => {
        const posthog = page();
        const tracking = tracker("application");
        expect(
            await tracking?.startReplay({
                userId: "user_1",
                organizationId: "org_1",
                sharesUsage: true,
                noticeShown: true,
                inWorkspaceShell: true,
                doNotTrack: null,
                globalPrivacyControl: false,
            }),
        ).toBe(true);
        await until(() => posthog.paths.some((p) => p.endsWith("/config")));
        // Until someone touches the page the SDK holds what it recorded.
        await new Promise((r) => setTimeout(r, 300));
        expect(posthog.sent).toEqual([]);

        interact();
        await until(() =>
            posthog.items().some((i) => i.type === FULL_SNAPSHOT),
        );
        tracking?.stopReplay();

        const items = posthog.items();
        // Without this event the player never shows the page: blank, black.
        const meta = items.find((i) => i.type === META);
        expect(meta, "no meta event: the recording plays blank").toBeDefined();
        expect(meta?.data.href).toBe(
            `${window.location.origin}/commerce/orders`,
        );
        expect(meta?.data.width).toEqual(expect.any(Number));

        const full = items.find((i) => i.type === FULL_SNAPSHOT);
        expect(full, "no full snapshot: nothing to draw").toBeDefined();
        const words = wordsOf(full?.data.node).join("\n");
        // Saroh's own words are readable; the business's are not.
        expect(words).toContain("Orders");
        expect(words).toContain("New order");
        expect(words).not.toContain("Asha");
        expect(words).not.toContain("4200");
        expect(words).not.toContain("typed secret");
        expect(JSON.stringify(posthog.sent)).not.toContain("asha+rao");

        // Recordings and nothing else, to the recording address.
        expect(new Set(posthog.sent.map((s) => s.path))).toEqual(
            new Set(["/s/"]),
        );
        expect(
            new Set(posthog.sent.flatMap((s) => s.events.map((e) => e.event))),
        ).toEqual(new Set(["$snapshot"]));
        expect(posthog.sent[0]?.events[0]?.properties.distinct_id).toBe(
            "user_1",
        );
    }, 20_000);
});
