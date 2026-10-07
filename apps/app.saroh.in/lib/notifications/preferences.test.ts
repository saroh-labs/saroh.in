import { describe, expect, it } from "vitest";

import type { AlertPreferences } from "./preferences";
import {
    ALERT_CHANGED_SINCE,
    alertGrid,
    alertSaved,
    alertUndo,
    alertUndoRefusal,
    withAlert,
} from "./preferences";

/** The API's answer for an owner with email connected and no WhatsApp. */
function prefs(over: Partial<AlertPreferences> = {}): AlertPreferences {
    return {
        alerts: [
            {
                key: "order",
                channels: { bell: true, email: false, whatsapp: false },
            },
            {
                key: "booking",
                channels: { bell: true, email: false, whatsapp: false },
            },
            {
                key: "failed",
                channels: { bell: true, email: true, whatsapp: false },
            },
            {
                key: "team",
                channels: { bell: true, email: false, whatsapp: false },
            },
        ],
        channels: {
            bell: { available: true },
            email: { available: true },
            whatsapp: { available: false, reason: "NO_PROVIDER" },
        },
        canConnect: true,
        ...over,
    };
}

describe("alertGrid", () => {
    it("with an older API, draws every switch off and disabled, and says why", () => {
        const grid = alertGrid({ status: "not-available" });
        expect(grid.rows.map((r) => r.label)).toEqual([
            "New order",
            "New booking",
            "Payment failed",
            "Someone joins the team",
        ]);
        for (const row of grid.rows) {
            for (const cell of row.cells) {
                expect(cell).toMatchObject({ on: false, disabled: true });
                // Not "off": that would say what this person hears.
                expect(cell.label).toMatch(/can't be chosen yet$/);
            }
        }
        expect(grid.notes.map((n) => n.id)).toEqual(["not-available"]);
    });

    it("names the Website row when the API offers it (DEC-071, T10)", () => {
        const grid = alertGrid({
            status: "ok",
            prefs: prefs({
                alerts: [
                    {
                        key: "site",
                        channels: { bell: true, email: true, whatsapp: false },
                    },
                ],
            }),
        });
        expect(grid.rows.map((r) => [r.label, r.note])).toEqual([
            ["Website goes live", "When a scheduled go-live runs, or couldn't"],
        ]);
        expect(grid.rows[0]?.cells[0]?.label).toBe(
            "Website goes live by Bell, on",
        );
    });

    it("never offers the Monday summary: nothing sends it (default 127)", () => {
        const grid = alertGrid({ status: "ok", prefs: prefs() });
        expect(grid.rows.map((r) => r.label)).not.toContain("Monday summary");
    });

    it("draws the person's choices, with no WhatsApp column while none is connected", () => {
        const grid = alertGrid({ status: "ok", prefs: prefs() });
        expect(grid.columns).toEqual(["bell", "email"]);
        expect(grid.notes).toEqual([]);
        const failed = grid.rows.find((r) => r.key === "failed");
        expect(failed?.cells.map((c) => [c.on, c.disabled, c.label])).toEqual([
            [true, false, "Payment failed by Bell, on"],
            [true, false, "Payment failed by Email, on"],
        ]);
    });

    it("with no email provider, email is off and fixed, with the way to connect one", () => {
        const grid = alertGrid({
            status: "ok",
            prefs: prefs({
                channels: {
                    bell: { available: true },
                    email: { available: false, reason: "NO_PROVIDER" },
                    whatsapp: { available: false, reason: "NO_PROVIDER" },
                },
            }),
        });
        const email = grid.rows[0]?.cells.find((c) => c.channel === "email");
        expect(email).toMatchObject({
            on: false,
            disabled: true,
            label: "New order by Email, off — no provider connected",
        });
        expect(grid.notes).toEqual([
            {
                id: "email",
                text: "Email alerts go out through your business's own email provider, and none is connected.",
                link: {
                    label: "Connect email in Providers",
                    href: "/settings/providers",
                },
            },
        ]);
    });

    it("Free: says the plan, links to it, and never sends to Providers (UX-006)", () => {
        const noEmail = {
            bell: { available: true as const },
            email: {
                available: false as const,
                reason: "NO_PROVIDER" as const,
            },
            whatsapp: {
                available: false as const,
                reason: "NO_PROVIDER" as const,
            },
        };
        const lock = {
            upgrade: "Grow",
            cta: "See Grow",
            href: "/settings/billing?plan=grow#change-plan",
        };
        const grid = alertGrid(
            { status: "ok", prefs: prefs({ channels: noEmail }) },
            lock,
        );
        expect(grid.notes[0]).toEqual({
            id: "email",
            text: "Email alerts go out through your business's own email provider, which comes with Grow. Saroh still emails owners and admins about each new enquiry.",
            link: {
                label: "See Grow",
                href: "/settings/billing?plan=grow#change-plan",
            },
        });
        // Someone who can't change the plan: the words, no link.
        const member = alertGrid(
            {
                status: "ok",
                prefs: prefs({ channels: noEmail, canConnect: false }),
            },
            lock,
        );
        expect(member.notes[0]?.link).toBeUndefined();
        expect(member.notes[0]?.text).toContain("comes with Grow");
    });

    it("tells someone who can't connect one who can, with no link", () => {
        const grid = alertGrid({
            status: "ok",
            prefs: prefs({
                canConnect: false,
                channels: {
                    bell: { available: true },
                    email: { available: false, reason: "NO_PROVIDER" },
                    whatsapp: { available: false, reason: "NO_PROVIDER" },
                },
            }),
        });
        expect(grid.notes[0]?.link).toBeUndefined();
        expect(grid.notes[0]?.text).toMatch(/Ask an owner/);
    });

    it("a WhatsApp cell appears once a provider is connected, and still can't be switched on", () => {
        const grid = alertGrid({
            status: "ok",
            prefs: prefs({
                channels: {
                    bell: { available: true },
                    email: { available: true },
                    whatsapp: { available: false, reason: "NO_NUMBER" },
                },
            }),
        });
        expect(grid.columns).toEqual(["bell", "email", "whatsapp"]);
        for (const row of grid.rows) {
            expect(
                row.cells.find((c) => c.channel === "whatsapp"),
            ).toMatchObject({ on: false, disabled: true });
        }
        expect(grid.notes.map((n) => n.id)).toEqual(["whatsapp"]);
    });

    it("draws no bell for a role that doesn't see the inbox", () => {
        const grid = alertGrid({
            status: "ok",
            prefs: prefs({
                channels: {
                    bell: { available: false, reason: "NO_INBOX" },
                    email: { available: true },
                    whatsapp: { available: false, reason: "NO_PROVIDER" },
                },
            }),
        });
        expect(grid.columns).toEqual(["email"]);
    });

    it("draws only the rows the API offers, and says so when there are none", () => {
        const some = alertGrid({
            status: "ok",
            prefs: prefs({
                alerts: prefs().alerts.filter((a) => a.key !== "failed"),
            }),
        });
        expect(some.rows.map((r) => r.key)).toEqual([
            "order",
            "booking",
            "team",
        ]);

        const none = alertGrid({ status: "ok", prefs: prefs({ alerts: [] }) });
        expect(none.rows).toEqual([]);
        expect(none.notes.map((n) => n.id)).toEqual(["nothing"]);
    });
});

describe("a switch and its Undo", () => {
    const change = { alert: "order", channel: "email", on: true } as const;

    it("moves the one switch before the API answers", () => {
        const next = withAlert(prefs(), change);
        expect(next.alerts[0]?.channels).toEqual({
            bell: true,
            email: true,
            whatsapp: false,
        });
        expect(next.alerts[1]).toEqual(prefs().alerts[1]);
    });

    it("says what the save did", () => {
        expect(alertSaved(change)).toBe("Email on for New order");
        expect(
            alertSaved({ alert: "failed", channel: "bell", on: false }),
        ).toBe("Bell off for Payment failed");
    });

    it("Undo puts the switch back, while it still reads as the save left it", () => {
        const undo = alertUndo(change);
        expect(undo.back).toEqual({
            alert: "order",
            channel: "email",
            on: false,
        });
        expect(alertUndoRefusal(undo, withAlert(prefs(), change))).toBeNull();
        // Changed back in another tab since: refused, in Settings' words.
        expect(alertUndoRefusal(undo, prefs())).toBe(ALERT_CHANGED_SINCE);
    });
});
