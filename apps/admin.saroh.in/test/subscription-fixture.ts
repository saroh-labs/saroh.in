/**
 * A subscription sheet's data for tests: Rye and Co on a made-up plan and
 * made-up amounts, active, with nothing wrong. `subscription` and the rest
 * take overrides.
 */
import type {
    SarohInvoiceRow,
    SarohSubscriptionDetail,
} from "@/lib/billing-words";

type Detail = SarohSubscriptionDetail;

export function subscriptionDetail(
    overrides: Partial<Omit<Detail, "subscription">> & {
        subscription?: Partial<Detail["subscription"]>;
    } = {},
): Detail {
    const { subscription, ...rest } = overrides;
    return {
        subscription: {
            id: "sub_row",
            organization: { id: "org_rye", name: "Rye and Co", slug: "rye" },
            plan: {
                key: "plan.x",
                name: "Plan X",
                version: 2,
                interval: "month",
            },
            status: "ACTIVE",
            billingCycle: "month",
            currentPeriodEnd: "2026-11-14T00:00:00.000Z",
            cancelAtPeriodEnd: false,
            freeChosenAt: null,
            pending: null,
            provider: "RAZORPAY",
            providerSubscriptionId: "sub_Rye12345",
            providerCustomerId: "cust_Rye12345",
            termEndsAt: "2027-10-14T00:00:00.000Z",
            termPayment: "AUTOPAY",
            nextChargeAt: "2026-11-14T00:00:00.000Z",
            nextChargeHow: "AUTOPAY",
            autopayRunsOutSoon: false,
            billingProfile: { name: "Rye and Co Pvt", businesses: 1 },
            lastInvoice: null,
            ...subscription,
        },
        since: "2026-03-02T00:00:00.000Z",
        price: {
            listPaise: 12_300,
            currency: "INR",
            customPaise: null,
            customUntil: null,
        },
        billingProfile: {
            id: "bp_1",
            legalName: "Rye and Co Pvt",
            billingEmail: "accounts@example.com",
            gstin: null,
            provider: "RAZORPAY",
            providerCustomerId: "cust_Rye12345",
            syncedAt: "2026-10-01T05:00:00.000Z",
            lastError: null,
            contactWithheld: false,
            otherBusinesses: [],
        },
        invoices: [],
        refunds: [],
        doubleCharges: [],
        openActions: [],
        checkouts: [],
        events: [],
        ...rest,
    };
}

export function invoiceRow(n: number): SarohInvoiceRow {
    return {
        id: `inv_${n}`,
        number: `SAR/TEST/${n}`,
        issuedAt: "2026-10-14T06:00:00.000Z",
        organization: { id: "org_rye", name: "Rye and Co", slug: "rye" },
        source: "RENEWAL",
        planName: "Plan X",
        cycle: "month",
        currency: "INR",
        taxType: "INTRA",
        placeOfSupply: "29",
        taxablePaise: 10_000,
        cgstPaise: 900,
        sgstPaise: 900,
        igstPaise: 0,
        taxPaise: 1_800,
        totalPaise: 11_800,
        billToName: "Rye and Co Pvt",
        billToGstin: null,
        provider: "RAZORPAY",
        providerPaymentId: `pay_Test${n}abcd`,
        providerSubscriptionId: "sub_Rye12345",
        providerCustomerId: "cust_Rye12345",
        providerAmountPaise: null,
        amountMismatch: false,
        refunds: [],
    };
}
