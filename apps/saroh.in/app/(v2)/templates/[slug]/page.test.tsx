// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { galleryTemplates } from "@/content/templates";

import TemplatePage, { generateStaticParams } from "./page";

/**
 * /templates/[slug] (industry templates U13): one page per gallery template,
 * a 404 before 17 Oct (unless previewed) and for any other slug; the save
 * button carries `template=` to the waitlist; the facts have no Plan row.
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

async function renderAt(slug: string, iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    const page = await TemplatePage({ params: Promise.resolve({ slug }) });
    return render(page);
}

const AFTER = "2026-10-16T18:31:00Z";

describe("/templates/[slug]", () => {
    it("builds one page per gallery template, and no other", () => {
        expect(generateStaticParams()).toEqual(
            galleryTemplates().map((t) => ({ slug: t.slug })),
        );
    });

    it("is a 404 before 17 Oct, and for a template the gallery doesn't show", async () => {
        await expect(renderAt("gym", "2026-10-16T18:29:00Z")).rejects.toThrow(
            "NEXT_NOT_FOUND",
        );
        await expect(renderAt("starter", AFTER)).rejects.toThrow(
            "NEXT_NOT_FOUND",
        );
        await expect(renderAt("salon", AFTER)).rejects.toThrow(
            "NEXT_NOT_FOUND",
        );
    });

    it("on a preview, says early access opens 17 Oct and saves the template to the waitlist", async () => {
        mocked.env = { RESOURCES_PREVIEW: "1" };
        await renderAt("gym", "2026-10-10T06:00:00Z");
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Gym: the week's classes, first.",
            }),
        ).toBeTruthy();
        const [save] = screen.getAllByRole("link", {
            name: "Save Gym for early access",
        });
        expect(save.getAttribute("href")).toBe(
            "/waitlist?template=gym&src=templates-gym",
        );
        expect(
            screen.getByText(
                "Early access opens 17 Oct. Join the waitlist by the 16th and we'll keep Gym for you.",
            ),
        ).toBeTruthy();
        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "Start with Gym. It's ready for you on 17 Oct.",
            }),
        ).toBeTruthy();
    });

    it("shows the breadcrumb, the facts without a Plan row, and related templates", async () => {
        await renderAt("gym", AFTER);
        const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(crumbs.querySelector("a")?.getAttribute("href")).toBe(
            "/templates",
        );
        const terms = Array.from(document.querySelectorAll("dt")).map(
            (d) => d.textContent,
        );
        expect(terms).toEqual(["Pages", "Uses", "Type", "Colours"]);
        expect(
            screen.getByText("Bookings, Payments and Class packs"),
        ).toBeTruthy();
        expect(screen.getByText("Archivo Narrow and Archivo")).toBeTruthy();
        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "Also built around one thing",
            }),
        ).toBeTruthy();
        // Every save button names Gym; none on the day promises 17 Oct.
        for (const link of screen.getAllByRole("link", {
            name: "Save Gym for early access",
        })) {
            expect(link.getAttribute("href")).toMatch(
                /^\/waitlist\?template=gym&/,
            );
        }
        expect(screen.queryByText(/ready for you on 17 Oct/)).toBeNull();
    });

    it("switches pages and devices in the frame", async () => {
        await renderAt("gym", AFTER);
        const view = () =>
            document
                .querySelector("[data-template-view]")
                ?.getAttribute("data-template-view");
        expect(view()).toBe("/:desktop");
        fireEvent.click(screen.getByRole("button", { name: "Timetable" }));
        expect(view()).toBe("/timetable:desktop");
        fireEvent.click(screen.getByRole("button", { name: "Phone" }));
        expect(view()).toBe("/timetable:phone");
        expect(
            screen.getByRole("img", {
                name: /The Gym template's Timetable page on a phone/,
            }),
        ).toBeTruthy();
    });

    it("a one-page template has no page switcher", async () => {
        await renderAt("bakery", AFTER);
        expect(screen.queryByRole("group", { name: "Pages" })).toBeNull();
        expect(screen.getByRole("group", { name: "Show it on" })).toBeTruthy();
    });
});
