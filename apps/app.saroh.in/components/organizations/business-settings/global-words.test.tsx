// @vitest-environment jsdom
/**
 * No India-only word on a US business's Settings › Business (plan
 * 2026-11-08-001, U13): every tab, with its invoice preview, says no GST,
 * GSTIN, ₹, +91, MRP, PIN code or "Indian", and groups no figure in lakhs.
 * As a US business: Australia, New Zealand, Singapore and Canada rightly say
 * "GST". An Indian business's tabs still say GST, so the check can't pass by
 * dropping it everywhere. The browser's version is `global-screens.spec.ts`.
 * Made-up details only.
 */
import type { Edition } from "@saroh/edition";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    address,
    draw,
    host,
    mount,
    onTab,
    PROFILE,
    row,
    settings,
    unmount,
} from "./business-settings.test-kit";

const edition: { name: Edition } = vi.hoisted(() => ({ name: "INDIA" }));
vi.mock("@/lib/edition", async (actual) => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        ...(await actual<object>()),
        get PROFILE() {
            return editionProfile(edition.name);
        },
    };
});
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: vi.fn(),
    undoOrganizationSettings: vi.fn(),
    undoBusinessLogo: vi.fn(),
    undoStorefrontHours: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showUndo: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    dismissToast: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => address.params,
    usePathname: () => "/settings/organization",
}));
vi.mock("@/components/shared/fields/media-picker", () => ({
    useImageUpload: () => ({ upload: vi.fn(), busy: false, error: null }),
}));
vi.mock("@/lib/stores/storefront-actions", () => ({
    updateStorefront: vi.fn(),
}));

/** The same words `e2e/tests/global-screens.spec.ts` looks for. */
const INDIA_ONLY =
    /\bGST\b|GSTIN|₹|\+91|\bMRP\b|PIN code|Inclusive of all taxes|\blakh|\bIndian\b(?![ /]Ocean|\/)/;
const LAKH_GROUPED = /\d,\d\d,\d{3}\b/;
const TABS = ["identity", "contact", "tax", "hours", "address"] as const;

const US = settings({
    name: "Hill Road Studio",
    profile: {
        ...PROFILE,
        country: "US",
        timezone: "America/New_York",
        phone: "+12125550123",
    },
    tax: {
        registered: false,
        state: null,
        stateName: null,
        invoicePrefix: "HR",
        taxName: "Sales tax",
        taxRate: "8.875",
        yearStartMonth: 1,
        deliveryRate: "0",
        deliverySac: null,
    },
    registeredAddress: {
        line1: "500 Congress Avenue",
        line2: null,
        city: "Austin",
        postalCode: "78701",
        region: "TX",
        state: null,
        stateName: null,
    },
});

const INDIA = settings({
    tax: {
        registered: true,
        state: "29",
        stateName: "Karnataka",
        invoicePrefix: "NW",
        deliveryRate: "18",
        deliverySac: "996813",
    },
    profile: { ...PROFILE, taxId: "29ABCDE1234F1Z5" },
    registeredAddress: {
        line1: "12 Hill Road",
        line2: null,
        city: "Bengaluru",
        postalCode: "560001",
        state: "29",
        stateName: "Karnataka",
    },
});

beforeEach(mount);
afterEach(() => {
    edition.name = "INDIA";
    unmount();
});

describe("Settings › Business says nothing India's to a US business", () => {
    it.each(TABS)("%s", (tab) => {
        edition.name = "GLOBAL";
        onTab(tab);
        draw(US);
        const text = host.textContent;
        expect(text).not.toBe("");
        expect(text).not.toMatch(INDIA_ONLY);
        expect(text).not.toMatch(LAKH_GROUPED);
    });

    it("prints a US address's country once", () => {
        edition.name = "GLOBAL";
        onTab("address");
        draw(US);
        const text = row("business-registered-address")?.textContent ?? "";
        expect(text).toContain("Austin");
        expect(text.split("United States")).toHaveLength(2);
    });

    it("India unchanged: its address row still names India under it", () => {
        onTab("address");
        draw(INDIA);
        const text = row("business-registered-address")?.textContent ?? "";
        expect(text).toContain("Bengaluru");
        expect(text).toContain("India");
    });

    it("India unchanged: its tax tab still names GST and the GSTIN", () => {
        onTab("tax");
        draw(INDIA);
        expect(host.textContent).toMatch(/\bGST\b/);
        expect(host.textContent).toContain("29ABCDE1234F1Z5");
    });
});
