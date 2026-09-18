import type { RenderedServicesList } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicService } from "./services-list";
import ServicesListSection, {
    formatDuration,
    formatPrice,
} from "./services-list";

const content = BLOCK_META.servicesList.fixtures
    .default as RenderedServicesList;

const cut: PublicService = {
    id: "fixture-cut",
    name: "Cut and finish",
    description: "Wash, cut and blow-dry.",
    durationMinutes: 45,
    priceCents: 3800,
    currency: "GBP",
};
const consult: PublicService = {
    id: "fixture-consult",
    name: "Consultation",
    description: null,
    durationMinutes: 15,
    priceCents: null,
    currency: null,
};

describe("servicesList (#255)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function renderFetching(response: Response) {
        const fetchMock = vi.fn((_url: string) => Promise.resolve(response));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const view = render(<ServicesListSection content={content} />);
        await act(async () => {
            await Promise.resolve();
        });
        return { ...view, fetchMock };
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });

    it("draws what the API returns, in the merchant's order", async () => {
        const { fetchMock } = await renderFetching(json([cut, consult]));
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
            "/public/services?ids=fixture-cut%2Cfixture-colour%2Cfixture-consult",
        );
        const names = screen
            .getAllByRole("heading", { level: 3 })
            .map((h) => h.textContent);
        expect(names).toEqual(["Cut and finish", "Consultation"]);
        expect(screen.getByRole("link", { name: "Book now" })).toBeTruthy();
    });

    it("never draws an absent price as zero", async () => {
        const { container } = await renderFetching(json([consult]));
        expect(container.textContent).toContain("15 min");
        expect(container.textContent).not.toMatch(/0\.00|£0/);
    });

    it("renders nothing when no service may be offered", async () => {
        const { container } = await renderFetching(json([]));
        expect(container.innerHTML).toBe("");
    });

    it.each([
        ["a failed request", json({ error: {} }, 500)],
        ["a malformed body", json({ services: [] })],
        ["a body that is not JSON", new Response("<html>")],
    ])("shows its error state for %s", async (_label, response) => {
        await renderFetching(response);
        expect(screen.getByRole("alert").textContent).toMatch(
            /couldn't load our services/,
        );
        expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
        // No "Book now" for services we could not show.
        expect(screen.queryByRole("link", { name: "Book now" })).toBeNull();
    });

    it("hides prices when the merchant turns them off", () => {
        const { container } = render(
            <ServicesListSection
                content={{ ...content, showPrices: false }}
                services={[cut]}
            />,
        );
        expect(container.textContent).not.toContain("38");
    });

    it("formats durations and prices by the currency's own decimals", () => {
        expect(formatDuration(30)).toBe("30 min");
        expect(formatDuration(60)).toBe("1 hr");
        expect(formatDuration(90)).toBe("1 hr 30 min");
        expect(formatPrice(3800, "GBP")).toMatch(/38\.00/);
        // JPY has no minor unit: 1500 is ¥1,500, not ¥15.
        expect(formatPrice(1500, "JPY")).toMatch(/1,500/);
        expect(formatPrice(null, "GBP")).toBeNull();
        expect(formatPrice(100, "NOT-A-CODE")).toBeNull();
    });
});
