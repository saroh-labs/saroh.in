import type { ApiUsageView } from "@saroh/api-contract";
import { describe, expect, it } from "vitest";

import { developersTabOf, developersTabsFor } from "./developers";

const usage = (over: Partial<ApiUsageView> = {}): ApiUsageView => ({
    at: "2026-11-11T10:00:00.000Z",
    minute: [],
    keys: { kinds: ["SECRET"], open: ["SECRET"], count: 0, cap: null },
    webhooks: { open: true, count: 0, cap: null },
    ...over,
});
const tabs = (actions: string[], u: ApiUsageView | null = usage()) =>
    developersTabsFor(actions, u).map((t) => t.tab);

describe("API and AI apps tabs", () => {
    it("gives the Owner all four", () => {
        expect(tabs(["apikey:manage", "webhook:manage"])).toEqual([
            "ai",
            "keys",
            "webhooks",
            "usage",
        ]);
    });

    it("gives a Member no Connections and no Notifications", () => {
        expect(tabs([], usage({ keys: null, webhooks: null }))).toEqual([
            "ai",
            "usage",
        ]);
    });

    it("leaves out a tab whose switch is off, once the API says so", () => {
        expect(
            tabs(
                ["apikey:manage", "webhook:manage"],
                usage({
                    keys: { kinds: [], open: [], count: 0, cap: null },
                    webhooks: null,
                }),
            ),
        ).toEqual(["ai", "usage"]);
        // Unread: by permission alone.
        expect(tabs(["webhook:manage"], null)).toEqual([
            "ai",
            "webhooks",
            "usage",
        ]);
    });

    it("reads the tab off the address", () => {
        expect(developersTabOf("/settings/developers")).toBe("index");
        expect(developersTabOf("/settings/developers/ai")).toBe("ai");
        expect(developersTabOf("/settings/developers/webhooks")).toBe(
            "webhooks",
        );
    });
});
