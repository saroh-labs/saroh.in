import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma, Prisma as PrismaNamespace } from "@saroh/database";

import { readPending } from "../../common/drafts/draft-record";
import { toMoneyString } from "../../common/money";
import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    CANT_USE_PACKS,
    requireBookingPower,
} from "../bookings/booking-access";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { assertBusinessDetails } from "../invoices/business-details";
import { InvoicesService } from "../invoices/invoices.service";
import { paymentsOn } from "../invoices/payments-on";
import { contactName } from "../invoices/serialize";
import { fromCents, toCents } from "../invoices/totals";
import { allows } from "../organizations/organization-policy";
import { assertClassPacksOn } from "./class-packs-on";
import type {
    ExtendPurchaseDto,
    ListPackEventsQueryDto,
    ListPacksQueryDto,
    ListPurchasesQueryDto,
    PackDraftDto,
    PackInputDto,
    PackUsedQueryDto,
    SellPackDto,
    UsePackDto,
} from "./dto";
import { assertFirstPackAllowed } from "./first-pack";
import type { PackEditorView } from "./pack-draft-view";
import {
    columnValues,
    lockPack,
    PACK_DRAFT_FIELDS,
    PACK_DRAFT_SELECT,
    readPackEditor,
    revised,
    timesSold,
} from "./pack-draft-view";
import {
    createPackDraft,
    deletePackDraft,
    discardPackChanges,
    publishPack,
    savePackDraft,
} from "./pack-drafts";
import type { PackEventsPage } from "./pack-events";
import {
    diffPack,
    listPackEvents,
    packActor,
    recordPackChange,
    recordPackEvent,
} from "./pack-events";
import { extendPurchase } from "./pack-extend";
import type { PackKind, PackPaidBy } from "./pack-kind";
import {
    DEFAULT_PACK_KIND,
    MIN_VALIDITY_DAYS,
    paidAlready,
    purchasesPayingFor,
    readPackKind,
    refuseKindChange,
} from "./pack-kind";
import { assertPackOnSale, PACK_DRAFT } from "./pack-on-sale";
import type {
    MoneyTotal,
    PackCounts,
    PackHolderView,
    PackOverview,
    PurchaseStanding,
} from "./pack-reads";
import {
    packCounts,
    packHolders,
    packOverview,
    standingOf,
} from "./pack-reads";
import type { PackSaleView, PackUsedPage } from "./pack-used-sales";
import { packSales, packUsed } from "./pack-used-sales";
import { redeemPackInTx, reversePackInTx } from "./redeem-pack";

const DAY_MS = 86_400_000;
const LIST_LIMIT = 500;

/** A validity under a week is refused (E13, default 46), as the DTO says. */
function assertValidity(days: number | undefined): void {
    if (days !== undefined && days < MIN_VALIDITY_DAYS) {
        fieldError("A pack is valid for at least 7 days", "validityDays");
    }
}

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function notFound(what: string, field?: string): never {
    throw new NotFoundException(
        field
            ? { message: `${what} not found`, details: { field } }
            : `${what} not found`,
    );
}

export interface PackView {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    price: string;
    currency: string;
    status: string;
    services: { id: string; name: string }[];
    /** Every time it has been sold, still live or not. */
    sold: number;
    /** Purchases that still have classes and time left. */
    activeHolders: number;
    /** Classes (or sessions) left across those purchases (E13). */
    creditsLeft: number;
    /** People holding a live purchase: one person with two counts once (E15). */
    people: number;
    /** What its sales were sold for, per currency (E15). `pack:read` covers it. */
    takings: MoneyTotal[];
    /** A live pack holds unpublished changes (E14): "Changes not published". */
    hasPendingChanges: boolean;
    /**
     * When its draft was last saved (E14): a DRAFT's, or a live pack's
     * unpublished changes'. Null when a live pack has none.
     */
    pendingChangedAt: string | null;
    createdAt: string;
    /** Classes or one-to-one sessions (E13, default 45). */
    kind: PackKind;
    /** Sold only to someone who has never bought a pack of its kind (E13). */
    firstPackOnly: boolean;
}

