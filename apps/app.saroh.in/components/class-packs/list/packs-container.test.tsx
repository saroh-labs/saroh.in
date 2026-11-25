// @vitest-environment jsdom
/**
 * Class packs on React Query, first paint (owner, 25 Nov): the header, New
 * pack and the tabs are drawn at once from the page's gates; the cards
 * (and on Who holds one, the rows) are skeletons until the read lands, the
 * count waits rather than saying 0, and Sell a pack waits for its people.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/class-packs",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/class-packs/actions", () => ({
    setPackArchived: vi.fn(),
    sellPack: vi.fn(),
    extendHolder: vi.fn(),
    olderPackEvents: vi.fn(),
}));
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: vi.fn(),
    loadMissingRates: vi.fn(),
}));

import { PackDetailContainer } from "@/components/class-packs/pack-detail/pack-detail";
import { PurchasesContainer } from "@/components/class-packs/purchases/purchases-screen";
import { renderWithQuery } from "@/lib/query/test-utils";

import { PacksContainer } from "./packs-screen";

let answer: (body: unknown) => void;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(
        () =>
            new Promise((resolve) => {
                answer = (body) => resolve(new Response(JSON.stringify(body)));
            }),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));
const text = (host: HTMLElement) => host.textContent;
const skeleton = (host: HTMLElement) =>
    host.querySelector('[data-slot="page-loading"]');

describe("Packs, first paint", () => {
    it("draws the frame at once, skeleton cards, then the packs in place", async () => {
        const { host, unmount } = renderWithQuery(
            <PacksContainer canWrite canSell openSell={false} />,
        );
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Class packs");
        expect(text(host)).toContain("New pack");
        expect(text(host)).toContain("Who holds one");
        expect(skeleton(host)).not.toBeNull();
        expect(text(host)).not.toContain("No class packs yet");
        // One read, the list's.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0] as string).toContain(
            "/api/class-packs",
        );

        answer({
            packs: [],
            notes: {},
            contacts: [],
            held: [],
            invoicesOnSale: false,
            summary: "Nothing owed",
            rules: "A booking spends a class.",
            memberships: null,
        });
        await tick();
        expect(skeleton(host)).toBeNull();
        expect(text(host)).toContain("No class packs yet");
        expect(text(host)).toContain("A booking spends a class.");
        unmount();
    });
});

describe("Who holds one, first paint", () => {
    it("draws the frame at once, Sell a pack waiting, rows as skeletons", async () => {
        const { host, unmount } = renderWithQuery(
            <PurchasesContainer canWrite />,
        );
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Class packs");
        const sell = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "Sell a pack",
        );
        expect(sell?.disabled).toBe(true);
        expect(skeleton(host)).not.toBeNull();
        expect(text(host)).not.toContain("No packs sold yet");

        answer({
            purchases: [],
            packs: [],
            contacts: [],
            invoicesOnSale: false,
            gst: { asked: false },
        });
        await tick();
        expect(skeleton(host)).toBeNull();
        expect(text(host)).toContain("No packs sold yet");
        unmount();
    });
});

describe("A pack's page, first paint", () => {
    it("keeps the route's loader until the pack, whose name is the title, lands", async () => {
        const { host, unmount } = renderWithQuery(
            <PackDetailContainer
                packId="pk_1"
                skeleton={<p>Loading the pack</p>}
                canWrite
                canSell
                initialTab="overview"
            />,
        );
        await tick();
        expect(text(host)).toContain("Loading the pack");
        expect(host.querySelector("h1")).toBeNull();
        expect(fetchMock.mock.calls[0]?.[0] as string).toContain(
            "/api/class-packs/pk_1",
        );
        unmount();
    });
});
