import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { gstinProblem, stateCode } from "../invoices/gst-states";
import { normalisePublicPhone } from "../organizations/business-phone";
import { nonEmpty } from "./billing-details";
import { enqueueBillingProfileSync } from "./billing-profile-sync";
import { CATALOGUE_BILLING_PROVIDER } from "./provider-plan-sync.service";

/**
 * Billing profiles (DEC-167): who Saroh bills — a legal name, GSTIN,
 * billing address with its state, a billing email and a phone — owned by
 * the person who made it and used by any of their businesses. Each is one
 * customer at Saroh's billing provider, made and kept current by the
 * `billing.profile.sync` job queued with every save (`billing-customer.ts`).
 *
 * - **Only its owner** reads or changes a profile: every read and write
 *   here is filtered by the signed-in user, and another user's profile is
 *   a 404, as if it didn't exist (no RLS policy: the table isn't a
 *   business's, `rls-coverage.test.ts`).
 * - **One billing email per owner**, compared lower-case: Razorpay keeps
 *   one customer per email and phone, so two profiles sharing one could
 *   never both be customers. Asked before saving (a 409 with the plain
 *   message), and a save that loses a race to the database's unique index
 *   gets the same 409, not a 500.
 * - **An edit applies to every business on it** from its next invoice; the
 *   answer says how many there are, so the app can say so first.
 */

/** What a profile is made of, as the owner gives it. "" clears an optional field. */
export interface BillingProfileInput {
    legalName?: string;
    gstin?: string | null;
    gstState?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    billingEmail?: string;
    phone?: string | null;
}

/** A profile as its owner sees it, with how many businesses it bills. */
export interface BillingProfileView {
    id: string;
    legalName: string;
    gstin: string | null;
    gstState: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    billingEmail: string;
    phone: string | null;
    /** Businesses billed to it (not counting deleted ones). */
    businesses: number;
    createdAt: Date;
    updatedAt: Date;
}

/** The plain message for a billing email the owner already uses (R3). */
export const BILLING_EMAIL_TAKEN =
    "You already have a billing profile with this email. Use a different billing email for this one.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^\d{6}$/;

const VIEW_SELECT = {
    id: true,
    legalName: true,
    gstin: true,
    gstState: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    postalCode: true,
    billingEmail: true,
    phone: true,
    createdAt: true,
    updatedAt: true,
    _count: {
        select: { organizations: { where: { deletedRetainedAt: null } } },
    },
} as const;

type ViewRow = Prisma.BillingProfileGetPayload<{
    select: typeof VIEW_SELECT;
}>;

function view(row: ViewRow): BillingProfileView {
    const { _count, ...rest } = row;
    return { ...rest, businesses: _count.organizations };
}