/** One pack with Pack Detail's Overview figures (E13). */
export interface PackDetailView extends PackView {
    overview: PackOverview;
}

/** What selling a pack does besides recording it, for the sell dialog to say. */
export interface SellingTerms {
    /** Payments is on, so a sale issues its invoice there and then. */
    invoicesOnSale: boolean;
}

export type { PurchaseStanding };

export interface PurchaseView {
    id: string;
    pack: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    credits: number;
    used: number;
    /** Derived: the classes it was sold with, less the ones spent and not given back. */
    left: number;
    standing: PurchaseStanding;
    price: string;
    currency: string;
    expiresAt: string;
    /** The invoice issued for it; null when sold with Payments off. */
    invoiceId: string | null;
    createdAt: string;
    /** How it was paid (E13); null when not recorded. */
    paidBy: PackPaidBy | null;
}

const PACK_INCLUDE = {
    services: {
        select: { service: { select: { id: true, name: true } } },
    },
} as const;

const PURCHASE_SELECT = {
    id: true,
    credits: true,
    price: true,
    currency: true,
    expiresAt: true,
    createdAt: true,
    paidBy: true,
    pack: { select: { id: true, name: true } },
    contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    invoices: {
        where: { status: { not: "VOID" } },
        select: { id: true },
        take: 1,
    },
    _count: { select: { redemptions: { where: { reversedAt: null } } } },
} as const;

type PurchaseRow = Prisma.PackPurchaseGetPayload<{
    select: typeof PURCHASE_SELECT;
}>;

/**
 * Class packs (ADR-007): N classes for a price, valid for D days, on the
 * services the pack names.
 *
 * A purchase snapshots the classes, price and expiry when it is sold, and
 * issues its invoice in the same transaction when Payments is on. With
 * Payments off the sale is recorded, with the price paid, and no invoice.
 *
 * The balance is never stored: it is the classes sold less the redemptions
 * not given back, so it cannot drift from the bookings.
 */
@Injectable()
export class ClassPacksService {
    constructor(private readonly invoices: InvoicesService) {}

    // — Packs ——————————————————————————————————————————————————————

    async listPacks(
        ctx: OrganizationContext,
        query: ListPacksQueryDto,
    ): Promise<PackView[]> {
        requireBookingPower(ctx, "pack:read");
        // Drafts only when asked (E14): an app before the Pack Editor would
        // draw one as a pack on sale.
        const status = query.status
            ? { status: query.status }
            : query.include === "drafts"
              ? {}
              : { status: { not: PACK_DRAFT } };
        const rows = await prisma.classPack.findMany({
            where: { organizationId: ctx.organizationId, ...status },
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            include: PACK_INCLUDE,
        });
        const holders = await packCounts(
            ctx.organizationId,
            rows.map((r) => r.id),
        );
        return rows.map((r) => this.packView(r, holders.get(r.id)));
    }

    /**
     * Whether a sale issues an invoice right now — Payments on or off — so
     * the sell dialog mentions one only when there will be one.
     */
    async sellingTerms(ctx: OrganizationContext): Promise<SellingTerms> {
        requireBookingPower(ctx, "pack:read");
        return { invoicesOnSale: await paymentsOn(prisma, ctx.organizationId) };
    }

    /**
     * One pack with Pack Detail's Overview (E13): who holds it, the classes
     * left across them, how many run out soon or ran out unused, and what
     * it has sold, this month and in all. `pack:read` covers all of it,
     * money included (DEC-039).
     */
    async getPack(
        ctx: OrganizationContext,
        id: string,
    ): Promise<PackDetailView> {
        requireBookingPower(ctx, "pack:read");
        const pack = await this.readPack(ctx.organizationId, id);
        return {
            ...pack,
            overview: await packOverview(ctx.organizationId, id),
        };
    }

