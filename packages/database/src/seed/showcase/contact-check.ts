import type { Db } from "../helpers";
import { DUMMY_PHONE, DUMMY_PHONE_E164, dummyPhone } from "../helpers";

/**
 * No seeded row may hold a real person's phone or inbox. Every phone the
 * seeds write is a dummy, `+91 00000 NNNNN` (`dummyPhone` in `helpers.ts`;
 * a business's own line is stored as E.164, `+9100000NNNNN`, DEC-053), and
 * every customer, contact and booker email is `@example.com` — the
 * business's own `{business}@example.com`, a person's
 * `first.last@example.com`. Staff sign in on `@saroh.dev`, which is on users,
 * not here. A merged-away contact keeps the product's
 * `removed+<id>@removed.invalid` placeholder.
 *
 * The words of a site — its pages, footer, posts and what was published —
 * and contact notes may print a phone, but only in that dummy form.
 *
 * Only rows the seeds wrote (`seed_` ids) are read: a developer's own
 * customers on a local database are theirs.
 */
export async function checkDummyContacts(prisma: Db): Promise<void> {
    const failures: string[] = [];
    const fail = (what: string, rows: Record<string, unknown>[]) => {
        if (rows.length > 0) {
            failures.push(
                `${what}: ${rows.length} — e.g. ${JSON.stringify(rows.slice(0, 3))}`,
            );
        }
    };

    fail(
        "seeded phones that are not +91 00000 NNNNN",
        await prisma.$queryRaw`
            SELECT 'Booking.bookerPhone' AS col, id, "bookerPhone" AS phone
              FROM "Booking" WHERE id LIKE 'seed\\_%' AND "bookerPhone" IS NOT NULL
               AND "bookerPhone" !~ '^\\+91 00000 [0-9]{5}$'
            UNION ALL
            SELECT 'Contact.phone', id, phone FROM "Contact"
             WHERE id LIKE 'seed\\_%' AND phone IS NOT NULL
               AND phone !~ '^\\+91 00000 [0-9]{5}$'
            UNION ALL
            SELECT 'Customer.phone', id, phone FROM "Customer"
             WHERE id LIKE 'seed\\_%' AND phone IS NOT NULL
               AND phone !~ '^\\+91 00000 [0-9]{5}$'
            UNION ALL
            SELECT 'Order.deliveryPhone', id, "deliveryPhone" FROM "Order"
             WHERE id LIKE 'seed\\_%' AND "deliveryPhone" IS NOT NULL
               AND "deliveryPhone" !~ '^\\+91 00000 [0-9]{5}$'
            UNION ALL
            SELECT 'Order.walkInPhone', id, "walkInPhone" FROM "Order"
             WHERE id LIKE 'seed\\_%' AND "walkInPhone" IS NOT NULL
               AND "walkInPhone" !~ '^\\+91 00000 [0-9]{5}$'
            UNION ALL
            SELECT 'BusinessProfile.phone', id, phone FROM "BusinessProfile"
             WHERE id LIKE 'seed\\_%' AND phone IS NOT NULL
               AND phone !~ '^\\+9100000[0-9]{5}$'`,
    );

    fail(
        "seeded emails that are not @example.com",
        await prisma.$queryRaw`
            SELECT 'Customer.email' AS col, id, email FROM "Customer"
             WHERE id LIKE 'seed\\_%' AND email !~* '@example\\.com$'
            UNION ALL
            SELECT 'Contact.email', id, email FROM "Contact"
             WHERE id LIKE 'seed\\_%' AND email !~* '@example\\.com$'
               AND email !~ '^removed\\+.*@removed\\.invalid$'
            UNION ALL
            SELECT 'Booking.bookerEmail', id, "bookerEmail" FROM "Booking"
             WHERE id LIKE 'seed\\_%' AND "bookerEmail" IS NOT NULL
               AND "bookerEmail" !~* '@example\\.com$'
            UNION ALL
            SELECT 'BusinessProfile.contactEmail', id, "contactEmail"
              FROM "BusinessProfile"
             WHERE id LIKE 'seed\\_%' AND "contactEmail" IS NOT NULL
               AND "contactEmail" !~* '@example\\.com$'`,
    );

    // Words a visitor or the team reads: any "+91" followed by digits, once
    // the dummy forms are taken out, is a number in some other shape.
    fail(
        "seeded words that print a phone other than +91 00000 NNNNN",
        await prisma.$queryRaw`
            WITH words AS (
                SELECT 'Site' AS what, id,
                       concat_ws(' ', name, "seoTitle", "seoDescription",
                                 footer::text, navigation::text) AS t
                  FROM "Site" WHERE id LIKE 'seed\\_%'
                UNION ALL
                SELECT 'Section', id, content::text FROM "Section"
                 WHERE id LIKE 'seed\\_%'
                UNION ALL
                SELECT 'Post', id, concat_ws(' ', title, excerpt, content)
                  FROM "Post" WHERE id LIKE 'seed\\_%'
                UNION ALL
                SELECT 'Publication', id, snapshot::text FROM "Publication"
                 WHERE id LIKE 'seed\\_%'
                UNION ALL
                SELECT 'ContactNote', id, body FROM "ContactNote"
                 WHERE id LIKE 'seed\\_%'
                UNION ALL
                SELECT 'Submission', id, data::text FROM "Submission"
                 WHERE id LIKE 'seed\\_%'
            )
            SELECT what, id,
                   substring(t from '\\+91[^a-zA-Z<"]{0,16}') AS phone
              FROM words
             WHERE regexp_replace(t, '\\+91 00000 [0-9]{5}|\\+9100000[0-9]{5}', '', 'g')
                   ~ '(\\+91|wa\\.me/91)[ -]*[0-9]'`,
    );

    if (failures.length > 0) {
        throw new Error(
            `Seeded contact details that could be a real person's:\n  ${failures.join("\n  ")}`,
        );
    }
}

