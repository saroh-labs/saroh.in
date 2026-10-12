import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type {
    DraftPatch,
    DraftRevisionState,
} from "../../common/drafts/draft-record";
import {
    assertRevision,
    mergeForEditor,
    readPending,
} from "../../common/drafts/draft-record";
import { fromMinor, toMinor, toMoneyString } from "../../common/money";
import type { GstPriceMode } from "../invoices/gst-price";
import { isGstPriceMode } from "../invoices/gst-price";
import { loadPriceTerms } from "../invoices/price-terms";
import { saleCharge } from "../invoices/sale-price";
import { actorView, teamNames } from "./event-actors";
import type { PlanActor, PlanActorKind, PlanSnapshot } from "./plan-events";
import { planRate } from "./plan-events";
import { PLAN_DRAFT } from "./plan-on-sale";
import { nameTakenMessage, planNameClash } from "./plans";

/**
 * A plan as the Plan Editor reads it (round-2 D5): the values it shows, what
 * is live, whether it holds unpublished changes, the revision every save
 * carries, and what stops it being published. The shapes are the editor
 * shell's `EditorRecord` (`apps/app.saroh.in/lib/editor-shell/types.ts`).
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** The fields a plan's draft holds; nothing else is published. */
export const PLAN_DRAFT_FIELDS = [
    "name",
    "description",
    "price",
    "currency",
    "interval",
    "classesPerMonth",
    // GST (12 Oct 2026): published with the price, since under "GST is
    // added" they change what a buyer and a member pay.
    "gstRate",
    "sacCode",
    "gstPriceMode",
] as const;

/**
 * A plan's publishable values, as the editor sends and shows them. `price`
 * is "1500.00"; null on a draft whose price isn't set yet (stored as 0,
 * since the column can't be empty). `gstRate` is "18" (null: not set), and
 * `gstPriceMode` the plan's own way of carrying GST (null: the business's).
 */
export interface PlanValues {
    name: string;
    description: string | null;
    price: string | null;
    currency: string;
    interval: string;
    classesPerMonth: number | null;
    gstRate: string | null;
    sacCode: string | null;
    gstPriceMode: string | null;
}

/** A reason the plan can't be published yet, beside its field. */
export interface PlanProblem {
    field: string;
    message: string;
}

export interface PlanEditorView {
    id: string;
    status: string;
    /** A live plan holds a set of unpublished changes. */
    hasPendingChanges: boolean;
    /** Sent back with every save, publish, discard and delete (#285). */
    revision: number;
    /** What the editor shows: a draft's columns, or live with pending over. */
    values: PlanValues;
    /** What is live now; null for a draft. */
    published: PlanValues | null;
    /** A draft nobody has bought, so Delete draft is allowed. */
    canDelete: boolean;
    /** What stops Publish now. Empty when it can be published. */
    problems: PlanProblem[];
    /** When the draft or the pending set was last saved; null when none. */
    pendingChangedAt: string | null;
    /**
     * What the autopay of members switching to this plan at their next
     * renewal covers (D13): one entry per limit, lowest first. The renewal
     * that moves them bills the plan's price, and a price above a member's
     * limit is never charged (MANDATE_LIMIT_LOW) — they authorise again. The
     * editor warns as the price is typed. Members already on the plan keep
     * the price they joined at; what a change to the plan's GST does to
     * their renewals, and to their autopay, is `renewalChange`. Empty for
     * a draft, which nobody can switch to.
     */
    autopayLimits: AutopayLimit[];
    /**
     * Whether the editor asks for GST (12 Oct 2026): only a registered
     * business's plan carries a rate. `priceMode` is how the business's
     * prices carry GST, for "Same as the business (…)". A business that is
     * not registered is shown nothing and never held up.
     */
    gst: { asked: boolean; priceMode: GstPriceMode | null };
    /**
     * What publishing the GST shown here does to the members already on the
     * plan, said before Publish. Null when nobody is on it, or its GST is
     * as published.
     */
    renewalChange: RenewalChange | null;
}