    async createPack(
        ctx: OrganizationContext,
        dto: PackInputDto,
    ): Promise<PackView> {
        requireBookingPower(ctx, "pack:write");
        const kind = dto.kind ?? DEFAULT_PACK_KIND;
        const units = kind === "ONE_TO_ONE" ? "sessions" : "classes";
        if (!dto.name) fieldError("Give the pack a name", "name");
        if (dto.credits === undefined) {
            fieldError(`Say how many ${units} it holds`, "credits");
        }
        if (dto.validityDays === undefined) {
            fieldError("Say how long it is valid", "validityDays");
        }
        assertValidity(dto.validityDays);
        if (!dto.price) fieldError("Set a price", "price");
        if (!dto.currency) fieldError("Choose a currency", "currency");
        if (!dto.serviceIds?.length) {
            fieldError(`Choose the ${units} it pays for`, "serviceIds");
        }
        const serviceIds = await this.assertServices(
            ctx.organizationId,
            dto.serviceIds,
        );
        const { name, credits, validityDays, price, currency } = dto;

        const id = await prisma.$transaction(async (tx) => {
            const created = await tx.classPack.create({
                data: {
                    organizationId: ctx.organizationId,
                    name,
                    description: dto.description ?? null,
                    credits,
                    validityDays,
                    price: fromCents(toCents(price)),
                    currency,
                    kind,
                    firstPackOnly: dto.firstPackOnly ?? false,
                },
                select: { id: true },
            });
            await tx.classPackService.createMany({
                data: serviceIds.map((serviceId) => ({
                    packId: created.id,
                    serviceId,
                    organizationId: ctx.organizationId,
                })),
            });
            // Its first event (E13), with the terms it went on sale with.
            const made = await tx.classPack.findUniqueOrThrow({
                where: { id: created.id },
                select: PACK_DRAFT_SELECT,
            });
            await recordPackEvent(tx, {
                organizationId: ctx.organizationId,
                packId: created.id,
                kind: "CREATED",
                actor: packActor(ctx),
                details: diffPack(null, columnValues(made)),
            });
            return created.id;
        });
        return this.readPack(ctx.organizationId, id);
    }

    async updatePack(
        ctx: OrganizationContext,
        id: string,
        dto: PackInputDto,
    ): Promise<PackView> {
        requireBookingPower(ctx, "pack:write");
        await this.readPack(ctx.organizationId, id);
        assertValidity(dto.validityDays);
        const serviceIds = dto.serviceIds
            ? await this.assertServices(ctx.organizationId, dto.serviceIds)
            : undefined;
        if (serviceIds?.length === 0) {
            fieldError("Choose the classes it pays for", "serviceIds");
        }

        await prisma.$transaction(async (tx) => {
            // A draft is edited only through its revision-checked autosave
            // (E14); this whole-pack PATCH is the old form's, which never
            // saw a draft. A change here moves the revision, so a Pack
            // Editor open on the pack is told who changed it.
            await this.lockOutOfDraft(
                tx,
                ctx.organizationId,
                id,
                "This pack is a draft. Change it in the pack editor.",
            );
            const beforeRow = await tx.classPack.findUniqueOrThrow({
                where: { id },
                select: PACK_DRAFT_SELECT,
            });
            // The kind is locked once sold (E13): every holder bought it for
            // one kind of booking.
            if (
                dto.kind !== undefined &&
                dto.kind !== readPackKind(beforeRow.kind) &&
                (await timesSold(tx, ctx.organizationId, id)) > 0
            ) {
                refuseKindChange();
            }
            await tx.classPack.updateMany({
                where: { id, organizationId: ctx.organizationId },
                data: {
                    ...revised(ctx),
                    ...(dto.name !== undefined ? { name: dto.name } : {}),
                    ...(dto.description !== undefined
                        ? { description: dto.description }
                        : {}),
                    ...(dto.credits !== undefined
                        ? { credits: dto.credits }
                        : {}),
                    ...(dto.validityDays !== undefined
                        ? { validityDays: dto.validityDays }
                        : {}),
                    ...(dto.price !== undefined
                        ? { price: fromCents(toCents(dto.price)) }
                        : {}),
                    ...(dto.currency !== undefined
                        ? { currency: dto.currency }
                        : {}),
                    ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
                    ...(dto.firstPackOnly !== undefined
                        ? { firstPackOnly: dto.firstPackOnly }
                        : {}),
                },
            });
            if (serviceIds) {
                // Replaced as a whole. Packs already sold follow the pack's
                // current services: a class the business stops covering is
                // not one a holder can book with.
                await tx.classPackService.deleteMany({ where: { packId: id } });
                await tx.classPackService.createMany({
                    data: serviceIds.map((serviceId) => ({
                        packId: id,
                        serviceId,
                        organizationId: ctx.organizationId,
                    })),
                });
            }
            // One CHANGED event with what differs (E13); none if nothing did.
            const afterRow = await tx.classPack.findUniqueOrThrow({
                where: { id },
                select: PACK_DRAFT_SELECT,
            });
            await recordPackChange(tx, {
                organizationId: ctx.organizationId,
                packId: id,
                actor: packActor(ctx),
                before: columnValues(beforeRow),
                after: columnValues(afterRow),
            });
        });
        return this.readPack(ctx.organizationId, id);
    }

