import type {
    ClassFullSuggestion,
    FirstSaleSuggestion,
    LateBillSuggestion,
    SellingLessSuggestion,
    SuggestionsRead,
} from "./reads";

/** Insights' suggestions as the API sends them (#1087), for tests. */

export const CLASS_FULL: ClassFullSuggestion = {
    key: "class-full:svc_1",
    rule: "CLASS_FULL",
    dismissible: true,
    service: { id: "svc_1", name: "Saturday sourdough class" },
    days: 28,
    sessions: 4,
    seats: 48,
    booked: 45,
    fullPercent: 93,
    action: { kind: "ADD_CLASS_TIME", href: "/services/svc_1" },
};

export const LATE_BILL: LateBillSuggestion = {
    key: "late-bill:inv_1",
    rule: "LATE_BILL",
    dismissible: true,
    invoice: { id: "inv_1", number: "INV-0042" },
    billedTo: "Shruti Menon",
    leftToPayMinor: 1_125_000,
    currency: "INR",
    dueOn: "2026-09-20",
    daysLate: 29,
    action: {
        kind: "REMIND",
        invoiceId: "inv_1",
        href: "/billing/invoices/inv_1",
    },
};

export const SELLING_LESS: SellingLessSuggestion = {
    key: "selling-less:prd_1",
    rule: "SELLING_LESS",
    dismissible: true,
    product: { id: "prd_1", name: "Croissants, box of 4" },
    sold: 12,
    soldBefore: 30,
    fewerPercent: 60,
    rankBefore: 3,
    action: { kind: "OPEN_PRODUCT", href: "/commerce/products/prd_1" },
};

export const FIRST_SALE: FirstSaleSuggestion = {
    key: "first-sale",
    rule: "FIRST_SALE",
    dismissible: false,
    action: { kind: "COPY_SHOP_LINK" },
};

export function suggestionsRead(
    over: Partial<SuggestionsRead> = {},
): SuggestionsRead {
    return {
        period: "4w",
        money: true,
        hasSales: true,
        suggestions: [CLASS_FULL, LATE_BILL, SELLING_LESS],
        ...over,
    };
}
