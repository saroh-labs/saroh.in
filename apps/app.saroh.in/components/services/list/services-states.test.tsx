/**
 * Bookings › Services' route states (U15, #1031; board BKDStates): while
 * it loads, the real header over grey rows; a role that can't read
 * services is told why, calmly, by the page's own gate. The list's
 * reading states are the container's (`services-container.test.tsx`), its
 * own states `services-screen.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above these, so the page reads the mocks below.
import ServicesLoading from "@/app/(shell)/services/loading";
import ServicesPage from "@/app/(shell)/services/page";

vi.mock("@/lib/session", () => ({ requireSession: () => Promise.resolve() }));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("next/headers", () => ({}));
vi.mock("@/lib/services/editor-data", () => ({
    readCanEditServices: () => Promise.resolve(false),
}));
const org = vi.hoisted(() => ({
    business: null as null | Record<string, unknown>,
}));
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () => Promise.resolve(org.business),
}));
vi.mock("@/components/services/list/services-container", () => ({
    ServicesContainer: ({ canEdit }: { canEdit: boolean }) => (
        <div data-container={String(canEdit)} />
    ),
}));

beforeEach(() => {
    org.business = null;
});

describe("the Services route's states", () => {
    it("loading: the real title over grey, said once to a screen reader", () => {
        const html = renderToStaticMarkup(<ServicesLoading />);
        expect(html).toContain("Services");
        expect(html).toContain('role="status"');
        expect(html).toContain("Loading services");
    });

    it("a role without service:read is told, not shown a failure, and nothing is read", async () => {
        org.business = {
            id: "org_1",
            name: "Kaya Physio",
            role: "REVIEWER",
            actions: ["site:review"],
        };
        const html = renderToStaticMarkup(await ServicesPage());
        expect(html).not.toContain("Couldn&#x27;t load");
        expect(html).not.toContain("data-container");
        expect(html).toContain("Services");
    });

    it("hands a reader to the container, with what the role may change", async () => {
        org.business = {
            id: "org_1",
            name: "Kaya Physio",
            role: "MEMBER",
            actions: ["service:read"],
        };
        const html = renderToStaticMarkup(await ServicesPage());
        expect(html).toContain('data-container="false"');
    });
});
