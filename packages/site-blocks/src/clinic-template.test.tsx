import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { clinicTemplate, instantiateTemplate } from "@saroh/templates";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_VISIT } from "./block-fixture-preview";
import type { PublicToday } from "./blocks/on-today";
import type { PublicService } from "./blocks/services-list";
import { PageSections } from "./section-renderer";

/**
 * The Clinic template (industry templates U11) drawn as a live site draws
 * it: the next free appointments, the treatments, what a treatment
 * involves with its disclaimer, the doctors as placeholders, the
 * questions and the hours, every bound one read from a stubbed API.
 */

const API = "https://api.test";
const SITE = "site_clinic";

const TREATMENTS: PublicService[] = [
    {
        id: "svc_checkup",
        name: "Check-up and clean",
        description: "A look, a clean and an explanation.",
        durationMinutes: 30,
        priceCents: 120000,
        currency: "INR",
    },
    {
        id: "svc_root_canal",
        name: "Root canal treatment",
        description: "Usually three visits, priced for all of them.",
        durationMinutes: 60,
        priceCents: 1200000,
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
            serviceId: "svc_checkup",
            serviceName: "Check-up and clean",
            durationMinutes: 30,
            startAt: "2026-10-12T05:00:00.000Z",
            date: "2026-10-12",
            time: "10:30",
            staffName: "Dr. Sample",
            placesLeft: null,
        },
    ],
    hours: null,
    closedDates: [],
};

const bookable: TemplateContext = {
    organizationName: "Sample Clinic",
    contactEmail: "desk@example.com",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: TREATMENTS.map((s) => s.id),
};

function stubApi() {
    const fetchMock = vi.fn((url: string) => {
        if (url.startsWith(`${API}/public/services`)) {
            return Promise.resolve(
                new Response(JSON.stringify(TREATMENTS), { status: 200 }),
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
    const [home] = instantiateTemplate(clinicTemplate, ctx).pages;
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

describe("the Clinic template, rendered live", () => {
    it("opens on the next free appointment, then the treatments, how it works, the doctors, questions and hours", async () => {
        stubApi();
        const { container } = renderHome(bookable);
        await screen.findByText("Root canal treatment");
        await screen.findByText(/Dr\. Sample/);
        await screen.findByRole("rowheader", { name: /Monday/ });
        expect(headings(container)).toEqual([
            "Book a check-up. Know what happens next.",
            "Free today",
            "Treatments",
            "What a treatment involves",
            "Who you will see",
            "Before you come in",
            "Ask before you book",
            "Appointments and hours",
        ]);
        expect(container.querySelectorAll("h1")).toHaveLength(1);
    });

    it("draws prices from the treatments, and the disclaimer under the steps", async () => {
        stubApi();
        const { container } = renderHome(bookable);
        await screen.findByText("Root canal treatment");
        expect(container.textContent).toMatch(/12,000/);
        expect(container.textContent).toMatch(/30 min/);
        expect(
            screen.getByText(/Nothing on this site is a diagnosis/),
        ).toBeTruthy();
        // The questions open without JavaScript, one per <details>.
        expect(container.querySelectorAll("details").length).toBe(3);
    });

    it("sets the doctors as placeholders, with no photo drawn", async () => {
        stubApi();
        const { container } = renderHome(bookable);
        await screen.findByText("Root canal treatment");
        expect(screen.getByText("Your first doctor")).toBeTruthy();
        expect(screen.getAllByText(/^A placeholder\./)).toHaveLength(2);
        expect(container.querySelector("img")).toBeNull();
    });

    it("with Appointments off, lists no treatments and asks by email", () => {
        stubApi();
        const { container } = renderHome({
            organizationName: "Sample Clinic",
            contactEmail: "desk@example.com",
            modules: ["WEBSITE"],
        });
        const order = headings(container);
        expect(order).not.toContain("Treatments");
        expect(order).not.toContain("Free today");
        expect(order).toContain("Ask before you book");
        expect(container.querySelectorAll("details").length).toBe(2);
    });
});
