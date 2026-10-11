// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyFacts } from "@/content/company";
import { COMPANY } from "@/content/company";
import { CONTACT_PAGE, socialText } from "@/content/contact-page";
import type { PublishContext } from "@/content/resources";

import { ContactPage } from "./contact-page";

/**
 * /contact (design "Contact", DEC-137): the form, the ways to reach Saroh
 * and the registered office. Nothing of Saroh's plans in either mode until
 * a question about them is backed; no row for a fact that isn't set; Help
 * and the changelog only while they are shown.
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
afterEach(cleanup);

/** Every Resources page is live and built. */
const shown: PublishContext = {
    now: new Date("2026-10-20T06:00:00Z"),
    preview: false,
    routes: null,
};
/** Before Help publishes (17 Oct); the changelog is live. */
const beforeHelp: PublishContext = {
    ...shown,
    now: new Date("2026-10-11T06:00:00Z"),
};
/** The build has none of them. */
const none: PublishContext = { ...shown, routes: [] };

const PLAN_WORDS =
    /free plan|paid plan|\bplans?\b|on us\b|locked in|cancel|\bpricing\b/i;

const hrefs = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("a")).map(
        (a) => a.getAttribute("href") ?? "",
    );

describe.each(["waitlist", "open"] as const)("/contact in %s mode", (mode) => {
    it("says nothing of Saroh's plans, and makes no promise the product doesn't back", () => {
        const { container } = render(<ContactPage mode={mode} ctx={shown} />);
        expect(container.textContent).not.toMatch(PLAN_WORDS);
    });

    it("promises a reply within one working day, as the owner does (CT2)", () => {
        const { container } = render(<ContactPage mode={mode} ctx={shown} />);
        expect(container.textContent).toContain(
            "A real person reads every message and replies within one working day.",
        );
    });

    it("draws no placeholder: nothing in brackets, no made-up number", () => {
        const { container } = render(<ContactPage mode={mode} ctx={shown} />);
        expect(container.textContent).not.toMatch(/[[\]]/);
        expect(container.textContent).not.toMatch(/0{4,}/);
        expect(container.textContent).not.toMatch(/LLPIN|GSTIN|Phone/);
    });

    it("never links to Pricing or Templates", () => {
        const { container } = render(<ContactPage mode={mode} ctx={shown} />);
        for (const href of hrefs(container)) {
            expect(href).not.toMatch(/^\/(pricing|templates)/);
        }
    });

    it("gives contact@saroh.in, never another address (DEC-101)", () => {
        const { container } = render(<ContactPage mode={mode} ctx={shown} />);
        const mail = hrefs(container).filter((h) => h.startsWith("mailto:"));
        expect(mail.length).toBeGreaterThan(0);
        expect(new Set(mail)).toEqual(new Set(["mailto:contact@saroh.in"]));
    });

    it("answers where a customer's money is", () => {
        render(<ContactPage mode={mode} ctx={shown} />);
        const section = screen.getByRole("region", {
            name: CONTACT_PAGE.before.title,
        });
        expect(
            within(section)
                .getAllByRole("heading", { level: 3 })
                .map((h) => h.textContent),
        ).toEqual(["A customer paid me. Where's the money?"]);
    });
});

describe("/contact: the page", () => {
    it("opens with the design's title and the form", () => {
        render(<ContactPage mode="waitlist" ctx={shown} />);
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Talk to a person, not a bot.",
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole("form", { name: CONTACT_PAGE.form.title }),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: CONTACT_PAGE.form.submit }),
        ).toBeTruthy();
    });

    it("links Help and the changelog only while each is shown", () => {
        const help = { name: /^Need help with your account\?/ };
        const log = { name: /^Something not working\?/ };

        render(<ContactPage mode="waitlist" ctx={shown} />);
        expect(screen.getByRole("link", help).getAttribute("href")).toBe(
            "/help",
        );
        expect(screen.getByRole("link", log).getAttribute("href")).toBe(
            "/changelog",
        );
        cleanup();

        render(<ContactPage mode="waitlist" ctx={beforeHelp} />);
        expect(screen.queryByRole("link", help)).toBeNull();
        expect(screen.getByRole("link", log)).toBeTruthy();
        cleanup();

        render(<ContactPage mode="waitlist" ctx={none} />);
        expect(screen.queryByRole("link", help)).toBeNull();
        expect(screen.queryByRole("link", log)).toBeNull();
    });

    it("lists the email and Saroh's own accounts, in the design's order", () => {
        render(<ContactPage mode="waitlist" ctx={shown} />);
        const ways = screen
            .getByRole("heading", { name: CONTACT_PAGE.ways.title })
            .closest("div") as HTMLElement;
        expect(
            Array.from(ways.querySelectorAll("dt")).map((d) => d.textContent),
        ).toEqual(["Email", "Instagram", "LinkedIn", "X"]);
        expect(
            Array.from(ways.querySelectorAll("dd a")).map((a) => [
                a.textContent,
                a.getAttribute("href"),
            ]),
        ).toEqual([
            ["contact@saroh.in", "mailto:contact@saroh.in"],
            ["@sarohlabs", "https://www.instagram.com/sarohlabs"],
            [
                "linkedin.com/company/saroh",
                "https://www.linkedin.com/company/saroh",
            ],
            ["@sarohlabs", "https://x.com/sarohlabs"],
        ]);
    });
});

describe("/contact: company facts", () => {
    const bare: CompanyFacts = { legalName: COMPANY.legalName };

    it("draws the registered office the legal pages give, and no registration line", () => {
        render(<ContactPage mode="waitlist" ctx={shown} />);
        const office = screen
            .getByRole("heading", { name: CONTACT_PAGE.office.title })
            .closest("div") as HTMLElement;
        expect(office.querySelector("address")?.textContent).toBe(
            "Virashi Softwares LLPUnit 309, 3rd Floor, Tower-A, SAS Tower, Support Area, Medicity, Sector-38Gurgaon, Haryana 122001, India",
        );
        expect(office.children).toHaveLength(2);
    });

    it("draws no office card with nothing to put in it", () => {
        render(<ContactPage mode="waitlist" ctx={shown} company={bare} />);
        expect(
            screen.queryByRole("heading", { name: CONTACT_PAGE.office.title }),
        ).toBeNull();
    });

    it("adds the phone row and the registration line once they are set", () => {
        render(
            <ContactPage
                mode="waitlist"
                ctx={shown}
                company={{
                    ...COMPANY,
                    llpin: "AAB-1234",
                    phone: {
                        display: "+91 98765 43210",
                        dial: "+919876543210",
                        hours: "Mon to Sat, 10 am to 6 pm IST",
                    },
                }}
            />,
        );
        const phone = screen.getByRole("link", { name: "+91 98765 43210" });
        expect(phone.getAttribute("href")).toBe("tel:+919876543210");
        expect(phone.closest("dd")?.textContent).toBe(
            "+91 98765 43210 · Mon to Sat, 10 am to 6 pm IST",
        );
        expect(screen.getByText("LLPIN: AAB-1234")).toBeTruthy();
    });
});

describe("socialText", () => {
    it("writes a handle as @name and anything else as its address", () => {
        expect(socialText("https://www.instagram.com/sarohlabs")).toBe(
            "@sarohlabs",
        );
        expect(socialText("https://x.com/sarohlabs/")).toBe("@sarohlabs");
        expect(socialText("https://www.youtube.com/@SarohLabs")).toBe(
            "@SarohLabs",
        );
        expect(socialText("https://www.linkedin.com/company/saroh")).toBe(
            "linkedin.com/company/saroh",
        );
    });
});
