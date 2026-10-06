import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import { env } from "../../env";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { planMeter } from "../billing/metering.service";
import {
    limitLevel,
    nextMonthStarts,
} from "../billing/plan-limit-notice.handler";
import { businessTimezone } from "../bookings/staff-availability";
import {
    cleanBusinessName,
    codeSenderName,
} from "../site-accounts/sender-name";
import {
    replyToAddress,
    SAROH_BUSINESS_FROM_DEFAULT,
} from "./providers/saroh-email.sender";
import { SAROH_EMAILS_ROW } from "./saroh-delivery";
import type { SarohDeps } from "./saroh-may-send";
import {
    allowanceLimit,
    defaultSarohDeps,
    sarohRefusal,
} from "./saroh-may-send";

/**
 * What Settings → Providers says about Saroh sending a business's booking
 * emails (DEC-086, U4), worked out by the same rule as the send
 * (`sarohRefusal`) and the same count as the allowance, so the screen never
 * says Saroh sends when it doesn't, or the reverse.
 *
 * - OFF: Saroh doesn't send them (a provider of its own is connected, the
 *   route is off for it, its plan gives Saroh's emails no allowance, the
 *   global stop or the platform's ceiling). The screen shows nothing new.
 *   `takesOver` says whether, with its own email connected, disconnecting
 *   it would hand the booking emails to Saroh — for the Disconnect warning.
 * - SENDING / NEAR (80% of the month's allowance used) / PAUSED (all of it):
 *   the month's count, the cap, the day it starts again, and who the email
 *   comes from and where replies go.
 * - UNREAD: a lookup failed, so nothing can be said either way — never a
 *   zero.
 */
export interface SarohSender {
    /** "‹Business› via Saroh". */
    name: string;
    /** `bookings@notify.saroh.in`. */
    address: string;
}

export type SarohEmailState =
    | { state: "OFF"; takesOver: boolean }
    | {
          state: "SENDING" | "NEAR" | "PAUSED";
          used: number;
          cap: number;
          /** The day the business's month starts again, "1 Nov". */
          resetsOn: string;
          sender: SarohSender;
          /** Where a customer's reply goes; null when no clean contact email. */
          replyTo: string | null;
      }
    | { state: "UNREAD" };

/** What the state reads about the business beyond the rule. */
export interface SarohBusinessFacts {
    name: string;
    slug: string;
    contactEmail: string | null;
    zone: string;
}

export interface SarohStateDeps extends SarohDeps {
    business: (organizationId: string) => Promise<SarohBusinessFacts>;
}

const catalogue = new CatalogueAccessService();

/**
 * The business's `saroh-emails` row, read as `enforcedRow` reads it but
 * letting a failed lookup throw: the send folds a failure into "no
 * allowance" (fail closed), while this screen must say it couldn't read it
 * rather than look as if Saroh is simply off.
 */
async function allowanceOrThrow(
    organizationId: string,
    now: Date,
): Promise<ModuleAccess | null> {
    if (!(await planMeter.enforcing(organizationId))) return null;
    const a = await catalogue.resolve(organizationId, now);
    if (a.source !== "catalogue") return null;
    return a.modules.find((m) => m.moduleId === SAROH_EMAILS_ROW) ?? null;
}

async function businessFacts(
    organizationId: string,
): Promise<SarohBusinessFacts> {
    const [org, profile, zone] = await Promise.all([
        prisma.organization.findUnique({
            where: { id: organizationId },
            select: { name: true, slug: true },
        }),
        prisma.businessProfile.findUnique({
            where: { organizationId },
            select: { contactEmail: true },
        }),
        businessTimezone(prisma, organizationId),
    ]);
    return {
        name: org?.name ?? "",
        slug: org?.slug ?? "Saroh",
        contactEmail: profile?.contactEmail ?? null,
        zone,
    };
}

export const defaultSarohStateDeps: SarohStateDeps = {
    ...defaultSarohDeps,
    allowance: allowanceOrThrow,
    business: businessFacts,
};

type ProviderDb = Parameters<typeof sarohRefusal>[0];

/** The rule's provider read, answered "none": Saroh's route as if disconnected. */
const NO_PROVIDER = {
    communicationProvider: { findUnique: () => Promise.resolve(null) },
} as unknown as ProviderDb;

/** The booking notices all read alike; one stands for them. */
const BOOKING = "BOOKING_CONFIRMED";

export async function sarohEmailState(
    db: ProviderDb,
    organizationId: string,
    now: Date = new Date(),
    deps: SarohStateDeps = defaultSarohStateDeps,
): Promise<SarohEmailState> {
    const refusal = await sarohRefusal(db, organizationId, BOOKING, now, deps);
    if (refusal === "LOOKUP_FAILED") return { state: "UNREAD" };
    if (refusal === "PROVIDER_CONNECTED") {
        // Would Saroh take over if the business disconnected its own?
        const after = await sarohRefusal(
            NO_PROVIDER,
            organizationId,
            BOOKING,
            now,
            deps,
        );
        return { state: "OFF", takesOver: after === null };
    }
    if (refusal !== null) return { state: "OFF", takesOver: false };

    try {
        const cap = allowanceLimit(await deps.allowance(organizationId, now));
        // The row changed between the two reads: say nothing either way.
        if (cap === null) return { state: "UNREAD" };
        const [used, facts] = await Promise.all([
            deps.used(organizationId, now),
            deps.business(organizationId),
        ]);
        const level = limitLevel(used, cap);
        const name = cleanBusinessName(facts.name, facts.slug);
        return {
            state:
                level === "full" || level === "over"
                    ? "PAUSED"
                    : level === "warn"
                      ? "NEAR"
                      : "SENDING",
            used,
            cap,
            resetsOn: nextMonthStarts(now, facts.zone),
            sender: {
                name: codeSenderName(name),
                address:
                    env.SAROH_BUSINESS_EMAIL_FROM ??
                    SAROH_BUSINESS_FROM_DEFAULT,
            },
            replyTo: replyToAddress(facts.contactEmail),
        };
    } catch {
        return { state: "UNREAD" };
    }
}
