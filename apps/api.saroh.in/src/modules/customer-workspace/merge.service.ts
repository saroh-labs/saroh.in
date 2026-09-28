import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, auditMetadata } from "../audit/audit.service";
import { reservedMergedEmail } from "../contacts/contact-email";
import { authorize } from "../organizations/organization-policy";
import { cancelMandatesInTx } from "../payments/mandate-cancel-job";
import { absorbThread } from "../site-accounts/thread-store";
import type {
    AccountPlan,
    ConsentChannel,
    ConsentOutcome,
    FieldChoice,
    FieldOptions,
    MergeAccount,
    MergeContact,
    MergeRefusal,
    MergeSide,
    MoveCount,
    MoveKind,
} from "./merge-plan";
import {
    accountPlan,
    accountSentences,
    CONSENT_CHANNELS,
    consentOutcome,
    defaultSurvivor,
    fieldOptions,
    keptAddresses,
    mergeRefusals,
    moveCounts,
    survivorFields,
    survivorVerification,
} from "./merge-plan";
import type { MergeContactsDto } from "./merge.dto";
import { isRemovedContact } from "./resolve-contact";

/**
 * Merge two customers into a chosen survivor (DEC-042, C9).
 *
 * One transaction with row locks, never an isolation level (DEV_LEARNINGS
 * "RLS quietly dropped Serializable"):
 * 1. both contacts locked `FOR UPDATE` in id order;
 * 2. the refusals checked again under the locks: a tombstone is 404 ("already
 *    merged"), a removed contact 409, the same live plan or active course 409;
 * 3. every relation re-pointed by its rule (`merge-plan.ts` MERGE_RULES),
 *    except the merged contact's autopay mandates, which are cancelled
 *    (D20);
 * 4. the merged contact made a tombstone — placeholder email, no personal
 *    values, `mergedIntoId`, `mergedAt` — BEFORE
 * 5. the survivor takes the chosen name, email and phone, so the unique
 *    email holds in one transaction;
 * 6. an audit row (`customer.merged`, ids and counts only, DEC-035), which
 *    the survivor's timeline reads as "Merged with a duplicate".
 *
 * Writers that hold a contact id from outside the request go through
 * `resolve-contact.ts`, whose `FOR SHARE` waits on this merge's lock.
 */

const SIGNS_IN = ["ACTIVE", "BLOCKED"] as const;

const CONTACT_SELECT = {
    id: true,
    organizationId: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    company: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    state: true,
    postalCode: true,
    country: true,
    createdAt: true,
    emailVerifiedAt: true,
    emailVerifiedVia: true,
    mergedIntoId: true,
} as const satisfies Prisma.ContactSelect;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof CONTACT_SELECT }>;

type Tx = Prisma.TransactionClient;

interface Pair {
    survivor: ContactRow;
    other: ContactRow;
    accounts: Record<MergeSide, MergeAccount | null>;
}

export interface MergePreview {
    survivorId: string;
    otherId: string;
    /** What moves from the other to the survivor. */
    moves: MoveCount[];
    /** Both values of name, email and phone, as the design offers them. */
    choices: FieldOptions;
    /** Per channel: the result if the survivor keeps its own address, or the other's. */
    consent: {
        channel: ConsentChannel;
        ifKept: Record<MergeSide, ConsentOutcome>;
    }[];
    account: {
        /** Carrying the other's sign-in over (the default). */
        carried: AccountPreview;
        /** "Don't carry the sign-in over". */
        notCarried: AccountPreview;
    };
    /** Why Merge can't go ahead yet; empty when it can. */
    refusals: MergeRefusal[];
}

export interface AccountPreview {
    action: AccountPlan["action"];
    /** "f…@example.in signs in on your website and will see everything here". */
    seesCombined: string | null;
    /** "o…@x.in will be asked to sign in with f…@example.in instead". */
    stopsReaching: string | null;
    confirmationRequired: boolean;
}

export interface MergeResult {
    survivorId: string;
    mergedId: string;
    moves: MoveCount[];
}

/** What a commit hands to the work that runs after it. */
export interface MergedEvent {
    organizationId: string;
    survivorId: string;
    mergedId: string;
}

