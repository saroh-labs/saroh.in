/**
 * Bookings › Services' route states (U15, #1031; board BKDStates): while
 * it loads, the real header over grey rows; when the services can't be
 * read, "Couldn't load your services" with Try again, never an empty
 * list; a role that can't read services is told why, calmly. Read as
 * markup; the list's own states are in `services-screen.test.tsx`.
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
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/services",
    useSearchParams: () => new URLSearchParams(),
}));

const readServices = vi.fn();
vi.mock("@/lib/services/service", () => ({
    readServices: () => readServices() as unknown,
}));
vi.mock("@/lib/services/editor-data", () => ({
    readStaffOrNull: () => Promise.resolve(null),
    readHasBookingPage: () => Promise.resolve(true),
    readCanEditServices: () => Promise.resolve(true),
    businessCurrencyOf: () => "INR",
}));
vi.mock("@/lib/services/usage-read", () => ({
    readServiceUsage: () => Promise.resolve(null),
}));
vi.mock("@/lib/modules/guard", () => ({
    modulesOrUnknown: () => Promise.resolve(null),
}));
vi.mock("@/lib/staff/service", () => ({
    readBookingPayment: () => Promise.resolve(null),
}));
vi.mock("@/lib/gst-rates/service", () => ({
    readMissingRates: () => Promise.resolve(null),
}));
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () =>
        Promise.resolve({ id: "org_1", name: "Kaya Physio", role: "REVIEWER" }),
}));
vi.mock("@/lib/courses/access", () => ({ canWriteCourses: () => false }));

beforeEach(() => readServices.mockReset());

describe("the Services route's states", () => {
    it("loading: the real title over grey, said once to a screen reader", () => {
        const html = renderToStaticMarkup(<ServicesLoading />);
        expect(html).toContain("Services");
        expect(html).toContain('role="status"');
        expect(html).toContain("Loading services");
    });

    it("couldn't load: says so, with Try again, and no empty list", async () => {
        readServices.mockResolvedValue({ ok: false });
        const html = renderToStaticMarkup(await ServicesPage());
        expect(html).toContain("Couldn&#x27;t load your services");
        expect(html).toContain("Try again");
        expect(html).not.toContain("No services yet");
    });

    it("a role that can't read services is told, not shown a failure", async () => {
        readServices.mockResolvedValue({ ok: false, forbidden: true });
        const html = renderToStaticMarkup(await ServicesPage());
        expect(html).not.toContain("Couldn&#x27;t load");
        expect(html).toContain("Services");
    });
});
