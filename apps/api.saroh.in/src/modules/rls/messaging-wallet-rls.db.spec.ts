import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security and the CHECK on the messaging wallet (#1240, migration
 * from commit 1214f9793), over a NOBYPASSRLS role with enforcement on: one
 * business sees and writes only its own wallet and ledger, and the database
 * refuses a negative balance or a hold above the balance.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema with
 * `db push`, which creates no policies and no CHECKs.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithWallet(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("wallet-rls") },
    });
    const wallet = await prisma.messagingWallet.create({
        data: { organizationId: org.id, balancePaise: 100 },
    });
    const entry = await prisma.messagingLedgerEntry.create({
        data: {
            organizationId: org.id,
            kind: "TOPUP",
            amountPaise: 100,
            balanceAfter: 100,
        },
    });
    return { orgId: org.id, walletId: wallet.id, entryId: entry.id };
}

describeRls(
    "row-level security on MessagingWallet and MessagingLedgerEntry",
    () => {
        let a: Awaited<ReturnType<typeof businessWithWallet>>;
        let b: Awaited<ReturnType<typeof businessWithWallet>>;

        beforeAll(async () => {
            a = await businessWithWallet("Rye & Co.");
            b = await businessWithWallet("Pulse Fitness");
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

        it("shows a business only its own rows, a bogus one none, and no context all", async () => {
            const [wallets, ledger] = await runInOrgContext(a.orgId, () =>
                Promise.all([
                    prisma.messagingWallet.findMany({ select: { id: true } }),
                    prisma.messagingLedgerEntry.findMany({
                        select: { id: true },
                    }),
                ]),
            );
            const bogus = await runInOrgContext("org_does_not_exist", () =>
                Promise.all([
                    prisma.messagingWallet.count(),
                    prisma.messagingLedgerEntry.count(),
                ]),
            );
            const all = await prisma.messagingWallet.count({
                where: { id: { in: [a.walletId, b.walletId] } },
            });
            expect(wallets).toEqual([{ id: a.walletId }]);
            expect(ledger).toEqual([{ id: a.entryId }]);
            expect(bogus).toEqual([0, 0]);
            expect(all).toBe(2);
        });

        it("can't change another business's wallet or ledger, even raw", async () => {
            const changed = await runInOrgContext(a.orgId, () =>
                prisma.messagingWallet.updateMany({
                    where: { id: b.walletId },
                    data: { balancePaise: 0 },
                }),
            );
            const raw = await runInOrgContext(
                a.orgId,
                () =>
                    prisma.$executeRaw`UPDATE "MessagingWallet" SET "heldPaise" = 1 WHERE id = ${b.walletId}`,
            );
            const deleted = await runInOrgContext(a.orgId, () =>
                prisma.messagingLedgerEntry.deleteMany({
                    where: { id: b.entryId },
                }),
            );
            expect(changed.count).toBe(0);
            expect(raw).toBe(0);
            expect(deleted.count).toBe(0);
            await expect(
                prisma.messagingWallet.findUniqueOrThrow({
                    where: { id: b.walletId },
                }),
            ).resolves.toMatchObject({ balancePaise: 100, heldPaise: 0 });
        });

        it("refuses to write another business's ledger inside a context", async () => {
            await expect(
                runInOrgContext(a.orgId, () =>
                    prisma.messagingLedgerEntry.create({
                        data: {
                            organizationId: b.orgId,
                            kind: "ADJUST",
                            amountPaise: 1,
                            balanceAfter: 101,
                        },
                    }),
                ),
            ).rejects.toThrow(/row-level security/);
        });

        it("refuses a negative balance and a hold above the balance", async () => {
            await expect(
                prisma.messagingWallet.update({
                    where: { id: a.walletId },
                    data: { balancePaise: -1 },
                }),
            ).rejects.toThrow(/MessagingWallet_amounts_check/);
            await expect(
                prisma.messagingWallet.update({
                    where: { id: a.walletId },
                    data: { heldPaise: 101 },
                }),
            ).rejects.toThrow(/MessagingWallet_amounts_check/);
        });
    },
);
