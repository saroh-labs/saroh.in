/**
 * A business's own commission rate against a real Postgres (DEC-169,
 * #1035): the floor (its first paid plan), who may, the dry run, the
 * back-pay (its window, its manager, at most once, never a PAID or
 * CANCELLED line), precedence for later payments, and the ledger.
 *
 * Payments are written as the billing webhook leaves its invoice and
 * settled by the commission job's own `settle`. Every rate is drawn at
 * random per run and every amount asserted against it. Rows satisfy the
 * migrations' CHECKs and trigger, so it holds with TEST_RLS=on, where the
 * console works with no organization context. Integration project.
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    endLink,
    linkTo,
    manager,
    randomRate,
    setRate,
    twoRates,
    wipeCommission,
} from "../../../test/fixtures/commission";
import { isRlsTestMode } from "../../../test/rls-mode";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { CommissionLineHandler } from "../commission/commission-line.job";
import {
    commissionPaise,
    monthOf,
    splitEvenly,
} from "../commission/commission-rules";
import { CommissionSweepJob } from "../commission/commission-sweep.job";
import { dayOf } from "../commission/own-rate-rules";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCommissionService } from "./admin-commission.service";
import { AdminOwnRateService } from "./admin-own-rate.service";
import { AdminRole, permissionsFor } from "./admin-permissions";

const DAY = 24 * 60 * 60 * 1000;
const itRls = isRlsTestMode() ? it : it.skip;
const tag = `${process.pid}-${Date.now()}`;

let ownRates: AdminOwnRateService;
let commission: AdminCommissionService;
let lines: CommissionLineHandler;
let sweep: CommissionSweepJob;

function staff(role: AdminRole): PlatformAdminInfo {
    return {
        userId: `user-${role}`,
        platformAdminId: `pa-${role}`,
        roles: [role],
        permissions: permissionsFor([role]),
        viaBootstrap: false,
    };
}
const OWNER = () => staff(AdminRole.PlatformOwner);

beforeEach(async () => {
    const audit = new AdminAuditService();
    ownRates = new AdminOwnRateService(audit);
    commission = new AdminCommissionService(audit);
    lines = new CommissionLineHandler();
    sweep = new CommissionSweepJob(lines);
    await prisma.job.deleteMany({});
    await wipeCommission();
    await prisma.sarohInvoice.deleteMany({});
    await prisma.adminAuditEvent.deleteMany({});
});

let seq = 0;
async function business(): Promise<string> {
    seq += 1;
    const org = await prisma.organization.create({
        data: {
            name: `Own rate shop ${seq}`,
            slug: `own-rate-${seq}-${tag}`,
            createdAt: new Date(Date.now() - 200 * DAY),
        },
    });
    return org.id;
}

const ago = (days: number) => new Date(Date.now() - days * DAY);

/** A payment cleared `daysAgo`, paying for the month up to `periodEnd`, settled. */
async function paid(
    organizationId: string,
    daysAgo: number,
    over: {
        periodEnd?: Date;
        taxablePaise?: number;
        cycle?: "month" | "year";
        /** When it cleared, in place of `daysAgo`. */
        at?: Date;
    } = {},
) {
    seq += 1;
    const issuedAt = over.at ?? ago(daysAgo);
    const cycle = over.cycle ?? "month";
    const taxablePaise =
        over.taxablePaise ?? 100_000 + Math.floor(Math.random() * 900_000);
    const periodEnd =
        over.periodEnd ??
        new Date(issuedAt.getTime() + (cycle === "year" ? 365 : 30) * DAY);
    const invoice = await prisma.sarohInvoice.create({
        data: {
            organizationId,
            number: `TST/OWN/${seq}-${tag}`,
            series: "TST/OWN",
            chargeKey: `own:${seq}:${tag}`,
            source: "RENEWAL",
            provider: "RAZORPAY",
            providerEventId: `evt_own_${seq}_${tag}`,
            providerPaymentId: `pay_own_${seq}_${tag}`,
            planName: "Plan C",
            cycle,
            periodStart: issuedAt,
            periodEnd,
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
    await lines.settle(invoice.id);
    return invoice;
}

const linesOf = (sarohInvoiceId: string) =>
    prisma.commissionLine.findMany({
        where: { sarohInvoiceId },
        orderBy: { installment: "asc" },
    });

/** A business its manager has looked after for 150 days, with no general rate. */
async function looked() {
    const m = await manager();
    const org = await business();
    await linkTo(org, m.platformAdminId, "ASSIGNED", ago(150));
    return { m, org };
}

describe("who may", () => {
    it("only commission:rates sets, previews or ends; team:pay reads; others read nothing", async () => {
        const { org } = await looked();
        const first = await paid(org, 40);
        const input = {
            basisPoints: randomRate(),
            earnsFrom: dayOf(first.issuedAt),
        };
        for (const role of [
            AdminRole.Billing,
            AdminRole.Support,
            AdminRole.Operations,
            AdminRole.Auditor,
            AdminRole.AccountManager,
        ]) {
            const s = staff(role);
            await expect(ownRates.preview(s, org, input)).rejects.toThrow(
                ForbiddenException,
            );
            await expect(
                ownRates.set(s, org, { ...input, reason: "a better deal" }),
            ).rejects.toThrow(ForbiddenException);
            await expect(
                ownRates.end(s, org, { reason: "deal over" }),
            ).rejects.toThrow(ForbiddenException);
        }
        await expect(
            ownRates.read(staff(AdminRole.Support), org),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            ownRates.read(staff(AdminRole.Billing), org),
        ).resolves.toMatchObject({ organizationId: org, current: null });
        expect(await prisma.businessCommissionRate.count()).toBe(0);
        expect((await linesOf(first.id))[0]!.status).toBe("NO_RATE");
    });
});

describe("the floor: the business's first paid plan", () => {
    it("refuses a day before it, and allows that day", async () => {
        const { org } = await looked();
        // A free month first: not a paid plan.
        await paid(org, 70, { taxablePaise: 0 });
        const first = await paid(org, 50);
        const before = dayOf(new Date(first.issuedAt.getTime() - DAY));
        await expect(
            ownRates.preview(OWNER(), org, {
                basisPoints: randomRate(),
                earnsFrom: before,
            }),
        ).rejects.toThrow(/at the earliest, the day of its first paid plan/);
        await expect(
            ownRates.set(OWNER(), org, {
                basisPoints: randomRate(),
                earnsFrom: before,
                reason: "start earlier",
            }),
        ).rejects.toThrow(BadRequestException);
        const read = await ownRates.read(OWNER(), org);
        expect(read.dates.firstPaidPlan).toBe(dayOf(first.issuedAt));
        expect(read.dates.joined).toBe(dayOf(ago(200)));
        expect(read.dates.managerSince).toBe(dayOf(ago(150)));
        await expect(
            ownRates.preview(OWNER(), org, {
                basisPoints: randomRate(),
                earnsFrom: dayOf(first.issuedAt),
            }),
        ).resolves.toMatchObject({ payments: 1 });
        expect(await prisma.businessCommissionRate.count()).toBe(0);
    });

    it("refuses any day, even a later one, for a business with no paid plan yet", async () => {
        const { org } = await looked();
        await paid(org, 10, { taxablePaise: 0 });
        for (const earnsFrom of [
            dayOf(ago(5)),
            dayOf(new Date(Date.now() + 30 * DAY)),
        ]) {
            await expect(
                ownRates.set(OWNER(), org, {
                    basisPoints: randomRate(),
                    earnsFrom,
                    reason: "a better deal",
                }),
            ).rejects.toThrow(/hasn't paid for a plan yet/);
        }
        expect(await prisma.businessCommissionRate.count()).toBe(0);
    });

    it("refuses a business with no account manager", async () => {
        const org = await business();
        const first = await paid(org, 20);
        await expect(
            ownRates.set(OWNER(), org, {
                basisPoints: randomRate(),
                earnsFrom: dayOf(first.issuedAt),
                reason: "a better deal",
            }),
        ).rejects.toThrow(/no account manager/);
    });
});

describe("the floor: the month the manager took it on (owner, 19 Oct)", () => {
    // "A business joins on 1 Nov on Pro, a manager is assigned on 1 Jan,
    // then the commission for the business is paid for January", and the
    // month counts: January's renewal at 00:05, before the manager's link
    // that morning, is theirs. Days are India's.
    const ist = (local: string) => new Date(`${local}+05:30`);

    it("a business that joined with no manager earns its manager nothing from the months before they were added", async () => {
        const m = await manager();
        const org = await business();
        const nov = await paid(org, 0, { at: ist("2025-11-01T00:05:00") });
        const dec = await paid(org, 0, { at: ist("2025-12-01T00:05:00") });
        const jan = await paid(org, 0, { at: ist("2026-01-01T00:05:00") });
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-01T11:00:00"),
        );
        await lines.settle(jan.id);

        expect(await linesOf(nov.id)).toHaveLength(0);
        expect(await linesOf(dec.id)).toHaveLength(0);
        expect(
            (await linesOf(jan.id)).map((l) => [l.platformAdminId, l.status]),
        ).toEqual([[m.platformAdminId, "NO_RATE"]]);

        const read = await ownRates.read(OWNER(), org);
        expect(read.dates.firstPaidPlan).toBe("2025-11-01");
        expect(read.dates.managerSince).toBe("2026-01-01");
        const name = read.manager?.name ?? "";
        for (const earnsFrom of ["2025-11-01", "2025-12-01", "2025-12-31"]) {
            await expect(
                ownRates.preview(OWNER(), org, {
                    basisPoints: randomRate(),
                    earnsFrom,
                }),
            ).rejects.toThrow(
                new RegExp(
                    `^${name} took it on in Jan\\w* 2026\\. A rate can start from 1 Jan\\w* 2026, the start of that month\\.$`,
                ),
            );
            await expect(
                ownRates.set(OWNER(), org, {
                    basisPoints: randomRate(),
                    earnsFrom,
                    reason: "back to the start",
                }),
            ).rejects.toThrow(BadRequestException);
        }
        expect(await prisma.businessCommissionRate.count()).toBe(0);

        // From the 1st of the month they took it on: January, and only it.
        const bps = randomRate();
        const saved = await ownRates.set(OWNER(), org, {
            basisPoints: bps,
            earnsFrom: "2026-01-01",
            reason: "took it on",
        });
        expect(saved.backPaid).toEqual({
            payments: 1,
            amountPaise: commissionPaise(jan.taxablePaise, bps),
        });
        expect(await linesOf(nov.id)).toHaveLength(0);
        expect(await linesOf(dec.id)).toHaveLength(0);
        expect(
            await prisma.commissionLine.count({
                where: { organizationId: org, basisPoints: { not: null } },
            }),
        ).toBe(1);
    });

    it("a manager added on the 20th: a rate can start from the 1st, not the month before", async () => {
        const m = await manager();
        const org = await business();
        const jan = await paid(org, 0, { at: ist("2026-01-01T00:05:00") });
        await linkTo(
            org,
            m.platformAdminId,
            "ASSIGNED",
            ist("2026-01-20T10:00:00"),
        );
        await lines.settle(jan.id);
        await expect(
            ownRates.set(OWNER(), org, {
                basisPoints: randomRate(),
                earnsFrom: "2025-12-31",
                reason: "too early",
            }),
        ).rejects.toThrow(/took it on in Jan/);
        const bps = randomRate();
        const saved = await ownRates.set(OWNER(), org, {
            basisPoints: bps,
            earnsFrom: "2026-01-01",
            reason: "took it on",
        });
        expect(saved.backPaid).toEqual({
            payments: 1,
            amountPaise: commissionPaise(jan.taxablePaise, bps),
        });
    });
});

describe("the dry run and the back-pay", () => {
    it("the dry run says what saving would price and writes nothing", async () => {
        const { org } = await looked();
        const a = await paid(org, 90);
        const b = await paid(org, 60);
        const c = await paid(org, 5);
        const bps = randomRate();
        const before = await prisma.commissionLine.findMany({
            orderBy: { id: "asc" },
        });
        const preview = await ownRates.preview(OWNER(), org, {
            basisPoints: bps,
            earnsFrom: dayOf(b.issuedAt),
        });
        expect(preview).toMatchObject({
            payments: 2,
            amountPaise:
                commissionPaise(b.taxablePaise, bps) +
                commissionPaise(c.taxablePaise, bps),
            alreadyPriced: 0,
            replaces: null,
        });
        expect(
            await prisma.commissionLine.findMany({ orderBy: { id: "asc" } }),
        ).toEqual(before);
        expect(await prisma.businessCommissionRate.count()).toBe(0);
        expect(
            await prisma.adminAuditEvent.count({
                where: { action: { startsWith: "commission.own-rate.s" } },
            }),
        ).toBe(0);
        expect((await linesOf(a.id))[0]!.status).toBe("NO_RATE");
    });

    it("prices only NO_RATE payments in its window, moved on as fresh lines, and is on the ledger", async () => {
        const { m, org } = await looked();
        const before = await paid(org, 120);
        const ended = await paid(org, 90, { periodEnd: ago(60) });
        const year = await paid(org, 45, { cycle: "year" });
        const after = await paid(org, 10);
        const bps = randomRate();
        const saved = await ownRates.set(OWNER(), org, {
            basisPoints: bps,
            earnsFrom: dayOf(ended.issuedAt),
            lastDay: dayOf(year.issuedAt),
            reason: "agreed with them",
        });
        expect(saved.backPaid).toEqual({
            payments: 2,
            amountPaise:
                commissionPaise(ended.taxablePaise, bps) +
                commissionPaise(year.taxablePaise, bps),
        });
        const rate = await prisma.businessCommissionRate.findFirstOrThrow();
        expect(rate).toMatchObject({
            organizationId: org,
            platformAdminId: m.platformAdminId,
            basisPoints: bps,
            setByUserId: OWNER().userId,
            reason: "agreed with them",
        });
        expect(saved.current?.id ?? saved.history[0]?.id).toBe(rate.id);

        // Outside the window: still nothing.
        expect((await linesOf(before.id))[0]!.status).toBe("NO_RATE");
        expect((await linesOf(after.id))[0]!.status).toBe("NO_RATE");

        // Its period ended: payable in the month it ended.
        const [e] = await linesOf(ended.id);
        expect(e).toMatchObject({
            status: "PAYABLE",
            statementMonth: monthOf(ago(60)),
            basisPoints: bps,
            businessRateId: rate.id,
            rateId: null,
            amountPaise: commissionPaise(ended.taxablePaise, bps),
        });

        // A year paid at once: twelve parts that add up, each moved on.
        const parts = await linesOf(year.id);
        expect(parts).toHaveLength(12);
        expect(parts.map((l) => l.amountPaise)).toEqual(
            splitEvenly(commissionPaise(year.taxablePaise, bps), 12),
        );
        for (const l of parts) {
            expect(l.businessRateId).toBe(rate.id);
            expect(l.status).toBe(
                l.periodEnd.getTime() <= Date.now() ? "PAYABLE" : "PENDING",
            );
        }

        const audit = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { action: "commission.own-rate.set" },
        });
        expect(audit).toMatchObject({
            actorUserId: OWNER().userId,
            permission: "commission:rates",
            targetType: "organization",
            targetId: org,
            reason: "agreed with them",
            outcome: "SUCCESS",
        });
        expect(audit.metadata).toMatchObject({
            rateId: rate.id,
            backPaidPayments: 2,
            backPaidLines: 13,
        });
        // The sweep moves the back-paid lines on like any other.
        await sweep.sweep(new Date());
        expect(
            await prisma.commissionLine.count({
                where: { businessRateId: rate.id, status: "NO_RATE" },
            }),
        ).toBe(0);
    });

    it("prices only the manager's own lines: a payment under the manager before stays NO_RATE", async () => {
        const before = await manager();
        const now = await manager();
        const org = await business();
        await linkTo(org, before.platformAdminId, "ASSIGNED", ago(150));
        const theirs = await paid(org, 100);
        await endLink(org, ago(50));
        await linkTo(org, now.platformAdminId, "ASSIGNED", ago(50));
        const mine = await paid(org, 20);
        // A payment's line follows the link open when it was made; settling
        // again gives the new manager nothing of the old one's.
        await lines.settle(theirs.id);
        expect(
            (await linesOf(theirs.id)).map((l) => l.platformAdminId),
        ).toEqual([before.platformAdminId]);
        // No back-pay to a later manager: their rate starts when they did.
        await expect(
            ownRates.set(OWNER(), org, {
                basisPoints: randomRate(),
                earnsFrom: dayOf(theirs.issuedAt),
                reason: "agreed with the new manager",
            }),
        ).rejects.toThrow(
            /took it on in .*\. A rate can start from .*, the start of that month\.$/,
        );
        const saved = await ownRates.set(OWNER(), org, {
            basisPoints: randomRate(),
            earnsFrom: dayOf(ago(50)),
            reason: "agreed with the new manager",
        });
        expect(saved.backPaid.payments).toBe(1);
        expect((await linesOf(theirs.id))[0]).toMatchObject({
            platformAdminId: before.platformAdminId,
            status: "NO_RATE",
            businessRateId: null,
        });
        expect((await linesOf(mine.id))[0]).toMatchObject({
            platformAdminId: now.platformAdminId,
            businessRateId: saved.history[0]!.id,
        });
    });

    it("back-pays at most once: saving again prices nothing twice", async () => {
        const { org } = await looked();
        const a = await paid(org, 40);
        const bps = randomRate();
        const input = {
            basisPoints: bps,
            earnsFrom: dayOf(a.issuedAt),
            reason: "agreed with them",
        };
        const first = await ownRates.set(OWNER(), org, input);
        expect(first.backPaid.payments).toBe(1);
        const priced = await linesOf(a.id);

        let other = randomRate();
        while (other === bps) other = randomRate();
        const again = await ownRates.set(OWNER(), org, {
            ...input,
            basisPoints: other,
        });
        expect(again.backPaid).toEqual({ payments: 0, amountPaise: 0 });
        expect(await linesOf(a.id)).toEqual(priced);
        // One in force: the first was ended before it began.
        const rows = await prisma.businessCommissionRate.findMany({
            orderBy: { createdAt: "asc" },
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]!.until).toEqual(rows[0]!.earnsFrom);
        expect(rows[0]!.endedReason).toMatch(/^Replaced by the own rate/);
        expect(again.current?.id).toBe(rows[1]!.id);
        // The preview says so before the save.
        await expect(
            ownRates.preview(OWNER(), org, {
                basisPoints: bps,
                earnsFrom: dayOf(a.issuedAt),
            }),
        ).resolves.toMatchObject({
            payments: 0,
            alreadyPriced: 1,
            replaces: { id: rows[1]!.id },
        });
    });

    it("never touches a PAID or CANCELLED line, and a general rate set later never back-pays", async () => {
        const { m, org } = await looked();
        const rates = twoRates();
        const old = await paid(org, 100, { periodEnd: ago(70) });
        await setRate("ASSIGNED", rates.assigned, ago(80));
        const toPay = await paid(org, 60, { periodEnd: ago(35) });
        const refunded = await paid(org, 30, { periodEnd: ago(1) });
        // A general rate from today on: the payment before it stays NO_RATE.
        await commission.setRate(OWNER(), {
            kind: "ASSIGNED",
            basisPoints: rates.assigned,
            reason: "new general rate",
        });
        await sweep.sweep(new Date());
        expect((await linesOf(old.id))[0]!.status).toBe("NO_RATE");

        const month = monthOf(ago(35));
        await commission.markPaid(
            OWNER(),
            {
                platformAdminId: m.platformAdminId,
                month,
                reference: `UTR-${tag}`,
                reason: "paid by bank",
            },
            new Date(),
        );
        await prisma.billingRefund.create({
            data: {
                organizationId: org,
                provider: "RAZORPAY",
                kind: "REFUND",
                providerRefundId: `rfnd_own_${tag}`,
                providerPaymentId: refunded.providerPaymentId!,
                invoiceId: refunded.id,
                status: "PROCESSED",
                source: "PROVIDER",
            },
        });
        await lines.settle(refunded.id);
        const paidLine = (await linesOf(toPay.id))[0]!;
        const cancelled = (await linesOf(refunded.id))[0]!;
        expect(paidLine.status).toBe("PAID");
        expect(cancelled.status).toBe("CANCELLED");

        const saved = await ownRates.set(OWNER(), org, {
            basisPoints: rates.broughtIn,
            earnsFrom: dayOf(old.issuedAt),
            reason: "agreed with them",
        });
        expect(saved.backPaid.payments).toBe(1);
        expect((await linesOf(toPay.id))[0]).toEqual(paidLine);
        expect((await linesOf(refunded.id))[0]).toEqual(cancelled);
        expect((await linesOf(old.id))[0]).toMatchObject({
            status: "PAYABLE",
            basisPoints: rates.broughtIn,
        });
    });

    it("a refunded payment with no rate stays NO_RATE", async () => {
        const { org } = await looked();
        const a = await paid(org, 30);
        await prisma.billingRefund.create({
            data: {
                organizationId: org,
                provider: "RAZORPAY",
                kind: "REFUND",
                providerRefundId: `rfnd_nr_${tag}`,
                providerPaymentId: a.providerPaymentId!,
                invoiceId: a.id,
                status: "PROCESSED",
                source: "PROVIDER",
            },
        });
        const saved = await ownRates.set(OWNER(), org, {
            basisPoints: randomRate(),
            earnsFrom: dayOf(a.issuedAt),
            reason: "agreed with them",
        });
        expect(saved.backPaid.payments).toBe(0);
        expect((await linesOf(a.id))[0]!.status).toBe("NO_RATE");
    });
});

describe("precedence and End", () => {
    it("a payment after the save earns the own rate, not the kind's; after End, the kind's", async () => {
        const { m, org } = await looked();
        const rates = twoRates();
        await setRate("ASSIGNED", rates.assigned, ago(140));
        const first = await paid(org, 30);
        expect((await linesOf(first.id))[0]!.basisPoints).toBe(rates.assigned);
        await ownRates.set(OWNER(), org, {
            basisPoints: rates.broughtIn,
            earnsFrom: dayOf(new Date()),
            reason: "agreed with them",
        });
        // Priced by the general rate already: left as it is.
        expect((await linesOf(first.id))[0]!.basisPoints).toBe(rates.assigned);
        const next = await paid(org, 0);
        expect((await linesOf(next.id))[0]).toMatchObject({
            platformAdminId: m.platformAdminId,
            basisPoints: rates.broughtIn,
            rateId: null,
            amountPaise: commissionPaise(next.taxablePaise, rates.broughtIn),
        });

        const ended = await ownRates.end(OWNER(), org, {
            reason: "deal over",
        });
        expect(ended.current).toBeNull();
        await expect(
            ownRates.end(OWNER(), org, { reason: "deal over" }),
        ).rejects.toThrow(ConflictException);
        // Its lines keep their price.
        expect((await linesOf(next.id))[0]!.basisPoints).toBe(rates.broughtIn);
        const later = await paid(org, 0);
        expect((await linesOf(later.id))[0]!.basisPoints).toBe(rates.assigned);
        expect(
            await prisma.adminAuditEvent.count({
                where: { action: "commission.own-rate.end", targetId: org },
            }),
        ).toBe(1);
    });

    // The trigger is the migration's; `db push` (the plain run) builds none.
    itRls(
        "a rate's row only ever ends earlier: the database refuses anything else",
        async () => {
            const { org } = await looked();
            const a = await paid(org, 30);
            await ownRates.set(OWNER(), org, {
                basisPoints: randomRate(),
                earnsFrom: dayOf(a.issuedAt),
                reason: "agreed with them",
            });
            const row = await prisma.businessCommissionRate.findFirstOrThrow();
            await expect(
                prisma.businessCommissionRate.update({
                    where: { id: row.id },
                    data: { basisPoints: randomRate() + 1 },
                }),
            ).rejects.toThrow();
            await expect(
                prisma.businessCommissionRate.update({
                    where: { id: row.id },
                    data: { earnsFrom: ago(400) },
                }),
            ).rejects.toThrow();
        },
    );
});