    /**
     * Archived packs are not sold; everyone holding one carries on using it.
     * A draft is neither archived nor sold again: it goes on sale only by
     * being published (E14), and is deleted rather than archived.
     */
    async setPackStatus(
        ctx: OrganizationContext,
        id: string,
        status: "ACTIVE" | "ARCHIVED",
    ): Promise<PackView> {
        requireBookingPower(ctx, "pack:write");
        await this.readPack(ctx.organizationId, id);
        await prisma.$transaction(async (tx) => {
            const was = await this.lockOutOfDraft(
                tx,
                ctx.organizationId,
                id,
                "This pack is a draft. Publish it, or delete the draft.",
            );
            if (was === status) return;
            await tx.classPack.updateMany({
                where: { id, organizationId: ctx.organizationId },
                data: { status, ...revised(ctx) },
            });
            await recordPackEvent(tx, {
                organizationId: ctx.organizationId,
                packId: id,
                kind: status === "ARCHIVED" ? "ARCHIVED" : "RESTORED",
                actor: packActor(ctx),
            });
        });
        return this.readPack(ctx.organizationId, id);
    }

    // — Drafts (E14): the Pack Editor's read and writes ——————————————
    // Each write answers with the pack as the editor reads it; a stale
    // `revision` is a 409 naming who saved since, and writes nothing.

    /** A pack as the editor reads it: values, what's live, the revision. */
    async getPackEditor(
        ctx: OrganizationContext,
        id: string,
    ): Promise<PackEditorView> {
        requireBookingPower(ctx, "pack:read");
        return readPackEditor(ctx.organizationId, id);
    }

    /** The editor's first save of a new pack: a DRAFT nobody can buy. */
    async createPackDraft(
        ctx: OrganizationContext,
        dto: PackInputDto,
    ): Promise<PackEditorView> {
        requireBookingPower(ctx, "pack:write");
        const id = await createPackDraft(ctx, dto);
        return readPackEditor(ctx.organizationId, id);
    }

    /** Autosave: a draft's fields, or a live pack's unpublished changes. */
    async savePackDraft(
        ctx: OrganizationContext,
        id: string,
        dto: PackDraftDto,
    ): Promise<PackEditorView> {
        requireBookingPower(ctx, "pack:write");
        await savePackDraft(ctx, id, dto);
        return readPackEditor(ctx.organizationId, id);
    }

    /** Put a draft on sale, or make a live pack's changes its terms. */
    async publishPack(
        ctx: OrganizationContext,
        id: string,
        revision: number,
    ): Promise<PackEditorView> {
        requireBookingPower(ctx, "pack:write");
        await publishPack(ctx, id, revision);
        return readPackEditor(ctx.organizationId, id);
    }

    /** Drop a live pack's unpublished changes. */
    async discardPackChanges(
        ctx: OrganizationContext,
        id: string,
        revision: number,
    ): Promise<PackEditorView> {
        requireBookingPower(ctx, "pack:write");
        await discardPackChanges(ctx, id, revision);
        return readPackEditor(ctx.organizationId, id);
    }

