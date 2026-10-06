import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { instantiateTemplate, salonTemplate } from "@saroh/templates";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_VISIT } from "./block-fixture-preview";
import type { PublicToday } from "./blocks/on-today";
import type { PublicService } from "./blocks/services-list";
import { PageSections } from "./section-renderer";

/**
 * The Salon template (industry templates U11) drawn as a live site draws
 * it: instantiated against a business, every section through
 * `PageSections`, the services, today's free times and the place read from
 * a stubbed API. What it proves: who is free and what it costs come first,
 * both the business's own; the stylists are placeholders; and with
 * nothing to book, nothing about prices or free times is drawn.
 */

const API = "https://api.test";
const SITE = "site_salon";

const SERVICES: PublicService[] = [
    {
        id: "svc_cut",
        name: "Haircut and blow-dry",
        description: "Wash, cut and finish.",
        durationMinutes: 60,
        priceCents: 120000,
        currency: "INR",
    },
    {
        id: "svc_colour",
        name: "Global colour",
        description: null,
        durationMinutes: 120,
        priceCents: 380000,
        currency: "INR",
    },
];

const TODAY: PublicToday = {
    timezone: "Asia/Kolkata",
    date: "2026-10-12",
    appointments: true,
    classes: false,
    items: [
        {
            kind: "one",
            serviceId: "svc_cut",
            serviceName: "Haircut and blow-dry",
            durationMinutes: 60,
            startAt: "2026-10-12T06:00:00.000Z",
            date: "2026-10-12",
            time: "11:30",
            staffName: "Asha",
            placesLeft: null,
        },
    ],
    hours: null,
    closedDates: [],
};

const bookable: TemplateContext = {
    organizationName: "Sample Salon",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: SERVICES.map((s) => s.id),
};

function stubApi() {
    const fetchMock = vi.fn((url: string) => {
        if (url.startsWith(`${API}/public/services`)) {
            return Promise.resolve(
                new Response(JSON.stringify(SERVICES), { status: 200 }),
            );
        }
        if (url === `${API}/public/sites/${SITE}/today`) {
            return Promise.resolve(
                new Response(JSON.stringify(TODAY), { status: 200 }),
            );
        }
        if (url === `${API}/public/sites/${SITE}/visit`) {
            return Promise.resolve(
                new Response(JSON.stringify(SAMPLE_VISIT), { status: 200 }),
            );
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderHome(ctx: TemplateContext) {
    const [home] = instantiateTemplate(salonTemplate, ctx).pages;
    const resolvePage = () => undefined;
    return render(
        <PageSections
            apiUrl={API}
            siteId={SITE}
            bookHref="/book"
            sections={home.sections.map((section) => ({
                type: section.type,
                content: toRendered(
                    section.type,
                    section.type === "enquiry"
                        ? { ...(section.content as object), formId: "form_1" }
                        : section.content,
                    { resolvePage },
                ),
            }))}
        />,
    );
}

function headings(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("h1, h2")).map(
        (h) => h.textContent,
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the Salon template, rendered live", () => {
    it("opens on who is free today, then the prices, then the stylists and the place", async () => {
        stubApi();
        const { container } = renderHome(bookable);
        await screen.findByText("Global colour");
        await screen.findByText(/Asha/);
        await screen.findByText("Find the salon");
        const order = headings(container);
        expect(order[0]).toBe("Book your chair. Walk in fresh.");
        expect(order.slice(1)).toEqual([
            "Free today",
            "Services and prices",
            "Who you'll be with",
            "Before you come in",
            "Find the salon",
        ]);
        expect(container.querySelectorAll("h1")).toHaveLength(1);
    });

    it("prices and lengths are the services', never the template's", async () => {
        stubApi();
        const { container } = renderHome(bookable);
        await screen.findByText("Global colour");
        expect(container.textContent).toMatch(/1,200/);
        expect(container.textContent).toMatch(/3,800/);
        expect(container.textContent).toMatch(/2 hr/);
    });

    it("sets the stylists as placeholders, with no photo drawn", async () => {
        stubApi();
        const { container } = renderHome(bookable);
        await screen.findByText("Global colour");
        expect(screen.getByText("Your first stylist")).toBeTruthy();
        expect(screen.getAllByText(/^A placeholder\./)).toHaveLength(3);
        expect(container.querySelector("img")).toBeNull();
    });

    it("with Appointments off, draws no prices or free times, and offers a form", () => {
        const fetchMock = stubApi();
        const { container } = renderHome({
            organizationName: "Sample Salon",
            modules: ["WEBSITE"],
        });
        const order = headings(container);
        expect(order).not.toContain("Services and prices");
        expect(order).not.toContain("Free today");
        expect(order).toContain("Ask for an appointment");
        expect(
            fetchMock.mock.calls.some(([url]) => String(url).includes("today")),
        ).toBe(false);
    });
});
