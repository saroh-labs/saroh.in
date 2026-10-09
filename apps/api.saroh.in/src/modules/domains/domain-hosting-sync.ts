import { Logger } from "@nestjs/common";
import type { Domain } from "@saroh/database";
import { prisma } from "@saroh/database";

import type {
    DomainHosting,
    HostedHostname,
    HostedProblem,
} from "./domain-hosting";
import { HostingCallError, hostingCnameTarget } from "./domain-hosting";

/**
 * Keeping a verified domain registered with the host (#859), and the
 * hosting state the workspace reads.
 *
 * The rule: hosting never undoes verification. A failed call leaves the row
 * VERIFIED and records what failed in words (`hostingError`), with
 * `hostingStatus` REGISTER_FAILED when nothing is registered yet; the next
 * check (`DomainsService.verify` on a VERIFIED domain) runs this again.
 */

/** What `Domain.hostingStatus` holds. */
export type HostingStatus = "PENDING" | "ACTIVE" | "FAILED" | "REGISTER_FAILED";

/**
 * The hosting state of one domain, as the workspace's screen reads it
 * (#861 builds its states from `state`):
 * - OFF: hosting isn't set up on this instance; the domain can still verify.
 * - WAITING_VERIFICATION: the TXT check hasn't passed yet.
 * - NOT_POINTED: verified and registered (or about to be), waiting for the
 *   CNAME and the certificate.
 * - LIVE: serving the site.
 * - PROBLEM: registering failed, or the host reports a problem; `problem`
 *   says what in words.
 */
export type HostingState =
    "OFF" | "WAITING_VERIFICATION" | "NOT_POINTED" | "LIVE" | "PROBLEM";

export interface DomainHostingView {
    state: HostingState;
    /** What last went wrong, in the merchant's words; null when nothing did. */
    problem: string | null;
    /** When the host was last asked. */
    checkedAt: Date | null;
    /** The record to add so the domain reaches the site, when we know it. */
    dnsRecord: { type: "CNAME"; name: string; value: string } | null;
}

export const HOSTING_WORDS = {
    unreachable:
        "We couldn't reach our hosting provider to connect this domain. We'll try again the next time you check.",
    refused:
        "Our hosting provider didn't accept this domain. Check it's spelled right, or contact support.",
    blocked:
        "Our hosting provider blocked this domain. Contact support and we'll look into it.",
    certificate:
        "The secure certificate for this domain couldn't be issued. Check the CNAME record points to Saroh, then check again.",
    checkFailed:
        "We couldn't check this domain with our hosting provider just now. We'll try again the next time you check.",
} as const;

const PROBLEM_WORDS: Record<HostedProblem, string> = {
    BLOCKED: HOSTING_WORDS.blocked,
    CERTIFICATE: HOSTING_WORDS.certificate,
};

const logger = new Logger("DomainHosting");

/**
 * Register a VERIFIED domain with the host, or refresh its standing when it
 * already is. Never throws for a host failure: the failure is written on the
 * row and returned. Returns the row as it now stands.
 */
export async function syncHosting(
    hosting: DomainHosting | null,
    domain: Domain,
): Promise<Domain> {
    if (domain.status !== "VERIFIED") return domain;
    if (!hosting) {
        // Degraded path: one line per verified domain checked while hosting
        // is off. Any volume on a deployed API means custom domains verify
        // and then never serve.
        logger.warn(
            `domain_hosting_off_verified domain=${domain.id} org=${domain.organizationId}`,
        );
        return domain;
    }

    const checkedAt = new Date();
    try {
        let hosted: HostedHostname | null = domain.hostingId
            ? await hosting.status(domain.hostingId)
            : null;
        // Not registered yet, or the host no longer has it (removed by hand,
        // or the instance moved zones): register it (again).
        hosted ??= await hosting.register(domain.hostname);
        if (hosted.id !== domain.hostingId) {
            logger.log(
                `domain_hosting_registered domain=${domain.id} hostingId=${hosted.id}`,
            );
        }
        return await prisma.domain.update({
            where: { id: domain.id },
            data: {
                hostingId: hosted.id,
                hostingStatus: hosted.state satisfies HostingStatus,
                hostingError: hosted.problem
                    ? PROBLEM_WORDS[hosted.problem]
                    : null,
                hostingCheckedAt: checkedAt,
            },
        });
    } catch (err) {
        if (!(err instanceof HostingCallError)) throw err;
        const registering = !domain.hostingId;
        logger.warn(
            `domain_hosting_call_failed domain=${domain.id} step=${registering ? "register" : "status"} ${err.message}`,
        );
        return prisma.domain.update({
            where: { id: domain.id },
            data: registering
                ? {
                      hostingStatus: "REGISTER_FAILED" satisfies HostingStatus,
                      hostingError:
                          err.kind === "REFUSED"
                              ? HOSTING_WORDS.refused
                              : HOSTING_WORDS.unreachable,
                      hostingCheckedAt: checkedAt,
                  }
                : // Registered already: keep its last known standing and
                  // say the check didn't happen.
                  {
                      hostingError: HOSTING_WORDS.checkFailed,
                      hostingCheckedAt: checkedAt,
                  },
        });
    }
}

/** The hosting state of a domain row (pure; exported for tests). */
export function hostingView(
    domain: Pick<
        Domain,
        | "hostname"
        | "status"
        | "hostingStatus"
        | "hostingError"
        | "hostingCheckedAt"
    >,
    hostingOn: boolean,
): DomainHostingView {
    const target = hostingCnameTarget();
    const dnsRecord =
        hostingOn && target
            ? { type: "CNAME" as const, name: domain.hostname, value: target }
            : null;
    const base = {
        problem: hostingOn ? domain.hostingError : null,
        checkedAt: hostingOn ? domain.hostingCheckedAt : null,
        dnsRecord,
    };
    if (!hostingOn) return { state: "OFF", ...base };
    if (domain.status !== "VERIFIED") {
        return { state: "WAITING_VERIFICATION", ...base };
    }
    switch (domain.hostingStatus as HostingStatus | null) {
        case "ACTIVE":
            return { state: "LIVE", ...base };
        case "FAILED":
        case "REGISTER_FAILED":
            return { state: "PROBLEM", ...base };
        default:
            return { state: "NOT_POINTED", ...base };
    }
}
