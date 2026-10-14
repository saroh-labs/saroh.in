import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    PUBLISHED_ON,
    SAROH_OLD_HELP_URL,
    SAROH_SITE_URL,
    sarohFooterLinks,
} from "./saroh-links";

const resources = readFileSync(
    path.resolve(__dirname, "../../../../apps/saroh.in/content/resources.ts"),
    "utf8",
);

/** A page's `publishOn` in the marketing site's own table. */
function publishOn(id: string): string | undefined {
    return new RegExp(
        `id: "${id}",[\\s\\S]*?publishOn: "(\\d{4}-\\d{2}-\\d{2})"`,
    ).exec(resources)?.[1];
}

describe("the days the footer's pages publish", () => {
    it.each(["privacy", "terms", "help"] as const)(
        "%s is the marketing site's own publishOn",
        (id) => {
            expect(publishOn(id)).toBe(PUBLISHED_ON[id]);
        },
    );

    it("has a page on the marketing site at each address", () => {
        for (const page of ["privacy", "terms", "help"]) {
            expect(resources).toContain(`href: "/${page}"`);
        }
    });
});

describe("sarohFooterLinks", () => {
    it("is Privacy, Terms and Help once all three are published", () => {
        expect(sarohFooterLinks(new Date("2026-10-17T00:00:00+05:30"))).toEqual(
            [
                { label: "Privacy", href: `${SAROH_SITE_URL}/privacy` },
                { label: "Terms", href: `${SAROH_SITE_URL}/terms` },
                { label: "Help", href: `${SAROH_SITE_URL}/help` },
            ],
        );
    });

    it("sends Help to the old help site until Help publishes", () => {
        const links = sarohFooterLinks(new Date("2026-10-16T23:59:59+05:30"));
        expect(links.map((l) => l.label)).toEqual(["Privacy", "Terms", "Help"]);
        expect(links.at(-1)?.href).toBe(SAROH_OLD_HELP_URL);
    });

    it("leaves out a page that is not published yet", () => {
        // The day before each one's own day, whatever those days are now.
        const dayBefore = (day: string) =>
            new Date(new Date(`${day}T12:00:00+05:30`).getTime() - 86_400_000);
        expect(
            sarohFooterLinks(dayBefore(PUBLISHED_ON.privacy)).map(
                (l) => l.label,
            ),
        ).not.toContain("Privacy");
        expect(
            sarohFooterLinks(dayBefore(PUBLISHED_ON.terms)).map((l) => l.label),
        ).not.toContain("Terms");
    });

    it("begins each page at midnight in India", () => {
        const labels = (at: Date) => sarohFooterLinks(at).map((l) => l.label);
        const midnight = new Date(`${PUBLISHED_ON.privacy}T00:00:00+05:30`);
        expect(labels(new Date(midnight.getTime() - 1))).not.toContain(
            "Privacy",
        );
        expect(labels(midnight)).toContain("Privacy");
    });
});
