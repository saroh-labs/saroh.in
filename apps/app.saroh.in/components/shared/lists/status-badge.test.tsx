import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrderStatusFilter } from "@/components/commerce/orders/order-tabs";
import { LeadsViewSwitch } from "@/components/leads/leads-view-switch";
import { SinceNotice } from "@/components/shared/notices/since-notice";
import { SectionList } from "@/components/shared/page/section-list";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOrdersQuery } from "@/lib/orders/list-query";
import type { Thing } from "@/lib/status/vocabulary";
import { publication, PUBLICATION_WORD } from "@/lib/status/vocabulary";
import { Chip, chipClass } from "./chip";
import { StatusBadge } from "./status-badge";

const html = renderToStaticMarkup;

/** The opening tag of the link to `href`, whatever order its attributes are in. */
function linkTo(markup: string, href: string): string {
    const tags = markup.match(/<a\s[^>]*>/g) ?? [];
    return tags.find((t) => t.includes(`href="${href}"`)) ?? "";
}

describe("the status vocabulary", () => {
    it("says Live for every kind of thing customers can get", () => {
        const live: [Thing, string][] = [
            ["product", "PUBLISHED"],
            ["plan", "ACTIVE"],
            ["course", "OPEN"],
            ["pack", "ACTIVE"],
            ["post", "PUBLISHED"],
            ["service", "TAKING"],
            ["discount", "ACTIVE"],
        ];
        for (const [thing, status] of live) {
            expect(publication(thing, status).word, thing).toBe("Live");
            expect(publication(thing, status).tone).toBe("success");
        }
    });

    it("says Draft for every kind of thing still being made", () => {
        for (const thing of [
            "product",
            "plan",
            "course",
            "pack",
            "post",
        ] as const) {
            expect(publication(thing, "DRAFT").word).toBe("Draft");
        }
    });

    it("gives each off state one word with one meaning", () => {
        expect(publication("service", "NOT_TAKING").word).toBe("Paused");
        expect(publication("course", "CLOSED").word).toBe("Paused");
        expect(publication("discount", "EXPIRED").word).toBe("Ended");
        expect(publication("discount", "EXHAUSTED").word).toBe("Ended");
        expect(publication("discount", "SCHEDULED").word).toBe("Scheduled");
        expect(publication("product", "ARCHIVED").word).toBe("Archived");
        expect(Object.values(PUBLICATION_WORD)).toEqual([
            "Draft",
            "Scheduled",
            "Live",
            "Paused",
            "Ended",
            "Archived",
        ]);
    });

    it("keeps the thing's own sentence as the hint", () => {
        expect(publication("service", "TAKING").hint).toBe("Taking bookings.");
        expect(publication("plan", "ACTIVE").hint).toBe("Open to sign-ups.");
        expect(publication("pack", "ACTIVE").hint).toBe("On sale.");
    });

    it("never claims Live for a status it doesn't know", () => {
        expect(publication("product", "SOMETHING_NEW").word).toBe("Draft");
    });

    it("has no em dash or semicolon in anything a person reads", () => {
        const things: Thing[] = [
            "product",
            "plan",
            "course",
            "pack",
            "post",
            "service",
            "discount",
        ];
        const statuses = [
            "DRAFT",
            "PUBLISHED",
            "ACTIVE",
            "OPEN",
            "CLOSED",
            "ARCHIVED",
            "TAKING",
            "NOT_TAKING",
            "SCHEDULED",
            "EXPIRED",
            "EXHAUSTED",
        ];
        for (const t of things) {
            for (const s of statuses) {
                expect(publication(t, s).hint).not.toMatch(/[—;]/);
            }
        }
    });
});

describe("StatusBadge", () => {
    it("draws a thing's status in the vocabulary's word, sentence case, with its hint as the description", () => {
        const out = html(<StatusBadge thing="service" status="NOT_TAKING" />);
        expect(out).toContain(">Paused<");
        expect(out).toContain('aria-description="Not taking bookings."');
        expect(out).toContain('data-status="paused"');
        expect(out).not.toMatch(/uppercase|brand|highlight/);
    });

    it("draws any other state with its own words and a tone", () => {
        const out = html(<StatusBadge tone="error">Overdue</StatusBadge>);
        expect(out).toContain(">Overdue<");
        expect(out).toContain("bg-destructive-subtle");
    });

    it("maps every screen's tone names onto the one badge", () => {
        expect(html(<StatusBadge tone="ok">Paid</StatusBadge>)).toContain(
            "bg-success-subtle",
        );
        expect(html(<StatusBadge tone="bad">Failed</StatusBadge>)).toContain(
            "bg-destructive-subtle",
        );
        // What was a Saffron tint is a solid Ink edge.
        const active = html(<StatusBadge tone="accent">Due</StatusBadge>);
        expect(active).toContain("border-foreground");
        expect(active).not.toMatch(/brand|highlight/);
    });

    it("is not a control: no hover, no focus ring, no tab stop", () => {
        const out = html(<StatusBadge tone="neutral">Archived</StatusBadge>);
        expect(out).not.toMatch(/hover:|focus|tabindex/);
    });
});

