import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { id } from "../helpers";
import { SHOWCASE_KEY, SHOWCASE_SEED } from "./data";
import { hashKey } from "./people";
import type { Rng } from "./random";
import { createRng } from "./random";

/**
 * CarePoint Clinic's bills (the owner's "paid consultations, about 150 a
 * month"): Payments on with the seed's stand-in Razorpay, and every visit
 * paid one of the two ways a clinic is paid —
 *
 * - online, on the booking page, when the patient booked: the booking's own
 *   invoice (source BOOKING), paid a few minutes later through Razorpay,
 *   and the booking marked paid (`paidWith` PAID). Teleconsultations are
 *   always paid this way; a third of the rest are.
 * - at the desk after the visit: a bill written by hand (source MANUAL),
 *   mostly paid there and then by UPI, cash or card, a few left due and one
 *   or two overdue.
 *
 * Healthcare is exempt, and the clinic is not GST-registered: no tax on any
 * line, the clinic's registered address on every issued bill (DEC-068), in
 * the INV series from 0001 in the order they were issued. The bills name
 * the patient's contact, so their account on the site shows them beside
 * their visits; nothing medical is stored, only the visit and its price.
 *
 * Runs after `seedBusiness` wrote the clinic's diary and cleared its
 * earlier invoices; reads the bookings back rather than re-planning them.
 */

const KEY = "carepoint";
const sid = (...parts: (string | number)[]) => id(SHOWCASE_KEY, KEY, ...parts);
const rngFor = (...parts: string[]) =>
    createRng((SHOWCASE_SEED ^ hashKey(KEY, ...parts)) >>> 0);

const MINUTE = 60_000;
const DAY = 86_400_000;

