import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security and the CHECKs on an invoice's history (automatic
 * notices U9 #1140, migration `20261223140000_invoice_events`), over a
 * NOBYPASSRLS role with enforcement on: one business sees and writes only
 * its own invoices' events, and the database refuses a kind, an actor or
 * a channel Saroh doesn't word, a person's line with no person, and an
 * event naming another business's invoice.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies and no CHECKs, and connects as
 * the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithEvent(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("events-rls") },
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
    const event = await prisma.invoiceEvent.create({
        data: {
            organizationId: org.id,
            invoiceId: invoice.id,
            kind: "SENT",
            actorKind: "USER",
            actorUserId: "user_owner",
            channel: "EMAIL",
            data: { to: "asha@example.com" },
        },
    });
    return { orgId: org.id, invoiceId: invoice.id, eventId: event.id };
}

describeRls("row-level security on InvoiceEvent", () => {
    let a: Awaited<ReturnType<typeof businessWithEvent>>;
    let b: Awaited<ReturnType<typeof businessWithEvent>>;

    beforeAll(async () => {
        a = await businessWithEvent("Rye & Co.");
        b = await businessWithEvent("Pulse Fitness");
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

    it("shows a business only its own events, a bogus one none, and no context all", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.invoiceEvent.findMany({ select: { id: true } }),
        );
        const bogus = await runInOrgContext("org_does_not_exist", () =>
            prisma.invoiceEvent.count(),
        );
        const all = await prisma.invoiceEvent.count({
            where: { id: { in: [a.eventId, b.eventId] } },
        });
        expect(own).toEqual([{ id: a.eventId }]);
        expect(bogus).toBe(0);
        expect(all).toBe(2);
    });

    it("can't read, change or delete another business's event", async () => {
        const found = await runInOrgContext(a.orgId, () =>
            prisma.invoiceEvent.findUnique({ where: { id: b.eventId } }),
        );
        const changed = await runInOrgContext(a.orgId, () =>
            prisma.invoiceEvent.updateMany({
                where: { id: b.eventId },
                data: { kind: "VOIDED" },
            }),
        );
        const deleted = await runInOrgContext(a.orgId, () =>
            prisma.invoiceEvent.deleteMany({ where: { id: b.eventId } }),
        );
        expect(found).toBeNull();
        expect(changed.count).toBe(0);
        expect(deleted.count).toBe(0);
        await expect(
            prisma.invoiceEvent.findUniqueOrThrow({ where: { id: b.eventId } }),
        ).resolves.toMatchObject({ kind: "SENT" });
    });

    it("refuses to write an event for another business inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.invoiceEvent.create({
                    data: {
                        organizationId: b.orgId,
                        invoiceId: b.invoiceId,
                        kind: "ISSUED",
                        actorKind: "JOB",
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});

describeRls("the invoice history's CHECKs", () => {
    let own: Awaited<ReturnType<typeof businessWithEvent>>;
    let other: Awaited<ReturnType<typeof businessWithEvent>>;

    beforeAll(async () => {
        own = await businessWithEvent("Kavi Dental");
        other = await businessWithEvent("Northwind Supply");
    });

    const event = (data: {
        kind?: string;
        actorKind?: string;
        actorUserId?: string | null;
        channel?: string | null;
        invoiceId?: string;
    }) =>
        prisma.invoiceEvent.create({
            data: {
                organizationId: own.orgId,
                invoiceId: data.invoiceId ?? own.invoiceId,
                kind: data.kind ?? "ISSUED",
                actorKind: data.actorKind ?? "JOB",
                actorUserId: data.actorUserId ?? null,
                channel: data.channel ?? null,
            },
        });

    it("takes each kind Saroh words", async () => {
        for (const kind of [
            "ISSUED",
            "SENT",
            "REMINDED",
            "AUTO_SENT",
            "AUTO_REMINDED",
            "SEND_FAILED",
            "VOIDED",
            "CREDITED",
            "REISSUED",
            "PAY_ATTEMPT_FAILED",
            "LINK_MADE",
        ]) {
            await expect(event({ kind })).resolves.toMatchObject({ kind });
        }
    });

    it("takes a person, Saroh and the customer, and email and thread", async () => {
        await expect(
            event({ actorKind: "USER", actorUserId: "user_ravi" }),
        ).resolves.toMatchObject({ actorKind: "USER" });
        await expect(event({ actorKind: "CUSTOMER" })).resolves.toMatchObject({
            actorKind: "CUSTOMER",
        });
        for (const channel of ["EMAIL", "THREAD"]) {
            await expect(
                event({ kind: "SENT", channel }),
            ).resolves.toMatchObject({ channel });
        }
    });

    it("refuses a kind Saroh doesn't word", async () => {
        await expect(event({ kind: "PAID" })).rejects.toThrow(
            /InvoiceEvent_kind_check/,
        );
    });

    it("refuses an actor Saroh doesn't know", async () => {
        await expect(event({ actorKind: "ROBOT" })).rejects.toThrow(
            /InvoiceEvent_actorKind_check/,
        );
    });

    it.each([
        ["a person's line with no person", { actorKind: "USER" }],
        [
            "Saroh's line naming a person",
            { actorKind: "JOB", actorUserId: "user_ravi" },
        ],
    ])("refuses %s", async (_what, data) => {
        await expect(event(data)).rejects.toThrow(/InvoiceEvent_actor_check/);
    });

    it("refuses a channel Saroh doesn't send on", async () => {
        await expect(event({ channel: "WHATSAPP" })).rejects.toThrow(
            /InvoiceEvent_channel_check/,
        );
    });

    it("refuses an event naming another business's invoice", async () => {
        await expect(event({ invoiceId: other.invoiceId })).rejects.toThrow();
    });
});
