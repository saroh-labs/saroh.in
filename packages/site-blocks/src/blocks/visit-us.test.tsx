import type { RenderedVisitUs } from "@saroh/block-contract";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageSections } from "../section-renderer";
import type { PublicVisit } from "./visit-us";
import VisitUsSection, { directionsHref, isPublicVisit } from "./visit-us";

/** Rye & Co.: Hill Road, open Tue–Sun 07:00–19:00, Mumbai time. */
const RYE: PublicVisit = {
    source: "storefront",
    storeId: "store_hill",
    name: "Hill Road",
    address: "22 Hill Road, Bandra West\nMumbai 400050",
    phone: "+91 22 4000 0000",
    hours: [
        { day: "MON", open: "07:00", close: "19:00", closed: true },
        { day: "TUE", open: "07:00", close: "19:00", closed: false },
        { day: "WED", open: "07:00", close: "19:00", closed: false },
        { day: "THU", open: "07:00", close: "19:00", closed: false },
        { day: "FRI", open: "07:00", close: "19:00", closed: false },
        { day: "SAT", open: "07:00", close: "19:00", closed: false },
        { day: "SUN", open: "07:00", close: "19:00", closed: false },
    ],
    timezone: "Asia/Kolkata",
};

const content: RenderedVisitUs = { storeId: "store_hill" };

/** Friday 25 Sep 2026, 18:00 in Mumbai. */
const FRIDAY_6PM = new Date("2026-09-25T18:00:00+05:30");

