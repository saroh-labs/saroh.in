import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../src/common/types/organization-context";
import { CommunicationsService } from "../../src/modules/communications/communications.service";
import { CUSTOMER_NOTIFY_TYPE } from "../../src/modules/site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../../src/modules/site-accounts/customer-notify.handler";
import { giveBusinessDetails } from "../business-details";

/**
 * A studio for the pack notices' database specs (DEC-174 U22): Class packs
 * on, its own email provider connected (unless asked otherwise), a class
 * its packs pay for, and Asha with an email address. Its zone is Kolkata.
 */

export const comms = new CommunicationsService();
const notices = new CustomerNotifyService(comms);
export const customerNotify = new CustomerNotifyHandler(notices);

let seq = 0;

export interface PackStudio {
    owner: OrganizationContext;
    organizationId: string;
    contactId: string;
    serviceId: string;
}

export async function packStudio(
    opts: { email?: boolean; packCredits?: boolean } = {},
): Promise<PackStudio> {
    seq += 1;
    const tag = `${process.pid}-${seq}`;
    const org = await prisma.organization.create({
        data: { name: "Rye Studio", slug: `u22-${tag}` },
    });
    await giveBusinessDetails(org.id);
    await prisma.businessProfile.update({
        where: { organizationId: org.id },
        data: { timezone: "Asia/Kolkata" },
    });
    const user = await prisma.user.create({
        data: { email: `u22-owner-${tag}@example.com` },
    });
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "CLASS_PACKS",
            status: "ENABLED",
        },
    });
    const service = await prisma.service.create({
        data: {
            organizationId: org.id,
            name: "Vinyasa",
            durationMinutes: 60,
            capacity: 20,
            timezone: "Asia/Kolkata",
            status: "ACTIVE",
        },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: `asha.rao.${tag}@example.com`,
            firstName: "Asha",
            lastName: "Rao",
        },
    });
    if (opts.email !== false) {
        await comms.connectProvider(owner, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
    }
    if (opts.packCredits === false) {
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: org.id,
                kind: "PACK_CREDITS",
                enabled: false,
            },
        });
    }
    return {
        owner,
        organizationId: org.id,
        contactId: contact.id,
        serviceId: service.id,
    };
}

/** A pack on sale that pays for the studio's class. */
export async function makePack(
    s: PackStudio,
    credits: number,
    validityDays = 60,
): Promise<{ id: string; name: string }> {
    const pack = await prisma.classPack.create({
        data: {
            organizationId: s.organizationId,
            name: `${credits}-class pack`,
            credits,
            validityDays,
            price: "4500.00",
            currency: "INR",
            status: "ACTIVE",
            services: {
                create: {
                    serviceId: s.serviceId,
                    organizationId: s.organizationId,
                },
            },
        },
        select: { id: true, name: true },
    });
    return pack;
}

/** Asha holding `credits` of a pack, bought `boughtAt`, running out `expiresAt`. */
export async function holding(
    s: PackStudio,
    packId: string,
    input: { credits: number; expiresAt: Date; boughtAt?: Date },
): Promise<string> {
    const row = await prisma.packPurchase.create({
        data: {
            organizationId: s.organizationId,
            packId,
            contactId: s.contactId,
            credits: input.credits,
            price: "4500.00",
            currency: "INR",
            expiresAt: input.expiresAt,
            paidBy: "CASH",
            ...(input.boughtAt ? { createdAt: input.boughtAt } : {}),
        },
        select: { id: true },
    });
    return row.id;
}

/** A class booked for Asha, `days` from now. */
export async function classBooking(
    s: PackStudio,
    days: number,
): Promise<string> {
    const startAt = new Date(Date.now() + days * 86_400_000);
    const row = await prisma.booking.create({
        data: {
            organizationId: s.organizationId,
            serviceId: s.serviceId,
            contactId: s.contactId,
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
            timezone: "Asia/Kolkata",
            status: "CONFIRMED",
            snapshot: {},
            bookerEmail: "asha@example.com",
        },
        select: { id: true },
    });
    return row.id;
}

/** The business's waiting `customer.notify` jobs of one kind. */
export async function pendingNotices(
    organizationId: string,
    kind: string,
): Promise<Job[]> {
    return prisma.job.findMany({
        where: {
            organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
            payload: { path: ["kind"], equals: kind },
        },
        orderBy: { createdAt: "asc" },
    });
}

/** Run every waiting notice of a kind, as the worker would, once each. */
export async function runNotices(
    organizationId: string,
    kind: string,
): Promise<void> {
    for (const job of await pendingNotices(organizationId, kind)) {
        await customerNotify.handle(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
    }
}

/** The emails a kind of notice wrote. */
export function emailsOf(organizationId: string, template: string) {
    return prisma.message.findMany({
        where: { organizationId, template },
        orderBy: { createdAt: "asc" },
    });
}
