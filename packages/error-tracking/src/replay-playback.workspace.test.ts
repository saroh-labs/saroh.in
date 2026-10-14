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
        document.title = "Order ORD-007 \u00b7 Northwind Supply";
        const tracking = tracker("application", "on");
        // The app names the page: the route's shape, never the address.
        tracking?.pageview("/commerce/orders");
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
        expect(
            posthog.sent.flatMap((s) => s.events.map((e) => e.event)),
        ).not.toContain("$snapshot");

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

        // Recordings and page visits (DEC-160), and nothing else.
        const events = posthog.sent.flatMap((s) => s.events);
        expect(new Set(events.map((e) => e.event))).toEqual(
            new Set(["$snapshot", "$pageview"]),
        );
        const recorded = events.find((e) => e.event === "$snapshot");
        expect(recorded?.properties?.distinct_id).toBe("user_1");

        // One visit, to the page the app named, in the recording's session.
        const visits = events.filter((e) => e.event === "$pageview");
        expect(visits).toHaveLength(1);
        const visit = visits[0]?.properties ?? {};
        expect(visit.$current_url).toBe(
            `${window.location.origin}/commerce/orders`,
        );
        expect(visit.$pathname).toBe("/commerce/orders");
        expect(visit.distinct_id).toBe("user_1");
        expect(visit.organization_id).toBe("org_1");
        expect(visit.$session_id).toBe(recorded?.properties?.$session_id);
        // Not the tab's title (it names the business), not where they
        // came from, and no person property.
        for (const key of Object.keys(visit))
            expect(key).not.toMatch(
                /^title$|referr|^\$initial_|^\$session_entry_|^\$set/u,
            );
        expect(visits[0]).not.toHaveProperty("$set");
        expect(visits[0]).not.toHaveProperty("$set_once");
        expect(JSON.stringify(visits)).not.toMatch(/Northwind|ORD-007/u);
    }, 20_000);
});
