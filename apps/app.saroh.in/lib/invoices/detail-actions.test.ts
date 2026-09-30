import { describe, expect, it } from "vitest";

import type { DetailActionState } from "./detail-actions";
import { detailActions } from "./detail-actions";

/**
 * Invoice Detail's buttons (after "Saroh Invoice Detail"), and what DEC-070
 * changes: without online payment Send reads "Send invoice" and there is no
 * "Copy pay link"; with it, today's buttons.
 */

const base: DetailActionState = {
    standing: "ISSUED",
    credit: false,
    fromOrder: false,
    canWrite: true,
    sendable: true,
    reminding: false,
    reminderWaits: false,
    payOnline: true,
    charging: false,
    hasPdf: true,
    linkBusy: false,
    pdfBusy: false,
};

const labels = (over: Partial<DetailActionState>) =>
    detailActions({ ...base, ...over }).map((a) => a.label);
const primary = (over: Partial<DetailActionState>) =>
    detailActions({ ...base, ...over }).find((a) => a.primary)?.label;

describe("detailActions", () => {
    it("an unpaid invoice that pays online: Send with pay link and Copy pay link, as today", () => {
        expect(labels({})).toEqual([
            "Send with pay link",
            "Copy pay link",
            "Mark paid",
            "Print",
            "Download PDF",
            "Cancel invoice",
        ]);
        expect(primary({})).toBe("Send with pay link");
    });

    it("payOnline false: Send invoice, and no Copy pay link (DEC-070)", () => {
        const got = labels({ payOnline: false });
        expect(got[0]).toBe("Send invoice");
        expect(got).not.toContain("Copy pay link");
        expect(got).not.toContain("Send with pay link");
        expect(primary({ payOnline: false })).toBe("Send invoice");
    });

    it("payOnline false and nothing to send it by: Mark paid leads", () => {
        const got = labels({ payOnline: false, sendable: false });
        expect(got).toEqual([
            "Mark paid",
            "Print",
            "Download PDF",
            "Cancel invoice",
        ]);
        expect(primary({ payOnline: false, sendable: false })).toBe(
            "Mark paid",
        );
    });

    it("a draft: Send invoice issues and sends without online payment", () => {
        expect(labels({ standing: "DRAFT", payOnline: false })).toEqual([
            "Send invoice",
            "Issue it",
            "Edit",
            "Delete draft",
        ]);
        expect(labels({ standing: "DRAFT" })[0]).toBe("Send with pay link");
        expect(primary({ standing: "DRAFT", sendable: false })).toBe(
            "Issue it",
        );
    });

    it("once sent, Send reminder, held while one went today", () => {
        const got = detailActions({
            ...base,
            payOnline: false,
            reminding: true,
            reminderWaits: true,
        });
        expect(got[0]).toMatchObject({
            id: "remind",
            label: "Send reminder",
            disabled: true,
        });
    });

    it("no pay link while autopay is charging it (D13)", () => {
        expect(labels({ charging: true })).not.toContain("Copy pay link");
    });

    it("paid: Print and Refund, or Refund on the order", () => {
        expect(labels({ standing: "PAID" })).toEqual([
            "Print",
            "Download PDF",
            "Refund…",
        ]);
        expect(labels({ standing: "PAID", fromOrder: true })).toContain(
            "Refund on the order",
        );
        expect(labels({ standing: "PAID", canWrite: false })).toEqual([
            "Print",
            "Download PDF",
        ]);
    });

    it("a role that only reads it gets Print and the PDF", () => {
        expect(labels({ canWrite: false })).toEqual(["Print", "Download PDF"]);
    });
});