describe("the call sites moved onto the shared pieces", () => {
    it("a list's status filter: one dropdown in the toolbar's row, never tabs or chips", () => {
        const out = html(
            <OrderStatusFilter
                query={readOrdersQuery({ tab: "open" })}
                counts={{ all: 12, open: 3, refunded: 0 }}
                go={() => undefined}
            />,
        );
        expect(out).toMatch(/role="combobox"[^>]*aria-label="Order status"/);
        expect(out).toContain("data-list-filter");
        // The box says the chosen status and how many it holds.
        expect(out).toMatch(/>Open <span data-value-count=""[^>]*>3</);
        expect(out).not.toMatch(
            /data-tab-strip|role="tab|role="radio"|data-count-badge|aria-current| · /,
        );
        expect(out).not.toMatch(/--brand|highlight/);
    });

    it("a view switch: the one segmented control, as links", () => {
        const out = html(<LeadsViewSwitch current="board" />);
        expect(out).toContain('<nav data-segmented="" aria-label="Leads view"');
        expect(linkTo(out, "/pipeline")).toContain('aria-current="page"');
        expect(out).toMatch(/bg-primary[^"]*text-primary-foreground/);
    });

    it("a chip: a radio by default, a toggle for a filter, one look for both", () => {
        const radio = html(<Chip on>UPI</Chip>);
        expect(radio).toContain('role="radio"');
        expect(radio).toContain('aria-checked="true"');
        const toggle = html(
            <Chip on={false} as="toggle">
                Returning
            </Chip>,
        );
        expect(toggle).toContain('aria-pressed="false"');
        expect(toggle).not.toContain('role="radio"');
        expect(chipClass(true)).toContain("bg-primary");
        expect(chipClass(true)).toContain("coarse:h-11");
    });

    it("the section list: a vertical tablist with one tab stop, or a nav of links", () => {
        const tabs = html(
            <SectionList
                label="Settings sections"
                idPrefix="settings-tab"
                phone="hidden"
                value="address"
                onValueChange={() => undefined}
                items={[
                    { value: "address", label: "Address", controls: "p-a" },
                    { value: "search", label: "Search", controls: "p-s" },
                ]}
            />,
        );
        expect(tabs).toContain('role="tablist"');
        expect(tabs).toContain('aria-orientation="vertical"');
        expect(tabs).toMatch(
            /id="settings-tab-address"[^>]*aria-selected="true"[^>]*tabindex="0"/,
        );
        expect(tabs).toMatch(/id="settings-tab-search"[^>]*tabindex="-1"/);

        const links = html(
            <SectionList
                label="Settings"
                value="/settings/team"
                items={[
                    {
                        value: "/settings",
                        label: "Business",
                        href: "/settings",
                    },
                    {
                        value: "/settings/team",
                        label: "Team",
                        href: "/settings/team",
                    },
                ]}
            />,
        );
        expect(links).toContain('<nav aria-label="Settings"');
        expect(linkTo(links, "/settings/team")).toContain(
            'aria-current="page"',
        );
        expect(links).not.toMatch(/brand|highlight/);
    });

    it("the two thin notices keep their wording on the one Notice", () => {
        const note = html(<ReadOnlyNote />);
        expect(note).toContain('role="note"');
        expect(note).toContain("data-notice");
        expect(note).toContain(
            "Your role can read these settings but not change them.",
        );
        const since = html(
            <SinceNotice
                count={3}
                noun={{ one: "order", other: "orders" }}
                verb="placed"
                clearHref="/commerce/orders"
            />,
        );
        expect(since).toContain('role="status"');
        expect(since).toContain(
            "Only the 3 orders placed in the last 24 hours.",
        );
        expect(linkTo(since, "/commerce/orders")).toContain("underline");
        expect(since).toContain("Show all orders");
    });
});
