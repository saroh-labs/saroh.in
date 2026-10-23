/**
 * "The month counts" against a real Postgres (DEC-169, owner 19 Oct): a
 * business that joined with no manager earns its manager nothing until
 * they are added, and then the whole month (in India) they were added in,
 * even a payment that came in earlier that month. Earlier months earn
 * nothing; a manager whose link was open at a payment keeps it. The line
 * is written by the sweep's Re-run, by assigning a manager, or by the line
 * job, once.
 *
 * Days are India's ("+05:30"). Every rate is drawn at random per run and
 * every amount asserted against it. Integration project; holds with
 * TEST_RLS=on.
 */
import { prisma } from "@saroh/database";

import {
    endLink,
    linkTo,
    manager,
    randomRate,
    setRate,
    wipeCommission,
} from "../../../test/fixtures/commission";
import { AdminAccountManagersService } from "../admin/admin-account-managers.service";
import { AdminAuditService } from "../admin/admin-audit.service";
import { AdminRole, permissionsFor } from "../admin/admin-permissions";
import { CommissionLineHandler } from "./commission-line.job";
import { commissionPaise, monthOf } from "./commission-rules";
import * as settleModule from "./commission-settle";
import { CommissionSweepJob } from "./commission-sweep.job";

const tag = `${process.pid}-${Date.now()}`;
const ist = (local: string) => new Date(`${local}+05:30`);

const SUPPORT = {
    userId: "user-support",
    platformAdminId: "pa-support",
    roles: [AdminRole.Support],
    permissions: permissionsFor([AdminRole.Support]),
    viaBootstrap: false,
};
const managers = () => new AdminAccountManagersService(new AdminAuditService());

let lines: CommissionLineHandler;
let sweep: CommissionSweepJob;

beforeEach(async () => {
    lines = new CommissionLineHandler();
    sweep = new CommissionSweepJob(lines);
    await prisma.job.deleteMany({});
    await wipeCommission();
    await prisma.sarohInvoice.deleteMany({});
});

let seq = 0;
async function business(): Promise<string> {
    seq += 1;
    const org = await prisma.organization.create({
        data: {
            name: `Month shop ${seq}`,
            slug: `month-${seq}-${tag}`,
            createdAt: ist("2025-10-01T10:00:00"),
        },
    });
    return org.id;
}

/** A monthly payment cleared at `issuedAt`, settled then as the line job would. */
async function paid(organizationId: string, issuedAt: Date) {
    seq += 1;
    const taxablePaise = 100_000 + Math.floor(Math.random() * 900_000);
    const invoice = await prisma.sarohInvoice.create({
        data: {
            organizationId,
            number: `TST/MON/${seq}-${tag}`,
            series: "TST/MON",
            chargeKey: `mon:${seq}:${tag}`,
            source: "RENEWAL",
            provider: "RAZORPAY",
            providerEventId: `evt_mon_${seq}_${tag}`,
            providerPaymentId: `pay_mon_${seq}_${tag}`,
            planName: "Plan C",
            cycle: "month",
            periodStart: issuedAt,
            periodEnd: new Date(issuedAt.getTime() + 30 * 86_400_000),
            issuedAt,
            sellerName: "Saroh",
            billToName: "A shop",
            taxType: "INTRA",
            subtotalPaise: taxablePaise,
            taxablePaise,
            cgstPaise: 0,
            sgstPaise: 0,
            igstPaise: 0,
            taxPaise: 0,
            totalPaise: taxablePaise,
        },
    });
    await lines.settle(invoice.id, issuedAt);
    return invoice;
}

const linesOf = (sarohInvoiceId: string) =>
    prisma.commissionLine.findMany({ where: { sarohInvoiceId } });