/** "+91 9AAAA BBBBB" → "9AAAA BBBBB": the key a generator drew it under. */
const drawnKey = (phone: string) => {
    const digits = phone.replace(/\D/g, "").slice(-10);
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
};

const isDummy = (phone: string) =>
    DUMMY_PHONE.test(phone) || DUMMY_PHONE_E164.test(phone);

/** A stale number as its dummy, E.164 kept E.164. */
function dummyFor(phone: string): string {
    const e164 = /^\+91\d{10}$/.test(phone);
    const dummy = dummyPhone(drawnKey(phone));
    return e164 ? dummy.replace(/ /g, "") : dummy;
}

const PHONE_IN_WORDS = /(?:\+91|wa\.me\/91)[ -]*\d[\d -]*\d/g;

function scrubWords(text: string): string {
    return text.replace(PHONE_IN_WORDS, (m) =>
        isDummy(m) || m.replace(/\D/g, "").length < 12
            ? m
            : m.startsWith("wa.me/")
              ? `wa.me/${dummyFor(m).replace(/\D/g, "")}`
              : dummyFor(m),
    );
}

/**
 * A database seeded before phones were dummies still holds real-looking
 * numbers where a run writes a row only once: a contact a payment made, a
 * publication (immutable, so never rewritten), a post. Each is turned into
 * its dummy here, before the check — a person's under the same key their
 * generator now draws, so they keep the number their customer has. A fresh
 * database has nothing to scrub. Returns how many rows changed.
 */
