import { describe, expect, it } from "vitest";

import { COMING_NEXT } from "./changelog";
import { byComingGroup, COMING_GROUPS } from "./coming";
import { plannedIntegrations } from "./integrations";

/**
 * The two public lists of planned work: the changelog's Coming next and the
 * Integrations page's Planned (QR codes plan U10). They say what's coming,
 * truthfully: nothing a merchant can already do is listed, no row names a
 * plan or a price, and the two pages never disagree about a row.
 */
const lists = [
    ["Coming next", COMING_NEXT],
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
    it("are the nearest months, then Early 2027, then Later", () => {
        expect(COMING_GROUPS.map((group) => group.label)).toEqual([
            "Nov–Dec 2026",
            "Early 2027",
            "Later",
        ]);
    });

    it("give only the nearest group its months, and Later no date", () => {
        const [, early, later] = COMING_GROUPS;
        expect(early.label).not.toMatch(/jan|feb|mar|apr|–/i);
        expect(later.label).not.toMatch(/\d/);
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
            ["Nov–Dec 2026", ["a", "b"]],
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

    it("has all three groups", () => {
        expect(byComingGroup(rows).map((group) => group.key)).toEqual(
            COMING_GROUPS.map((group) => group.key),
        );
    });

    it("is words only: a group, a name and a line, and never a link", () => {
        for (const row of rows) {
            expect(Object.keys(row).sort()).toEqual(["group", "line", "name"]);
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

    it("keeps social publishing in Later: it is not a current priority", () => {
        const social = rows.filter((row) => /social|canva/i.test(row.name));
        expect(social.map((row) => row.name).sort()).toEqual([
            "Canva",
            "Social publishing",
        ]);
        expect(social.every((row) => row.group === "later")).toBe(true);
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
            const coming = COMING_NEXT.find((item) => item.line === row.line);
            expect(coming, row.name).toBeTruthy();
            expect(coming?.group, row.name).toBe(row.group);
        }
    });

    it("list as integrations only what connects to another service", () => {
        expect(plannedIntegrations.map((row) => row.name)).toEqual([
            "Automatic WhatsApp messages",
            "Google Calendar",
            "Google Meet and Zoom",
            "Shopify import",
            "PhonePe",
            "Shiprocket",
            "Google Business Profile",
            "Tally and Zoho Books export",
            "Social publishing",
            "Canva",
        ]);
        const planned = plannedIntegrations.map((row) => row.line);
        const ownWork = COMING_NEXT.filter(
            (item) => !planned.includes(item.line),
        ).map((item) => item.name);
        expect(ownWork).toEqual([
            "QR codes",
            "Saroh for Android",
            "Invoice layouts",
            "Sign in with Google",
            "Bring your own login",
            "API keys and webhooks",
        ]);
    });

    it("keep QR codes in the nearest group until they are released", () => {
        expect(
            COMING_NEXT.find((item) => item.name === "QR codes")?.group,
        ).toBe("next");
    });
});
