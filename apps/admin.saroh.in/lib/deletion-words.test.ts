import { describe, expect, it } from "vitest";

import type { TrailRowLike } from "./deletion-words";
import {
    DATA_KEPT_MEANS,
    dataKeptLine,
    formatMinor,
    LEGAL_HOLD_MEANS,
    legalHoldLine,
    refundStage,
    trailDetail,
    trailTitle,
} from "./deletion-words";

const row = (extra: Partial<TrailRowLike>): TrailRowLike => ({
    action: "organization.deleted",
    outcome: "SUCCESS",
    reason: null,
    actor: null,
    actorUserId: "system:organization-deletion",
    refunds: null,
    steps: null,
    ...extra,
});

describe("deletion trail words (#921)", () => {
    it("names each step of a deletion", () => {
        expect(trailTitle(row({}))).toBe("Deleted");
        expect(
            trailTitle(
                row({ action: "organization.deletion.waiting_on_refunds" }),
            ),
        ).toBe("Waiting on refunds");
        expect(
            trailTitle(
                row({
                    action: "organization.deletion.cleanup",
                    outcome: "FAILURE",
                }),
            ),
        ).toBe("Clean-up unfinished");
        expect(
            trailTitle(row({ action: "organization.deletion.cleanup" })),
        ).toBe("Clean-up finished");
    });

    it("says how many refunds a run waited on, and what is owed", () => {
        expect(
            trailDetail(
                row({
                    action: "organization.deletion.waiting_on_refunds",
                    refunds: { count: 2, owedMinorByCurrency: { INR: 62_000 } },
                }),
            ),
        ).toBe("2 refunds still owed to customers · ₹620.00");
    });

    it("says how each clean-up step went", () => {
        expect(
            trailDetail(
                row({
                    action: "organization.deletion.cleanup",
                    steps: [
                        { step: "billing", result: "ok" },
                        { step: "keys", result: "failed" },
                    ],
                }),
            ),
        ).toBe("Saroh billing: done · Payment and messaging keys: failed");
    });

    it("says who did an operator's step, and why", () => {
        expect(
            trailDetail(
                row({
                    action: "organization.deletion.scheduled",
                    reason: "Owner asked",
                    actor: "Priya",
                    actorUserId: "u1",
                }),
            ),
        ).toBe("Owner asked · Priya");
        expect(trailDetail(row({}))).toBe("Saroh, automatically");
    });

    it("names a legal hold placed and lifted (DEC-122)", () => {
        expect(
            trailTitle(row({ action: "organization.legal_hold.placed" })),
        ).toBe("Legal hold placed");
        expect(
            trailTitle(row({ action: "organization.legal_hold.lifted" })),
        ).toBe("Legal hold lifted");
        expect(
            trailDetail(
                row({
                    action: "organization.legal_hold.placed",
                    reason: "Police notice 14/2026",
                    actor: "Priya",
                    actorUserId: "u1",
                }),
            ),
        ).toBe("Police notice 14/2026 · Priya");
    });

    it("says a clean-up stood aside for a legal hold, not that it failed", () => {
        const held = row({
            action: "organization.deletion.cleanup",
            outcome: "FAILURE",
            steps: [
                { step: "jobs", result: "held" },
                { step: "keys", result: "held" },
            ],
        });
        expect(trailTitle(held)).toBe("Clean-up held: legal hold");
        expect(trailDetail(held)).toBe(
            "Nothing was removed. It runs again when the hold is lifted.",
        );
        // A hold that landed mid-run: each step says how it went.
        expect(
            trailDetail(
                row({
                    action: "organization.deletion.cleanup",
                    outcome: "FAILURE",
                    steps: [
                        { step: "billing", result: "ok" },
                        { step: "keys", result: "held" },
                    ],
                }),
            ),
        ).toBe("Saroh billing: done · Payment and messaging keys: held");
    });

    it("words the erase, 180 days on", () => {
        const erased = row({
            action: "organization.retention.erase",
            steps: [
                { step: "media", result: "ok" },
                { step: "contacts", result: "ok" },
                { step: "records", result: "ok" },
            ],
        });
        expect(trailTitle(erased)).toBe("Data erased");
        expect(trailDetail(erased)).toBe(
            "Files: done · Customers: done · Orders, bookings, messages and the CRM: done",
        );
        const base = {
            action: "organization.retention.erase",
            outcome: "FAILURE",
        };
        expect(trailTitle(row({ ...base, state: "held" }))).toBe(
            "Erase stopped: legal hold",
        );
        expect(trailTitle(row({ ...base, state: "more" }))).toBe(
            "Erase under way",
        );
        expect(trailTitle(row({ ...base, state: "failed" }))).toBe(
            "Erase unfinished",
        );
        expect(trailTitle(row(base))).toBe("Erase unfinished");
    });

    it("says until when a deleted business's data is kept", () => {
        expect(dataKeptLine({})).toBeNull();
        expect(dataKeptLine({ dataKeptUntil: null })).toBeNull();
        expect(
            dataKeptLine({ dataKeptUntil: "2027-04-08T08:00:00.000Z" }),
        ).toMatch(/^Data kept until \d{1,2} Apr 2027$/);
        expect(
            dataKeptLine({
                dataKeptUntil: "2027-04-08T08:00:00.000Z",
                retentionErasedAt: "2027-04-09T02:00:00.000Z",
            }),
        ).toMatch(/^Data erased on \d{1,2} Apr 2027$/);
        // On legal hold the date passes and nothing is erased.
        expect(
            dataKeptLine({
                dataKeptUntil: "2027-04-08T08:00:00.000Z",
                legalHold: { at: "2026-12-01T00:00:00.000Z" },
            }),
        ).toMatch(
            /^Data kept while it is on legal hold \(it would have been erased on \d{1,2} Apr 2027\)$/,
        );
        expect(DATA_KEPT_MEANS).toContain("180 days");
        expect(DATA_KEPT_MEANS).toContain("tax records");
    });

    it("says who placed a legal hold and when, and what it means", () => {
        expect(
            legalHoldLine({
                at: "2026-10-10T06:00:00.000Z",
                reason: "Police notice 14/2026",
                by: "Priya",
            }),
        ).toMatch(/^Placed \d{1,2} Oct 2026 by Priya$/);
        expect(
            legalHoldLine({
                at: "2026-10-10T06:00:00.000Z",
                reason: null,
                by: null,
            }),
        ).toMatch(/ by an operator$/);
        expect(LEGAL_HOLD_MEANS).toContain("Platform Owner");
        expect(LEGAL_HOLD_MEANS).toContain("Nothing deletes or erases it");
    });

    it("words where a refund stands, and its amount", () => {
        expect(refundStage("CONFIRMING")).toBe("Sent, not confirmed");
        expect(formatMinor(45_000, "INR")).toBe("₹450.00");
        expect(formatMinor(null, "INR")).toBe("—");
    });
});