    /** Delete a draft nobody has bought. */
    async deletePackDraft(
        ctx: OrganizationContext,
        id: string,
        revision: number,
    ): Promise<void> {
        requireBookingPower(ctx, "pack:write");
        await deletePackDraft(ctx, id, revision);
    }

    // — Purchases ——————————————————————————————————————————————————

    /**
     * Sell a pack to a contact. The purchase keeps the pack's classes, price
     * and validity as they are now; it expires that many days from today.
     * How the desk was paid is recorded when given (E13), and a "first pack
     * only" pack is refused (409) to someone who has had a pack of its kind.
     */
    async sell(
        ctx: OrganizationContext,
        packId: string,
        dto: SellPackDto,
    ): Promise<PurchaseView> {
        requireBookingPower(ctx, "pack:sell");
        const organizationId = ctx.organizationId;
        // Switched off: no new sales, whatever enforcement says (E12).
        await assertClassPacksOn(prisma, organizationId);
        const [found, contact] = await Promise.all([
            prisma.classPack.findFirst({
                where: { id: packId, organizationId },
                select: { id: true, status: true },
            }),
            prisma.contact.findFirst({
                where: { id: dto.contactId, organizationId },
                select: { id: true },
            }),
        ]);
        if (!found) notFound("Class pack");
        if (!contact) notFound("Contact", "contactId");
        // A draft isn't published yet, an archived pack isn't sold (E14).
        assertPackOnSale(found);
        // Its invoice still to be paid is refused without the business
        // details; money the desk has already taken is recorded, and Home
        // asks for them (DEC-068).
        if (
            !paidAlready(dto.paidBy) &&
            (await paymentsOn(prisma, organizationId))
        ) {
            await assertBusinessDetails(prisma, organizationId);
        }

        const id = await prisma.$transaction(async (tx) => {
            // The published terms, held FOR SHARE for the sale: a publish or
            // a kind change (FOR NO KEY UPDATE) waits for it, so a pack is
            // never sold on half-published terms, nor has its kind changed
            // by a save that counted no sales while this one was committing.
            await tx.$queryRaw`SELECT id FROM "ClassPack" WHERE id = ${found.id} AND "organizationId" = ${organizationId} FOR SHARE`;
            const pack = await tx.classPack.findFirst({
                where: { id: found.id, organizationId },
            });
            if (!pack) notFound("Class pack");
            assertPackOnSale(pack);
            const price = toMoneyString(pack.price);
            // Merged since the page loaded (C9)? Sell to the survivor.
            const buyer = await resolveContact(tx, contact.id, organizationId);
            if (!buyer || buyer.removed) notFound("Contact", "contactId");
            await assertFirstPackAllowed(tx, {
                organizationId,
                contactId: buyer.id,
                pack,
            });
            const paidBy = dto.paidBy ?? null;
            const purchase = await tx.packPurchase.create({
                data: {
                    organizationId,
                    packId: pack.id,
                    contactId: buyer.id,
                    credits: pack.credits,
                    price,
                    currency: pack.currency,
                    expiresAt: new Date(
                        Date.now() + pack.validityDays * DAY_MS,
                    ),
                    createdByUserId: ctx.userId,
                    paidBy,
                },
                select: { id: true },
            });
            if (await paymentsOn(tx, organizationId)) {
                const unit =
                    readPackKind(pack.kind) === "ONE_TO_ONE"
                        ? pack.credits === 1
                            ? "session"
                            : "sessions"
                        : pack.credits === 1
                          ? "class"
                          : "classes";
                await this.invoices.issueInTx(tx, organizationId, {
                    contactId: buyer.id,
                    currency: pack.currency,
                    lines: [
                        {
                            description: `${pack.name} · ${pack.credits} ${unit}`,
                            quantity: 1,
                            unitPrice: price,
                        },
                    ],
                    source: "PACK",
                    packPurchaseId: purchase.id,
                    createdByUserId: ctx.userId,
                });
            }
            await recordPackEvent(tx, {
                organizationId,
                packId: pack.id,
                purchaseId: purchase.id,
                kind: "SOLD",
                actor: packActor(ctx),
                details: {
                    price,
                    currency: pack.currency,
                    credits: pack.credits,
                    paidBy,
                },
            });
            return purchase.id;
        });
        return this.readPurchase(ctx, id);
    }

