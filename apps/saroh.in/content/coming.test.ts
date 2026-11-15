import { describe, expect, it } from "vitest";

import { featuresOff } from "@/lib/feature-switches";
import {
    byComingGroup,
    COMING,
    COMING_GROUPS,
    COMING_ITEMS,
    shownComing,
} from "./coming";

import { plannedIntegrations } from "./integrations";

/**
 * The two public lists of planned work: the changelog's Coming next and the
 * Integrations page's Planned (QR codes plan U10). They say what's coming,
 * truthfully: nothing a merchant can already do is listed, no row names a
 * plan or a price, and the two pages never disagree about a row.
 */
const lists = [
    ["Coming next", COMING_ITEMS],
    ["Planned integrations", plannedIntegrations],
] as const;

const groupIndex = (key: string) =>
    COMING_GROUPS.findIndex((group) => group.key === key);

/**
 * Built, so never "coming" (checked on `development`, 10 Oct 2026): CSV
 * import (#175), and a merchant's own Meta Pixel and Google Analytics
 * (Website › Settings › Tracking, #889).
 */
const BUILT = /\bcsv\b|spreadsheet|\bpixel\b|google analytics|\btrackers?\b/i;

/** The repo is public: no plan, price or effort on these pages. */
const PLAN_OR_PRICE =
    /\b(plans?|free|grow|pro|starter|premium|paid|price[ds]?|pricing|rupees?|rs\.?|inr|a month|per month|monthly|yearly|weeks?|sprints?)\b|₹/i;

describe("the groups", () => {
    it("are Coming next, then Later, with no date", () => {
        expect(COMING_GROUPS.map((group) => group.label)).toEqual([
            "Coming next",
            "Later",
        ]);
    });

    it("put rows under their group, nearest first, and leave out an empty one", () => {
        const rows = [
            { group: "later", name: "c" },
            { group: "next", name: "a" },
            { group: "next", name: "b" },
        ] as const;
        expect(
            byComingGroup(rows).map((group) => [
                group.label,
                group.rows.map((row) => row.name),
            ]),
        ).toEqual([
            ["Coming next", ["a", "b"]],
            ["Later", ["c"]],
        ]);
    });
});

describe.each(lists)("%s", (_title, rows) => {
    it("has every row in a known group, written in the order it is shown", () => {
        const order = rows.map((row) => groupIndex(row.group));
        expect(order).not.toContain(-1);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("has both groups", () => {
        expect(byComingGroup(rows).map((group) => group.key)).toEqual(
            COMING_GROUPS.map((group) => group.key),
        );
    });

    it("is words only: a group, a name and a line, and never a link", () => {
        for (const row of rows) {
            // `integration` only says which page lists it too, and
            // `hiddenWhenOn` which switch ships it.
            expect(
                Object.keys(row)
                    .filter(
                        (key) =>
                            key !== "integration" && key !== "hiddenWhenOn",
                    )
                    .sort(),
            ).toEqual(["group", "line", "name"]);
            expect(`${row.name} ${row.line}`).not.toMatch(/https?:|www\.|\//);
        }
    });

    it("names each thing once", () => {
        const names = rows.map((row) => row.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("lists nothing that is already built", () => {
        for (const row of rows) {
            expect(`${row.name}: ${row.line}`).not.toMatch(BUILT);
        }
    });

    it("names no plan, price or effort", () => {
        for (const row of rows) {
            expect(`${row.name}: ${row.line}`).not.toMatch(PLAN_OR_PRICE);
        }
    });

    it("doesn't say what today's email does: only what WhatsApp will", () => {
        // "…on WhatsApp, not just email" read as if booking reminders go by
        // email today. None does (ledger BK2).
        for (const row of rows) {
            expect(row.line).not.toMatch(/not just email/i);
        }
    });

    it("has posting to social networks coming next, and Canva later (owner, 4 Nov 2026; renamed 13 Nov)", () => {
        const groupOf = (name: string) =>
            rows.find((row) => row.name === name)?.group;
        expect(groupOf("Posting to social networks")).toBe("next");
        expect(groupOf("Saroh Social")).toBe(undefined);
        expect(groupOf("Canva")).toBe("later");
    });

    it("writes no em-dash aside", () => {
        for (const row of rows) {
            expect(`${row.name} ${row.line}`).not.toContain("—");
        }
    });
});

describe("the two lists together", () => {
    it("say each integration in the changelog's words, in its group", () => {
        for (const row of plannedIntegrations) {
            const coming = COMING_ITEMS.find((item) => item.line === row.line);
            expect(coming, row.name).toBeTruthy();
            expect(coming?.group, row.name).toBe(row.group);
        }
    });

    it("list as integrations only what connects to another service", () => {
        expect(plannedIntegrations.map((row) => row.name)).toEqual([
            "Automatic WhatsApp messages",
            "Google Calendar sync",
            "Google Meet and Zoom links",
            "Posting to social networks",
            "Shopify import",
            "PhonePe",
            "Shiprocket",
            "Google Business Profile",
            "Tally and Zoho Books export",
            "Canva",
        ]);
        const planned = plannedIntegrations.map((row) => row.line);
        const ownWork = COMING_ITEMS.filter(
            (item) => !planned.includes(item.line),
        ).map((item) => item.name);
        expect(ownWork).toEqual([
            "Saroh for Android",
            "Invoice layouts",
            "Sign in with Google",
            "Bring your own login",
            "API keys and webhooks",
        ]);
    });

    it("drop QR codes once released: they are in the launch entry", () => {
        expect(COMING.find((item) => item.name === "QR codes")).toBe(undefined);
    });

    it("never promise a booking reminder: none is sent on any channel yet", () => {
        for (const item of COMING) {
            expect(item.line).not.toMatch(/reminder/i);
        }
    });
});

describe("the rows follow the release switches (plan 2026-11-13-002, U11)", () => {
    const names = (off: string[]) => shownComing(off).map((row) => row.name);

    it("lists API keys and webhooks as coming only while Developers is off", () => {
        expect(names(["developers"])).toContain("API keys and webhooks");
        expect(names([])).not.toContain("API keys and webhooks");
        // Nothing else moves.
        expect(names([])).toEqual(
            names(["developers"]).filter((n) => n !== "API keys and webhooks"),
        );
    });

    it("builds its list from this build's switches", () => {
        expect(COMING.map((row) => row.name)).toEqual(
            shownComing(featuresOff()).map((row) => row.name),
        );
    });

    it("never says Saroh posts for you", () => {
        for (const row of COMING_ITEMS) {
            expect(`${row.name} ${row.line}`).not.toMatch(
                /posts? (it )?for you|automatically post|auto-?post|on its own/i,
            );
        }
    });
});
