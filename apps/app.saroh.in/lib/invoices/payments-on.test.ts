import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingAccessView } from "@/lib/billing/access";
import { offlinePlan, onlinePlan } from "@/lib/billing/fixtures.test-data";

import { onlinePayReady, payLinkPossible } from "./payments-on";

/**
 * The invoice form's "Issue with pay link" and the bookings pages' link
 * (R33): offered only where the plan takes payment online, beside a
 * provider (and, for invoices, Payments on). Elsewhere the form just
 * issues, and the invoice goes out as a link to view.
 */

const reads = vi.hoisted(() => ({
    access: null as BillingAccessView | null,
    provider: true,
    paymentsOn: true,
}));

vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(reads.access),
}));
vi.mock("./tax", () => ({
    hasPaymentProvider: () => Promise.resolve(reads.provider),
}));
vi.mock("@/lib/modules/guard", () => ({
    modulesOrUnknown: () => Promise.resolve(null),
}));
vi.mock("@/lib/contacts/panels", () => ({
    moduleOn: () => reads.paymentsOn,
}));

beforeEach(() => {
    reads.access = null;
    reads.provider = true;
    reads.paymentsOn = true;
});

describe("payLinkPossible: the invoice form's Issue choice", () => {
    it("is off on a plan without online payments, even with a provider", async () => {
        reads.access = offlinePlan();
        expect(await payLinkPossible()).toBe(false);
    });

    it("is on with online payments, Payments on and a provider", async () => {
        reads.access = onlinePlan();
        expect(await payLinkPossible()).toBe(true);
    });

    it("is off with Payments switched off or no provider", async () => {
        reads.access = onlinePlan();
        reads.paymentsOn = false;
        expect(await payLinkPossible()).toBe(false);
        reads.paymentsOn = true;
        reads.provider = false;
        expect(await payLinkPossible()).toBe(false);
    });
});

describe("onlinePayReady: the bookings pages' pay link", () => {
    it("is off on a plan without online payments", async () => {
        reads.access = offlinePlan();
        expect(await onlinePayReady()).toBe(false);
    });

    it("is on with online payments and a provider", async () => {
        reads.access = onlinePlan();
        expect(await onlinePayReady()).toBe(true);
    });

    it("fails open when the plan can't be read, as the API does", async () => {
        reads.access = null;
        expect(await onlinePayReady()).toBe(true);
    });
});