describe("visitUs (G8)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function renderFetching(
        response: Response | Error,
        props: { siteId?: string | null; content?: RenderedVisitUs } = {},
    ) {
        const fetchMock = vi.fn((_url: string) =>
            response instanceof Error
                ? Promise.reject(response)
                : Promise.resolve(response),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const view = render(
            <VisitUsSection
                content={props.content ?? content}
                siteId={"siteId" in props ? props.siteId : "site_rye"}
                apiUrl="https://api.test"
                now={FRIDAY_6PM}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        return { ...view, fetchMock };
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });

    it("reads the place live and draws the design's card", async () => {
        const { fetchMock } = await renderFetching(json(RYE));
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            "https://api.test/public/sites/site_rye/visit/store_hill",
        );
        expect(
            screen.getByRole("heading", { name: "Come and see us" }),
        ).toBeTruthy();
        expect(screen.getByText(/22 Hill Road, Bandra West/)).toBeTruthy();
        expect(screen.getByText("Tue–Sun 7am–7pm")).toBeTruthy();
        expect(screen.getByText("Open now · closes 7pm")).toBeTruthy();
        const call = screen.getByRole("link", {
            name: "Call +91 22 4000 0000",
        });
        expect(call.getAttribute("href")).toBe("tel:+912240000000");
        const directions = screen.getByRole("link", { name: "Get directions" });
        expect(directions.getAttribute("href")).toBe(
            directionsHref(RYE.address ?? ""),
        );
        expect(directions.getAttribute("target")).toBe("_blank");
    });

    it("uses the merchant's own title", async () => {
        await renderFetching(json(RYE), {
            content: { ...content, title: "Find the bakery" },
        });
        expect(
            screen.getByRole("heading", { name: "Find the bakery" }),
        ).toBeTruthy();
    });

    it("says closed and when it next opens", () => {
        render(
            <VisitUsSection
                content={content}
                visit={RYE}
                // Monday 28 Sep, noon: Monday is closed.
                now={new Date("2026-09-28T12:00:00+05:30")}
            />,
        );
        expect(screen.getByText("Closed · opens Tue 7am")).toBeTruthy();
    });

    it("says closed on a closure day, as the hero does (review G-2)", () => {
        render(
            <VisitUsSection
                content={content}
                // Friday is open by the week, but the business closed it.
                visit={{ ...RYE, closedDates: ["2026-09-25"] }}
                now={FRIDAY_6PM}
            />,
        );
        expect(screen.getByText("Closed · opens Sat 7am")).toBeTruthy();
        expect(screen.queryByText(/Open now/)).toBeNull();
    });

    it("hides the hours row when none are saved, and says nothing false", () => {
        const { container } = render(
            <VisitUsSection
                content={content}
                visit={{ ...RYE, hours: null }}
                now={FRIDAY_6PM}
            />,
        );
        expect(container.textContent).not.toMatch(/Open now|Closed|am–|pm–/);
        expect(screen.getByText(/22 Hill Road/)).toBeTruthy();
    });

    it("leaves out the hours and the map link when the merchant turned them off", () => {
        const { container } = render(
            <VisitUsSection
                content={{ ...content, showHours: false, showMap: false }}
                visit={RYE}
                now={FRIDAY_6PM}
            />,
        );
        expect(container.textContent).not.toContain("Tue–Sun");
        expect(container.textContent).not.toContain("Open now");
        expect(
            screen.queryByRole("link", { name: "Get directions" }),
        ).toBeNull();
        expect(screen.getByRole("link", { name: /^Call / })).toBeTruthy();
    });

    it("draws no Call button without a phone, and no directions without an address", () => {
        render(
            <VisitUsSection
                content={content}
                visit={{ ...RYE, phone: null, address: null }}
                now={FRIDAY_6PM}
            />,
        );
        expect(screen.queryByRole("link", { name: /^Call/ })).toBeNull();
        expect(
            screen.queryByRole("link", { name: "Get directions" }),
        ).toBeNull();
        expect(screen.getByText("Tue–Sun 7am–7pm")).toBeTruthy();
    });

    it("renders nothing when the place is gone, closed or online-only (404)", async () => {
        const { container } = await renderFetching(
            json({ message: "Not found" }, 404),
        );
        expect(container.innerHTML).toBe("");
    });

    it("with no storefront chosen, reads the business's own place (template polish)", async () => {
        const { fetchMock } = await renderFetching(
            json({ ...RYE, source: "business", storeId: null }),
            { content: {} },
        );
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            "https://api.test/public/sites/site_rye/visit",
        );
        expect(screen.getByText(/22 Hill Road, Bandra West/)).toBeTruthy();
    });

    it("renders nothing for a place with no address, hours or phone", () => {
        const { container } = render(
            <VisitUsSection
                content={{}}
                visit={{
                    ...RYE,
                    source: "business",
                    storeId: null,
                    address: null,
                    phone: null,
                    hours: null,
                }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("renders nothing when the business has no place of its own (404)", async () => {
        const { container } = await renderFetching(
            json({ message: "Not found" }, 404),
            { content: {} },
        );
        expect(container.innerHTML).toBe("");
    });

    it("renders nothing on a live page that could not tell its site", async () => {
        const { container, fetchMock } = await renderFetching(json(RYE), {
            siteId: null,
        });
        expect(container.innerHTML).toBe("");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows its own error with a retry when the read fails", async () => {
        await renderFetching(new Error("offline"));
        expect(screen.getByRole("alert").textContent).toContain(
            "couldn't load our address and hours",
        );
        globalThis.fetch = vi.fn(() => Promise.resolve(json(RYE)));
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Try again" }));
            await Promise.resolve();
        });
        expect(screen.getByText("Tue–Sun 7am–7pm")).toBeTruthy();
    });

    it("treats a wrong shape as an error, not a crash (#264)", async () => {
        await renderFetching(json({ address: 42 }));
        expect(screen.getByRole("alert")).toBeTruthy();
    });

    it("on the editor canvas, says where the values come from instead of inventing them", async () => {
        const { fetchMock } = await renderFetching(json(RYE), {
            siteId: undefined,
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByText(/show here on your live site/)).toBeTruthy();
        expect(screen.queryByText(/Hill Road/)).toBeNull();
    });

    it("gets its site from the page it is on", async () => {
        const fetchMock = vi.fn((_url: string) => Promise.resolve(json(RYE)));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        render(
            <PageSections
                sections={[{ type: "visitUs", content }]}
                apiUrl="https://api.test"
                siteId="site_rye"
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            "https://api.test/public/sites/site_rye/visit/store_hill",
        );
    });
});

describe("isPublicVisit", () => {
    it("accepts the read's shape and refuses anything else", () => {
        expect(isPublicVisit(RYE)).toBe(true);
        expect(
            isPublicVisit({ ...RYE, source: "business", storeId: null }),
        ).toBe(true);
        expect(isPublicVisit({ ...RYE, hours: "Mon–Fri" })).toBe(false);
        expect(isPublicVisit({ ...RYE, source: "somewhere" })).toBe(false);
        // closedDates is optional (G-2): with or without, never malformed.
        expect(isPublicVisit({ ...RYE, closedDates: ["2026-09-25"] })).toBe(
            true,
        );
        expect(isPublicVisit({ ...RYE, closedDates: "2026-09-25" })).toBe(
            false,
        );
        expect(isPublicVisit({ ...RYE, closedDates: [25] })).toBe(false);
        expect(isPublicVisit(null)).toBe(false);
    });
});
