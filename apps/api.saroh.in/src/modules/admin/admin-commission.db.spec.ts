/**
 * Commission in the console against a real Postgres (DEC-169, admin
 * console U21): the month's statement across every business, Mark paid
 * (which locks the month), a teammate's earnings, the export and the
 * rates. `team:pay` for the money, `commission:rates` for the rates.
 *
 * Invoices are written as the billing webhook leaves them and settled by
 * the commission job's own `settle`. Every rate is drawn at random for the
 * run and every amount asserted against it. Rows satisfy the migrations'
 * CHECKs, so it holds with TEST_RLS=on, where the statement's reads span
 * businesses with no organization context. Integration project.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    linkTo,
    manager,
    randomRate,
    setRate,
    twoRates,
    wipeCommission,
} from "../../../test/fixtures/commission";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { CommissionLineHandler } from "../commission/commission-line.job";
import {
    commissionPaise,
    monthOf,
    nextMonth,
} from "../commission/commission-rules";
import { CommissionSweepJob } from "../commission/commission-sweep.job";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCommissionService } from "./admin-commission.service";
import {
    AdminPermission,
    AdminRole,
    permissionsFor,
} from "./admin-permissions";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

let commission: AdminCommissionService;
let lines: CommissionLineHandler;
let sweep: CommissionSweepJob;

function staff(
    roles: AdminRole[],
    over: Partial<PlatformAdminInfo> = {},
): PlatformAdminInfo {
    return {
        userId: `user-${roles.join("-")}`,
        platformAdminId: `pa-${roles.join("-")}`,
        roles,
        permissions: permissionsFor(roles),
        viaBootstrap: false,
        ...over,
    };
}

const OWNER = () => staff([AdminRole.PlatformOwner]);
const BILLING = () => staff([AdminRole.Billing]);

beforeEach(async () => {
    commission = new AdminCommissionService(new AdminAuditService());
    lines = new CommissionLineHandler();
    sweep = new CommissionSweepJob(lines);
    await prisma.job.deleteMany({});
    await wipeCommission();
    await prisma.sarohInvoice.deleteMany({});
});

let seq = 0;
async function business(name = "Shop"): Promise<string> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `${name} ${seq}`, slug: `adm-comm-${seq}-${tag}` },
    });
    return org.id;
}

/** A cleared monthly payment, as the webhook writes its invoice, settled. */
async function paid(
    organizationId: string,
    periodEnd: Date,
    taxablePaise = 100_000 + Math.floor(Math.random() * 900_000),
) {
    seq += 1;
    const invoice = await prisma.sarohInvoice.create({
        data: {
            organizationId,
            number: `TST/ADM/${seq}-${tag}`,
            series: "TST/ADM",
            chargeKey: `adm:${seq}:${tag}`,
            source: "RENEWAL",
            provider: "RAZORPAY",
            providerEventId: `evt_adm_${seq}_${tag}`,
            providerPaymentId: `pay_adm_${seq}_${tag}`,
            planName: "Plan C",
            cycle: "month",
            periodStart: new Date(periodEnd.getTime() - 30 * DAY),
            periodEnd,
            issuedAt: new Date(),
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

/** A period ending a few days into next month in India, and a moment after it. */
function nextMonthEnd() {
    const now = new Date();
    const m = nextMonth(monthOf(now));
    const end = new Date(Date.parse(`${m}-05T06:00:00.000Z`));
    return { end, month: m, after: new Date(end.getTime() + HOUR) };
}

describe("who sees what the team is owed", () => {
    it("without team:pay every money read and write is refused; rates need commission:rates", async () => {
        for (const role of [
            AdminRole.Support,
            AdminRole.Operations,
            AdminRole.ReleaseManager,
            AdminRole.Auditor,
            AdminRole.AccountManager,
        ]) {
            const s = staff([role]);
            await expect(commission.statement(s, undefined)).rejects.toThrow(
                ForbiddenException,
            );
            await expect(commission.exportCsv(s, undefined)).rejects.toThrow(
                ForbiddenException,
            );
            await expect(commission.earnings(s, "pa-x")).rejects.toThrow(
                ForbiddenException,
            );
            await expect(
                commission.markPaid(s, {
                    platformAdminId: "pa-x",
                    month: monthOf(new Date()),
                    reference: "ref",
                    reason: "paid",
                }),
            ).rejects.toThrow(ForbiddenException);
        }
        // Billing sees the money, never the rates.
        await expect(commission.rates(BILLING())).rejects.toThrow(
            ForbiddenException,
        );
        await expect(
            commission.setRate(BILLING(), {
                kind: "BROUGHT_IN",
                basisPoints: randomRate(),
                reason: "new rates",
            }),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            commission.statement(BILLING(), undefined),
        ).resolves.toMatchObject({ month: monthOf(new Date()), current: true });
        expect(await prisma.commissionRate.count()).toBe(0);
    });

    it("refuses a teammate marking their own commission paid", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const org = await business();
        await linkTo(org, m.platformAdminId);
        const { end, month, after } = nextMonthEnd();
        await paid(org, end);
        await sweep.sweep(after);
        const self = staff([AdminRole.PlatformOwner], {
            platformAdminId: m.platformAdminId,
            userId: m.userId,
        });
        await expect(
            commission.markPaid(
                self,
                {
                    platformAdminId: m.platformAdminId,
                    month,
                    reference: "UTR-1",
                    reason: "paying myself",
                },
                after,
            ),
        ).rejects.toThrow(ForbiddenException);
        expect(await prisma.commissionPayout.count()).toBe(0);
    });
});

describe("statements and Mark paid", () => {
    it("lists every manager across businesses, with what is due and what is waiting", async () => {
        const { broughtIn, assigned } = twoRates();
        await setRate("BROUGHT_IN", broughtIn);
        await setRate("ASSIGNED", assigned);
        const a = await manager({ name: "Asha Rao" });
        const b = await manager({ name: "Bilal Khan" });
        const idle = await manager({ name: "Chitra Nair" });
        const orgA = await business("Asha's shop");
        const orgB = await business("Bilal's shop");
        await linkTo(orgA, a.platformAdminId);
        await linkTo(orgB, b.platformAdminId, "ASSIGNED");
        const { end, month, after } = nextMonthEnd();
        const invA = await paid(orgA, end);
        const invB = await paid(orgB, end);
        // A payment for a period that ends a month later is still waiting.
        const later = await paid(orgA, new Date(end.getTime() + 31 * DAY));
        await sweep.sweep(after);

        const reads = () =>
            prisma.adminAuditEvent.count({
                where: { action: "commission.statement.read" },
            });
        const readsBefore = await reads();
        const s = await commission.statement(BILLING(), month, after);
        expect(s.month).toBe(month);
        const row = (id: string) =>
            s.people.find((p) => p.platformAdminId === id)!;
        expect(row(a.platformAdminId)).toMatchObject({
            name: "Asha Rao",
            status: "DUE",
            amountPaise: commissionPaise(invA.taxablePaise, broughtIn),
            lineCount: 1,
            waiting: {
                amountPaise: commissionPaise(later.taxablePaise, broughtIn),
                lines: 1,
            },
        });
        expect(row(b.platformAdminId)).toMatchObject({
            status: "DUE",
            amountPaise: commissionPaise(invB.taxablePaise, assigned),
        });
        expect(row(idle.platformAdminId)).toMatchObject({
            status: "NONE",
            amountPaise: 0,
        });
        expect(row(a.platformAdminId).lines[0]).toMatchObject({
            businessName: expect.stringContaining("Asha's shop"),
            invoiceNumber: invA.number,
            basisPoints: broughtIn,
        });
        expect(s.totals.duePaise).toBe(
            commissionPaise(invA.taxablePaise, broughtIn) +
                commissionPaise(invB.taxablePaise, assigned),
        );
        expect(await reads()).toBe(readsBefore + 1);
    });

    it("Mark paid pays the month's lines and locks it: a line payable later goes to the next month", async () => {
        const rate = randomRate();
        await setRate("BROUGHT_IN", rate);
        const m = await manager();
        const org = await business();
        await linkTo(org, m.platformAdminId);
        const { end, month, after } = nextMonthEnd();
        const first = await paid(org, end);
        // Paid with the same period, but its refund is still open when the
        // month is marked paid.
        const open = await paid(org, new Date(end.getTime() + HOUR));
        await prisma.billingRefund.create({
            data: {
                organizationId: org,
                provider: "RAZORPAY",
                providerRefundId: `rfnd_open_${tag}`,
                providerPaymentId: open.providerPaymentId!,
                invoiceId: open.id,
                status: "PENDING",
                source: "PROVIDER",
            },
        });
        const later = new Date(after.getTime() + 2 * HOUR);
        await sweep.sweep(later);

        const { payout } = await commission.markPaid(
            BILLING(),
            {
                platformAdminId: m.platformAdminId,
                month,
                reference: "UTR-SPEC-42",
                reason: "paid by bank transfer",
            },
            later,
        );
        expect(payout).toMatchObject({
            amountPaise: commissionPaise(first.taxablePaise, rate),
            lineCount: 1,
            reference: "UTR-SPEC-42",
        });
        const [line] = await prisma.commissionLine.findMany({
            where: { sarohInvoiceId: first.id },
        });
        expect(line).toMatchObject({ status: "PAID", payoutId: payout.id });
        expect(
            await prisma.adminAuditEvent.findFirst({
                where: { action: "commission.payout.paid" },
            }),
        ).toMatchObject({
            permission: AdminPermission.TeamPay,
            targetId: m.platformAdminId,
            reason: "paid by bank transfer",
        });

        // Marked twice: refused. The refund fails, so the second line is
        // payable now: the month is locked, so it goes to the next.
        await expect(
            commission.markPaid(
                BILLING(),
                {
                    platformAdminId: m.platformAdminId,
                    month,
                    reference: "UTR-AGAIN",
                    reason: "paid again",
                },
                later,
            ),
        ).rejects.toThrow("already marked paid");
        await prisma.billingRefund.update({
            where: {
                provider_providerRefundId: {
                    provider: "RAZORPAY",
                    providerRefundId: `rfnd_open_${tag}`,
                },
            },
            data: { status: "FAILED" },
        });
        await sweep.sweep(later);
        const [moved] = await prisma.commissionLine.findMany({
            where: { sarohInvoiceId: open.id },
        });
        expect(moved).toMatchObject({
            status: "PAYABLE",
            statementMonth: nextMonth(month),
        });
        const s = await commission.statement(BILLING(), month, later);
        expect(
            s.people.find((p) => p.platformAdminId === m.platformAdminId),
        ).toMatchObject({ status: "PAID", lineCount: 1 });
    });

    it("refuses a month not begun, and a month with nothing due", async () => {
        const m = await manager();
        const future = nextMonth(nextMonth(monthOf(new Date())));
        await expect(
            commission.markPaid(BILLING(), {
                platformAdminId: m.platformAdminId,
                month: future,
                reference: "UTR",
                reason: "early",
            }),
        ).rejects.toThrow("once it has begun");
        await expect(
            commission.markPaid(BILLING(), {
                platformAdminId: m.platformAdminId,
                month: monthOf(new Date()),
                reference: "UTR",
                reason: "nothing",
            }),
        ).rejects.toThrow("Nothing is due");
    });

    it("a payout lists the month's new brought-in businesses with how each was proved", async () => {
        await setRate("BROUGHT_IN", randomRate());
        const m = await manager();
        const viaLink = await business("Linked shop");
        const assignedOrg = await business("Given shop");
        await linkTo(viaLink, m.platformAdminId, "BROUGHT_IN", new Date());
        await linkTo(assignedOrg, m.platformAdminId, "ASSIGNED", new Date());

        const s = await commission.statement(BILLING(), undefined);
        const row = s.people.find(
            (p) => p.platformAdminId === m.platformAdminId,
        )!;
        expect(row.newBusinesses).toEqual([
            expect.objectContaining({
                organizationId: viaLink,
                name: expect.stringContaining("Linked shop"),
                source: "LINK",
                evidence: expect.objectContaining({
                    source: "LINK",
                    code: "SPEC2345",
                }),
                ended: false,
            }),
        ]);
        expect(s.totals.newBusinesses).toBe(1);
    });

    it("exports the month as a CSV, one row per line, never a formula", async () => {
        const rate = randomRate();
        await setRate("BROUGHT_IN", rate);
        const m = await manager({ name: "=HYPERLINK(evil)" });
        const org = await business();
        await linkTo(org, m.platformAdminId);
        const { end, month, after } = nextMonthEnd();
        const inv = await paid(org, end);
        await sweep.sweep(after);
        const { filename, csv } = await commission.exportCsv(
            BILLING(),
            month,
            after,
        );
        expect(filename).toBe(`saroh-commission-${month}.csv`);
        const rows = csv.trim().split("\r\n");
        expect(rows).toHaveLength(2);
        expect(rows[1]).toContain(inv.number);
        expect(rows[1]).toContain(`'=HYPERLINK(evil)`);
        expect(rows[1]).toContain(
            (commissionPaise(inv.taxablePaise, rate) / 100).toFixed(2),
        );
    });

    it("a teammate's earnings: what is waiting, due and paid, by month", async () => {
        const rate = randomRate();
        await setRate("BROUGHT_IN", rate);
        const m = await manager();
        const org = await business();
        await linkTo(org, m.platformAdminId);
        const { end, month, after } = nextMonthEnd();
        const due = await paid(org, end);
        const waiting = await paid(org, new Date(end.getTime() + 40 * DAY));
        await sweep.sweep(after);
        const e = await commission.earnings(BILLING(), m.platformAdminId);
        expect(e).toMatchObject({
            platformAdminId: m.platformAdminId,
            onCommission: true,
            totals: {
                duePaise: commissionPaise(due.taxablePaise, rate),
                pendingPaise: commissionPaise(waiting.taxablePaise, rate),
                paidPaise: 0,
            },
            months: [
                {
                    month,
                    amountPaise: commissionPaise(due.taxablePaise, rate),
                    lines: 1,
                    paid: false,
                },
            ],
        });
        expect(e.recent).toHaveLength(2);
        await expect(
            commission.earnings(BILLING(), "pa-nobody"),
        ).rejects.toThrow("Teammate not found");
    });
});

describe("rates", () => {
    it("a Platform owner sets a rate from now; lines waiting for one are worked out at once", async () => {
        const m = await manager();
        const org = await business();
        await linkTo(org, m.platformAdminId);
        const { end } = nextMonthEnd();
        const inv = await paid(org, end);
        expect(
            await prisma.commissionLine.findFirst({
                where: { sarohInvoiceId: inv.id },
            }),
        ).toMatchObject({ status: "NO_RATE" });

        const rate = randomRate();
        const view = await commission.setRate(OWNER(), {
            kind: "BROUGHT_IN",
            basisPoints: rate,
            reason: "first rates",
        });
        expect(view.current.BROUGHT_IN).toMatchObject({ basisPoints: rate });
        expect(view.current.ASSIGNED).toBeNull();
        expect(
            await prisma.commissionLine.findFirst({
                where: { sarohInvoiceId: inv.id },
            }),
        ).toMatchObject({
            status: "PENDING",
            basisPoints: rate,
            amountPaise: commissionPaise(inv.taxablePaise, rate),
        });
        expect(
            await prisma.adminAuditEvent.findFirst({
                where: { action: "commission.rate.set" },
            }),
        ).toMatchObject({ permission: AdminPermission.CommissionRates });
    });

    it("refuses a rate that starts in the past or isn't one; a later one waits as upcoming", async () => {
        await expect(
            commission.setRate(OWNER(), {
                kind: "ASSIGNED",
                basisPoints: randomRate(),
                effectiveFrom: new Date(Date.now() - 2 * DAY).toISOString(),
                reason: "backdated",
            }),
        ).rejects.toThrow("starts now or later");
        await expect(
            commission.setRate(OWNER(), {
                kind: "ASSIGNED",
                basisPoints: 10_001,
                reason: "too much",
            }),
        ).rejects.toThrow("between 0% and 100%");
        const rate = randomRate();
        const view = await commission.setRate(OWNER(), {
            kind: "ASSIGNED",
            basisPoints: rate,
            effectiveFrom: new Date(Date.now() + 3 * DAY).toISOString(),
            reason: "from next week",
        });
        expect(view.current.ASSIGNED).toBeNull();
        expect(view.upcoming).toEqual([
            expect.objectContaining({ kind: "ASSIGNED", basisPoints: rate }),
        ]);
        expect((await commission.rates(OWNER())).history).toHaveLength(1);
    });
});
