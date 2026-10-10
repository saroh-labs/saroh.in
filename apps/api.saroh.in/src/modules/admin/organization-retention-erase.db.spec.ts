/**
 * The retention eraser against a real Postgres (DEC-119): 180 days after a
 * business was deleted its files and personal data go and its tax records
 * stay; a day earlier nothing does; a business on legal hold, or one still
 * owing refunds, is left alone; and a hold placed while it runs stops it.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import { isReservedContactEmail } from "../contacts/contact-email";
import { MediaService } from "../media/media.service";
import { RETENTION_AFTER_DELETION_DAYS } from "../organizations/retention";
import {
    ORGANIZATION_RETENTION_ERASE_ACTION,
    ORGANIZATION_RETENTION_ERASE_TYPE,
    ORGANIZATION_RETENTION_ERASED_ACTION,
    OrganizationRetentionEraseHandler,
} from "./organization-retention-erase.handler";
import {
    eraseContact,
    eraseRecords,
    EraseStoppedError,
} from "./retention-erase-writes";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const DAY = 86_400_000;

const storage = createMemoryStorage();
const eraser = new OrganizationRetentionEraseHandler(new MediaService(storage));

const NOW = new Date("2027-06-01T06:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

/** A deleted business holding one of everything personal, and its records. */
async function deletedBusiness(
    deletedRetainedAt: Date,
    extra: { legalHoldAt?: Date } = {},
) {
    const org = await prisma.organization.create({
        data: {
            name: "Rye Bakery",
            slug: uniq("rye"),
            lifecycleStatus: "DELETED_RETAINED",
            deletedRetainedAt,
            ...(extra.legalHoldAt
                ? {
                      legalHoldAt: extra.legalHoldAt,
                      legalHoldReason: "Police notice 14/2026",
                      legalHoldByUserId: "staff_1",
                  }
                : {}),
        },
    });
    const organizationId = org.id;

    // A file.
    const upload = await storage.createSignedUploadUrl({
        organizationId,
        contentType: "image/png",
        contentLength: 2048,
        filename: "photo.png",
    });
    const media = await prisma.media.create({
        data: {
            organizationId,
            key: upload.key,
            contentType: "image/png",
            sizeBytes: 2048,
            filename: "photo.png",
            status: "READY",
        },
    });

    // A customer the CRM knows, with a note.
    const contact = await prisma.contact.create({
        data: {
            organizationId,
            email: `${uniq("asha")}@example.com`,
            firstName: "Asha",
            lastName: "Rao",
            phone: "+91 98450 00001",
            company: "Rao Studio",
            addressLine1: "12 MG Road",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560001",
            country: "IN",
        },
    });
    await prisma.contactNote.create({
        data: {
            organizationId,
            contactId: contact.id,
            createdByUserId: "user_1",
            body: "Asha prefers mornings",
        },
    });

    // A storefront, a customer no contact is linked to, and their order.
    const store = await prisma.store.create({
        data: { name: "Rye", slug: uniq("store"), organizationId },
    });
    const customer = await prisma.customer.create({
        data: {
            storeId: store.id,
            organizationId,
            email: `${uniq("ravi")}@example.com`,
            firstName: "Ravi",
            lastName: "Menon",
            phone: "+91 98450 00002",
            city: "Kochi",
            state: "Kerala",
            zipCode: "682001",
        },
    });
    const order = await prisma.order.create({
        data: {
            storeId: store.id,
            organizationId,
            orderId: `ORD-${uniq("o")}`,
            customerId: customer.id,
            subtotal: "450",
            total: "450",
            currency: "INR",
            status: "DELIVERED",
            paymentStatus: "PAID",
            deliveryName: "Ravi Menon",
            deliveryPhone: "+91 98450 00002",
            deliveryLine1: "4 Marine Drive",
            deliveryCity: "Kochi",
            deliveryState: "Kerala",
            deliveryPostalCode: "682001",
            notes: "Ravi will collect after six",
        },
    });
    // A walk-in: only a name and a phone on the order.
    const walkIn = await prisma.order.create({
        data: {
            storeId: store.id,
            organizationId,
            orderId: `ORD-${uniq("w")}`,
            subtotal: "120",
            total: "120",
            currency: "INR",
            status: "DELIVERED",
            paymentStatus: "PAID",
            walkInName: "Meera",
            walkInPhone: "+91 98450 00003",
        },
    });

    // The tax paper.
    const invoice = await prisma.invoice.create({
        data: {
            organizationId,
            contactId: contact.id,
            status: "ISSUED",
            currency: "INR",
            subtotal: "450",
            total: "450",
            billToName: "Asha Rao",
            billToEmail: "asha@example.com",
            billToState: "Karnataka",
            billToAddress: "12 MG Road, Bengaluru",
        },
    });

    // A booking with no contact (a walk-up), and the diary person.
    const service = await prisma.service.create({
        data: {
            organizationId,
            name: "Baking class",
            durationMinutes: 60,
            capacity: 6,
            priceCents: 80_000,
            currency: "INR",
            timezone: "Asia/Kolkata",
        },
    });
    const staff = await prisma.staffMember.create({
        data: { organizationId, name: "Priya Nair", title: "Baker" },
    });
    const start = daysAgo(300);
    const booking = await prisma.booking.create({
        data: {
            organizationId,
            serviceId: service.id,
            startAt: start,
            endAt: new Date(start.getTime() + 60 * 60_000),
            timezone: "Asia/Kolkata",
            status: "CONFIRMED",
            bookerName: "Kiran Shah",
            bookerEmail: "kiran@example.com",
            bookerPhone: "+91 98450 00004",
            intakeNote: "Nut allergy",
            snapshot: {
                service: { name: "Baking class", priceCents: 80_000 },
                booker: {
                    name: "Kiran Shah",
                    email: "kiran@example.com",
                    phone: "+91 98450 00004",
                },
            },
        },
    });

    // The CRM: a form entry, its lead, a note on it.
    const pipeline = await prisma.pipeline.create({
        data: { organizationId, name: "Enquiries", isDefault: true },
    });
    const stage = await prisma.stage.create({
        data: {
            organizationId,
            pipelineId: pipeline.id,
            name: "New",
            order: 1,
        },
    });
    const form = await prisma.form.create({
        data: { organizationId, name: "Contact", fields: [] },
    });
    const lead = await prisma.lead.create({
        data: {
            organizationId,
            contactId: contact.id,
            pipelineId: pipeline.id,
            stageId: stage.id,
            formId: form.id,
            title: "Enquiry from Asha Rao",
        },
    });
    const submission = await prisma.submission.create({
        data: {
            organizationId,
            formId: form.id,
            contactId: contact.id,
            leadId: lead.id,
            data: { name: "Asha Rao", email: "asha@example.com" },
            ipHash: "hash-of-an-address",
        },
    });
    const activity = await prisma.activity.create({
        data: {
            organizationId,
            leadId: lead.id,
            type: "NOTE",
            body: "Called Asha, wants a wedding cake",
        },
    });

    // What was sent, the team's inbox, an invitation, visitor events.
    const message = await prisma.message.create({
        data: {
            organizationId,
            channel: "EMAIL",
            toAddress: "kiran@example.com",
            subject: "Your class, Kiran",
            body: "See you Saturday, Kiran",
        },
    });
    await prisma.notification.create({
        data: {
            organizationId,
            type: "order.new",
            title: "New order from Ravi Menon",
        },
    });
    await prisma.organizationInvitation.create({
        data: {
            organizationId,
            email: `${uniq("invitee")}@example.com`,
            role: "MEMBER",
            tokenHash: uniq("hash"),
            expiresAt: new Date(NOW.getTime() + 7 * DAY),
        },
    });
    await prisma.analyticsEvent.create({
        data: {
            organizationId,
            type: "site.view",
            properties: { path: "/" },
            visitorHash: "visitor-1",
            occurredAt: daysAgo(200),
            receivedAt: daysAgo(200),
        },
    });

    return {
        organizationId,
        key: upload.key,
        media,
        contact,
        customer,
        order,
        walkIn,
        invoice,
        booking,
        staff,
        lead,
        submission,
        activity,
        message,
    };
}

