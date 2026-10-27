// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    CHANGELOG,
    CHANGELOG_ENTRIES,
    COMING_NEXT,
    changelogView,
} from "@/content/changelog";
import { byComingGroup } from "@/content/coming";

import ChangelogPage from "./page";

/**
 * /changelog (plan U4): before the first entry's day in India, the
 * pre-launch state; from that day, the entry. Coming next never links.
 */
vi.mock("@/env", () => ({ env: {} }));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/** 23:59 and 00:01 in India, the night of 16–17 Oct. */
const BEFORE = "2026-10-16T18:29:00Z";
const AFTER = "2026-10-16T18:31:00Z";

const ctx = (iso: string) => ({
    now: new Date(iso),
    preview: false,
    routes: null,
});

function renderAt(iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    return render(<ChangelogPage />);
}

describe("changelogView", () => {
    it("is the pre-launch state, naming 17 Oct, before the first entry's day", () => {
        expect(changelogView(ctx(BEFORE))).toEqual({
            state: "pre-launch",
            firstDay: "2026-10-17",
        });
    });

    it("lists the entries, newest first, from that day", () => {
        const view = changelogView(ctx(AFTER));
        expect(view.state).toBe("entries");
        if (view.state === "entries") {
            expect(view.entries.map((e) => e.slug)).toEqual(["saroh-is-open"]);
        }
    });

    it("adds the 18 Oct entry on its day in India, newest first", () => {
        // 23:59 and 00:01 in India, the night of 17–18 Oct.
        const before = changelogView(ctx("2026-10-17T18:29:00Z"));
        const after = changelogView(ctx("2026-10-17T18:31:00Z"));
        if (before.state !== "entries" || after.state !== "entries") {
            throw new Error("expected entries");
        }
        expect(before.entries.map((e) => e.slug)).toEqual(["saroh-is-open"]);
        expect(after.entries.map((e) => e.slug)).toEqual([
            "products-tidied-up",
            "saroh-is-open",
        ]);
    });
});

describe("entries", () => {
    const words = (e: (typeof CHANGELOG_ENTRIES)[number]) =>
        [
            e.title,
            e.summary,
            e.lead,
            e.description,
            ...e.sections.flatMap((s) => [s.name, s.body, s.link?.label]),
        ].join("\n");

    it("have one slug each, and list newest first in the file", () => {
        const slugs = CHANGELOG_ENTRIES.map((e) => e.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        const days = CHANGELOG_ENTRIES.map((e) => e.publishOn);
        expect(days).toEqual([...days].sort().reverse());
    });

    it("say location, never storefront, with no em dash or exclamation", () => {
        for (const e of CHANGELOG_ENTRIES) {
            expect(words(e)).not.toMatch(/storefront|\bstores?\b|—|!/i);
        }
    });

    it("name no price, plan or Saroh billing (owner, 18 Oct)", () => {
        const entry = CHANGELOG_ENTRIES.find(
            (e) => e.slug === "products-tidied-up",
        );
        expect(entry).toBeTruthy();
        if (!entry) return;
        expect(words(entry)).not.toMatch(
            /₹|\bplans?\b|\bgrow\b|\bpro\b|refund|cancel|subscription|admin|demo|billing details/i,
        );
        // Every link is a page of the site's own.
        for (const s of entry.sections) {
            if (s.link) expect(s.link.href).toMatch(/^\/features\//);
        }
    });
});

describe("/changelog", () => {
    it("before 17 Oct: one H1, 'First entry on 17 October', and no entry link", () => {
        renderAt(BEFORE);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByText("First entry on 17 October")).toBeTruthy();
        expect(document.querySelector('a[href^="/changelog/"]')).toBeNull();
    });

    it("from 17 Oct: the launch entry, linked to its note", () => {
        renderAt(AFTER);
        expect(screen.queryByText("First entry on 17 October")).toBeNull();
        const row = document.querySelector(
            'a[href="/changelog/saroh-is-open"]',
        );
        expect(row?.textContent).toContain("Early access is open");
        expect(row?.textContent).toContain("17 Oct 2026");
    });

    it("Coming next: every row says it isn't available, and none links", () => {
        renderAt(AFTER);
        const section = screen
            .getByRole("heading", { name: CHANGELOG.comingTitle })
            .closest("section");
        expect(section).toBeTruthy();
        expect(section?.querySelectorAll("a")).toHaveLength(0);
        expect(section?.querySelectorAll("li")).toHaveLength(
            COMING_NEXT.length,
        );
        expect(
            Array.from(section?.querySelectorAll("li") ?? []).every((li) =>
                li.textContent.includes(CHANGELOG.notYet),
            ),
        ).toBe(true);
        expect(CHANGELOG.notYet).toBe("Not available yet");
    });

    it("Coming next: each group's label is drawn once, over its rows, in order", () => {
        renderAt(AFTER);
        const section = screen
            .getByRole("heading", { name: CHANGELOG.comingTitle })
            .closest("section");
        if (!section) throw new Error("no Coming next section");
        const labels = within(section).getAllByRole("heading", { level: 3 });
        expect(labels.map((h) => h.textContent)).toEqual([
            "Nov–Dec 2026",
            "Early 2027",
            "Later",
        ]);
        const groups = byComingGroup(COMING_NEXT);
        const lists = within(section).getAllByRole("list");
        expect(lists).toHaveLength(groups.length);
        lists.forEach((list, i) => {
            const group = groups[i];
            expect(list.getAttribute("aria-labelledby")).toBe(labels[i].id);
            const rows = within(list).getAllByRole("listitem");
            expect(rows).toHaveLength(group.rows.length);
            // The label is on the group's first row and no other.
            expect(rows[0].contains(labels[i])).toBe(true);
            rows.forEach((row, r) => {
                expect(row.textContent).toContain(group.rows[r].name);
                expect(row.textContent).toContain(group.rows[r].line);
                if (r > 0) expect(row.textContent).not.toContain(group.label);
            });
        });
    });

    it("Coming next: no row names a plan or a price, or anything built", () => {
        renderAt(AFTER);
        const section = screen
            .getByRole("heading", { name: CHANGELOG.comingTitle })
            .closest("section");
        expect(section?.textContent).not.toMatch(
            /every plan|free plan|\bplans?\b|\bgrow\b|\bpro\b|₹|\bprice/i,
        );
        expect(section?.textContent).not.toMatch(
            /\bcsv\b|\bpixel\b|google analytics/i,
        );
    });

    it("lists CSV import as shipped, never as coming (#816)", () => {
        expect(COMING_NEXT.map((item) => item.name)).not.toContain(
            "CSV import",
        );
        const launch = CHANGELOG_ENTRIES.find(
            (e) => e.slug === "saroh-is-open",
        );
        expect(launch?.sections.map((s) => s.name)).toContain(
            "Bring your lists in",
        );
    });

    it("has the email field that joins the list", () => {
        renderAt(BEFORE);
        expect(screen.getByLabelText("Email")).toBeTruthy();
        expect(
            screen.getByRole("button", { name: CHANGELOG.signupLabel }),
        ).toBeTruthy();
    });
});
