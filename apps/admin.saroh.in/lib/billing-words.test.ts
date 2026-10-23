import { describe, expect, it, vi } from "vitest";

const getJson = vi.fn(() => Promise.resolve(null));
const adminFetch = vi.fn(() => Promise.resolve(new Response("")));
vi.mock("./control-plane", () => ({ getJson, adminFetch }));

const { listSarohInvoices, listSarohSubscriptions, fetchInvoicesExport } =
    await import("./billing");
const words = await import("./billing-words");
const {
    billingHref,
    currentIstMonth,
    endingLine,
    formatPaise,
    gstSplit,
    istDate,
    monthLabel,
    readGstin,
    readMonth,
    readPage,
    readStatus,
    readView,
    recentMonths,
} = words;

describe("reading the query string", () => {
    it("takes a month only as 2026-10", () => {
        expect(readMonth("2026-10")).toBe("2026-10");
        expect(readMonth(" 2026-01 ")).toBe("2026-01");
        for (const bad of [undefined, "", "2026-13", "2026-1", "Oct"]) {
            expect(readMonth(bad)).toBeUndefined();
        }
    });

    it("takes only the GSTIN, status and view values the API knows", () => {
        expect(readGstin("yes")).toBe("yes");
        expect(readGstin("true")).toBeUndefined();
        expect(readStatus("PAST_DUE")).toBe("PAST_DUE");
        expect(readStatus("past_due")).toBeUndefined();
        expect(readView("ending-soon")).toBe("ending-soon");
        expect(readView("toString")).toBeUndefined();
    });

    it("reads a page as a whole number from 1", () => {
        expect(readPage("3")).toBe(3);
        for (const bad of [undefined, "0", "-1", "1.5", "x"]) {
            expect(readPage(bad)).toBe(1);
        }
    });
});

describe("months", () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in India.
    const now = new Date("2026-10-31T20:00:00.000Z");

    it("takes this month as India's", () => {
        expect(currentIstMonth(now)).toBe("2026-11");
    });

    it("lists the recent months newest first, across the year", () => {
        expect(recentMonths(3, new Date("2026-02-10T00:00:00.000Z"))).toEqual([
            "2026-02",
            "2026-01",
            "2025-12",
        ]);
    });

    it("names a month", () => {
        expect(monthLabel("2026-10")).toBe("October 2026");
    });
});

describe("money and dates", () => {
    it("says paise as rupees with the paise, grouped the Indian way", () => {
        expect(formatPaise(0)).toBe("₹0.00");
        expect(formatPaise(13_098)).toBe("₹130.98");
        expect(formatPaise(12_345_678_9)).toBe("₹12,34,567.89");
        expect(formatPaise(-150)).toBe("-₹1.50");
    });

    it("says the day as it is in India", () => {
        expect(istDate("2026-10-16T20:00:00.000Z")).toBe("17 Oct 2026");
        expect(istDate(null)).toBe("—");
    });

    it("splits GST as stored: CGST + SGST within a state, IGST across", () => {
        const base = {
            currency: "INR",
            cgstPaise: 900,
            sgstPaise: 900,
            igstPaise: 0,
        };
        expect(gstSplit({ ...base, taxType: "INTRA" })).toBe(
            "CGST ₹9.00 + SGST ₹9.00",
        );
        expect(
            gstSplit({
                ...base,
                taxType: "INTER",
                cgstPaise: 0,
                sgstPaise: 0,
                igstPaise: 1_800,
            }),
        ).toBe("IGST ₹18.00");
    });
});

describe("what is coming for a subscription", () => {
    const row = {
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-11-03T00:00:00.000Z",
        pending: null,
    } as unknown as Parameters<typeof endingLine>[0];

    it("names a pending move, an end, or nothing", () => {
        expect(endingLine(row)).toBeNull();
        expect(endingLine({ ...row, cancelAtPeriodEnd: true })).toBe(
            "Ends 3 Nov 2026",
        );
        expect(
            endingLine({
                ...row,
                pending: {
                    plan: {
                        key: "k",
                        name: "Plan C",
                        version: 2,
                        interval: "month",
                    },
                    from: "2026-11-03T00:00:00.000Z",
                },
            }),
        ).toBe("Moves to Plan C on 3 Nov 2026");
        expect(
            endingLine({
                ...row,
                status: "CANCELLED",
                cancelAtPeriodEnd: true,
            }),
        ).toBeNull();
    });
});

