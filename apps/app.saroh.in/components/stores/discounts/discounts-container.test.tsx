// @vitest-environment jsdom
/**
 * Discount codes on React Query (DEC-259), in the browser: the list draws
 * its header, New code and the search at once, with the count a bar and
 * the rows skeletons until the codes land; a revisit within the records
 * tier's fresh time reads nothing. A code's save (End it now) reads
 * nothing as the form leaves for the list: the codes and Products are
 * marked stale; a refused save marks nothing and stays.
 */
import { act, Component } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
// A code opens read first (DEC-267); `?edit=1` is its form.
const address = { search: "" };
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(address.search),
    usePathname: () => "/commerce/discounts",
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
    unstable_rethrow: () => undefined,
}));
vi.mock("@/lib/api/http", () => ({}));
const update = vi.fn();
vi.mock("@/lib/discounts/actions", () => ({
    createDiscount: vi.fn(),
    updateDiscount: (id: string, input: unknown, orgId: string) =>
        update(id, input, orgId) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));

import {
    DiscountContainer,
    DiscountsContainer,
} from "@/components/stores/discounts/discounts-container";
import { discountRead, discountsListRead } from "@/lib/discounts/queries";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const CODE = {
    id: "d1",
    code: "MARKETDAY",
    description: null,
    kind: "PERCENTAGE",
    percent: "10",
    amount: null,
    currency: null,
    appliesTo: "BUSINESS",
    targets: [],
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    used: 2,
    state: "ACTIVE",
} as const;
const ASK = { discountId: "d1" };
const PRODUCT = domainKey("products", "org_1", "product", { productId: "p1" });

let release: () => void;
const reads: string[] = [];
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    reads.length = 0;
    push.mockReset();
    update.mockReset();
    const held = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url.split("?")[0] ?? url);
            await held;
            return new Response(JSON.stringify([CODE]), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

describe("the codes", () => {
    it("draw the header, New code and search at once; rows wait for the read", async () => {
        const { host, unmount } = renderWithQuery(
            <DiscountsContainer canWrite />,
        );
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain(
            "Discount codes",
        );
        expect(host.textContent).toContain("New code");
        expect(
            host.querySelector('input[type="search"], input'),
        ).not.toBeNull();
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.querySelector('[data-slot="page-loading"]')).not.toBeNull();
        expect(host.textContent).not.toContain("MARKETDAY");
        expect(host.textContent).not.toContain("No discount codes yet");

        release();
        await tick();
        expect(host.querySelector('[data-slot="page-loading"]')).toBeNull();
        expect(host.textContent).toContain("MARKETDAY");
        expect(reads).toEqual(["/api/discounts"]);
        unmount();
    });

    it("a revisit within its fresh time reads nothing", async () => {
        release();
        const client = makeTestClient();
        const first = renderWithQuery(<DiscountsContainer canWrite />, {
            client,
        });
        await tick();
        first.unmount();
        reads.length = 0;
        const again = renderWithQuery(<DiscountsContainer canWrite />, {
            client,
        });
        await tick();
        expect(reads).toEqual([]);
        again.unmount();
    });
});

describe("a code, read first (DEC-267)", () => {
    it("opens on what it gave and its facts, with Edit for who may change it", async () => {
        const client = makeTestClient();
        client.setQueryData(discountRead.key("org_1", ASK), {
            discount: {
                ...CODE,
                used: 14,
                usage: {
                    gaveOff: "2100.00",
                    currency: "INR",
                    ordersTotal: "18400.00",
                },
            },
            reach: {
                options: { STOREFRONT: [], COLLECTION: [], PRODUCT: [] },
                defaultCurrency: "INR",
            },
        });
        const { host, unmount } = renderWithQuery(
            <DiscountContainer ask={ASK} />,
            { client },
        );
        await tick();
        expect(host.textContent).toContain("Used on 14 orders · ₹2,100 off");
        expect(host.textContent).toContain("₹18,400 in those orders");
        // No field to type in by accident: Edit opens the form.
        expect(host.querySelector("input")).toBeNull();
        const edit = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent === "Edit",
        );
        expect(edit?.getAttribute("href")).toMatch(/\?edit=1$/);
        unmount();
    });
});

describe("a code's End it now", () => {
    async function ended(result: unknown) {
        release();
        update.mockResolvedValue(result);
        const client = makeTestClient();
        client.setQueryData(discountsListRead.key("org_1", {}), [CODE]);
        client.setQueryData(PRODUCT, {});
        client.setQueryData(discountRead.key("org_1", ASK), {
            discount: CODE,
            reach: {
                options: { STOREFRONT: [], COLLECTION: [], PRODUCT: [] },
                defaultCurrency: "INR",
            },
        });
        address.search = "edit=1";
        const { host, unmount } = renderWithQuery(
            <DiscountContainer ask={ASK} />,
            { client },
        );
        await tick();
        address.search = "";
        reads.length = 0;
        const end = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "End it now",
        );
        if (!end) throw new Error("no End it now");
        act(() => end.click());
        await tick();
        unmount();
        const stale = [
            discountsListRead.key("org_1", {}),
            discountRead.key("org_1", ASK),
            PRODUCT,
        ].map((key) => client.getQueryState(key)?.isInvalidated);
        return { stale, reads: [...reads] };
    }

    it("reads nothing, marks the codes and Products stale, and leaves for the list", async () => {
        const got = await ended({ ok: true, data: CODE });
        const [id, input, orgId] = (update.mock.calls[0] ?? []) as unknown[];
        expect([id, orgId]).toEqual(["d1", "org_1"]);
        expect(typeof (input as { endsAt?: unknown }).endsAt).toBe("string");
        expect(got).toEqual({ stale: [true, true, true], reads: [] });
        expect(push).toHaveBeenCalledWith("/commerce/discounts");
    });

    it("refused, marks nothing and stays", async () => {
        const got = await ended({ ok: false, error: "No" });
        expect(got).toEqual({ stale: [false, false, false], reads: [] });
        expect(push).not.toHaveBeenCalled();
    });
});

describe("a code that isn't this business's", () => {
    it("is the page's 404", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ code: "not_found" }), {
                        status: 404,
                    }),
                ),
            ),
        );
        const errors: unknown[] = [];
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        const { unmount } = renderWithQuery(
            <Catch onError={(e) => errors.push(e)}>
                <DiscountContainer ask={ASK} />
            </Catch>,
        );
        await tick();
        spy.mockRestore();
        expect(String(errors[0])).toContain("NEXT_NOT_FOUND");
        unmount();
    });
});

class Catch extends Component<
    { onError: (e: unknown) => void; children: React.ReactNode },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch(error: unknown) {
        this.props.onError(error);
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}
