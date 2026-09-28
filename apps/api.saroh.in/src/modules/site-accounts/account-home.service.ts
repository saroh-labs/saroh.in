import {
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { structuredLogger } from "../../common/logging/structured-logger";
import type { ModuleKey } from "../capabilities/module-registry";
import { MODULE_BY_KEY } from "../capabilities/module-registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { PublicInvoiceView } from "../payments/public-invoices.service";
import { invoicePaper } from "../payments/public-invoices.service";
import {
    readClasses,
    readLatestOrders,
    readNextBooking,
    readPlan,
} from "./account-home-reads";
import type { AccountOffers } from "./account-tabs";
import { accountTabs } from "./account-tabs";
import type { CustomerContext } from "./customer-context.decorator";
import type {
    AccountBooking,
    AccountClasses,
    AccountHome,
    AccountNote,
    AccountOrder,
    AccountPlan,
    AccountReceipt,
    AccountView,
    Block,
} from "./customer-view";
import { accountView, noteView, receiptView } from "./customer-view";
import type { AddNoteDto, UpdateDetailsDto } from "./dto";
import { unreadCount } from "./thread-store";

/**
 * The account area's reads and the customer's own changes to their details
 * (round-2 plan A, A5; ADR-011): Me, Home, receipts and health notes.
 *
 * Every read is scoped to the signed-in customer's business **and** contact
 * (`CustomerContext`, from `CustomerSessionGuard`), and runs in that
 * business's RLS context (`OrgRlsInterceptor`). A row of another customer,
 * even in the same business, is a 404 — never "not yours". Everything leaves
 * through `customer-view.ts`.
 *
 * Home reads each block on its own: a block whose read fails says so
 * (`{ ok: false }`) and never reads as zero or "none".
 */

/**
 * Whether a customer's health note can be sent (default 12): only once staff
 * can see and act on suggestions from customers (C12). Until then Me has no
 * "Add a health note" and the route is a 404. Open since A13: C12's staff
 * card names where each note came from ("from their account").
 */
export const CUSTOMER_NOTES_OPEN = Symbol("CUSTOMER_NOTES_OPEN");
export const CUSTOMER_NOTES_OPEN_DEFAULT = true;

/** A customer can have this many notes waiting for the team at once. */
export const MAX_WAITING_NOTES = 10;
/** The tag a note's first words make, as `ContactAttention.label` allows. */
const LABEL_MAX = 60;

const RECEIPT_ROWS = 20;
/** The newest notes the account lists; older ones stay on the record. */
export const NOTE_ROWS = 12;

type Ctx = Pick<CustomerContext, "organizationId" | "contactId" | "accountId">;

@Injectable()
export class AccountHomeService {
    private readonly flags = new FeatureFlagService();

    constructor(
        @Optional()
        @Inject(CUSTOMER_NOTES_OPEN)
        private readonly notesOpen: boolean = CUSTOMER_NOTES_OPEN_DEFAULT,
    ) {}

    // ---- Me --------------------------------------------------------------

    async me(ctx: Ctx): Promise<AccountView> {
        const account = await prisma.customerAccount.findFirst({
            where: {
                id: ctx.accountId,
                organizationId: ctx.organizationId,
                contactId: ctx.contactId,
            },
            select: {
                email: true,
                contact: {
                    select: { firstName: true, lastName: true, phone: true },
                },
                organization: { select: { name: true } },
            },
        });
        if (!account) throw new NotFoundException();
        const [offers, unreadMessages] = await Promise.all([
            this.offers(ctx),
            // The tab's dot (A13); a failed count never hides the account.
            unreadCount(
                prisma,
                ctx.organizationId,
                ctx.contactId,
                "customer",
            ).catch(() => 0),
        ]);
        return accountView({
            account,
            contact: account.contact,
            businessName: account.organization.name,
            tabs: accountTabs(offers),
            offers,
            bookingsLabel: offers.bookingsLabel,
            healthNotes: this.notesOpen,
            unreadMessages,
        });
    }

    /** Name and phone. The email changes only with a code (email-change). */
    async updateDetails(ctx: Ctx, dto: UpdateDetailsDto): Promise<AccountView> {
        const data: {
            firstName?: string | null;
            lastName?: string | null;
            phone?: string | null;
        } = {};
        if (dto.name !== undefined) {
            // The DTO refuses a blank name, so there is a first word.
            const [first, ...rest] = dto.name.split(/\s+/).filter(Boolean);
            data.firstName = first;
            data.lastName = rest.length ? rest.join(" ") : null;
        }
        if (dto.phone !== undefined)
            data.phone = dto.phone === "" ? null : dto.phone;
        if (Object.keys(data).length > 0) {
            const updated = await prisma.contact.updateMany({
                where: {
                    id: ctx.contactId,
                    organizationId: ctx.organizationId,
                },
                data,
            });
            if (updated.count === 0) throw new NotFoundException();
        }
        return this.me(ctx);
    }

    /**
     * What the business offers online, for the tab bar and Home's cards. A
     * module shows only when Saroh has rolled it out (DEC-057) and the
     * business has it on.
     */
    async offers(ctx: Ctx): Promise<AccountOffers> {
        const { organizationId, contactId } = ctx;
        const [appointments, orders, livePlans, ownPlan, classes] =
            await Promise.all([
                this.moduleOffered(organizationId, "APPOINTMENTS"),
                this.moduleOffered(organizationId, "COMMERCE"),
                prisma.subscriptionPlan.count({
                    where: { organizationId, status: "ACTIVE" },
                }),
                prisma.customerSubscription.count({
                    where: {
                        organizationId,
                        contactId,
                        status: { not: "CANCELLED" },
                    },
                }),
                prisma.service.count({
                    where: {
                        organizationId,
                        status: "ACTIVE",
                        capacity: { gt: 1 },
                    },
                }),
            ]);
        return {
            appointments,
            orders,
            plans: livePlans > 0 || ownPlan > 0,
            // Every business can be written to (A13).
            messages: true,
            bookingsLabel: classes > 0 ? "Bookings" : "Appointments",
        };
    }

    private async moduleOffered(
        organizationId: string,
        key: ModuleKey,
    ): Promise<boolean> {
        const descriptor = MODULE_BY_KEY.get(key);
        if (!descriptor) return false;
        const [rolledOut, installed] = await Promise.all([
            this.flags.isEnabled(descriptor.rolloutFlag, organizationId),
            prisma.organizationModule.findFirst({
                where: { organizationId, moduleKey: key, status: "ENABLED" },
                select: { id: true },
            }),
        ]);
        return rolledOut && installed !== null;
    }

    // ---- Home ------------------------------------------------------------

    async home(ctx: Ctx, now: Date = new Date()): Promise<AccountHome> {
        const offers = await this.offers(ctx);
        const [nextBooking, classes, orders, plan] = await Promise.all([
            offers.appointments
                ? block("next-booking", () => this.nextBooking(ctx, now))
                : Promise.resolve(null),
            block("classes", () => this.classes(ctx, now)),
            offers.orders
                ? block("orders", () => this.latestOrders(ctx))
                : Promise.resolve(null),
            block("plan", () => this.plan(ctx)),
        ]);
        return { nextBooking, classes, orders, plan };
    }

    /** The next confirmed booking from now on, or null. */
    nextBooking(ctx: Ctx, now: Date): Promise<AccountBooking | null> {
        return readNextBooking(ctx, now);
    }

    /** Classes left: the membership's month and live packs, or null. */
    classes(ctx: Ctx, now: Date): Promise<AccountClasses | null> {
        return readClasses(ctx, now);
    }

    /** The latest orders of the store customers linked to the contact. */
    latestOrders(ctx: Ctx): Promise<AccountOrder[]> {
        return readLatestOrders(ctx);
    }

    /** The customer's live membership, or null. */
    plan(ctx: Ctx): Promise<AccountPlan | null> {
        return readPlan(ctx);
    }

    // ---- Receipts --------------------------------------------------------

    /** Paid invoices billed to the customer, newest first. */
    async receipts(ctx: Ctx): Promise<AccountReceipt[]> {
        const rows = await prisma.invoice.findMany({
            where: {
                organizationId: ctx.organizationId,
                contactId: ctx.contactId,
                status: "PAID",
                number: { not: null },
            },
            orderBy: [{ paidAt: "desc" }, { issuedAt: "desc" }],
            take: RECEIPT_ROWS,
            select: {
                id: true,
                number: true,
                issuedAt: true,
                paidAt: true,
                total: true,
                currency: true,
            },
        });
        return rows.map(receiptView);
    }

    /**
     * One receipt as the pay link's paper shows it: the same allow-list
     * (`PublicInvoiceView`), for the customer's own paid invoice only.
     */
    async receipt(ctx: Ctx, invoiceId: string): Promise<PublicInvoiceView> {
        const own = await prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                organizationId: ctx.organizationId,
                contactId: ctx.contactId,
                status: "PAID",
                number: { not: null },
            },
            select: { id: true },
        });
        if (!own) throw new NotFoundException();
        return invoicePaper(ctx.organizationId, own.id);
    }

    // ---- Health notes (default 12) ---------------------------------------

    /** The notes this customer sent, and whether each is on their record. */
    async notes(ctx: Ctx): Promise<AccountNote[]> {
        if (!this.notesOpen) throw new NotFoundException();
        const rows = await prisma.contactAttention.findMany({
            where: {
                organizationId: ctx.organizationId,
                contactId: ctx.contactId,
                source: "CUSTOMER",
                removedAt: null,
            },
            orderBy: { createdAt: "desc" },
            take: NOTE_ROWS,
            select: {
                id: true,
                label: true,
                detail: true,
                status: true,
                createdAt: true,
            },
        });
        return rows.map(noteView);
    }

    /**
     * Send a note to the team. It arrives as a suggestion (SUGGESTED, source
     * CUSTOMER), sensitive, for staff to add to Needs attention or not (C1,
     * C12), like a booking page note. Add-only: the customer never edits
     * or removes what is on their record.
     */
    async addNote(ctx: Ctx, dto: AddNoteDto): Promise<AccountNote> {
        if (!this.notesOpen) throw new NotFoundException();
        const waiting = await prisma.contactAttention.count({
            where: {
                organizationId: ctx.organizationId,
                contactId: ctx.contactId,
                source: "CUSTOMER",
                status: "SUGGESTED",
                removedAt: null,
            },
        });
        if (waiting >= MAX_WAITING_NOTES) {
            throw new ConflictException({
                message:
                    "The team hasn't read your last notes yet. Try again once they have.",
                details: { reason: "too-many" },
            });
        }
        const row = await prisma.contactAttention.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: ctx.contactId,
                kind: "OTHER",
                label: noteLabel(dto.text),
                detail: dto.text,
                // A health note is the customer's own medical detail: only
                // those who may read sensitive entries see it.
                sensitive: true,
                source: "CUSTOMER",
                status: "SUGGESTED",
            },
            select: {
                id: true,
                label: true,
                detail: true,
                status: true,
                createdAt: true,
            },
        });
        return noteView(row);
    }
}

/** A note's first words, for its tag: at most 60 characters, on a word. */
export function noteLabel(text: string): string {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= LABEL_MAX) return clean;
    const cut = clean.slice(0, LABEL_MAX - 1);
    const space = cut.lastIndexOf(" ");
    return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Read one Home block on its own; a failure is logged and said, never zero. */
async function block<T>(
    name: string,
    read: () => Promise<T>,
): Promise<Block<T>> {
    try {
        return { ok: true, value: await read() };
    } catch (error) {
        structuredLogger.error("account_home_block_failed", {
            block: name,
            message: error instanceof Error ? error.message : String(error),
        });
        return { ok: false };
    }
}