describe("addresses", () => {
    it("keeps only the filters that say something, and page 1 out", () => {
        expect(billingHref("/billing/invoices", {})).toBe("/billing/invoices");
        expect(
            billingHref("/billing/invoices", {
                month: "2026-10",
                q: "",
                gstin: undefined,
                page: 1,
            }),
        ).toBe("/billing/invoices?month=2026-10");
        expect(
            billingHref("/billing/subscriptions", {
                view: "past-due",
                page: 2,
            }),
        ).toBe("/billing/subscriptions?view=past-due&page=2");
    });

    it("asks the API with only the filters given", async () => {
        await listSarohInvoices({ month: "2026-10", q: undefined, page: 2 });
        expect(getJson).toHaveBeenLastCalledWith(
            "/billing/invoices?month=2026-10&page=2",
        );
        await listSarohSubscriptions({});
        expect(getJson).toHaveBeenLastCalledWith("/billing/subscriptions");
        await fetchInvoicesExport({ month: "2026-10", gstin: "yes" });
        expect(adminFetch).toHaveBeenLastCalledWith(
            "/billing/invoices/export?month=2026-10&gstin=yes",
        );
    });
});

describe("a subscription row in words (R26)", () => {
    const { autopayState, billedToLine, nextChargeLine, planNote } = words;
    const base = {
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-11-03T00:00:00.000Z",
        pending: null,
        termEndsAt: "2027-06-01T00:00:00.000Z",
        termPayment: "AUTOPAY",
        nextChargeAt: "2026-11-03T00:00:00.000Z",
        nextChargeHow: "AUTOPAY",
        autopayRunsOutSoon: false,
        billingProfile: null,
    } as unknown as Parameters<typeof nextChargeLine>[0];

    it("says the next charge and how it is paid", () => {
        expect(nextChargeLine(base)).toBe("3 Nov 2026 · autopay");
        expect(
            nextChargeLine({
                ...base,
                nextChargeHow: "PAID_FOR_YEAR",
                nextChargeAt: null,
                termPayment: "ONE_TIME",
                termEndsAt: "2027-05-05T00:00:00.000Z",
            }),
        ).toBe("Paid for the year · ends 5 May 2027");
        expect(
            nextChargeLine({
                ...base,
                nextChargeHow: "NONE",
                nextChargeAt: null,
                cancelAtPeriodEnd: true,
            }),
        ).toBe("None · ends 3 Nov 2026");
        expect(
            nextChargeLine({
                ...base,
                status: "CANCELLED",
                nextChargeHow: "NONE",
                nextChargeAt: null,
            }),
        ).toBe("None · ended");
    });

    it("marks an autopay running out soon, and one declined", () => {
        expect(autopayState(base)).toEqual({
            label: "On until 1 Jun 2027",
            warn: false,
        });
        expect(
            autopayState({
                ...base,
                autopayRunsOutSoon: true,
                termEndsAt: "2026-11-10T00:00:00.000Z",
            }),
        ).toEqual({ label: "Runs out 10 Nov 2026", warn: true });
        expect(autopayState({ ...base, status: "PAST_DUE" })).toEqual({
            label: "Declined",
            warn: true,
        });
        expect(
            autopayState({ ...base, nextChargeHow: "PAID_FOR_YEAR" }).label,
        ).toBe("Not needed");
    });

    it("says who it is billed to, and when a profile bills two", () => {
        expect(billedToLine(base)).toBeNull();
        expect(
            billedToLine({
                ...base,
                billingProfile: { name: "Example Holdings", businesses: 2 },
            }),
        ).toBe("Example Holdings · 2 businesses on one profile");
        expect(
            billedToLine({
                ...base,
                billingProfile: { name: "Example Holdings", businesses: 1 },
            }),
        ).toBe("Example Holdings");
    });

    it("notes a trial's end", () => {
        expect(planNote({ ...base, status: "TRIALING" })).toBe(
            "Trial until 3 Nov 2026",
        );
        expect(planNote(base)).toBeNull();
    });
});