/**
 * The next renewal of the members on a plan, as its published GST bills it
 * and as the editor's would. A member keeps the price they joined at, and
 * every renewal reads the plan's GST as it stands that day, so a rate set
 * (or "GST is added" chosen) reaches their next invoice. Under "includes
 * GST" the amount is the same and the invoice shows the GST inside; under
 * "GST is added" they pay more.
 */
export interface RenewalChange {
    /** Members on the plan now, active or paused. */
    members: number;
    /** By the price each pays: the next renewal now, and once published. */
    groups: { members: number; currency: string; from: string; to: string }[];
    /** How many members' next renewal amount changes. 0: nobody's. */
    changed: number;
    /**
     * Of those, how many pay by autopay with a limit below the new amount.
     * Their renewal is never charged above the limit: it goes out as an
     * invoice with a pay link, and they authorise autopay again.
     */
    aboveAutopayLimit: number;
}

/** Members whose autopay covers up to `limit` ("1500.00"). */
export interface AutopayLimit {
    limit: string;
    members: number;
}

export const PLAN_DRAFT_SELECT = {
    id: true,
    status: true,
    name: true,
    description: true,
    price: true,
    currency: true,
    interval: true,
    classesPerMonth: true,
    gstRate: true,
    sacCode: true,
    gstPriceMode: true,
    pendingChanges: true,
    pendingChangedAt: true,
    pendingChangedById: true,
    draftRevision: true,
} as const;

export type PlanDraftRow = Prisma.SubscriptionPlanGetPayload<{
    select: typeof PLAN_DRAFT_SELECT;
}>;

/** The plan's columns as values: what is live, or a draft's own. */
export function columnValues(row: PlanDraftRow): PlanValues {
    const unpriced = row.status === PLAN_DRAFT && toMinor(row.price) === 0;
    return {
        name: row.name,
        description: row.description,
        price: unpriced ? null : toMoneyString(row.price),
        currency: row.currency,
        interval: row.interval,
        classesPerMonth: row.classesPerMonth,
        gstRate: planRate(row.gstRate),
        sacCode: row.sacCode,
        gstPriceMode: isGstPriceMode(row.gstPriceMode)
            ? row.gstPriceMode
            : null,
    };
}

export function pendingOf(row: PlanDraftRow): DraftPatch<PlanValues> | null {
    if (row.status === PLAN_DRAFT) return null;
    return readPending<PlanValues>(PLAN_DRAFT_FIELDS, row.pendingChanges);
}

/** What the editor shows: a draft's columns, or live with pending over. */
export function editorValues(row: PlanDraftRow): PlanValues {
    return mergeForEditor(columnValues(row), pendingOf(row));
}

/** Values as the columns take them. An unset price is stored as 0. */
export function valueColumns(values: PlanValues) {
    return {
        name: values.name,
        description: values.description,
        price: values.price ?? "0",
        currency: values.currency,
        interval: values.interval,
        classesPerMonth: values.classesPerMonth,
        gstRate: values.gstRate,
        sacCode: values.sacCode,
        gstPriceMode: values.gstPriceMode,
    };
}

/** Values as a plan event records them (D2). */
export function valuesSnapshot(
    values: PlanValues,
    status: string,
): PlanSnapshot {
    return { ...values, status };
}

/** How an operator's save is named, as the plan's history names them. */
const SAROH_SUPPORT = "Saroh support";

/** Who a save by `actor` is stored as: never a Saroh operator (DEC-035). */
export function savedById(actor: PlanActor): string | null {
    return actor.actorKind === "OPERATOR" ? null : actor.actorUserId;
}

/**
 * What stops these values being published: a name (free among live and
 * draft plans, D1), a price above zero and, for a GST-registered business,
 * a GST rate (12 Oct 2026; "Exempt (0%)" is one). The DTO has already
 * checked each field's shape and range. A business that is not registered
 * is never asked for a rate.
 */