@Injectable()
export class MergeService {
    private readonly logger = new Logger(MergeService.name);

    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    /** What merging `otherId` into the survivor would do, for the dialog. */
    async preview(
        ctx: OrganizationContext,
        contactId: string,
        otherId: string,
        survivorId?: string,
    ): Promise<MergePreview> {
        authorize(ctx, "customer:merge");
        refuseSelf(contactId, otherId);
        return this.db.$transaction(async (tx) => {
            const pair = await this.loadPair(
                tx,
                ctx.organizationId,
                contactId,
                otherId,
                survivorId,
            );
            const counts = await countMoves(tx, pair);
            const otherBrings = Object.values(counts).some((n) => n > 0);
            const consents = await loadConsents(tx, pair);
            const choices = fieldOptions(
                toMergeContact(pair.survivor),
                toMergeContact(pair.other),
                pair.accounts,
            );
            return {
                survivorId: pair.survivor.id,
                otherId: pair.other.id,
                moves: moveCounts(counts),
                choices,
                consent: CONSENT_CHANNELS.map((channel) => ({
                    channel,
                    ifKept: {
                        survivor: this.consentFor(pair, consents, channel, {
                            name: "survivor",
                            email: "survivor",
                            phone: "survivor",
                        }),
                        other: this.consentFor(pair, consents, channel, {
                            name: "survivor",
                            email: "other",
                            phone: "other",
                        }),
                    },
                })),
                account: {
                    carried: accountPreview(
                        accountPlan({
                            ...pair.accounts,
                            carry: true,
                            otherBrings,
                        }),
                    ),
                    notCarried: accountPreview(
                        accountPlan({
                            ...pair.accounts,
                            carry: false,
                            otherBrings,
                        }),
                    ),
                },
                refusals: await refusalsFor(tx, pair),
            };
        });
    }

