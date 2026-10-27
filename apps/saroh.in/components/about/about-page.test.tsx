// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ABOUT } from "@/content/about";
import type { CompanyFacts } from "@/content/company";
import { COMPANY } from "@/content/company";
import type { PublishContext } from "@/content/resources";

import { AboutPage } from "./about-page";

/**
 * /about (design "About", DEC-137): nothing of Saroh's plans, prices or
 * limits before launch, and all of it back once the switch opens; a company
 * fact that isn't set is not drawn, and no placeholder ever is.
 */
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
vi.mock("next/image", () => ({
    default: ({ alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={alt} {...props} />
    ),
}));
afterEach(cleanup);

/** Every Resources page is live and built. */
const shown: PublishContext = {
    now: new Date("2026-10-20T06:00:00Z"),
    preview: false,
    routes: null,
};
/** The build has none of them. */
const none: PublishContext = { ...shown, routes: [] };

/** Words that are about Saroh's own plans, prices or limits, or that only launch makes true. */
const PLAN_WORDS =
    /free plan|paid plan|priced in rupees|prices in rupees|honest limits|\blimits?\b|add-ons?|upgrades?|start free|no card|live and you can use it today|\bpricing\b/i;

const hrefs = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("a")).map(
        (a) => a.getAttribute("href") ?? "",
    );

describe("/about before launch (waitlist mode)", () => {
    it("says nothing of Saroh's plans, prices or limits", () => {
        const { container } = render(<AboutPage mode="waitlist" ctx={shown} />);
        expect(container.textContent).not.toMatch(PLAN_WORDS);
    });

    it("ends the opening at 'in one place.'", () => {
        render(<AboutPage mode="waitlist" ctx={shown} />);
        const lead = screen.getByText(/^Most small businesses in India/);
        expect(lead.textContent.endsWith("your website in one place.")).toBe(
            true,
        );
    });

    it("draws four things we hold ourselves to, without Honest limits", () => {
        render(<AboutPage mode="waitlist" ctx={shown} />);
        const section = screen.getByRole("region", {
            name: ABOUT.values.title,
        });
        expect(
            within(section)
                .getAllByRole("heading", { level: 3 })
                .map((h) => h.textContent),
        ).toEqual([
            "One place, not six apps",
            "Made for India",
            "Your money, your account",
            "Source-available",
        ]);
    });

    it("says early access opens, not that Saroh is live", () => {
        render(<AboutPage mode="waitlist" ctx={shown} />);
        expect(
            screen.getByRole("heading", {
                name: "Early access, from 17 October 2026.",
            }),
        ).toBeTruthy();
        expect(
            screen.getByText(
                /^Saroh opens in early access on 17 October 2026\. It's early/,
            ),
        ).toBeTruthy();
    });

    it("closes by asking for the waitlist", () => {
        const { container } = render(<AboutPage mode="waitlist" ctx={shown} />);
        expect(
            screen.getByRole("heading", { name: "Grow with us." }),
        ).toBeTruthy();
        const start = screen.getByRole("link", { name: "Join the waitlist" });
        expect(start.getAttribute("href")).toBe("/waitlist?src=about-band");
        expect(
            screen.getByText(
                "We'll email you once, with your invite, when early access opens.",
            ),
        ).toBeTruthy();
        expect(hrefs(container).some((h) => h.includes("/signup"))).toBe(false);
    });
});

describe("/about once the launch switch is open", () => {
    it("brings the plan words back, with no change but the mode", () => {
        render(<AboutPage mode="open" ctx={shown} />);
        const lead = screen.getByText(/^Most small businesses in India/);
        expect(
            lead.textContent.endsWith(
                "in one place, priced in rupees, with a Free plan you can really use.",
            ),
        ).toBe(true);
        expect(
            screen.getByRole("heading", { name: "Honest limits" }),
        ).toBeTruthy();
        expect(
            screen.getByText(/^Prices in rupees, GST shown both ways/),
        ).toBeTruthy();
        expect(
            screen.getByText(/^Saroh is live and you can use it today\./),
        ).toBeTruthy();
    });

    it("closes with Start free, to sign-up", () => {
        const { container } = render(<AboutPage mode="open" ctx={shown} />);
        expect(
            screen.getByRole("heading", { name: "Start free. Grow with us." }),
        ).toBeTruthy();
        const start = screen.getByRole("link", { name: "Start free" });
        expect(start.getAttribute("href")).toMatch(/\/signup\?src=about-band$/);
        expect(screen.getByText("No card needed to start.")).toBeTruthy();
        expect(hrefs(container).some((h) => h.includes("/waitlist"))).toBe(
            false,
        );
    });
});