export async function planProblems(
    db: Db,
    organizationId: string,
    id: string,
    values: PlanValues,
): Promise<PlanProblem[]> {
    const problems: PlanProblem[] = [];
    if (!values.name.trim()) {
        problems.push({ field: "name", message: "Give the plan a name" });
    } else {
        const clash = await planNameClash(db, organizationId, values.name, id);
        if (clash) {
            problems.push({
                field: "name",
                message: nameTakenMessage(clash.name),
            });
        }
    }
    if (!values.price || toMinor(values.price) === 0) {
        problems.push({ field: "price", message: "Set a price" });
    } else if (
        values.gstRate === null &&
        (await loadPriceTerms(db, organizationId)).registered
    ) {
        problems.push({ field: "gstRate", message: GST_RATE_NEEDED });
    }
    return problems;
}

/** Said beside the rate, and when Publish is refused for it. */
export const GST_RATE_NEEDED =
    "Choose a GST rate. Exempt (0%) is one of the choices.";

/** A plan's GST as a set of values holds it. */
function gstOf(values: PlanValues) {
    return {
        gstRate: values.gstRate,
        sacCode: values.sacCode,
        gstPriceMode: values.gstPriceMode,
    };
}

/**
 * What publishing `next` does to the next renewal of the members on a plan
 * whose GST is `live` now ({@link RenewalChange}). Null when nobody is on
 * the plan, or the two charge and describe a renewal the same way.
 */
export async function renewalChangeOf(
    db: Db,
    organizationId: string,
    planId: string,
    live: PlanValues,
    next: PlanValues,
): Promise<RenewalChange | null> {
    if (
        live.gstRate === next.gstRate &&
        live.gstPriceMode === next.gstPriceMode
    ) {
        return null;
    }
    const onIt = {
        organizationId,
        planId,
        status: { in: ["ACTIVE", "PAUSED"] },
    };
    const rows = await db.customerSubscription.groupBy({
        by: ["price", "currency"],
        where: onIt,
        _count: { _all: true },
        orderBy: { price: "asc" },
    });
    if (rows.length === 0) return null;
    const terms = await loadPriceTerms(db, organizationId);
    const pay = (price: { toString(): string }, values: PlanValues) =>
        saleCharge(toMinor(price), gstOf(values), terms).payCents;
    const groups = rows.map((r) => ({
        members: r._count._all,
        currency: r.currency,
        fromCents: pay(r.price, live),
        toCents: pay(r.price, next),
    }));
    const changed = groups
        .filter((g) => g.fromCents !== g.toCents)
        .reduce((n, g) => n + g.members, 0);
    let aboveAutopayLimit = 0;
    if (changed > 0) {
        const mandates = await db.paymentMandate.findMany({
            where: {
                organizationId,
                status: "ACTIVE",
                maxAmountCents: { not: null },
                subscription: onIt,
            },
            select: {
                maxAmountCents: true,
                subscription: { select: { price: true } },
            },
        });
        aboveAutopayLimit = mandates.filter(
            (m) =>
                m.maxAmountCents !== null &&
                pay(m.subscription.price, next) > m.maxAmountCents,
        ).length;
    }
    return {
        members: groups.reduce((n, g) => n + g.members, 0),
        groups: groups.map((g) => ({
            members: g.members,
            currency: g.currency,
            from: fromMinor(g.fromCents),
            to: fromMinor(g.toCents),
        })),
        changed,
        aboveAutopayLimit,
    };
}

/**
 * Who moved the revision last, and when: the draft's own last save, or the
 * plan's newest event (a publish, a discard, an archive, a change through
 * the old form), whichever is later. Named as the plan's history names
 * them: Saroh support for an operator (DEC-035).
 */
