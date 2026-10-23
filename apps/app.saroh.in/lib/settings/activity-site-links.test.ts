/**
 * Settings › Activity tells the links made in Saroh (DEC-181, #1099): made,
 * archived and brought back on Insights › Where customers come from, each
 * with the link's name and label, opening that website's tab.
 */
import { describe, expect, it } from "vitest";

import type { AuditEventRow } from "./activity";
import { ACTIVITY_ACTIONS, activityLine } from "./activity";

const priya = { name: "Priya", email: "priya@example.com" };

function event(action: string, metadata: unknown): AuditEventRow {
    return {
        id: "evt_1",
        action,
        actorUserId: "u_priya",
        targetType: "site-link",
        targetId: "link_1",
        outcome: "SUCCESS",
        metadata,
        createdAt: "2026-10-22T03:44:00.000Z",
        actor: priya,
        target: null,
    };
}

const META = { siteId: "site_1", name: "Diwali post", label: "diwali-post" };

describe("a link made in Saroh", () => {
    it("is asked for, made, archived and brought back", () => {
        for (const action of [
            "site-link.created",
            "site-link.archived",
            "site-link.restored",
        ]) {
            expect(ACTIVITY_ACTIONS).toContain(action);
        }
    });

    it("says which link, and opens its website's Where customers come from", () => {
        expect(activityLine(event("site-link.created", META))).toEqual({
            id: "evt_1",
            at: "2026-10-22T03:44:00.000Z",
            who: "Priya",
            what: "made the link Diwali post (diwali-post)",
            where: {
                label: "Insights",
                href: "/analytics?tab=from&siteId=site_1",
            },
        });
        expect(activityLine(event("site-link.archived", META))?.what).toBe(
            "archived the link Diwali post (diwali-post)",
        );
        expect(activityLine(event("site-link.restored", META))?.what).toBe(
            "brought back the link Diwali post (diwali-post)",
        );
    });

    it("says a link when the row names none", () => {
        expect(activityLine(event("site-link.created", {}))).toMatchObject({
            what: "made a link",
            where: { href: "/analytics?tab=from" },
        });
    });
});