    // — Pack Detail's reads and Extend (E13) ——————————————————————————

    /** Everyone who has bought it, live purchases first (Who has it). */
    async listHolders(
        ctx: OrganizationContext,
        packId: string,
    ): Promise<PackHolderView[]> {
        requireBookingPower(ctx, "pack:read");
        await this.assertPack(ctx.organizationId, packId);
        return packHolders(ctx.organizationId, { packId });
    }

    /** Classes spent from it in a range, this week by default (Used). */
    async listUsed(
        ctx: OrganizationContext,
        packId: string,
        query: PackUsedQueryDto,
    ): Promise<PackUsedPage> {
        requireBookingPower(ctx, "pack:read");
        await this.assertPack(ctx.organizationId, packId);
        return packUsed(ctx.organizationId, packId, query);
    }

    /** Every sale, newest first, with its method and who sold it (Sales). */
    async listSales(
        ctx: OrganizationContext,
        packId: string,
    ): Promise<PackSaleView[]> {
        requireBookingPower(ctx, "pack:read");
        await this.assertPack(ctx.organizationId, packId);
        return packSales(ctx, packId);
    }

    /** Its history, newest first, paged (Activity). */
    async listEvents(
        ctx: OrganizationContext,
        packId: string,
        query: ListPackEventsQueryDto,
    ): Promise<PackEventsPage> {
        requireBookingPower(ctx, "pack:read");
        await this.assertPack(ctx.organizationId, packId);
        return listPackEvents(ctx.organizationId, packId, query);
    }

    /**
     * Give a holder's pack more days: at most 30 at a time, with a reason
     * (default 46). Answers the holder as Who has it shows them.
     */
    async extend(
        ctx: OrganizationContext,
        purchaseId: string,
        dto: ExtendPurchaseDto,
    ): Promise<PackHolderView> {
        requireBookingPower(ctx, "pack:write");
        await extendPurchase(ctx, purchaseId, dto);
        const [holder] = await packHolders(ctx.organizationId, {
            purchaseId,
        });
        return holder;
    }

