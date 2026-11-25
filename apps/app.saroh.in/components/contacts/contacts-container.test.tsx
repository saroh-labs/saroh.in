// @vitest-environment jsdom
/**
 * Contacts on React Query, first paint (owner, 25 Nov): the heading and New
 * contact are drawn at once; the count is a bar and the list skeleton rows
 * until the contacts land. Adding a contact reads Contacts again and marks
 * Customers and Home stale; a customer write marks Contacts stale.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/contacts",
}));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/contacts/create", () => ({ createContact: vi.fn() }));

import { ContactsContainer } from "@/components/contacts/contacts-container";
import { contactsSaved } from "@/lib/contacts/use-contacts";
import { customersSaved } from "@/lib/customers/use-customers";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const CONTACT = {
    id: "c1",
    email: "priya@example.com",
    firstName: "Priya",
    lastName: "Raman",
    phone: null,
    company: null,
    source: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    openLeadValue: null,
    openLeadCount: 0,
    nextBookingAt: null,
    lastOrderAt: null,
    lastOrderTotal: null,
    lastOrderCurrency: null,
};

let release: () => void;
const reads: string[] = [];

beforeEach(() => {
    reads.length = 0;
    const landed = new Promise<void>((r) => (release = r));
    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            await landed;
            return new Response(JSON.stringify([CONTACT]), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("Contacts before its first read", () => {
    it("draws the frame and skeleton rows, then the contacts in their place", async () => {
        const { host, unmount } = renderWithQuery(
            <ContactsContainer canAdd openOnArrival={false} currency="INR" />,
        );
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Contacts");
        expect(host.textContent).toContain("New contact");
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.textContent).not.toContain("Priya");
        expect(reads).toEqual(["/api/contacts"]);

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        expect(host.textContent).toContain("Priya");
        unmount();
    });
});

/** The keys a save asks React Query to invalidate, and how. */
function watch() {
    const client = makeTestClient();
    const asked: { key: unknown; refetch?: string }[] = [];
    const invalidate = client.invalidateQueries.bind(client);
    client.invalidateQueries = (filters) => {
        asked.push({ key: filters?.queryKey, refetch: filters?.refetchType });
        return invalidate(filters);
    };
    return { client, asked };
}

describe("saves", () => {
    it("a contact added reads Contacts again; Customers and Home are marked stale", async () => {
        const { client, asked } = watch();
        await contactsSaved(client, "org_1");
        expect(asked).toEqual([
            { key: ["contacts", "org_1"], refetch: undefined },
            { key: ["customers", "org_1"], refetch: "none" },
            { key: ["home", "org_1"], refetch: "none" },
        ]);
    });

    it("a customer write marks Contacts stale", async () => {
        const { client, asked } = watch();
        await customersSaved(client, "org_1");
        expect(asked).toContainEqual({
            key: ["contacts", "org_1"],
            refetch: "none",
        });
    });
});