type Business = Awaited<ReturnType<typeof deletedBusiness>>;

/** Everything the eraser must have left exactly as it was. */
async function expectUntouched(b: Business) {
    expect(storage.has(b.key)).toBe(true);
    expect(await prisma.media.count({ where: { id: b.media.id } })).toBe(1);
    const contact = await prisma.contact.findUniqueOrThrow({
        where: { id: b.contact.id },
    });
    expect(contact.firstName).toBe("Asha");
    expect(contact.removedAt).toBeNull();
    expect(
        (
            await prisma.customer.findUniqueOrThrow({
                where: { id: b.customer.id },
            })
        ).firstName,
    ).toBe("Ravi");
    expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: b.order.id } }))
            .deliveryName,
    ).toBe("Ravi Menon");
    expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: b.walkIn.id } }))
            .walkInName,
    ).toBe("Meera");
    expect(
        (
            await prisma.booking.findUniqueOrThrow({
                where: { id: b.booking.id },
            })
        ).bookerName,
    ).toBe("Kiran Shah");
    expect(
        (await prisma.lead.findUniqueOrThrow({ where: { id: b.lead.id } }))
            .title,
    ).toBe("Enquiry from Asha Rao");
    expect(
        await prisma.contactNote.count({
            where: { organizationId: b.organizationId },
        }),
    ).toBe(1);
    expect(
        await prisma.analyticsEvent.count({
            where: { organizationId: b.organizationId },
        }),
    ).toBe(1);
    expect(
        (
            await prisma.organization.findUniqueOrThrow({
                where: { id: b.organizationId },
            })
        ).retentionErasedAt,
    ).toBeNull();
}

