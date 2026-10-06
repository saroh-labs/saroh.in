import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
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
import { SAROH_REPRESENTATIVE_NOTICE } from "./saroh-delivery";
import type { SarohDeps } from "./saroh-may-send";
import {
    allowanceLimit,
    allowancePaused,
    defaultSarohDeps,
    sarohDecision,
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
    business: businessFacts,
};

type ProviderDb = Pick<Prisma.TransactionClient, "communicationProvider">;

export async function sarohEmailState(
    db: ProviderDb,
    organizationId: string,
    now: Date = new Date(),
    deps: SarohStateDeps = defaultSarohStateDeps,
): Promise<SarohEmailState> {
    // The same rule as the send, which reads the allowance's row for it: a
    // plan that can't be read is LOOKUP_FAILED, so UNREAD, never OFF.
    const decision = await sarohDecision(
        db,
        organizationId,
        SAROH_REPRESENTATIVE_NOTICE,
        now,
        deps,
    );
    const { refusal } = decision;
    if (refusal === "LOOKUP_FAILED") return { state: "UNREAD" };
    if (refusal === "PROVIDER_CONNECTED") {
        // Would Saroh take over if the business disconnected its own?
        const after = await sarohDecision(
            db,
            organizationId,
            SAROH_REPRESENTATIVE_NOTICE,
            now,
            deps,
            { providerConnected: false },
        );
        return { state: "OFF", takesOver: after.refusal === null };
    }
    if (refusal !== null) return { state: "OFF", takesOver: false };

    const cap = allowanceLimit(decision.allowance);
    // The rule said yes only with a cap; said again so the type knows it.
    if (cap === null) return { state: "UNREAD" };
    try {
        const [used, facts] = await Promise.all([
            deps.used(organizationId, now),
            deps.business(organizationId),
        ]);
        const name = cleanBusinessName(facts.name, facts.slug);
        return {
            state: allowancePaused(used, cap)
                ? "PAUSED"
                : limitLevel(used, cap) === "warn"
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