    /** Merge `otherId` and `contactId` into `dto.survivorId`. Final. */
    async merge(
        ctx: OrganizationContext,
        contactId: string,
        otherId: string,
        dto: MergeContactsDto,
        now: Date = new Date(),
    ): Promise<MergeResult> {
        authorize(ctx, "customer:merge");
        refuseSelf(contactId, otherId);
        if (dto.survivorId !== contactId && dto.survivorId !== otherId) {
            throw new BadRequestException(
                "The customer to keep must be one of the two being merged",
            );
        }
        const organizationId = ctx.organizationId;
        const choice: FieldChoice = {
            name: dto.name ?? "survivor",
            email: dto.email ?? "survivor",
            phone: dto.phone ?? "survivor",
        };

        const result = await this.db.$transaction(async (tx) => {
            // One merge per pair at a time, and none racing a writer that
            // resolved either contact (`resolve-contact.ts`, FOR SHARE).
            // Id order, so two merges sharing a contact can't deadlock.
            const ids = [contactId, otherId].sort();
            await tx.$queryRaw`SELECT id FROM "Contact"
                WHERE id IN (${ids[0]}, ${ids[1]})
                  AND "organizationId" = ${organizationId}
                ORDER BY id
                FOR UPDATE`;
            const pair = await this.loadPair(
                tx,
                organizationId,
                contactId,
                otherId,
                dto.survivorId,
            );
            const { survivor, other } = pair;

            const refusals = await refusalsFor(tx, pair);
            if (refusals.length > 0) {
                throw new ConflictException({
                    message: refusals[0].message,
                    details: { reason: refusals[0].reason },
                });
            }

            const counts = await countMoves(tx, pair);
            const plan = accountPlan({
                ...pair.accounts,
                carry: dto.carryAccount ?? true,
                otherBrings: Object.values(counts).some((n) => n > 0),
            });
            if (plan.confirmationRequired && dto.accountConfirmed !== true) {
                const seen = accountSentences(plan).seesCombined;
                throw new BadRequestException({
                    message: `${seen}. Check that this email is theirs before merging.`,
                    details: { reason: "confirm-account" },
                });
            }

            const s = toMergeContact(survivor);
            const o = toMergeContact(other);
            const fields = survivorFields(s, o, pair.accounts, choice);
            await refuseEmailHeldElsewhere(
                tx,
                organizationId,
                pair,
                fields.email,
            );

            const consents = await loadConsents(tx, pair);
            await moveRelations(tx, pair);
            await mergeConsents(
                tx,
                pair,
                consents,
                keptAddresses(s, o, pair.accounts, fields),
            );
            await applyAccountPlan(tx, pair, plan, now);
            // The merged-away person's autopay is never moved: the survivor
            // never authorised it (D20). It stops here, in the merge's
            // transaction, and a `mandate.cancel` job asks the provider
            // after commit, so a provider timeout can't undo the merge.
            await cancelMandatesInTx(
                tx,
                { organizationId, contactId: other.id },
                "MERGED",
                { now },
            );

            // The tombstone first: it gives up its email, so the survivor
            // can take it in the same transaction.
            await tx.contact.update({
                where: { id: other.id },
                data: {
                    email: reservedMergedEmail(other.id),
                    firstName: null,
                    lastName: null,
                    phone: null,
                    company: null,
                    addressLine1: null,
                    addressLine2: null,
                    city: null,
                    state: null,
                    postalCode: null,
                    country: null,
                    emailVerifiedAt: null,
                    emailVerifiedVia: null,
                    mergedIntoId: survivor.id,
                    mergedAt: now,
                },
                select: { id: true },
            });
            await tx.contact.update({
                where: { id: survivor.id },
                data: {
                    ...fields,
                    ...survivorVerification({
                        email: fields.email,
                        account: plan.seesCombined,
                        survivor: s,
                        other: o,
                        now,
                    }),
                },
                select: { id: true },
            });

            const moves = moveCounts(counts);
            await tx.auditEvent.create({
                data: {
                    action: AuditAction.CustomerMerged,
                    actorUserId: ctx.userId,
                    organizationId,
                    targetType: "contact",
                    targetId: survivor.id,
                    outcome: "SUCCESS",
                    // Ids and counts only: never a name, email or phone.
                    metadata: auditMetadata(ctx.roleKey, {
                        mergedContactId: other.id,
                        moved: Object.fromEntries(
                            moves.map((m) => [m.key, m.count]),
                        ),
                        account: plan.action,
                        ...(plan.retired
                            ? { retiredAccountId: plan.retired.id }
                            : {}),
                        ...(plan.action === "move" && plan.seesCombined
                            ? { movedAccountId: plan.seesCombined.id }
                            : {}),
                    }),
                },
            });
            return { survivorId: survivor.id, mergedId: other.id, moves };
        });

        await this.afterCommit({
            organizationId,
            survivorId: result.survivorId,
            mergedId: result.mergedId,
        });
        return result;
    }

    /**
     * Work that follows a committed merge and must never roll it back. A12
     * releases a second waitlist hold here. (The merged-away contact's
     * mandates are cancelled inside the merge, with their `mandate.cancel`
     * job written on its transaction: D20.)
     */
    protected afterCommit(merged: MergedEvent): Promise<void> {
        this.logger.log(
            `Merged contact ${merged.mergedId} into ${merged.survivorId} (organization ${merged.organizationId})`,
        );
        return Promise.resolve();
    }

    private consentFor(
        pair: Pair,
        consents: ConsentRows,
        channel: ConsentChannel,
        choice: FieldChoice,
    ): ConsentOutcome {
        const s = toMergeContact(pair.survivor);
        const o = toMergeContact(pair.other);
        const fields = survivorFields(s, o, pair.accounts, choice);
        const keeps = keptAddresses(s, o, pair.accounts, fields)[channel];
        return consentOutcome(
            {
                survivor: consents.survivor.get(channel),
                other: consents.other.get(channel),
            },
            keeps,
        );
    }

