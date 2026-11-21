import type { OrganizationContext } from "../../common/types/organization-context";
import type { UnitVerdictRow } from "./change-approvals";
import { recordUnitVerdicts, unitApprovals } from "./change-approvals";
import type { ChangeUnit } from "./change-units";

// Per-change approval (DEC-226, website area U9): the pure rule, and the
// write's refusals.

const unit = (key: string, editedBy: string | null, fingerprint = "f1") =>
    ({
        key,
        kind: "section",
        change: "changed",
        label: "Changed · Intro",
        where: "Bridal",
        pageId: "p1",
        fingerprint,
        editedBy,
        editedAt: editedBy ? "2026-11-20T10:00:00.000Z" : null,
        requires: [],
    }) satisfies ChangeUnit;

const row = (
    unitKey: string,
    byUserId: string,
    outcome: string,
    unitFingerprint = "f1",
    reason: string | null = null,
): UnitVerdictRow => ({
    unitKey,
    unitFingerprint,
    byUserId,
    outcome,
    reason,
    createdAt: new Date("2026-11-20T11:00:00.000Z"),
});

const LEADS = new Set(["mohit"]);

describe("unitApprovals", () => {
    it("a reviewer's approval covers the change it saw", () => {
        const s = unitApprovals(
            [unit("k1", "ritika")],
            [row("k1", "kavya", "APPROVED")],
            LEADS,
        ).get("k1");
        expect(s).toMatchObject({
            state: "approved",
            byUserId: "kavya",
            voided: false,
        });
    });

    it("an edit after it voids the approval", () => {
        const s = unitApprovals(
            [unit("k1", "ritika", "f2")],
            [row("k1", "kavya", "APPROVED", "f1")],
            LEADS,
        ).get("k1");
        expect(s).toMatchObject({ state: "waiting", voided: true });
    });

    it("an approval by the change's own last editor covers nothing", () => {
        const s = unitApprovals(
            [unit("k1", "kavya")],
            [row("k1", "kavya", "APPROVED")],
            LEADS,
        ).get("k1");
        expect(s?.state).toBe("waiting");
    });

    it("an owner's or admin's change needs nobody's approval", () => {
        expect(
            unitApprovals([unit("k1", "mohit")], [], LEADS).get("k1")?.state,
        ).toBe("not-needed");
    });

    it("the newest verdict stands: asked for changes, with the reason", () => {
        const s = unitApprovals(
            [unit("k1", "ritika")],
            [
                row("k1", "kavya", "CHANGES_REQUESTED", "f1", "Old prices"),
                row("k1", "kavya", "APPROVED"),
            ],
            LEADS,
        ).get("k1");
        expect(s).toMatchObject({
            state: "asked",
            reason: "Old prices",
        });
    });

    it("an earlier change (nobody stamped) waits", () => {
        expect(
            unitApprovals([unit("k1", null)], [], LEADS).get("k1")?.state,
        ).toBe("waiting");
    });
});

describe("recordUnitVerdicts", () => {
    const ctx = (userId: string): OrganizationContext => ({
        organizationId: "org_1",
        userId,
        role: "REVIEWER",
    });
    const tx = () => ({
        siteChangeApproval: {
            create: jest
                .fn()
                .mockImplementation(({ data }: { data: { unitKey: string } }) =>
                    Promise.resolve({ id: `row-${data.unitKey}` }),
                ),
        },
        job: { create: jest.fn().mockResolvedValue({ id: "job_1" }) },
        siteReviewer: { count: jest.fn().mockResolvedValue(1) },
    });
    const units = [
        unit("k1", "ritika"),
        unit("k2", "kavya"),
        unit("k3", "ritika"),
    ];

    it("refuses a change the caller made last (403)", async () => {
        const t = tx();
        await expect(
            recordUnitVerdicts(t as never, ctx("kavya"), {
                siteId: "s1",
                units,
                keys: ["k1", "k2"],
                outcome: "APPROVED",
            }),
        ).rejects.toMatchObject({ status: 403 });
        expect(t.siteChangeApproval.create).not.toHaveBeenCalled();
    });

    it("refuses a change not waiting any more (400)", async () => {
        await expect(
            recordUnitVerdicts(tx() as never, ctx("kavya"), {
                siteId: "s1",
                units,
                keys: ["gone"],
                outcome: "APPROVED",
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("approves at each change's fingerprint, telling nobody", async () => {
        const t = tx();
        await recordUnitVerdicts(t as never, ctx("kavya"), {
            siteId: "s1",
            units,
            keys: ["k1"],
            outcome: "APPROVED",
            reason: "ignored",
        });
        expect(t.siteChangeApproval.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                unitKey: "k1",
                unitFingerprint: "f1",
                byUserId: "kavya",
                outcome: "APPROVED",
                reason: null,
            }),
            select: { id: true },
        });
        expect(t.job.create).not.toHaveBeenCalled();
    });

    it("asking for changes tells each editor once", async () => {
        const t = tx();
        await recordUnitVerdicts(t as never, ctx("mohit"), {
            siteId: "s1",
            units,
            keys: ["k1", "k2", "k3"],
            outcome: "CHANGES_REQUESTED",
            reason: "Old prices",
        });
        expect(t.siteChangeApproval.create).toHaveBeenCalledTimes(3);
        expect(t.job.create).toHaveBeenCalledTimes(2);
    });
});