    async listPurchases(
        ctx: OrganizationContext,
        query: ListPurchasesQueryDto,
    ): Promise<PurchaseView[]> {
        requireBookingPower(ctx, "pack:read");
        // Only packs that pay for this service: they cover it and are of its
        // kind (E13) — a one-to-one pack isn't offered for a class. Another
        // business's service id, or one that's gone, matches nothing.
        let forService: Prisma.PackPurchaseWhereInput = {};
        if (query.serviceId) {
            const service = await prisma.service.findFirst({
                where: {
                    id: query.serviceId,
                    organizationId: ctx.organizationId,
                },
                select: { id: true, capacity: true },
            });
            forService = service
                ? purchasesPayingFor(service)
                : { id: { in: [] } };
        }
        const rows = await prisma.packPurchase.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.contactId ? { contactId: query.contactId } : {}),
                ...(query.packId ? { packId: query.packId } : {}),
                ...forService,
            },
            orderBy: { createdAt: "desc" },
            take: LIST_LIMIT,
            select: PURCHASE_SELECT,
        });
        const now = new Date();
        return rows.map((r) => this.purchaseView(r, now, ctx));
    }

    async getPurchase(
        ctx: OrganizationContext,
        id: string,
    ): Promise<PurchaseView> {
        requireBookingPower(ctx, "pack:read");
        return this.readPurchase(ctx, id);
    }

    // — Using a pack on a booking ——————————————————————————————————

    /**
     * Pay a booking already made with one of its booker's packs. Needs both
     * `pack:sell` (the desk's pack power, E26) and `booking:write`: it
     * spends a class and changes what the booking says about payment.
     */
    async useOnBooking(
        ctx: OrganizationContext,
        bookingId: string,
        dto: UsePackDto,
    ): Promise<{ bookingId: string; purchase: PurchaseView }> {
        requireBookingPower(ctx, "pack:sell", CANT_USE_PACKS);
        requireBookingPower(ctx, "booking:write");
        const booking = await prisma.booking.findFirst({
            where: { id: bookingId, organizationId: ctx.organizationId },
            select: {
                id: true,
                status: true,
                contactId: true,
                serviceId: true,
                startAt: true,
            },
        });
        if (!booking) notFound("Booking");
        if (booking.status !== "CONFIRMED") {
            throw new ConflictException(
                "Only a confirmed booking can be paid with a class pack.",
            );
        }
        if (!booking.contactId) {
            throw new ConflictException(
                "This booking is not linked to a contact, so it has no packs to use.",
            );
        }
        const { contactId } = booking;

        // Serializable, like booking with a pack: two spends of the same
        // pack's last class — one here, one from booking — must not both
        // commit, and Postgres only catches that between serializable
        // transactions. The booking is locked too, so a cancel racing this
        // cannot leave a class spent on a cancelled booking. A lost race is
        // tried once more, so the answer says what is true now — usually
        // that the class has gone.
        const spend = () =>
            prisma.$transaction(
                async (tx) => {
                    const [locked] = await tx.$queryRaw<
                        ({ status: string } | undefined)[]
                    >`SELECT status FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
                    if (locked?.status !== "CONFIRMED") {
                        throw new ConflictException(
                            "Only a confirmed booking can be paid with a class pack.",
                        );
                    }
                    return redeemPackInTx(tx, {
                        organizationId: ctx.organizationId,
                        bookingId: booking.id,
                        contactId,
                        serviceId: booking.serviceId,
                        startAt: booking.startAt,
                        purchaseId: dto.packPurchaseId,
                    });
                },
                {
                    isolationLevel:
                        PrismaNamespace.TransactionIsolationLevel.Serializable,
                },
            );
        const code = prismaErrorCode;
        let purchaseId: string;
        try {
            try {
                ({ purchaseId } = await spend());
            } catch (err) {
                if (code(err) !== "P2034") throw err;
                ({ purchaseId } = await spend());
            }
        } catch (err) {
            // P2034 twice over, or P2002: another pack went on this booking
            // at the same moment.
            if (code(err) === "P2034" || code(err) === "P2002") {
                throw new ConflictException(
                    "That changed while you were paying. Refresh and try again.",
                );
            }
            throw err;
        }
        return {
            bookingId: booking.id,
            purchase: await this.readPurchase(ctx, purchaseId),
        };
    }

    /** Take a pack off a booking and give its class back. */
    async removeFromBooking(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<{ bookingId: string; returned: boolean }> {
        requireBookingPower(ctx, "pack:sell", CANT_USE_PACKS);
        requireBookingPower(ctx, "booking:write");
        const booking = await prisma.booking.findFirst({
            where: { id: bookingId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!booking) notFound("Booking");
        const returned = await prisma.$transaction(async (tx) => {
            const back = await reversePackInTx(tx, booking.id);
            // No longer paid with a pack, so it no longer says so (U3).
            if (back) {
                await tx.booking.updateMany({
                    where: { id: booking.id, paidWith: "PACK" },
                    data: { paidWith: null },
                });
            }
            return back;
        });
        return { bookingId: booking.id, returned };
    }

    // — internals —————————————————————————————————————————————————

    /**
     * Take the pack's row lock, and refuse a draft with `message` (409): the
     * old whole-pack writes never see one. Answers the status it had.
     */
    private async lockOutOfDraft(
        tx: Prisma.TransactionClient,
        organizationId: string,
        id: string,
        message: string,
    ): Promise<string> {
        await lockPack(tx, organizationId, id);
        const row = await tx.classPack.findFirst({
            where: { id, organizationId },
            select: { status: true },
        });
        if (!row) notFound("Class pack");
        if (row.status === PACK_DRAFT) {
            throw new ConflictException({
                message,
                details: { field: "status" },
            });
        }
        return row.status;
    }

    /** Every service id from the client belongs to this business, or it is a 404. */
    private async assertServices(
        organizationId: string,
        ids: string[],
    ): Promise<string[]> {
        const unique = [...new Set(ids)];
        const found = await prisma.service.count({
            where: { id: { in: unique }, organizationId, deletedAt: null },
        });
        if (found !== unique.length) {
            throw new NotFoundException({
                message: "One of those services was not found",
                details: { field: "serviceIds" },
            });
        }
        return unique;
    }

    private async readPack(
        organizationId: string,
        id: string,
    ): Promise<PackView> {
        const row = await prisma.classPack.findFirst({
            where: { id, organizationId },
            include: PACK_INCLUDE,
        });
        if (!row) notFound("Class pack");
        const holders = await packCounts(organizationId, [id]);
        return this.packView(row, holders.get(id));
    }

    /** The pack is this business's, or it is a 404. */
    private async assertPack(
        organizationId: string,
        id: string,
    ): Promise<void> {
        const row = await prisma.classPack.findFirst({
            where: { id, organizationId },
            select: { id: true },
        });
        if (!row) notFound("Class pack");
    }

    private async readPurchase(
        ctx: OrganizationContext,
        id: string,
    ): Promise<PurchaseView> {
        const row = await prisma.packPurchase.findFirst({
            where: { id, organizationId: ctx.organizationId },
            select: PURCHASE_SELECT,
        });
        if (!row) notFound("Class pack purchase");
        return this.purchaseView(row, new Date(), ctx);
    }

    private packView(
        row: {
            id: string;
            name: string;
            description: string | null;
            credits: number;
            validityDays: number;
            price: { toString(): string };
            currency: string;
            status: string;
            createdAt: Date;
            services: { service: { id: string; name: string } }[];
            pendingChanges?: unknown;
            pendingChangedAt?: Date | null;
            kind: string;
            firstPackOnly: boolean;
        },
        holders: PackCounts | undefined,
    ): PackView {
        const pending =
            row.status !== PACK_DRAFT &&
            readPending(PACK_DRAFT_FIELDS, row.pendingChanges) !== null;
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            credits: row.credits,
            validityDays: row.validityDays,
            price: toMoneyString(row.price),
            currency: row.currency,
            status: row.status,
            services: row.services.map((s) => s.service),
            sold: holders?.sold ?? 0,
            activeHolders: holders?.active ?? 0,
            creditsLeft: holders?.creditsLeft ?? 0,
            people: holders?.people ?? 0,
            takings: holders?.takings ?? [],
            hasPendingChanges: pending,
            pendingChangedAt:
                row.status === PACK_DRAFT || pending
                    ? (row.pendingChangedAt?.toISOString() ?? null)
                    : null,
            createdAt: row.createdAt.toISOString(),
            kind: readPackKind(row.kind),
            firstPackOnly: row.firstPackOnly,
        };
    }

    /**
     * Someone who may see packs but not invoices is not handed the invoice
     * id — its page would not open for them.
     */
    private purchaseView(
        row: PurchaseRow,
        now: Date,
        ctx: OrganizationContext,
    ): PurchaseView {
        const used = row._count.redemptions;
        const left = Math.max(0, row.credits - used);
        const standing = standingOf({ expiresAt: row.expiresAt, left }, now);
        return {
            id: row.id,
            pack: row.pack,
            contact: {
                id: row.contact.id,
                name: contactName(row.contact),
                email: row.contact.email,
            },
            credits: row.credits,
            used,
            left,
            standing,
            price: toMoneyString(row.price),
            currency: row.currency,
            expiresAt: row.expiresAt.toISOString(),
            invoiceId: allows(ctx, "invoice:read")
                ? (row.invoices[0]?.id ?? null)
                : null,
            createdAt: row.createdAt.toISOString(),
            paidBy: (row.paidBy as PackPaidBy | null) ?? null,
        };
    }
}