function refuse(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

/** A billing email as kept: trimmed and lower-case. */
export function normaliseBillingEmail(raw: string): string {
    return raw.trim().toLowerCase();
}

type ProfileWrite = Omit<
    Prisma.BillingProfileUncheckedCreateInput,
    "ownerUserId" | "provider"
>;

/**
 * The columns a save writes, checked by field: what was sent, trimmed; ""
 * clears an optional one. `current` is the profile being edited, so a GSTIN
 * is checked against the state it will have.
 */
function profileWrite(
    input: BillingProfileInput,
    current: { gstState: string | null } | null,
): Partial<ProfileWrite> {
    const out: Partial<ProfileWrite> = {};
    if (input.legalName !== undefined) {
        const name = nonEmpty(input.legalName);
        if (!name) {
            refuse("Add the legal name Saroh's invoices go to.", "legalName");
        }
        if (name.length > 200) {
            refuse("Keep the legal name under 200 characters.", "legalName");
        }
        out.legalName = name;
    }
    if (input.billingEmail !== undefined) {
        const email = normaliseBillingEmail(input.billingEmail);
        if (!email) {
            refuse(
                "Add an email for Saroh's invoices and payment receipts.",
                "billingEmail",
            );
        }
        if (email.length > 254 || !EMAIL.test(email)) {
            refuse("That email doesn't look right.", "billingEmail");
        }
        out.billingEmail = email;
    }
    if (input.gstState !== undefined) {
        const raw = nonEmpty(input.gstState);
        const code = raw ? stateCode(raw) : null;
        if (raw && !code) {
            refuse("Choose the state of the billing address.", "gstState");
        }
        out.gstState = code;
    }
    if (input.gstin !== undefined) {
        const gstin = nonEmpty(input.gstin)?.toUpperCase() ?? null;
        if (gstin) {
            const state =
                out.gstState !== undefined
                    ? out.gstState
                    : (current?.gstState ?? null);
            const problem = gstinProblem(gstin, state);
            if (problem) refuse(problem, "gstin");
            // A GSTIN names its state: the address's, when none was given.
            if (!state) out.gstState = gstin.slice(0, 2);
        }
        out.gstin = gstin;
    }
    for (const [field, max] of [
        ["addressLine1", 120],
        ["addressLine2", 120],
        ["city", 60],
    ] as const) {
        const raw = input[field];
        if (raw === undefined) continue;
        const value = nonEmpty(raw);
        if (value && value.length > max) {
            refuse(`Keep this under ${max} characters.`, field);
        }
        out[field] = value;
    }
    if (input.postalCode !== undefined) {
        const pin = nonEmpty(input.postalCode)?.replace(/\s+/g, "") ?? null;
        if (pin && !PIN.test(pin)) {
            refuse("A PIN code is six digits, like 560038.", "postalCode");
        }
        out.postalCode = pin;
    }
    if (input.phone !== undefined) {
        const result = normalisePublicPhone(input.phone ?? "");
        if ("problem" in result) refuse(result.problem, "phone");
        out.phone = result.phone;
    }
    return out;
}

type ProfileTx = Pick<
    Prisma.TransactionClient,
    "billingProfile" | "job" | "organization"
>;

/** 409 when the owner already has another profile with this email. */
async function assertEmailFree(
    tx: Pick<Prisma.TransactionClient, "billingProfile">,
    ownerUserId: string,
    billingEmail: string,
    exceptId?: string,
): Promise<void> {
    const taken = await tx.billingProfile.findFirst({
        where: {
            ownerUserId,
            billingEmail,
            ...(exceptId ? { id: { not: exceptId } } : {}),
        },
        select: { id: true },
    });
    if (taken) throw emailTaken();
}

function emailTaken(): ConflictException {
    return new ConflictException({
        message: BILLING_EMAIL_TAKEN,
        details: { field: "billingEmail" },
    });
}

/**
 * A new profile for its owner, on the caller's transaction, with its sync
 * queued there (the outbox): a profile made with the business it is for
 * (creating a business, U4) is made, or not, with it. The email is asked
 * about first, so a taken one is refused before anything is written.
 */
export async function createBillingProfileInTx(
    tx: ProfileTx,
    ownerUserId: string,
    input: BillingProfileInput,
): Promise<{ id: string }> {
    const data = profileWrite(
        {
            ...input,
            legalName: input.legalName ?? "",
            billingEmail: input.billingEmail ?? "",
        },
        null,
    );
    const { legalName, billingEmail } = data;
    // Both required: an empty one was refused by its field above.
    if (legalName === undefined || billingEmail === undefined) {
        throw new Error("billing profile written without a name or email");
    }
    await assertEmailFree(tx, ownerUserId, billingEmail);
    const made = await tx.billingProfile.create({
        data: {
            ...data,
            legalName,
            billingEmail,
            ownerUserId,
            provider: CATALOGUE_BILLING_PROVIDER,
        },
        select: { id: true },
    });
    await enqueueBillingProfileSync(tx, made.id);
    return made;
}

/**
 * The first business's profile (R6, F1): made from the business's own
 * details — its legal name (else its name), its GSTIN while it says it is
 * GST-registered, its registered address, state and phone — billed to the
 * owner's sign-in email, and the business pointed at it. Idempotent: an
 * owner who already has a profile with that email gets it back (and the
 * business pointed at it only if it has none), with nothing new queued.
 * Null when there's no email to bill to. On the caller's transaction.
 */
export async function firstBillingProfileInTx(
    tx: ProfileTx & Pick<Prisma.TransactionClient, "user" | "businessProfile">,
    input: { ownerUserId: string; organizationId: string },
): Promise<string | null> {
    const [user, org, business] = await Promise.all([
        tx.user.findUnique({
            where: { id: input.ownerUserId },
            select: { email: true },
        }),
        tx.organization.findUnique({
            where: { id: input.organizationId },
            select: { name: true, billingProfileId: true },
        }),
        tx.businessProfile.findUnique({
            where: { organizationId: input.organizationId },
            select: {
                legalName: true,
                contactEmail: true,
                phone: true,
                taxId: true,
                gstRegistered: true,
                gstState: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                postalCode: true,
            },
        }),
    ]);
    if (!org) throw new NotFoundException("Business not found");
    const raw = nonEmpty(user?.email) ?? nonEmpty(business?.contactEmail);
    if (!raw) return null;
    const billingEmail = normaliseBillingEmail(raw);

    const point = async (billingProfileId: string) => {
        if (org.billingProfileId) return;
        await tx.organization.update({
            where: { id: input.organizationId },
            data: { billingProfileId },
        });
    };
    const existing = await tx.billingProfile.findUnique({
        where: {
            ownerUserId_billingEmail: {
                ownerUserId: input.ownerUserId,
                billingEmail,
            },
        },
        select: { id: true },
    });
    if (existing) {
        await point(existing.id);
        return existing.id;
    }
    const made = await tx.billingProfile.create({
        data: {
            ownerUserId: input.ownerUserId,
            legalName: nonEmpty(business?.legalName) ?? org.name,
            // As on Saroh's invoice until now: the GSTIN only while the
            // business says it is GST-registered.
            gstin: business?.gstRegistered
                ? (nonEmpty(business.taxId)?.toUpperCase() ?? null)
                : null,
            gstState: business?.gstState ?? null,
            addressLine1: nonEmpty(business?.addressLine1),
            addressLine2: nonEmpty(business?.addressLine2),
            city: nonEmpty(business?.city),
            postalCode: nonEmpty(business?.postalCode),
            billingEmail,
            phone: nonEmpty(business?.phone),
            provider: CATALOGUE_BILLING_PROVIDER,
        },
        select: { id: true },
    });
    await point(made.id);
    await enqueueBillingProfileSync(tx, made.id);
    return made.id;
}

@Injectable()
export class BillingProfilesService {
    private readonly logger = new Logger(BillingProfilesService.name);

    /** The signed-in user's profiles, oldest first. */
    async listMine(userId: string): Promise<BillingProfileView[]> {
        const rows = await prisma.billingProfile.findMany({
            where: { ownerUserId: userId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: VIEW_SELECT,
        });
        return rows.map(view);
    }

    /** One of the signed-in user's profiles; anyone else's is a 404. */
    async get(userId: string, id: string): Promise<BillingProfileView> {
        const row = await prisma.billingProfile.findFirst({
            where: { id, ownerUserId: userId },
            select: VIEW_SELECT,
        });
        if (!row) throw notFound();
        return view(row);
    }

    /** A new profile for the signed-in user; its customer is made by a job. */
    async create(
        userId: string,
        input: BillingProfileInput,
    ): Promise<BillingProfileView> {
        try {
            const made = await prisma.$transaction((tx) =>
                createBillingProfileInTx(tx, userId, input),
            );
            this.logger.log(
                `billing_profile_created profile=${made.id} owner=${userId}`,
            );
            return this.get(userId, made.id);
        } catch (error) {
            throw raceAsTaken(error);
        }
    }

    /**
     * Change one of the signed-in user's profiles. Applies to every
     * business on it from its next invoice; `businesses` says how many,
     * as the app says before saving (R9). Issued invoices keep what they
     * were issued with. The customer is brought up to date by a job.
     */
    async update(
        userId: string,
        id: string,
        input: BillingProfileInput,
    ): Promise<{ profile: BillingProfileView; businesses: number }> {
        try {
            await prisma.$transaction(async (tx) => {
                const current = await tx.billingProfile.findFirst({
                    where: { id, ownerUserId: userId },
                    select: { gstState: true },
                });
                if (!current) throw notFound();
                const data = profileWrite(input, current);
                if (Object.keys(data).length === 0) return;
                if (data.billingEmail) {
                    await assertEmailFree(tx, userId, data.billingEmail, id);
                }
                await tx.billingProfile.update({ where: { id }, data });
                await enqueueBillingProfileSync(tx, id);
            });
        } catch (error) {
            throw raceAsTaken(error);
        }
        const profile = await this.get(userId, id);
        this.logger.log(
            `billing_profile_updated profile=${id} businesses=${profile.businesses}`,
        );
        return { profile, businesses: profile.businesses };
    }
}

function notFound(): NotFoundException {
    return new NotFoundException("Billing profile not found");
}

/** A save that lost the race to the unique index: the same 409 as asked. */
function raceAsTaken(error: unknown): unknown {
    return prismaErrorCode(error) === "P2002" ? emailTaken() : error;
}
