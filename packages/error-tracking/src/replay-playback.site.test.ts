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
describe("what saroh.in's recorder sends (the real SDK)", () => {
    it("saroh.in: a recording that can be played, about nobody", async () => {
        const posthog = page();
        const tracking = tracker("web");
        expect(
            await tracking?.startSiteReplay({
                consent: "granted",
                teamBrowser: false,
                doNotTrack: null,
                globalPrivacyControl: false,
            }),
        ).toBe(true);
        await until(() => posthog.paths.some((p) => p.endsWith("/config")));
        // The recorder starts once the project's settings are in; until
        // someone then touches the page, the SDK holds what it recorded.
        await new Promise((r) => setTimeout(r, 300));
        expect(posthog.sent).toEqual([]);
        interact();
        await until(() =>
            posthog.items().some((i) => i.type === FULL_SNAPSHOT),
        );
        tracking?.stopReplay();

        const items = posthog.items();
        const meta = items.find((i) => i.type === META);
        expect(meta, "no meta event: the recording plays blank").toBeDefined();
        expect(meta?.data.href).toBe(
            `${window.location.origin}/commerce/orders`,
        );
        const words = wordsOf(
            items.find((i) => i.type === FULL_SNAPSHOT)?.data.node,
        ).join("\n");
        // The site's own text is readable; what was typed never is.
        expect(words).toContain("Asha Rao owes 4200");
        expect(words).not.toContain("typed secret");
        expect(
            new Set(posthog.sent.flatMap((s) => s.events.map((e) => e.event))),
        ).toEqual(new Set(["$snapshot"]));
    }, 20_000);
});
