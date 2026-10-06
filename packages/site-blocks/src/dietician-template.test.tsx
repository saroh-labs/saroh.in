import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { dieticianTemplate, instantiateTemplate } from "@saroh/templates";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_VISIT } from "./block-fixture-preview";
import type { JournalFeed } from "./blocks/journal";
import type { PublicService } from "./blocks/services-list";
import { PageSections } from "./section-renderer";

/**
 * The Dietician template (industry templates U7) drawn as a live site draws
 * it: instantiated against a business, every section through
 * `PageSections`, with the business's services, hours and posts read from
 * a stubbed API and feed. What it proves: the design's sections arrive in
 * the design's order; the consultation's price and length are the
 * service's, never the template's; and a section with nothing to show
 * draws nothing.
 */

const API = "https://api.test";

/** The business's one consultation, as the public services read returns it. */
const CONSULTATION: PublicService = {
    id: "svc_initial",
    name: "Initial consultation",
    description: "In person in Pune, or by video.",
    durationMinutes: 45,
    priceCents: 250000,
    currency: "INR",
};

const POSTS: JournalFeed = {
    basePath: "/blog",
    posts: [
        {
            title: "Rice is not the enemy, but the plate is",
            slug: "rice-is-not-the-enemy",
            excerpt:
                "What actually changes blood sugar in an Indian meal, and why swapping rice for something else is usually the least effective place to start.",
            publishedAt: "2026-09-18T08:00:00.000Z",
        },
        {
            title: "What a food diary is for",
            slug: "what-a-food-diary-is-for",
            excerpt: "It is not surveillance and it is not a test.",
            publishedAt: "2026-08-02T08:00:00.000Z",
        },
    ],
};

const bookable: TemplateContext = {
    organizationName: "Dr Sample Nair",
    contactEmail: "clinic@example.com",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: [CONSULTATION.id],
};

/** The public API: the services asked for, and the business's place. */
function stubApi({ hours = true }: { hours?: boolean } = {}) {
    const fetchMock = vi.fn((input: string) => {
        const url = input;
        if (url.startsWith(`${API}/public/services`)) {
            return Promise.resolve(
                new Response(JSON.stringify([CONSULTATION]), { status: 200 }),
            );
        }
        if (url === `${API}/public/sites/site_dietician/visit`) {
            return Promise.resolve(
                new Response(
                    JSON.stringify(
                        hours ? SAMPLE_VISIT : { ...SAMPLE_VISIT, hours: null },
                    ),
                    { status: 200 },
                ),
            );
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderHome(ctx: TemplateContext, journal: JournalFeed) {
    const [home] = instantiateTemplate(dieticianTemplate, ctx).pages;
    const resolvePage = () => undefined;
    return render(
        <PageSections
            apiUrl={API}
            siteId="site_dietician"
            bookHref="/book"
            journal={journal}
            sections={home.sections.map((section) => ({
                type: section.type,
                content: toRendered(
                    section.type,
                    // The API makes the enquiry's Form with the site
                    // (`withEnquiryForms`); a template lays down none.
                    section.type === "enquiry"
                        ? { ...(section.content as object), formId: "form_1" }
                        : section.content,
                    { resolvePage },
                ),
            }))}
        />,
    );
}

/** Each `h2`, in page order. */
function headings(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("h2")).map(
        (h) => h.textContent,
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the Dietician template, rendered live", () => {
    it("draws the design's sections in the design's order", async () => {
        stubApi();
        const { container } = renderHome(bookable, POSTS);
        await screen.findByText("Initial consultation");
        await screen.findByRole("rowheader", { name: /Monday/ });
        expect(headings(container)).toEqual([
            "Dr Sample Nair",
            "How I work",
            "One consultation",
            "What it includes",
            "What I am asked about most",
            "Writing",
            "Getting an appointment",
            "Appointments",
        ]);
    });

    it("numbers the four stages, and says how many there are", async () => {
        stubApi();
        const { container } = renderHome(bookable, POSTS);
        expect(
            screen.getByText(
                "Four stages, and the whole of the first one is listening.",
            ),
        ).toBeTruthy();
        // The first numbered list on the page is How I work's.
        const steps = container.querySelector("ol");
        if (!(steps instanceof HTMLElement)) throw new Error("no steps");
        expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
        expect(steps.textContent).toMatch(/^01We talk first/);
        expect(steps.textContent).toContain("04We check in six weeks");
        await waitFor(() => expect(container.textContent).toContain("₹"));
    });

    it("takes the consultation's price and length from the service, with Ask for a time to the booking page", async () => {
        stubApi();
        renderHome(bookable, POSTS);
        await screen.findByText("Initial consultation");
        expect(screen.getByText("45 min")).toBeTruthy();
        expect(screen.getByText(/₹\s?2,500/)).toBeTruthy();
        expect(
            screen.getByRole("link", {
                name: "Ask for a time: Initial consultation",
            }),
        ).toHaveAttribute("href", "/book?service=svc_initial");
    });

    it("lists the writing, dated, and the hours from the business", async () => {
        stubApi();
        renderHome(bookable, POSTS);
        expect(
            screen.getByRole("link", {
                name: /Rice is not the enemy, but the plate is/,
            }),
        ).toHaveAttribute("href", "/blog/rice-is-not-the-enemy");
        await screen.findByRole("rowheader", { name: /Monday/ });
        expect(screen.getByText("clinic@example.com")).toBeTruthy();
        expect(
            screen.getByText(/I do not change prescribed medication/),
        ).toBeTruthy();
    });

    it("draws no Writing with no posts, and no hours with none saved", async () => {
        const fetchMock = stubApi({ hours: false });
        const { container } = renderHome(bookable, {
            posts: [],
            basePath: "/blog",
        });
        await screen.findByText("Initial consultation");
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                `${API}/public/sites/site_dietician/visit`,
                expect.anything(),
            ),
        );
        await waitFor(() =>
            expect(headings(container)).not.toContain("Appointments"),
        );
        expect(headings(container)).not.toContain("Writing");
        expect(container.textContent).not.toMatch(/no posts|closed/i);
    });

    it("with no services to book, describes the consultation and types no price", async () => {
        stubApi();
        const { container } = renderHome(
            { organizationName: "Dr Sample Nair" },
            POSTS,
        );
        await screen.findByRole("rowheader", { name: /Monday/ });
        expect(headings(container)).toContain("One consultation");
        expect(container.textContent).not.toMatch(/₹|\d+\s?min/);
        // No email: the form asks instead.
        expect(
            screen.getByRole("heading", { name: "Getting an appointment" }),
        ).toBeTruthy();
        expect(screen.getByRole("textbox", { name: /Email/ })).toBeTruthy();
    });

    it("shows a portrait brief to no visitor, and loads no image", () => {
        stubApi();
        const { container } = renderHome(bookable, POSTS);
        expect(container.querySelectorAll("img")).toHaveLength(0);
        expect(container.textContent).not.toContain("Professional portrait");
    });
});