describe.each(["waitlist", "open"] as const)("/about in %s mode", (mode) => {
    it("draws no placeholder: nothing in brackets", () => {
        const { container } = render(<AboutPage mode={mode} ctx={shown} />);
        expect(container.textContent).not.toMatch(/[[\]]/);
        expect(container.textContent).not.toMatch(/your name/i);
    });

    it("never links to Pricing or Templates", () => {
        const { container } = render(<AboutPage mode={mode} ctx={shown} />);
        for (const href of hrefs(container)) {
            expect(href).not.toMatch(/^\/(pricing|templates)/);
        }
    });

    it("keeps the Hindi as designed, each piece marked as Hindi", () => {
        const { container } = render(<AboutPage mode={mode} ctx={shown} />);
        const hindi = Array.from(container.querySelectorAll('[lang="hi"]'));
        expect(hindi.map((el) => el.textContent)).toEqual([
            "सारोह",
            "स",
            "सपरिवार",
            "आरोह",
            "पर्वतारोही",
        ]);
        for (const el of hindi) {
            expect(el.className).toContain("var(--font-devanagari)");
        }
        expect(screen.getByText(/, with\. As in/).textContent).toBe(
            "sa, with. As in सपरिवार, with the family.",
        );
        expect(screen.getByText(/, rising\. As in/).textContent).toBe(
            "aaroh, rising. As in पर्वतारोही, the one who climbs a mountain.",
        );
        expect(screen.getByText("Let's rise together.")).toBeTruthy();
    });
});

describe("/about: links", () => {
    it("links the changelog and what's coming next while the changelog is shown", () => {
        render(<AboutPage mode="waitlist" ctx={shown} />);
        expect(
            screen
                .getByRole("link", { name: "Read the changelog" })
                .getAttribute("href"),
        ).toBe("/changelog");
        expect(
            screen
                .getByRole("link", { name: "See what's coming next" })
                .getAttribute("href"),
        ).toBe("/changelog#coming-next");
    });

    it("draws neither when the changelog isn't shown", () => {
        render(<AboutPage mode="waitlist" ctx={none} />);
        expect(
            screen.queryByRole("link", { name: "Read the changelog" }),
        ).toBeNull();
        expect(
            screen.queryByRole("link", { name: "See what's coming next" }),
        ).toBeNull();
    });

    it("always links Contact", () => {
        render(<AboutPage mode="waitlist" ctx={none} />);
        expect(
            screen
                .getByRole("link", { name: "Contact us" })
                .getAttribute("href"),
        ).toBe("/contact");
    });
});

describe("/about: company facts", () => {
    const bare: CompanyFacts = { legalName: COMPANY.legalName };

    it("says who makes Saroh and where its registered office is", () => {
        render(<AboutPage mode="waitlist" ctx={shown} />);
        expect(
            screen.getByText("Saroh is a product of Virashi Softwares LLP."),
        ).toBeTruthy();
        expect(screen.getByText("Registered office")).toBeTruthy();
        expect(
            screen.getByText(/^Unit 309, .* Gurgaon, Haryana 122001, India$/),
        ).toBeTruthy();
    });

    it("draws no office row without an office", () => {
        render(<AboutPage mode="waitlist" ctx={shown} company={bare} />);
        expect(screen.queryByText("Registered office")).toBeNull();
        expect(screen.getByText("Company")).toBeTruthy();
        expect(screen.getByText("Get in touch")).toBeTruthy();
    });

    it("draws no founder's note until there is a name and a note", () => {
        render(<AboutPage mode="waitlist" ctx={shown} />);
        expect(screen.queryByText(ABOUT.founder.eyebrow)).toBeNull();
        expect(screen.queryByText(ABOUT.founder.role)).toBeNull();
        cleanup();

        render(
            <AboutPage
                mode="waitlist"
                ctx={shown}
                company={{ ...bare, founder: { name: "Asha Rao", note: [] } }}
            />,
        );
        expect(screen.queryByText(ABOUT.founder.eyebrow)).toBeNull();
    });

    it("draws the note once it is set, with the photo only if there is one", () => {
        const founder = {
            name: "Asha Rao",
            note: ["A first paragraph.", "A second one."],
        };
        const { container } = render(
            <AboutPage
                mode="waitlist"
                ctx={shown}
                company={{ ...bare, founder }}
            />,
        );
        expect(screen.getByText(ABOUT.founder.eyebrow)).toBeTruthy();
        expect(screen.getByText("A first paragraph.")).toBeTruthy();
        expect(screen.getByText("A second one.")).toBeTruthy();
        expect(screen.getByText("Asha Rao")).toBeTruthy();
        expect(screen.getByText(ABOUT.founder.role)).toBeTruthy();
        expect(container.querySelector("img")).toBeNull();
        cleanup();

        render(
            <AboutPage
                mode="waitlist"
                ctx={shown}
                company={{
                    ...bare,
                    founder: {
                        ...founder,
                        photo: { src: "/founder.jpg", alt: "Asha Rao" },
                    },
                }}
            />,
        );
        expect(screen.getByRole("img", { name: "Asha Rao" })).toBeTruthy();
    });
});