const rupees = (p: number) =>
    `${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;

const dateLine = (at: Date) =>
    new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    }).format(at);

const hex = (rng: Rng, n: number) =>
    Array.from({ length: n }, () =>
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789".charAt(
            rng.int(0, 57),
        ),
    ).join("");

export interface CarePointBilling {
    invoices: number;
    paidOnline: number;
    paidAtDesk: number;
    due: number;
}

export async function seedCarePointBilling(
    prisma: Db,
    a: {
        orgId: string;
        now: Date;
        sellerName: string;
        sellerAddress: string;
        deskUserIds: readonly string[];
    },
): Promise<CarePointBilling> {
    const { orgId, now } = a;
    const rng = rngFor("billing");
    const t = now.getTime();

    await prisma.paymentAttempt.deleteMany({
        where: { id: { startsWith: sid("attempt", "") } },
    });
    await prisma.paymentIntent.deleteMany({
        where: { id: { startsWith: sid("intent", "") } },
    });

    const bookings = await prisma.booking.findMany({
        where: {
            organizationId: orgId,
            id: { startsWith: sid("booking", "") },
            status: "CONFIRMED",
            contactId: { not: null },
        },
        select: {
            id: true,
            startAt: true,
            endAt: true,
            createdAt: true,
            outcome: true,
            contactId: true,
            service: {
                select: { name: true, priceCents: true, meetingUrl: true },
            },
            contact: {
                select: { firstName: true, lastName: true, email: true },
            },
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });

    const intents: Prisma.PaymentIntentCreateManyInput[] = [];
    const attempts: Prisma.PaymentAttemptCreateManyInput[] = [];
    const specs: (Omit<Prisma.InvoiceCreateManyInput, "number"> & {
        issuedAt: Date;
        lines: { description: string; paise: number }[];
    })[] = [];
    const paidOnline: string[] = [];
    const paidAtDesk: string[] = [];
    let due = 0;

    for (const b of bookings) {
        const pricePaise = b.service.priceCents ?? 0;
        if (pricePaise <= 0 || !b.contact?.email || !b.contactId) continue;
        const key = b.id.slice(sid("booking", "").length);
        const name =
            `${b.contact.firstName ?? ""} ${b.contact.lastName ?? ""}`.trim();
        const line = {
            description: `${b.service.name} — ${dateLine(b.startAt)}`,
            paise: pricePaise,
        };
        const online = !!b.service.meetingUrl || rng.chance(0.33);
        const bill = {
            organizationId: orgId,
            contactId: b.contactId,
            billToName: name,
            billToEmail: b.contact.email,
            sellerName: a.sellerName,
            sellerAddress: a.sellerAddress,
            currency: "INR",
            subtotal: rupees(pricePaise),
            tax: "0.00",
            total: rupees(pricePaise),
            lines: [line],
        };
        if (online) {
            // Paid on the booking page when they booked.
            const paidAt = new Date(
                b.createdAt.getTime() + rng.int(2, 6) * MINUTE,
            );
            if (paidAt.getTime() > t) continue;
            const invoiceId = sid("invoice", "b", key);
            const ref = `pay_${hex(rng, 14)}`;
            intents.push({
                id: sid("intent", key),
                organizationId: orgId,
                invoiceId,
                provider: "RAZORPAY",
                providerIntentId: `order_${hex(rng, 14)}`,
                amountCents: pricePaise,
                currency: "INR",
                status: "SUCCEEDED",
                createdAt: b.createdAt,
                updatedAt: paidAt,
            });
            attempts.push({
                id: sid("attempt", key),
                organizationId: orgId,
                paymentIntentId: sid("intent", key),
                provider: "RAZORPAY",
                providerRef: ref,
                status: "CAPTURED",
                createdAt: paidAt,
            });
            specs.push({
                id: invoiceId,
                ...bill,
                status: "PAID",
                source: "BOOKING",
                bookingId: b.id,
                issuedAt: paidAt,
                dueAt: paidAt,
                paidAt,
                paymentMethod: "ONLINE",
                paymentReference: ref,
                paymentNote: "Paid online through Razorpay",
                createdByUserId: null,
                createdAt: b.createdAt,
                updatedAt: paidAt,
            });
            paidOnline.push(b.id);
            continue;
        }
        // Billed at the desk after the visit.
        if (b.outcome !== "ATTENDED" || b.endAt.getTime() + 20 * MINUTE > t)
            continue;
        const issuedAt = new Date(b.endAt.getTime() + rng.int(2, 10) * MINUTE);
        const ageDays = (t - issuedAt.getTime()) / DAY;
        const paid = rng.chance(ageDays > 7 ? 0.97 : 0.9);
        const paidAt = new Date(issuedAt.getTime() + rng.int(1, 4) * MINUTE);
        const method = rng.weighted(
            [
                { m: "UPI", w: 58 },
                { m: "CASH", w: 22 },
                { m: "CARD", w: 20 },
            ],
            (x) => x.w,
        ).m;
        if (!paid) due += 1;
        specs.push({
            id: sid("invoice", "m", key),
            ...bill,
            status: paid ? "PAID" : "ISSUED",
            source: "MANUAL",
            bookingId: null,
            issuedAt,
            dueAt: new Date(issuedAt.getTime() + 7 * DAY),
            paidAt: paid ? paidAt : null,
            paymentMethod: paid ? method : null,
            paymentReference: !paid
                ? null
                : method === "UPI"
                  ? `UPI ref ${rng.int(3, 6)}${String(rng.int(1e9, 9e9))}${rng.int(0, 9)}`
                  : method === "CARD"
                    ? `Card ending ${String(rng.int(1000, 9999))}`
                    : null,
            paymentNote: null,
            createdByUserId: rng.pick(a.deskUserIds),
            createdAt: issuedAt,
            updatedAt: paid ? paidAt : issuedAt,
        });
        paidAtDesk.push(b.id);
    }

    // Numbered in the order they were issued.
    specs.sort(
        (x, y) =>
            x.issuedAt.getTime() - y.issuedAt.getTime() ||
            String(x.id).localeCompare(String(y.id)),
    );
    const invoices: Prisma.InvoiceCreateManyInput[] = specs.map((s, k) => {
        const { lines: _lines, ...row } = s;
        return { ...row, number: `INV-${String(k + 1).padStart(4, "0")}` };
    });
    const lines: Prisma.InvoiceLineCreateManyInput[] = specs.flatMap((s) =>
        s.lines.map((l, position) => ({
            id: `${String(s.id)}_line_${position}`,
            organizationId: orgId,
            invoiceId: String(s.id),
            position,
            description: l.description,
            quantity: 1,
            unitPrice: rupees(l.paise),
            amount: rupees(l.paise),
        })),
    );
    for (let k = 0; k < invoices.length; k += 1000) {
        await prisma.invoice.createMany({ data: invoices.slice(k, k + 1000) });
    }
    for (let k = 0; k < lines.length; k += 1000) {
        await prisma.invoiceLine.createMany({ data: lines.slice(k, k + 1000) });
    }
    await prisma.paymentIntent.createMany({ data: intents });
    await prisma.paymentAttempt.createMany({ data: attempts });
    await prisma.booking.updateMany({
        where: { id: { in: paidOnline } },
        data: { paidWith: "PAID" },
    });
    await prisma.booking.updateMany({
        where: { id: { in: paidAtDesk } },
        data: { paidWith: "DESK" },
    });
    await prisma.invoiceSequence.upsert({
        where: {
            organizationId_series: { organizationId: orgId, series: "INV" },
        },
        update: { lastNumber: invoices.length },
        create: {
            organizationId: orgId,
            series: "INV",
            lastNumber: invoices.length,
        },
    });
    return {
        invoices: invoices.length,
        paidOnline: paidOnline.length,
        paidAtDesk: paidAtDesk.length,
        due,
    };
}

/**
 * What the clinic's billing must show: Payments on, bills every month at a
 * clinic's pace, each naming its patient, none taxed, online ones on their
 * booking and paid, and a few still due.
 */
export async function checkCarePoint(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<Record<string, number>> {
    const since = new Date(now.getTime() - 30 * DAY);
    const [payments, paid30, online, due, untied, taxed, posts] =
        await Promise.all([
            prisma.organizationModule.count({
                where: {
                    organizationId: orgId,
                    moduleKey: "PAYMENTS",
                    status: "ENABLED",
                },
            }),
            prisma.invoice.count({
                where: {
                    organizationId: orgId,
                    status: "PAID",
                    paidAt: { gte: since },
                },
            }),
            prisma.invoice.count({
                where: {
                    organizationId: orgId,
                    source: "BOOKING",
                    status: "PAID",
                    bookingId: { not: null },
                    booking: { paidWith: "PAID" },
                },
            }),
            prisma.invoice.count({
                where: { organizationId: orgId, status: "ISSUED" },
            }),
            prisma.invoice.count({
                where: { organizationId: orgId, contactId: null },
            }),
            prisma.invoice.count({
                where: { organizationId: orgId, tax: { not: 0 } },
            }),
            prisma.post.count({
                where: {
                    site: { organizationId: orgId },
                    currentPublicationId: { not: null },
                },
            }),
        ]);
    const counts = { payments, paid30, online, due, untied, taxed, posts };
    const missing = Object.entries({
        "Payments on": payments === 1,
        "120 or more paid consultations in the last 30 days": paid30 >= 120,
        "bookings paid online with their invoice": online >= 20,
        "a bill still due": due >= 1,
        "every bill naming its patient": untied === 0,
        "no tax on healthcare": taxed === 0,
        "24 or more posts on the journal": posts >= 24,
    }).flatMap(([what, ok]) => (ok ? [] : [what]));
    if (missing.length > 0) {
        throw new Error(
            `CarePoint Clinic is missing: ${missing.join("; ")} (${JSON.stringify(counts)})`,
        );
    }
    return counts;
}
