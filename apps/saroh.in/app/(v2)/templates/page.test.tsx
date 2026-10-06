// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { galleryTemplates } from "@/content/templates";

import TemplatesPage from "./page";

/**
 * /templates (Resources plan U6, industry templates U13): a 404 before
 * early access's day in India unless a preview asks; from that day the
 * gallery's templates as cards, chips only for kinds with one, the sample
 * note, and the band.
 */
const mocked = vi.hoisted(() => {
    const env: Record<string, string | undefined> = {};
    return { env };
});
vi.mock("@/env", () => mocked);
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
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocked.env = {};
});

function renderAt(iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    return render(<TemplatesPage />);
}

describe("/templates", () => {
    it("is a 404 at 23:59 in India on 16 Oct", () => {
        expect(() => renderAt("2026-10-16T18:29:00Z")).toThrow(
            "NEXT_NOT_FOUND",
        );
    });

    it("shows on a preview before its day, with the pre-launch band", () => {
        mocked.env = { RESOURCES_PREVIEW: "1" };
        renderAt("2026-10-10T06:00:00Z");
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Pick a site that looks like your business.",
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "Pick one now. It's ready for you on 17 Oct.",
            }),
        ).toBeTruthy();
    });

    it("lists every gallery template as a card linking to its page, from 17 Oct", () => {
        renderAt("2026-10-16T18:31:00Z");
        const cards = screen
            .getAllByRole("heading", { level: 2 })
            .map((h) => h.textContent);
        const names = galleryTemplates().map((t) => t.name);
        expect(cards.slice(0, names.length)).toEqual(names);
        expect(
            document
                .querySelector('[data-template="gym"]')
                ?.getAttribute("href"),
        ).toBe("/templates/gym");
        expect(
            screen.getByText(/Every business shown is a sample/),
        ).toBeTruthy();
        expect(screen.getByText(/^Seven templates/)).toBeTruthy();
        // The pre-launch line is gone on the day.
        expect(screen.queryByText(/ready for you on 17 Oct/)).toBeNull();
        expect(screen.queryByText(/Plan/)).toBeNull();
    });

    it("filters by kind, with chips only for kinds that have a template", () => {
        renderAt("2026-10-16T18:31:00Z");
        const group = screen.getByRole("group", { name: "Kind of business" });
        const chips = Array.from(group.querySelectorAll("button")).map(
            (b) => b.textContent,
        );
        expect(chips).toEqual([
            "All",
            "Gyms & studios",
            "Clinics",
            "Dieticians & coaches",
            "Bakeries & food",
            "Shops",
            "Creators",
        ]);
        fireEvent.click(screen.getByRole("button", { name: "Creators" }));
        expect(
            screen
                .getByRole("button", { name: "Creators" })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        const shown = Array.from(
            document.querySelectorAll("[data-template]"),
        ).map((a) => a.getAttribute("data-template"));
        expect(shown).toEqual(["store", "blogs", "studio", "developer"]);
        expect(screen.getByRole("status").textContent).toBe(
            "4 templates for Creators",
        );
        fireEvent.click(screen.getByRole("button", { name: "All" }));
        expect(document.querySelectorAll("[data-template]")).toHaveLength(
            galleryTemplates().length,
        );
    });

    it("its band's button is the waitlist's, from the one CTA builder", () => {
        renderAt("2026-10-16T18:31:00Z");
        const button = screen.getByRole("link", { name: "Join the waitlist" });
        expect(button.getAttribute("href")).toBe(
            "/waitlist?src=templates-band",
        );
    });
});
