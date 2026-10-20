import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security and the CHECKs on the invoice share log (DEC-173,
 * U5 #1117, migration `20261210100000_invoice_shares`), over a NOBYPASSRLS
 * role with enforcement on: one business sees and writes only its own
 * shares, and the database refuses a channel or a message Saroh doesn't
 * know, or a share naming another business's invoice.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies and no CHECKs, and connects as
 * the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithShare(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("shares-rls") },
    });
    const invoice = await prisma.invoice.create({
        data: {
            organizationId: org.id,
            number: uniq("INV"),
            status: "ISSUED",
            currency: "INR",
            subtotal: "8400.00",
            total: "8400.00",
            issuedAt: new Date(),
        },
    });
    const share = await prisma.invoiceShare.create({
        data: {
            organizationId: org.id,
            invoiceId: invoice.id,
            channel: "WHATSAPP",
            kind: "REMINDER",
            byUserId: "user_owner",
        },
    });
    return { orgId: org.id, invoiceId: invoice.id, shareId: share.id };
}

describeRls("row-level security on InvoiceShare", () => {
    let a: Awaited<ReturnType<typeof businessWithShare>>;
    let b: Awaited<ReturnType<typeof businessWithShare>>;

    beforeAll(async () => {
        a = await businessWithShare("Rye & Co.");
        b = await businessWithShare("Pulse Fitness");
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

    it("shows a business only its own shares, a bogus one none, and no context all", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.invoiceShare.findMany({ select: { id: true } }),
        );
        const bogus = await runInOrgContext("org_does_not_exist", () =>
            prisma.invoiceShare.count(),
        );
        const all = await prisma.invoiceShare.count({
            where: { id: { in: [a.shareId, b.shareId] } },
        });
        expect(own).toEqual([{ id: a.shareId }]);
        expect(bogus).toBe(0);
        expect(all).toBe(2);
    });

    it("can't read, change or delete another business's share", async () => {
        const found = await runInOrgContext(a.orgId, () =>
            prisma.invoiceShare.findUnique({ where: { id: b.shareId } }),
        );
        const changed = await runInOrgContext(a.orgId, () =>
            prisma.invoiceShare.updateMany({
                where: { id: b.shareId },
                data: { kind: "NEW" },
            }),
        );
        const deleted = await runInOrgContext(a.orgId, () =>
            prisma.invoiceShare.deleteMany({ where: { id: b.shareId } }),
        );
        expect(found).toBeNull();
        expect(changed.count).toBe(0);
        expect(deleted.count).toBe(0);
        await expect(
            prisma.invoiceShare.findUniqueOrThrow({ where: { id: b.shareId } }),
        ).resolves.toMatchObject({ kind: "REMINDER" });
    });

    it("refuses to log a share for another business inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.invoiceShare.create({
                    data: {
                        organizationId: b.orgId,
                        invoiceId: b.invoiceId,
                        channel: "LINK",
                        kind: "NEW",
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});

describeRls("the share log's CHECKs", () => {
    let own: Awaited<ReturnType<typeof businessWithShare>>;
    let other: Awaited<ReturnType<typeof businessWithShare>>;

    beforeAll(async () => {
        own = await businessWithShare("Kavi Dental");
        other = await businessWithShare("Northwind Supply");
    });

    const share = (data: {
        channel?: string;
        kind?: string;
        invoiceId?: string;
    }) =>
        prisma.invoiceShare.create({
            data: {
                organizationId: own.orgId,
                invoiceId: data.invoiceId ?? own.invoiceId,
                channel: data.channel ?? "PDF",
                kind: data.kind ?? "NEW",
            },
        });

    it("takes each channel Saroh knows", async () => {
        for (const channel of ["WHATSAPP", "LINK", "PDF", "PRINT"]) {
            await expect(share({ channel })).resolves.toMatchObject({
                channel,
            });
        }
    });

    it.each([
        ["an email (its Message is the record)", { channel: "EMAIL" }],
        ["a channel Saroh doesn't know", { channel: "SMS" }],
    ])("refuses %s", async (_what, data) => {
        await expect(share(data)).rejects.toThrow(/InvoiceShare_channel_check/);
    });

    it("refuses a message Saroh doesn't word", async () => {
        await expect(share({ kind: "THANKS" })).rejects.toThrow(
            /InvoiceShare_kind_check/,
        );
    });

    it("refuses a share naming another business's invoice", async () => {
        await expect(share({ invoiceId: other.invoiceId })).rejects.toThrow();
    });
});