    /**
     * Both contacts, in this business, neither a tombstone nor removed, and
     * which one survives (the older one when not said, default 22).
     */
    private async loadPair(
        tx: Tx,
        organizationId: string,
        contactId: string,
        otherId: string,
        survivorId?: string,
    ): Promise<Pair> {
        const rows = await tx.contact.findMany({
            where: { id: { in: [contactId, otherId] }, organizationId },
            select: CONTACT_SELECT,
        });
        const a = rows.find((r) => r.id === contactId);
        const b = rows.find((r) => r.id === otherId);
        if (!a || !b) throw new NotFoundException("Contact not found");
        for (const c of [a, b]) {
            if (c.mergedIntoId) {
                throw new NotFoundException({
                    message: "This customer was already merged into another",
                    details: {
                        reason: "already-merged",
                        mergedInto: c.mergedIntoId,
                    },
                });
            }
            if (isRemovedContact(c)) {
                throw new ConflictException(
                    "This customer's details were removed, so they can't be merged",
                );
            }
        }
        const keep =
            survivorId ?? defaultSurvivor(toMergeContact(a), toMergeContact(b));
        if (keep !== a.id && keep !== b.id) {
            throw new BadRequestException(
                "The customer to keep must be one of the two being merged",
            );
        }
        const survivor = keep === a.id ? a : b;
        const other = keep === a.id ? b : a;
        const accounts = await tx.customerAccount.findMany({
            where: {
                organizationId,
                contactId: { in: [survivor.id, other.id] },
                status: { in: [...SIGNS_IN] },
            },
            select: { id: true, email: true, contactId: true },
        });
        const accountOf = (id: string): MergeAccount | null => {
            const found = accounts.find((x) => x.contactId === id);
            return found ? { id: found.id, email: found.email } : null;
        };
        return {
            survivor,
            other,
            accounts: {
                survivor: accountOf(survivor.id),
                other: accountOf(other.id),
            },
        };
    }
}

function refuseSelf(contactId: string, otherId: string): void {
    if (contactId === otherId) {
        throw new BadRequestException(
            "A customer can't be merged with themselves",
        );
    }
}

function toMergeContact(row: ContactRow): MergeContact {
    return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        company: row.company,
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
        country: row.country,
        createdAt: row.createdAt,
        emailVerifiedAt: row.emailVerifiedAt,
        emailVerifiedVia: row.emailVerifiedVia,
    };
}

function accountPreview(plan: AccountPlan): AccountPreview {
    return {
        action: plan.action,
        ...accountSentences(plan),
        confirmationRequired: plan.confirmationRequired,
    };
}

/** Live on one plan (the partial unique's predicate), or active in one course. */
async function refusalsFor(tx: Tx, pair: Pair): Promise<MergeRefusal[]> {
    const ids = [pair.survivor.id, pair.other.id];
    const [subs, enrolments] = await Promise.all([
        tx.customerSubscription.findMany({
            where: { contactId: { in: ids }, status: { not: "CANCELLED" } },
            select: {
                contactId: true,
                planId: true,
                plan: { select: { name: true } },
            },
        }),
        tx.courseEnrollment.findMany({
            where: { contactId: { in: ids }, status: "ACTIVE" },
            select: {
                contactId: true,
                courseId: true,
                course: { select: { name: true } },
            },
        }),
    ]);
    const shared = <T extends { contactId: string }>(
        rows: T[],
        key: (r: T) => string,
        name: (r: T) => string,
    ): string[] => {
        const byKey = new Map<string, Set<string>>();
        const names = new Map<string, string>();
        for (const r of rows) {
            const k = key(r);
            byKey.set(k, (byKey.get(k) ?? new Set()).add(r.contactId));
            names.set(k, name(r));
        }
        return [...byKey.entries()]
            .filter(([, who]) => who.size > 1)
            .map(([k]) => names.get(k) ?? "")
            .sort();
    };
    return mergeRefusals({
        samePlans: shared(
            subs,
            (r) => r.planId,
            (r) => r.plan.name,
        ),
        sameCourses: shared(
            enrolments,
            (r) => r.courseId,
            (r) => r.course.name,
        ),
    });
}

/**
 * An email held by a third contact can't be taken (the unique email). The
 * two being merged are fine: the tombstone gives its email up first.
 */
async function refuseEmailHeldElsewhere(
    tx: Tx,
    organizationId: string,
    pair: Pair,
    email: string,
): Promise<void> {
    const holder = await tx.contact.findFirst({
        where: {
            organizationId,
            email: { equals: email, mode: "insensitive" },
            id: { notIn: [pair.survivor.id, pair.other.id] },
        },
        select: { id: true },
    });
    if (holder) {
        throw new ConflictException({
            message:
                "That email belongs to another customer. Merge them first.",
            details: { reason: "email-taken", contactId: holder.id },
        });
    }
}

