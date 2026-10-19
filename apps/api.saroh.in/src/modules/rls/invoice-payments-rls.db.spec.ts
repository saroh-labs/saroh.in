import type { Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security and the CHECKs on the invoice ledger (DEC-173, #1113,
 * migration `20261206110000_invoice_payments_ledger`), over a NOBYPASSRLS
 * role with enforcement on: one business sees and writes only its own
 * payments, and the database refuses a payment that breaks the ledger's
 * rules (no amount, a cheque with no bank status, a bank status on cash, a
 * payment naming another business's invoice).
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies and no CHECKs, and connects as
 * the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const at = new Date("2026-10-12T06:30:00.000Z");

async function businessWithPayment(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("ledger-rls") },
    });
    const invoice = await prisma.invoice.create({
        data: {
            organizationId: org.id,
            number: uniq("INV"),
            status: "PAID",
            currency: "INR",
            subtotal: "2500.00",
            total: "2500.00",
            issuedAt: at,
            paidAt: at,
            paymentMethod: "CHEQUE",
            paidCents: 250000,
        },
    });
    const payment = await prisma.invoicePayment.create({
        data: {
            organizationId: org.id,
            invoiceId: invoice.id,
            amountCents: 250000,
            currency: "INR",
            method: "CHEQUE",
            chequeNumber: "004512",
            chequeBank: "HDFC Bank",
            bankStatus: "WAITING",
            receivedAt: at,
        },
    });
    return { orgId: org.id, invoiceId: invoice.id, paymentId: payment.id };
}

describeRls("row-level security on InvoicePayment", () => {
    let a: Awaited<ReturnType<typeof businessWithPayment>>;
    let b: Awaited<ReturnType<typeof businessWithPayment>>;

    beforeAll(async () => {
        a = await businessWithPayment("Rye & Co.");
        b = await businessWithPayment("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("connects as a role row-level security applies to", async () => {
        const [role] = await prisma.$queryRaw<
            Array<{ rolsuper: boolean; rolbypassrls: boolean }>
        >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
        expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it("shows a business only its own payments, a bogus one none, and no context all", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.invoicePayment.findMany({ select: { id: true } }),
        );
        const bogus = await runInOrgContext("org_does_not_exist", () =>
            prisma.invoicePayment.count(),
        );
        const all = await prisma.invoicePayment.count({
            where: { id: { in: [a.paymentId, b.paymentId] } },
        });

        expect(own).toEqual([{ id: a.paymentId }]);
        expect(bogus).toBe(0);
        expect(all).toBe(2);
    });

    it("can't read another business's payment by its id", async () => {
        const found = await runInOrgContext(a.orgId, () =>
            prisma.invoicePayment.findUnique({ where: { id: b.paymentId } }),
        );
        expect(found).toBeNull();
    });

    it("can't change or remove another business's payment", async () => {
        const changed = await runInOrgContext(a.orgId, () =>
            prisma.invoicePayment.updateMany({
                where: { id: b.paymentId },
                data: { removedAt: at, removedReason: "Recorded by mistake" },
            }),
        );
        expect(changed.count).toBe(0);
        const still = await prisma.invoicePayment.findUniqueOrThrow({
            where: { id: b.paymentId },
        });
        expect(still.removedAt).toBeNull();
    });

    it("refuses to write a payment for another business inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.invoicePayment.create({
                    data: {
                        organizationId: b.orgId,
                        invoiceId: b.invoiceId,
                        amountCents: 100,
                        currency: "INR",
                        method: "CASH",
                        receivedAt: at,
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});

describeRls("the ledger's CHECKs", () => {
    let org: Awaited<ReturnType<typeof businessWithPayment>>;
    let other: Awaited<ReturnType<typeof businessWithPayment>>;

    beforeAll(async () => {
        org = await businessWithPayment("Kavi Dental");
        other = await businessWithPayment("Northwind Supply");
    });

    const payment = (
        data: Partial<Prisma.InvoicePaymentUncheckedCreateInput>,
    ) =>
        prisma.invoicePayment.create({
            data: {
                organizationId: org.orgId,
                invoiceId: org.invoiceId,
                amountCents: 100,
                currency: "INR",
                method: "CASH",
                receivedAt: at,
                ...data,
            },
        });

    it("takes a part payment in cash", async () => {
        await expect(payment({})).resolves.toMatchObject({ amountCents: 100 });
    });

    it.each([
        ["no amount", { amountCents: 0 }, /InvoicePayment_amount_check/],
        [
            "a negative amount",
            { amountCents: -100 },
            /InvoicePayment_amount_check/,
        ],
        [
            "a method Saroh doesn't know",
            { method: "BARTER" },
            /InvoicePayment_method_check/,
        ],
        [
            "a cheque with no bank status",
            { method: "CHEQUE" },
            /InvoicePayment_cheque_check/,
        ],
        [
            "a bank status on cash",
            { bankStatus: "WAITING" },
            /InvoicePayment_cheque_check/,
        ],
        [
            "a cleared cheque with no date",
            { method: "CHEQUE", bankStatus: "CLEARED" },
            /InvoicePayment_cheque_check/,
        ],
        [
            "a bounce reason on a waiting cheque",
            { method: "CHEQUE", bankStatus: "WAITING", bounceReason: "Funds" },
            /InvoicePayment_cheque_check/,
        ],
        [
            "a cheque number on cash",
            { chequeNumber: "1" },
            /InvoicePayment_cheque_check/,
        ],
        [
            "who removed it, with no removal",
            { removedById: "user_1" },
            /InvoicePayment_removed_check/,
        ],
    ])("refuses %s", async (_what, data, constraint) => {
        await expect(payment(data)).rejects.toThrow(constraint);
    });

    it("takes a bounced cheque with its date and reason", async () => {
        await expect(
            payment({
                method: "CHEQUE",
                bankStatus: "BOUNCED",
                bouncedAt: at,
                bounceReason: "Insufficient funds",
            }),
        ).resolves.toMatchObject({ bankStatus: "BOUNCED" });
    });

    it("refuses a payment naming another business's invoice", async () => {
        await expect(payment({ invoiceId: other.invoiceId })).rejects.toThrow();
    });

    it("refuses a negative paidCents on the invoice", async () => {
        await expect(
            prisma.invoice.update({
                where: { id: org.invoiceId },
                data: { paidCents: -1 },
            }),
        ).rejects.toThrow(/Invoice_paidCents_check/);
    });
});