describe("the retention eraser (DEC-119)", () => {
    it("keeps everything one day before the 180 days are up", async () => {
        const b = await deletedBusiness(
            daysAgo(RETENTION_AFTER_DELETION_DAYS - 1),
        );

        const result = await eraser.eraseOne(b.organizationId, NOW);

        expect(result.outcome).toBe("passed");
        await expectUntouched(b);

        // And the sweep doesn't list it.
        const swept = await eraser.sweep(NOW);
        expect(swept.erased).not.toContain(b.organizationId);
        await expectUntouched(b);
    });

    it("erases the files and the personal data at 180 days, and keeps the tax records", async () => {
        const b = await deletedBusiness(daysAgo(RETENTION_AFTER_DELETION_DAYS));

        const result = await eraser.eraseOne(b.organizationId, NOW);

        expect(result).toMatchObject({ outcome: "erased", failed: [] });
        expect(result.counts).toMatchObject({
            mediaRemoved: 1,
            contacts: 1,
            storeCustomers: 1,
            orders: 2,
            bookings: 1,
            messages: 1,
            submissions: 1,
            leads: 1,
            notices: 1,
            invitations: 1,
            staff: 1,
            analyticsEvents: 1,
        });

        // Files: out of storage, and their rows.
        expect(storage.has(b.key)).toBe(false);
        expect(
            await prisma.media.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);

        // The customer: anonymised in place, so every key to them holds.
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: b.contact.id },
        });
        expect(contact).toMatchObject({
            firstName: null,
            lastName: null,
            phone: null,
            company: null,
            addressLine1: null,
            city: null,
            postalCode: null,
        });
        expect(isReservedContactEmail(contact.email)).toBe(true);
        expect(contact.removedAt).toEqual(NOW);
        expect(
            await prisma.contactNote.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);

        // The store customer no contact was linked to.
        const customer = await prisma.customer.findUniqueOrThrow({
            where: { id: b.customer.id },
        });
        expect(customer).toMatchObject({
            firstName: null,
            lastName: null,
            phone: null,
            city: null,
            zipCode: null,
        });
        expect(customer.email).toBe(`removed+${customer.id}@removed.invalid`);

        // Orders: the recipient, the note and the walk-in go…
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: b.order.id },
        });
        expect(order).toMatchObject({
            deliveryName: null,
            deliveryPhone: null,
            deliveryLine1: null,
            deliveryCity: null,
            deliveryPostalCode: null,
            notes: null,
        });
        const walkIn = await prisma.order.findUniqueOrThrow({
            where: { id: b.walkIn.id },
        });
        expect(walkIn).toMatchObject({ walkInName: null, walkInPhone: null });
        // …and the tax facts stay: the amounts, the status, the place of supply.
        expect(order.deliveryState).toBe("Kerala");
        expect(order.total.toString()).toBe("450");
        expect(order.status).toBe("DELIVERED");
        expect(order.paymentStatus).toBe("PAID");
        expect(order.customerId).toBe(b.customer.id);

        // The invoice, as printed.
        expect(
            await prisma.invoice.findUniqueOrThrow({
                where: { id: b.invoice.id },
                select: {
                    billToName: true,
                    billToEmail: true,
                    billToAddress: true,
                    billToState: true,
                    contactId: true,
                    status: true,
                },
            }),
        ).toEqual({
            billToName: "Asha Rao",
            billToEmail: "asha@example.com",
            billToAddress: "12 MG Road, Bengaluru",
            billToState: "Karnataka",
            contactId: b.contact.id,
            status: "ISSUED",
        });

        // The booking keeps its time and price, not its booker.
        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: b.booking.id },
        });
        expect(booking).toMatchObject({
            bookerName: "Removed customer",
            bookerEmail: null,
            bookerPhone: null,
            intakeNote: null,
        });
        expect(booking.snapshot).toEqual({
            service: { name: "Baking class", priceCents: 80_000 },
            booker: { name: "Removed customer", email: null, phone: null },
        });

        // The CRM.
        expect(
            (await prisma.lead.findUniqueOrThrow({ where: { id: b.lead.id } }))
                .title,
        ).toBe("Removed");
        expect(
            await prisma.submission.findUniqueOrThrow({
                where: { id: b.submission.id },
                select: { data: true, ipHash: true },
            }),
        ).toEqual({ data: {}, ipHash: null });
        expect(
            (
                await prisma.activity.findUniqueOrThrow({
                    where: { id: b.activity.id },
                })
            ).body,
        ).toBeNull();

        // What was sent, the team's notices and invitations, the diary.
        const message = await prisma.message.findUniqueOrThrow({
            where: { id: b.message.id },
        });
        expect(message.body).toBe("Removed");
        expect(message.subject).toBeNull();
        expect(message.toAddress).toBe(`removed+${message.id}@removed.invalid`);
        expect(
            await prisma.notification.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.organizationInvitation.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.staffMember.findUniqueOrThrow({
                where: { id: b.staff.id },
                select: { name: true, title: true },
            }),
        ).toEqual({ name: "Removed team member", title: null });
        expect(
            await prisma.analyticsEvent.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);

        // No personal value is left anywhere this spec put one.
        const left = JSON.stringify([
            contact,
            customer,
            order,
            walkIn,
            booking,
            message,
            await prisma.lead.findMany({
                where: { organizationId: b.organizationId },
            }),
            await prisma.submission.findMany({
                where: { organizationId: b.organizationId },
            }),
        ]);
        for (const value of [
            "Asha",
            "Rao",
            "Ravi",
            "Menon",
            "Meera",
            "Kiran",
            "98450",
            "MG Road",
            "Marine Drive",
        ]) {
            expect(`${value}: ${left.includes(value)}`).toBe(`${value}: false`);
        }

        // Stamped, on both ledgers, with counts and ids only.
        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: b.organizationId },
        });
        expect(org.retentionErasedAt).toEqual(NOW);
        expect(org.lifecycleStatus).toBe("DELETED_RETAINED");
        const ledger = await prisma.adminAuditEvent.findMany({
            where: {
                organizationId: b.organizationId,
                action: ORGANIZATION_RETENTION_ERASE_ACTION,
            },
        });
        expect(ledger).toHaveLength(1);
        expect(ledger[0]?.outcome).toBe("SUCCESS");
        expect(ledger[0]?.metadata).toMatchObject({
            retentionDays: 180,
            counts: { contacts: 1, mediaRemoved: 1 },
        });
        expect(JSON.stringify(ledger[0])).not.toMatch(/Asha|Ravi|example\.com/);
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: b.organizationId,
                    action: ORGANIZATION_RETENTION_ERASED_ACTION,
                },
            }),
        ).toBe(1);
    });

    it("does nothing a second time", async () => {
        const b = await deletedBusiness(daysAgo(200));
        expect((await eraser.eraseOne(b.organizationId, NOW)).outcome).toBe(
            "erased",
        );

        const again = await eraser.eraseOne(b.organizationId, NOW);

        expect(again).toEqual({ outcome: "passed", counts: {}, failed: [] });
        expect(
            await prisma.adminAuditEvent.count({
                where: {
                    organizationId: b.organizationId,
                    action: ORGANIZATION_RETENTION_ERASE_ACTION,
                },
            }),
        ).toBe(1);
        const swept = await eraser.sweep(NOW);
        expect(swept.erased).not.toContain(b.organizationId);
    });

    it("the sweep erases a due business and counts a held one without touching it", async () => {
        const due = await deletedBusiness(daysAgo(181));
        const held = await deletedBusiness(daysAgo(400), {
            legalHoldAt: daysAgo(390),
        });

        const swept = await eraser.sweep(NOW);

        expect(swept.erased).toContain(due.organizationId);
        expect(swept.erased).not.toContain(held.organizationId);
        expect(swept.held).toBeGreaterThanOrEqual(1);
        await expectUntouched(held);
    });

    it("refuses a business on legal hold, however long ago it was deleted", async () => {
        const b = await deletedBusiness(daysAgo(900), {
            legalHoldAt: daysAgo(800),
        });

        const result = await eraser.eraseOne(b.organizationId, NOW);

        expect(result.outcome).toBe("held");
        await expectUntouched(b);
        // The writes refuse on their own too, under the business's row lock.
        await expect(
            eraseContact(b.organizationId, b.contact.id, NOW),
        ).rejects.toBeInstanceOf(EraseStoppedError);
        await expect(eraseRecords(b.organizationId, NOW)).rejects.toMatchObject(
            {
                why: "legal-hold",
            },
        );
        await expectUntouched(b);
    });

    it("erases it once the hold is lifted", async () => {
        const b = await deletedBusiness(daysAgo(900), {
            legalHoldAt: daysAgo(800),
        });
        expect((await eraser.eraseOne(b.organizationId, NOW)).outcome).toBe(
            "held",
        );
        await prisma.organization.update({
            where: { id: b.organizationId },
            data: {
                legalHoldAt: null,
                legalHoldReason: null,
                legalHoldByUserId: null,
            },
        });

        expect((await eraser.eraseOne(b.organizationId, NOW)).outcome).toBe(
            "erased",
        );
        expect(storage.has(b.key)).toBe(false);
    });

    it("stops within one step when a hold lands while it runs", async () => {
        const b = await deletedBusiness(daysAgo(181));
        // The hold arrives as the files are about to go: `mayErase` is asked
        // before every batch.
        const real = storage.deleteObject.bind(storage);
        const spy = jest
            .spyOn(storage, "deleteObject")
            .mockImplementation(async (key: string) => {
                await prisma.organization.update({
                    where: { id: b.organizationId },
                    data: { legalHoldAt: new Date() },
                });
                return real(key);
            });
        try {
            const result = await eraser.eraseOne(b.organizationId, NOW);
            expect(result.outcome).toBe("held");
        } finally {
            spy.mockRestore();
        }
        // The one file in flight went; nothing after it did.
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: b.contact.id },
        });
        expect(contact.firstName).toBe("Asha");
        expect(
            (
                await prisma.order.findUniqueOrThrow({
                    where: { id: b.walkIn.id },
                })
            ).walkInName,
        ).toBe("Meera");
        expect(
            (
                await prisma.organization.findUniqueOrThrow({
                    where: { id: b.organizationId },
                })
            ).retentionErasedAt,
        ).toBeNull();
        const noted = await prisma.adminAuditEvent.findFirst({
            where: {
                organizationId: b.organizationId,
                action: ORGANIZATION_RETENTION_ERASE_ACTION,
            },
        });
        expect(noted?.outcome).toBe("FAILURE");
        expect(noted?.metadata).toMatchObject({
            legalHold: true,
            state: "held",
        });
    });

    it.each(["ACTIVE", "SUSPENDED", "PENDING_DELETION"])(
        "never touches a %s business",
        async (lifecycleStatus) => {
            const b = await deletedBusiness(daysAgo(400));
            await prisma.organization.update({
                where: { id: b.organizationId },
                data: { lifecycleStatus },
            });
            expect((await eraser.eraseOne(b.organizationId, NOW)).outcome).toBe(
                "passed",
            );
            await expect(
                eraseRecords(b.organizationId, NOW),
            ).rejects.toMatchObject({ why: "not-deleted" });
            await expectUntouched(b);
        },
    );

    it("keeps one waiting run of the chain", async () => {
        await prisma.job.deleteMany({
            where: { type: ORGANIZATION_RETENTION_ERASE_TYPE },
        });
        expect(await eraser.schedule(new Date())).toBe(true);
        expect(await eraser.schedule(new Date())).toBe(true);
        expect(
            await prisma.job.count({
                where: {
                    type: ORGANIZATION_RETENTION_ERASE_TYPE,
                    status: "PENDING",
                },
            }),
        ).toBe(1);
        await prisma.job.deleteMany({
            where: { type: ORGANIZATION_RETENTION_ERASE_TYPE },
        });
    });
});
