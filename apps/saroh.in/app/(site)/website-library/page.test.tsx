// @vitest-environment jsdom
import {
    BLOCK_META,
    blockFamilies,
    SECTION_TYPES,
} from "@saroh/block-contract";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIBRARY_BLOCKS } from "@/content/website-library";
import { resetAddress } from "@/lib/page-address";

import WebsiteLibraryRoute from "./page";

/**
 * /website-library (DEC-228, plan 2026-11-18-001 U11): a 404 while its
 * switch is off; on, every block's name and words in the page, Subscribe
 * as Coming with no form, labelled radio groups that write the address and
 * the previews' addresses, and a preview that fails says so.
 */
const mocked = vi.hoisted(() => {
    const ON: Record<string, string | undefined> = {
        NEXT_PUBLIC_WEBSITE_LIBRARY: "on",
    };
    return { env: ON, ON };
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

/** jsdom lays nothing out: every card is 640px wide. */
class WideObserver {
    constructor(
        private readonly cb: (
            entries: { contentRect: { width: number } }[],
        ) => void,
    ) {}
    observe() {
        this.cb([{ contentRect: { width: 640 } }]);
    }
    unobserve() {
        return undefined;
    }
    disconnect() {
        return undefined;
    }
}

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", WideObserver);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T06:00:00Z"));
});
afterEach(() => {
    cleanup();
    resetAddress();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mocked.env = mocked.ON;
});

function card(name: string): HTMLElement {
    const article = screen
        .getByRole("heading", { level: 4, name })
        .closest("article");
    if (!article) throw new Error(`no card for ${name}`);
    return article;
}
const frameOf = (name: string) =>
    within(card(name)).getByTitle(new RegExp(`^${name}, `));

describe("/website-library", () => {
    it("is a 404 with its switch off or unset, preview or not", () => {
        mocked.env = {};
        expect(() => render(<WebsiteLibraryRoute />)).toThrow("NEXT_NOT_FOUND");
        mocked.env = {
            NEXT_PUBLIC_WEBSITE_LIBRARY: "off",
            RESOURCES_PREVIEW: "1",
        };
        expect(() => render(<WebsiteLibraryRoute />)).toThrow("NEXT_NOT_FOUND");
    });

    it("draws every block's name, what it does and its layouts, one card per family", () => {
        render(<WebsiteLibraryRoute />);
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "See what your website can be made of.",
            }),
        ).toBeTruthy();
        const families = blockFamilies(SECTION_TYPES);
        expect(Object.keys(LIBRARY_BLOCKS).sort()).toEqual(
            families.map((f) => f.head).sort(),
        );
        for (const f of families) {
            const c = card(f.name);
            expect(c.textContent).toContain(
                LIBRARY_BLOCKS[f.head as keyof typeof LIBRARY_BLOCKS].what,
            );
        }
        // Families: one Visit us card with its members' layouts.
        const visit = within(card("Visit us")).getByRole("radiogroup", {
            name: "Layouts",
        });
        expect(visit.textContent).toContain("Talk to us");
        expect(visit.textContent).toContain("Hours");
        expect(screen.queryByRole("heading", { name: "Contact" })).toBeNull();
        expect(BLOCK_META.servicesList.variants.length).toBeGreaterThan(1);
    });

    it("shows Subscribe as Coming, with no preview and no form", () => {
        render(<WebsiteLibraryRoute />);
        const subscribe = card("Subscribe");
        expect(within(subscribe).getByText("Coming")).toBeTruthy();
        expect(subscribe.querySelector("iframe, form, input")).toBeNull();
    });

    it("its toolbar is labelled radio groups that write the address and the previews", () => {
        render(<WebsiteLibraryRoute />);
        const looks = screen.getByRole("radiogroup", { name: "Look" });
        expect(
            within(looks)
                .getAllByRole("radio")
                .map((r) => r.textContent),
        ).toEqual(["Classic", "Quiet", "Folio", "Live"]);
        expect(
            screen.getByRole("radiogroup", { name: "Colours" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("radiogroup", { name: "Show on" }),
        ).toBeTruthy();
        // Component styles start folded.
        expect(screen.queryByRole("radiogroup", { name: "Cards" })).toBeNull();
        fireEvent.click(
            screen.getByRole("button", { name: "Component styles" }),
        );
        expect(screen.getByRole("radiogroup", { name: "Cards" })).toBeTruthy();

        const hero = frameOf("Hero");
        expect(hero.getAttribute("src")).toBe(
            "/library-preview/hero?variant=centered",
        );
        expect(hero.title).toBe("Hero, Centered layout, preview");

        fireEvent.click(within(looks).getByRole("radio", { name: "Live" }));
        fireEvent.click(
            within(screen.getByRole("radiogroup", { name: "Cards" })).getByRole(
                "radio",
                { name: "Flat" },
            ),
        );
        expect(window.location.search).toBe("?look=live&cards=flat");
        expect(frameOf("Hero").getAttribute("src")).toBe(
            "/library-preview/hero?variant=centered&look=live&cards=flat",
        );

        // Phone lays the frame out at a phone's width; the address says so.
        fireEvent.click(screen.getByRole("radio", { name: "Phone" }));
        expect(frameOf("Hero").getAttribute("width")).toBe("390");
        expect(window.location.search).toContain("view=phone");

        // A layout is picked on its card.
        fireEvent.click(
            within(card("Hero")).getByRole("radio", { name: "Answer panel" }),
        );
        expect(frameOf("Hero").getAttribute("src")).toContain("variant=answer");
        expect(frameOf("Hero").title).toBe(
            "Hero, Answer panel layout, preview",
        );
    });

    it("opens with the choices its address carries", () => {
        window.history.replaceState(
            null,
            "",
            "/website-library?look=folio&palette=tide&look2=x",
        );
        render(<WebsiteLibraryRoute />);
        expect(
            screen
                .getByRole("radio", { name: "Folio" })
                .getAttribute("aria-checked"),
        ).toBe("true");
        expect(frameOf("Timetable").getAttribute("src")).toBe(
            "/library-preview/timetable?variant=grid&look=folio&palette=tide",
        );
    });

    it("names the block and says so when its preview could not load", () => {
        render(<WebsiteLibraryRoute />);
        const frame = frameOf("Gallery");
        expect(
            within(card("Gallery")).getByText("Loading preview"),
        ).toBeTruthy();
        // A page with no preview mark (the 404): never a blank frame.
        fireEvent.load(frame);
        expect(
            within(card("Gallery")).getByText("Preview could not load"),
        ).toBeTruthy();
    });

    it("its start button is the one CTA builder's, from the library", () => {
        render(<WebsiteLibraryRoute />);
        expect(
            screen
                .getByRole("link", { name: "Join the waitlist" })
                .getAttribute("href"),
        ).toBe("/waitlist?src=library");
    });
});