describe("the month counts", () => {
    it("the owner's example: joined 1 Nov, manager on 1 Jan after the 00:05 renewal: January earns, November and December don't", async () => {
        const bps = randomRate();
        await setRate("ASSIGNED", bps, ist("2025-01-01T00:00:00"));
        const m = await manager();
        const org = await business();
        const nov = await paid(org, ist("2025-11-01T00:05:00"));
        const dec = await paid(org, ist("2025-12-01T00:05:00"));
        const jan = await paid(org, ist("2026-01-01T00:05:00"));
        // No manager when any of them cleared.
        for (const i of [nov, dec, jan])
            expect(await linesOf(i.id)).toEqual([]);

        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-01T11:00:00"),
        );
        // The sweep's Re-run writes January's line, for them, at the rate.
        const first = await sweep.sweep(ist("2026-01-25T12:00:00"));
        expect(first.written).toBe(1);
        expect(await linesOf(nov.id)).toEqual([]);
        expect(await linesOf(dec.id)).toEqual([]);
        const got = await linesOf(jan.id);
        expect(got.map((l) => l.platformAdminId)).toEqual([m.platformAdminId]);
        expect(got[0]!.amountPaise).toBe(
            commissionPaise(jan.taxablePaise, bps),
        );
        // The month's statement: its period ends in January's last days
        // or February's first, never in November or December.
        expect(monthOf(got[0]!.periodEnd) >= "2026-01").toBe(true);

        // Once: settling and sweeping again write nothing more.
        expect((await lines.settle(jan.id)).written).toBe(0);
        expect((await sweep.sweep(ist("2026-01-26T12:00:00"))).written).toBe(0);
        expect(await prisma.commissionLine.count()).toBe(1);
    });

    it("mid-month: a renewal on the 1st and a manager on the 20th, January earns", async () => {
        const m = await manager();
        const org = await business();
        const jan = await paid(org, ist("2026-01-01T00:05:00"));
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-20T10:00:00"),
        );
        expect((await lines.settle(jan.id)).written).toBe(1);
        expect((await linesOf(jan.id)).map((l) => l.platformAdminId)).toEqual([
            m.platformAdminId,
        ]);
    });

    it("the month is India's: 00:30 on 1 Jan in India is January", async () => {
        const m = await manager();
        const org = await business();
        const jan = await paid(org, ist("2026-01-01T00:30:00"));
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-05T10:00:00"),
        );
        expect((await lines.settle(jan.id)).written).toBe(1);
    });

    it("the month before: a renewal on 31 Dec and a manager on 1 Jan, nothing", async () => {
        const m = await manager();
        const org = await business();
        const dec = await paid(org, ist("2025-12-31T23:30:00"));
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-01T00:30:00"),
        );
        expect(await lines.settle(dec.id)).toMatchObject({
            written: 0,
            noLine: "no-manager",
        });
        expect((await sweep.sweep(ist("2026-01-10T12:00:00"))).written).toBe(0);
        expect(await linesOf(dec.id)).toEqual([]);
    });

    it("a manager whose link was open at the payment keeps it; the next one that month gets nothing of it", async () => {
        const before = await manager();
        const after = await manager();
        const org = await business();
        await linkTo(
            org,
            before.platformAdminId,
            "ASSIGNED",
            ist("2025-12-01T10:00:00"),
        );
        const jan = await paid(org, ist("2026-01-05T10:00:00"));
        await endLink(org, ist("2026-01-10T10:00:00"));
        await linkTo(
            org,
            after.platformAdminId,
            "ASSIGNED",
            ist("2026-01-10T10:00:00"),
        );
        await lines.settle(jan.id);
        await sweep.sweep(ist("2026-01-25T12:00:00"));
        expect((await linesOf(jan.id)).map((l) => l.platformAdminId)).toEqual([
            before.platformAdminId,
        ]);
    });

    it("the month starts at 00:00:00.000 on the 1st in India: that payment counts, 23:59:59.999 the day before doesn't", async () => {
        const m = await manager();
        const org = await business();
        const first = await paid(org, ist("2026-01-01T00:00:00.000"));
        const before = await paid(org, ist("2025-12-31T23:59:59.999"));
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-15T10:00:00"),
        );
        expect((await lines.settle(first.id)).written).toBe(1);
        expect((await lines.settle(before.id)).written).toBe(0);
        expect(await linesOf(before.id)).toEqual([]);
    });

    it("a manager taken on and let go in the same month still earns its earlier payment", async () => {
        const m = await manager();
        const org = await business();
        const jan = await paid(org, ist("2026-01-03T10:00:00"));
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-10T10:00:00"),
        );
        await endLink(org, ist("2026-01-20T10:00:00"));
        await sweep.sweep(ist("2026-01-25T12:00:00"));
        expect((await linesOf(jan.id)).map((l) => l.platformAdminId)).toEqual([
            m.platformAdminId,
        ]);
    });

    it("a refunded payment in the counted month earns nothing", async () => {
        await setRate("ASSIGNED", randomRate(), ist("2025-01-01T00:00:00"));
        const m = await manager();
        const org = await business();
        const jan = await paid(org, ist("2026-01-03T10:00:00"));
        await prisma.billingRefund.create({
            data: {
                organizationId: org,
                provider: "RAZORPAY",
                kind: "REFUND",
                providerRefundId: `rfnd_mon_${tag}`,
                providerPaymentId: jan.providerPaymentId!,
                invoiceId: jan.id,
                status: "PROCESSED",
                source: "PROVIDER",
            },
        });
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-10T10:00:00"),
        );
        await sweep.sweep(ist("2026-01-25T12:00:00"));
        const got = await linesOf(jan.id);
        expect(got.filter((l) => l.status !== "CANCELLED")).toEqual([]);
    });

    it("the first manager later that month decides it: off commission, nobody earns it, and the sweep leaves it be", async () => {
        await setRate("ASSIGNED", randomRate(), ist("2025-01-01T00:00:00"));
        const off = await manager({ onCommission: false });
        const on = await manager();
        const org = await business();
        const jan = await paid(org, ist("2026-01-03T10:00:00"));
        await linkTo(
            org,
            off.platformAdminId,
            "ASSIGNED",
            ist("2026-01-10T10:00:00"),
        );
        await endLink(org, ist("2026-01-15T10:00:00"));
        await linkTo(
            org,
            on.platformAdminId,
            "ASSIGNED",
            ist("2026-01-15T10:00:00"),
        );
        expect((await lines.settle(jan.id)).written).toBe(0);
        const settle = jest.spyOn(lines, "settle");
        for (const day of ["2026-01-25", "2026-01-26"]) {
            await sweep.sweep(ist(`${day}T12:00:00`));
            // Never picked up again: it would re-settle on every run.
            expect(settle).not.toHaveBeenCalledWith(jan.id, expect.anything());
        }
        expect(await linesOf(jan.id)).toEqual([]);
    });

    it("assigning a manager writes the lines of this month's payments made with no manager, once", async () => {
        const bps = randomRate();
        await setRate("ASSIGNED", bps, ist("2025-01-01T00:00:00"));
        const m = await manager();
        const org = await business();
        const now = ist("2026-01-20T12:00:00");
        const thisMonth = await paid(org, ist("2026-01-01T00:00:00.000"));
        const lastMonth = await paid(org, ist("2025-12-31T23:59:59.999"));
        expect(await linesOf(thisMonth.id)).toEqual([]);

        await managers().assign(
            SUPPORT,
            org,
            {
                platformAdminId: m.platformAdminId,
                reason: "taking it on",
            },
            now,
        );
        const got = await linesOf(thisMonth.id);
        expect(got.map((l) => [l.platformAdminId, l.amountPaise])).toEqual([
            [m.platformAdminId, commissionPaise(thisMonth.taxablePaise, bps)],
        ]);
        expect(await linesOf(lastMonth.id)).toEqual([]);
        expect((await lines.settle(thisMonth.id, now)).written).toBe(0);
        expect(await prisma.commissionLine.count()).toBe(1);
    });

    it("assigning while the sweep runs writes the line once", async () => {
        const bps = randomRate();
        await setRate("ASSIGNED", bps, ist("2025-01-01T00:00:00"));
        const m = await manager();
        const org = await business();
        const now = ist("2026-01-20T12:00:00");
        const jan = await paid(org, ist("2026-01-05T10:00:00"));
        await Promise.all([
            managers().assign(
                SUPPORT,
                org,
                { platformAdminId: m.platformAdminId, reason: "taking it on" },
                now,
            ),
            sweep.sweep(now),
            sweep.sweep(now),
        ]);
        await sweep.sweep(now);
        expect((await linesOf(jan.id)).map((l) => l.platformAdminId)).toEqual([
            m.platformAdminId,
        ]);
    });

    it("a settle that fails after assigning leaves the assignment in place; the sweep writes the line", async () => {
        const bps = randomRate();
        await setRate("ASSIGNED", bps, ist("2025-01-01T00:00:00"));
        const m = await manager();
        const org = await business();
        const now = ist("2026-01-20T12:00:00");
        const jan = await paid(org, ist("2026-01-05T10:00:00"));
        const failing = jest
            .spyOn(settleModule, "settleMonthBeforeLinkInTx")
            .mockRejectedValueOnce(new Error("settle broke"));
        try {
            await expect(
                managers().assign(
                    SUPPORT,
                    org,
                    {
                        platformAdminId: m.platformAdminId,
                        reason: "taking it on",
                    },
                    now,
                ),
            ).resolves.toMatchObject({
                manager: { platformAdminId: m.platformAdminId },
            });
        } finally {
            failing.mockRestore();
        }
        expect(
            await prisma.accountManagerLink.count({
                where: { organizationId: org, endedAt: null },
            }),
        ).toBe(1);
        expect(await linesOf(jan.id)).toEqual([]);
        expect((await sweep.sweep(now)).written).toBe(1);
        expect((await linesOf(jan.id)).map((l) => l.platformAdminId)).toEqual([
            m.platformAdminId,
        ]);
    });
});