async function lastChange(
    db: Db,
    organizationId: string,
    row: PlanDraftRow,
): Promise<Omit<DraftRevisionState, "revision">> {
    const event = await db.subscriptionPlanEvent.findFirst({
        where: { organizationId, planId: row.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { actorKind: true, actorUserId: true, createdAt: true },
    });
    const savedAt = row.pendingChangedAt;
    if (savedAt && (!event || savedAt >= event.createdAt)) {
        const by = row.pendingChangedById;
        // A save with a time and no person is an operator's (savedById).
        if (!by) return { changedBy: SAROH_SUPPORT, changedAt: savedAt };
        const names = await teamNames([{ actorKind: "TEAM", actorUserId: by }]);
        return { changedBy: names.get(by) ?? null, changedAt: savedAt };
    }
    if (!event) return { changedBy: null, changedAt: null };
    const names = await teamNames([event]);
    const view = actorView(
        event.actorKind as PlanActorKind,
        event.actorUserId,
        names,
    );
    return { changedBy: view.name, changedAt: event.createdAt };
}

/**
 * Refuse (409) a write from an editor holding an older revision, naming who
 * saved since. Nothing is read for a current one.
 */
export async function checkPlanRevision(
    db: Db,
    organizationId: string,
    row: PlanDraftRow,
    yours: number,
): Promise<void> {
    if (yours === row.draftRevision) return;
    assertRevision(
        yours,
        {
            revision: row.draftRevision,
            ...(await lastChange(db, organizationId, row)),
        },
        "plan",
    );
}

/** The editor's view of a plan row. */
export async function planEditorView(
    db: Db,
    organizationId: string,
    row: PlanDraftRow,
): Promise<PlanEditorView> {
    const isDraft = row.status === PLAN_DRAFT;
    const values = editorValues(row);
    const live = columnValues(row);
    const [problems, sold, autopayLimits, terms, renewalChange] =
        await Promise.all([
            planProblems(db, organizationId, row.id, values),
            isDraft
                ? timesSold(db, organizationId, row.id)
                : Promise.resolve(0),
            isDraft
                ? Promise.resolve([])
                : switchersAutopayLimits(db, organizationId, row.id),
            loadPriceTerms(db, organizationId),
            isDraft
                ? Promise.resolve(null)
                : renewalChangeOf(db, organizationId, row.id, live, values),
        ]);
    return {
        id: row.id,
        status: row.status,
        hasPendingChanges: pendingOf(row) !== null,
        revision: row.draftRevision,
        values,
        published: isDraft ? null : live,
        canDelete: isDraft && sold === 0,
        problems,
        pendingChangedAt: row.pendingChangedAt?.toISOString() ?? null,
        autopayLimits,
        gst: {
            asked: terms.registered,
            priceMode: terms.registered ? terms.mode : null,
        },
        renewalChange,
    };
}

/**
 * The limits of the ACTIVE mandates on subscriptions booked to switch to
 * this plan (D13's Plan Editor warning), grouped, lowest first. Only those
 * renewals bill the plan's price as it will be; the charge handler refuses
 * one above the limit (`mandate-charges.service.ts`).
 */
export async function switchersAutopayLimits(
    db: Db,
    organizationId: string,
    planId: string,
): Promise<AutopayLimit[]> {
    const rows = await db.paymentMandate.groupBy({
        by: ["maxAmountCents"],
        where: {
            organizationId,
            status: "ACTIVE",
            maxAmountCents: { not: null },
            subscription: {
                organizationId,
                pendingPlanId: planId,
                status: { in: ["ACTIVE", "PAUSED"] },
            },
        },
        _count: { _all: true },
        orderBy: { maxAmountCents: "asc" },
    });
    return rows.flatMap((r) =>
        r.maxAmountCents === null
            ? []
            : [
                  {
                      limit: fromMinor(r.maxAmountCents),
                      members: r._count._all,
                  },
              ],
    );
}

/** Subscriptions on the plan, or booked to switch to it. */
export async function timesSold(
    db: Db,
    organizationId: string,
    planId: string,
): Promise<number> {
    return db.customerSubscription.count({
        where: {
            organizationId,
            OR: [{ planId }, { pendingPlanId: planId }],
        },
    });
}

/** One plan as the editor reads it; another business's is a 404. */
export async function readPlanEditor(
    organizationId: string,
    id: string,
): Promise<PlanEditorView> {
    const row = await prisma.subscriptionPlan.findFirst({
        where: { id, organizationId },
        select: PLAN_DRAFT_SELECT,
    });
    if (!row) throw new NotFoundException("Plan not found");
    return planEditorView(prisma, organizationId, row);
}
