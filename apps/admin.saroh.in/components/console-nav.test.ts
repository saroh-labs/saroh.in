import { describe, expect, it } from "vitest";

import { navFor } from "@/components/console-nav";
import type { AdminPermission } from "@/lib/control-plane";

/**
 * The menu (admin console redesign U10, R15): grouped by job, with the
 * plain names, and filtered by what the operator may open. A redesign keeps
 * every screen the menu reached before (owner rule, 19 Oct), so the old
 * addresses are pinned here, moved where they moved.
 */

const EVERY: AdminPermission[] = [
    "platform:read",
    "organization:read",
    "organization:pii:read",
    "waitlist:read",
    "jobs:read",
    "webhooks:read",
    "providers:read",
    "flags:read",
    "staff:read",
    "audit:read",
    "pricing:read",
    "deployments:run",
    "saroh-billing:read",
    "saroh-leads:read",
];

const labels = (permissions: AdminPermission[]) =>
    navFor(permissions).map((group) => [
        group.label,
        group.items.map((item) => item.label),
    ]);

const hrefs = (permissions: AdminPermission[]) =>
    navFor(permissions).flatMap((group) =>
        group.items.map((item) => item.href),
    );

describe("navFor", () => {
    it("groups the menu by job, Home first, with the plain names", () => {
        expect(labels(EVERY)).toEqual([
            ["Home", ["Home"]],
            [
                "Help customers",
                [
                    "Businesses",
                    "Users",
                    "Reports",
                    "Messages",
                    "Waitlist",
                    "Leads",
                ],
            ],
            [
                "Money",
                [
                    "Subscriptions",
                    "Invoices",
                    "Needs action",
                    "Provider events",
                ],
            ],
            ["Product", ["Releases", "Plans and modules", "Usage"]],
            [
                "Keep it running",
                [
                    "Health",
                    "Jobs",
                    "Webhooks",
                    "Providers",
                    "Deployments",
                    "Team",
                    "Audit trail",
                ],
            ],
        ]);
        expect(navFor(EVERY)[0]?.plain).toBe(true);
    });

    it("links Users to /users and Releases to /releases, and no row says People", () => {
        const items = navFor(EVERY).flatMap((group) => group.items);
        expect(items.find((item) => item.label === "Users")?.href).toBe(
            "/users",
        );
        expect(items.find((item) => item.label === "Releases")?.href).toBe(
            "/releases",
        );
        expect(items.map((item) => item.label)).not.toContain("People");
        expect(items.map((item) => item.href)).not.toContain("/flags");
        expect(items.map((item) => item.href)).not.toContain("/people");
    });

    it("keeps every screen the menu reached before the redesign", () => {
        // `/` was Health; it is Home now and Health is `/health`. `/people`
        // and `/flags` redirect to `/users` and `/releases`.
        const before = [
            "/",
            "/businesses",
            "/reports",
            "/messages",
            "/usage",
            "/users",
            "/plans",
            "/releases",
            "/audit",
            "/billing/invoices",
            "/billing/subscriptions",
            "/billing/actions",
            "/billing/events",
            "/operations/jobs",
            "/operations/webhooks",
            "/operations/providers",
            "/deployments",
            "/team",
            "/waitlist",
            "/leads",
        ];
        const now = hrefs(EVERY);
        for (const href of before) expect(now).toContain(href);
        expect(now).toContain("/health");
    });

    it("shows only what the operator may open, and drops an empty group", () => {
        // A Release manager.
        expect(
            labels(["platform:read", "organization:read", "flags:read"]),
        ).toEqual([
            ["Home", ["Home"]],
            ["Help customers", ["Businesses", "Reports"]],
            ["Product", ["Releases", "Usage"]],
            ["Keep it running", ["Health"]],
        ]);
        // An Account manager reaches Home and their own leads board.
        expect(labels(["accounts:read", "saroh-leads:read"])).toEqual([
            ["Home", ["Home"]],
            ["Help customers", ["Leads"]],
        ]);
    });
});