/** How many of each kind moves from the other to the survivor. */
async function countMoves(
    tx: Tx,
    pair: Pair,
): Promise<Record<MoveKind, number>> {
    const from = pair.other.id;
    const to = pair.survivor.id;
    const [
        orders,
        bookings,
        invoices,
        subscriptions,
        packs,
        courses,
        notes,
        attention,
        messages,
        leads,
        submissions,
        links,
    ] = await Promise.all([
        // Orders move with the store records linked to the other; one the
        // survivor is already linked to moves nothing.
        tx.order.count({
            where: {
                customer: {
                    identityLinks: { some: { contactId: from } },
                    NOT: { identityLinks: { some: { contactId: to } } },
                },
            },
        }),
        tx.booking.count({ where: { contactId: from } }),
        tx.invoice.count({ where: { contactId: from } }),
        tx.customerSubscription.count({ where: { contactId: from } }),
        tx.packPurchase.count({ where: { contactId: from } }),
        tx.courseEnrollment.count({ where: { contactId: from } }),
        tx.contactNote.count({ where: { contactId: from } }),
        tx.contactAttention.count({
            where: { contactId: from, removedAt: null },
        }),
        // Emails, and messages in their account thread (A13).
        Promise.all([
            tx.message.count({ where: { contactId: from } }),
            tx.customerThreadMessage.count({
                where: { thread: { contactId: from } },
            }),
        ]).then(([emails, thread]) => emails + thread),
        tx.lead.count({ where: { contactId: from } }),
        tx.submission.count({ where: { contactId: from } }),
        tx.customerIdentityLink.count({
            where: {
                contactId: from,
                customer: { identityLinks: { none: { contactId: to } } },
            },
        }),
    ]);
    return {
        orders,
        bookings,
        invoices,
        subscriptions,
        packs,
        courses,
        notes,
        attention,
        messages,
        leads,
        submissions,
        links,
    };
}

/** Re-point every relation by its rule in MERGE_RULES. */
async function moveRelations(tx: Tx, pair: Pair): Promise<void> {
    const from = pair.other.id;
    const to = pair.survivor.id;
    const move = { where: { contactId: from }, data: { contactId: to } };

    await tx.lead.updateMany(move);
    await tx.submission.updateMany(move);
    await tx.booking.updateMany(move);
    await tx.message.updateMany(move);
    await tx.invoice.updateMany(move);
    await tx.packPurchase.updateMany(move);
    // Refused above while both are live on one plan or active in one course,
    // so the partial uniques hold.
    await tx.customerSubscription.updateMany(move);
    await tx.courseEnrollment.updateMany(move);
    await tx.contactNote.updateMany(move);

    // Store records: a customer both are linked to keeps the survivor's link.
    await tx.customerIdentityLink.deleteMany({
        where: {
            contactId: from,
            customer: { identityLinks: { some: { contactId: to } } },
        },
    });
    await tx.customerIdentityLink.updateMany(move);

    await collapseAttention(tx, pair);

    // One thread: the survivor's absorbs the other's (A13).
    await absorbThread(tx, pair.survivor.organizationId, from, to);

    // "This isn't them" stays true of the survivor, unless the account now
    // signs in on it (then there is nobody to part it from).
    await tx.customerAccount.updateMany({
        where: { unlinkedFromContactId: from, NOT: { contactId: to } },
        data: { unlinkedFromContactId: to },
    });
    await tx.customerAccount.updateMany({
        where: { unlinkedFromContactId: from, contactId: to },
        data: { unlinkedFromContactId: null },
    });

    // A chain is never more than one hop.
    await tx.contact.updateMany({
        where: { mergedIntoId: from },
        data: { mergedIntoId: to },
    });
}

/**
 * Needs attention combines (default 24). An entry of the other's equal to a
 * live one of the survivor's — the same kind, label and allergen — moves
 * but is retired, so it is kept for the record and shown once.
 */