export async function scrubSeededPhones(prisma: Db): Promise<number> {
    let changed = 0;
    const seeded = { startsWith: "seed_" };
    const stale = <T extends Record<string, string | null>>(rows: T[]) =>
        rows.filter((r) =>
            Object.entries(r).some(
                ([k, v]) => k !== "id" && v !== null && !isDummy(v),
            ),
        );
    const fix = (v: string | null) =>
        v === null || isDummy(v) ? v : dummyFor(v);

    for (const r of stale(
        await prisma.contact.findMany({
            where: { id: seeded, phone: { not: null } },
            select: { id: true, phone: true },
        }),
    )) {
        await prisma.contact.update({
            where: { id: r.id },
            data: { phone: fix(r.phone) },
        });
        changed += 1;
    }
    for (const r of stale(
        await prisma.customer.findMany({
            where: { id: seeded, phone: { not: null } },
            select: { id: true, phone: true },
        }),
    )) {
        await prisma.customer.update({
            where: { id: r.id },
            data: { phone: fix(r.phone) },
        });
        changed += 1;
    }
    for (const r of stale(
        await prisma.booking.findMany({
            where: { id: seeded, bookerPhone: { not: null } },
            select: { id: true, bookerPhone: true },
        }),
    )) {
        await prisma.booking.update({
            where: { id: r.id },
            data: { bookerPhone: fix(r.bookerPhone) },
        });
        changed += 1;
    }
    for (const r of stale(
        await prisma.order.findMany({
            where: {
                id: seeded,
                OR: [
                    { deliveryPhone: { not: null } },
                    { walkInPhone: { not: null } },
                ],
            },
            select: { id: true, deliveryPhone: true, walkInPhone: true },
        }),
    )) {
        await prisma.order.update({
            where: { id: r.id },
            data: {
                deliveryPhone: fix(r.deliveryPhone),
                walkInPhone: fix(r.walkInPhone),
            },
        });
        changed += 1;
    }
    for (const r of stale(
        await prisma.businessProfile.findMany({
            where: { id: seeded, phone: { not: null } },
            select: { id: true, phone: true },
        }),
    )) {
        await prisma.businessProfile.update({
            where: { id: r.id },
            data: {
                phone: dummyPhone(drawnKey(r.phone ?? "")).replace(/ /g, ""),
            },
        });
        changed += 1;
    }

    // Words: what changed is rewritten in place, JSON kept JSON.
    const json = (text: string) => JSON.parse(scrubWords(text)) as object;
    const words = await prisma.$queryRaw<{ what: string; id: string }[]>`
        WITH words AS (
            SELECT 'site' AS what, id,
                   concat_ws(' ', footer::text, navigation::text) AS t
              FROM "Site" WHERE id LIKE 'seed\\_%'
            UNION ALL SELECT 'section', id, content::text FROM "Section"
             WHERE id LIKE 'seed\\_%'
            UNION ALL SELECT 'post', id, concat_ws(' ', title, excerpt, content)
              FROM "Post" WHERE id LIKE 'seed\\_%'
            UNION ALL SELECT 'publication', id, snapshot::text FROM "Publication"
             WHERE id LIKE 'seed\\_%'
            UNION ALL SELECT 'note', id, body FROM "ContactNote"
             WHERE id LIKE 'seed\\_%'
            UNION ALL SELECT 'submission', id, data::text FROM "Submission"
             WHERE id LIKE 'seed\\_%'
        )
        SELECT what, id FROM words
         WHERE regexp_replace(t, '\\+91 00000 [0-9]{5}|\\+9100000[0-9]{5}', '', 'g')
               ~ '(\\+91|wa\\.me/91)[ -]*[0-9]'`;
    for (const { what, id } of words) {
        if (what === "site") {
            const s = await prisma.site.findUniqueOrThrow({
                where: { id },
                select: { footer: true, navigation: true },
            });
            await prisma.site.update({
                where: { id },
                data: {
                    ...(s.footer === null
                        ? {}
                        : { footer: json(JSON.stringify(s.footer)) }),
                    ...(s.navigation === null
                        ? {}
                        : { navigation: json(JSON.stringify(s.navigation)) }),
                },
            });
        } else if (what === "section") {
            const s = await prisma.section.findUniqueOrThrow({ where: { id } });
            await prisma.section.update({
                where: { id },
                data: { content: json(JSON.stringify(s.content)) },
            });
        } else if (what === "post") {
            const p = await prisma.post.findUniqueOrThrow({ where: { id } });
            await prisma.post.update({
                where: { id },
                data: {
                    title: scrubWords(p.title),
                    excerpt: p.excerpt === null ? null : scrubWords(p.excerpt),
                    content: scrubWords(p.content),
                },
            });
        } else if (what === "publication") {
            const p = await prisma.publication.findUniqueOrThrow({
                where: { id },
            });
            await prisma.publication.update({
                where: { id },
                data: { snapshot: json(JSON.stringify(p.snapshot)) },
            });
        } else if (what === "note") {
            const n = await prisma.contactNote.findUniqueOrThrow({
                where: { id },
            });
            await prisma.contactNote.update({
                where: { id },
                data: { body: scrubWords(n.body) },
            });
        } else {
            const s = await prisma.submission.findUniqueOrThrow({
                where: { id },
            });
            await prisma.submission.update({
                where: { id },
                data: { data: json(JSON.stringify(s.data)) },
            });
        }
        changed += 1;
    }
    return changed;
}