async function collapseAttention(tx: Tx, pair: Pair): Promise<void> {
    const [mine, theirs] = await Promise.all(
        [pair.survivor.id, pair.other.id].map((contactId) =>
            tx.contactAttention.findMany({
                where: { contactId, removedAt: null },
                select: {
                    id: true,
                    kind: true,
                    label: true,
                    allergenId: true,
                    status: true,
                },
            }),
        ),
    );
    const key = (e: {
        kind: string;
        label: string;
        allergenId: string | null;
        status: string;
    }) =>
        [
            e.kind,
            e.label.trim().toLowerCase(),
            e.allergenId ?? "",
            e.status,
        ].join("|");
    const held = new Set(mine.map(key));
    const duplicates = theirs.filter((e) => held.has(key(e))).map((e) => e.id);
    if (duplicates.length > 0) {
        await tx.contactAttention.updateMany({
            where: { id: { in: duplicates } },
            data: { removedAt: new Date() },
        });
    }
    await tx.contactAttention.updateMany({
        where: { contactId: pair.other.id },
        data: { contactId: pair.survivor.id },
    });
}

interface ConsentRow {
    id: string;
    status: string;
    updatedAt: Date;
}

interface ConsentRows {
    survivor: Map<string, ConsentRow>;
    other: Map<string, ConsentRow>;
}

async function loadConsents(tx: Tx, pair: Pair): Promise<ConsentRows> {
    const rows = await tx.consent.findMany({
        where: { contactId: { in: [pair.survivor.id, pair.other.id] } },
        select: {
            id: true,
            contactId: true,
            channel: true,
            status: true,
            updatedAt: true,
        },
    });
    const of = (contactId: string) =>
        new Map(
            rows
                .filter((r) => r.contactId === contactId)
                .map((r) => [r.channel, r] as const),
        );
    return { survivor: of(pair.survivor.id), other: of(pair.other.id) };
}

/**
 * One consent per channel on the survivor, by `consentOutcome`. The row
 * that wins is kept as it was (its `updatedAt` is when the person said
 * it), so a later merge still compares real answers; the rest go.
 */
async function mergeConsents(
    tx: Tx,
    pair: Pair,
    consents: ConsentRows,
    keeps: Record<ConsentChannel, Record<MergeSide, boolean>>,
): Promise<void> {
    const channels = new Set([
        ...consents.survivor.keys(),
        ...consents.other.keys(),
    ]);
    for (const channel of channels) {
        const survivorRow = consents.survivor.get(channel);
        const otherRow = consents.other.get(channel);
        const known = (CONSENT_CHANNELS as readonly string[]).includes(channel);
        const outcome = known
            ? consentOutcome(
                  { survivor: survivorRow, other: otherRow },
                  keeps[channel as ConsentChannel],
              )
            : { status: null, from: survivorRow ? "survivor" : null };
        const winner =
            outcome.from === "survivor"
                ? survivorRow
                : outcome.from === "other"
                  ? otherRow
                  : undefined;
        const losers = [survivorRow, otherRow].filter(
            (r): r is ConsentRow => !!r && r !== winner,
        );
        if (losers.length > 0) {
            await tx.consent.deleteMany({
                where: { id: { in: losers.map((r) => r.id) } },
            });
        }
        if (winner && winner === otherRow) {
            // Raw, so `updatedAt` keeps when they said it.
            await tx.$executeRaw`UPDATE "Consent" SET "contactId" = ${pair.survivor.id}
                WHERE id = ${winner.id}`;
        }
    }
}

/** ADR-011: move the other's account, or retire it on the tombstone. */
async function applyAccountPlan(
    tx: Tx,
    pair: Pair,
    plan: AccountPlan,
    now: Date,
): Promise<void> {
    if (plan.action === "move" && plan.seesCombined) {
        await tx.customerAccount.update({
            where: { id: plan.seesCombined.id },
            data: { contactId: pair.survivor.id },
            select: { id: true },
        });
        return;
    }
    if (plan.retired) {
        // The row stays, with its email reserved (MERGED counts against the
        // one-account-per-email index), so the next sign-in with it can't
        // make a new contact that recreates the duplicate (DEC-049).
        await tx.customerAccount.update({
            where: { id: plan.retired.id },
            data: {
                status: "MERGED",
                mergedIntoId: plan.retiredInto?.id ?? null,
            },
            select: { id: true },
        });
        await tx.customerSession.updateMany({
            where: { accountId: plan.retired.id, revokedAt: null },
            data: { revokedAt: now },
        });
    }
}
