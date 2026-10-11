import { Logger } from "@nestjs/common";
import type { Domain } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { HostnameKind } from "./bare-domain";
import { hostnameShape, wwwOf } from "./bare-domain";
import type { BareDomainCheck, BareStatus } from "./bare-forwarding";
import { BARE_STATUSES } from "./bare-forwarding";

/**
 * A bare domain in the connect flow, and on a domain's read (DEC-140).
 *
 * - Which hostname a claim connects: a bare domain becomes its `www`,
 *   unless its DNS already reaches the hosting.
 * - What the check of a verified `www` domain records about its bare
 *   domain (`Domain.bareStatus`, `bareCheckedAt`).
 * - What the workspace reads: the hostname's kind, and for a `www`
 *   connection the bare domain's standing.
 *
 * The rule: the bare domain is a notice. Nothing here changes the `www`
 * domain's verification or hosting, and a look that fails changes nothing.
 */

const logger = new Logger("BareDomain");

/**
 * The hostname to connect for what was typed. A bare domain whose DNS
 * already reaches the hosting (an ALIAS, ANAME or flattened CNAME) is
 * kept as it is; any other bare domain is connected as `www.<domain>`,
 * because a CNAME record can't be relied on there. Everything else is
 * kept. Decided here from DNS, never from what the client says.
 *
 * `www.` always fits: a bare domain is one label and its suffix, far
 * short of a hostname's 253 characters.
 */
export async function hostnameToConnect(
    hostname: string,
    check: BareDomainCheck | null,
): Promise<string> {
    const shape = hostnameShape(hostname);
    if (shape.kind !== "bare") return hostname;
    if (check && (await check.pointsHere(hostname))) return hostname;
    return wwwOf(hostname);
}

/**
 * How long the background re-check may spend looking at bare domains.
 *
 * A look waits on a stranger's host, up to a few seconds when it never
 * answers, and a run of the `domains.recheck` chain checks up to 50
 * domains inside one job lease. So the background's looks share this much
 * time in any five minutes; past it they are skipped until the window
 * turns, and the domain's next check looks. "Check now" is one look a
 * person asked for, and is never skipped.
 */
export const BARE_LOOK_BUDGET_MS = 60_000;
export const BARE_LOOK_WINDOW_MS = 5 * 60_000;

export class BareLookBudget {
    private windowStart = 0;
    private spent = 0;

    constructor(
        private readonly limitMs: number = BARE_LOOK_BUDGET_MS,
        private readonly windowMs: number = BARE_LOOK_WINDOW_MS,
    ) {}

    /** Whether there is time left in the window `now` falls in. */
    has(now: number = Date.now()): boolean {
        if (now - this.windowStart >= this.windowMs) {
            this.windowStart = now;
            this.spent = 0;
        }
        return this.spent < this.limitMs;
    }

    spend(ms: number): void {
        this.spent += Math.max(0, ms);
    }
}

/**
 * Look at the bare domain of a VERIFIED `www` domain and record where it
 * stands. Returns the row as it now is. Any other domain, or the check
 * off, returns the row untouched. A look that throws is logged and leaves
 * the last standing. With a `budget` (the background re-check), a look is
 * skipped once the budget is spent, and the row keeps its last standing.
 */
export async function syncBareDomain(
    check: BareDomainCheck | null,
    domain: Domain,
    budget?: BareLookBudget,
): Promise<Domain> {
    if (!check || domain.status !== "VERIFIED") return domain;
    const shape = hostnameShape(domain.hostname);
    if (shape.kind !== "www" || !shape.bare) return domain;
    if (budget && !budget.has()) {
        logger.warn(
            `bare_domain_look_skipped domain=${domain.id}: this window's time for bare domains is spent`,
        );
        return domain;
    }

    let status: BareStatus;
    const started = Date.now();
    try {
        status = await check.forwarding(shape.bare, domain.hostname);
    } catch (err) {
        logger.warn(
            `bare_domain_check_failed domain=${domain.id}: ${String(err)}`,
        );
        return domain;
    } finally {
        budget?.spend(Date.now() - started);
    }
    if (status !== domain.bareStatus) {
        // One line per change, so a domain whose forwarding stopped shows.
        logger.log(
            `bare_domain_status domain=${domain.id} org=${domain.organizationId} from=${domain.bareStatus ?? "-"} to=${status}`,
        );
    }
    return prisma.domain.update({
        where: { id: domain.id },
        data: { bareStatus: status, bareCheckedAt: new Date() },
    });
}

/**
 * The bare domain of a `www` connection, as the workspace reads it.
 * `state` is null until the first check (the domain isn't verified yet,
 * or the check is off here).
 */
export interface BareDomainView {
    /** The bare domain: `example.com` for `www.example.com`. */
    hostname: string;
    /** Where it should forward: `https://www.example.com`. */
    forwardTo: string;
    state: BareStatus | null;
    checkedAt: Date | null;
    /** The business has added the bare domain as a domain of its own. */
    added: boolean;
}

export interface BareRead {
    hostnameKind: HostnameKind;
    /** Set for a `www` connection only. */
    bare: BareDomainView | null;
}

function knownStatus(value: string | null): BareStatus | null {
    return BARE_STATUSES.includes(value as BareStatus)
        ? (value as BareStatus)
        : null;
}

/**
 * The bare-domain part of a domain's read (pure). `ownHostnames` are the
 * hostnames the same business holds, so the read can say the bare domain
 * was added too.
 */
export function bareRead(
    domain: Pick<Domain, "hostname" | "bareStatus" | "bareCheckedAt">,
    ownHostnames: ReadonlySet<string>,
): BareRead {
    const shape = hostnameShape(domain.hostname);
    if (shape.kind !== "www" || !shape.bare) {
        return { hostnameKind: shape.kind, bare: null };
    }
    return {
        hostnameKind: "www",
        bare: {
            hostname: shape.bare,
            forwardTo: `https://${domain.hostname}`,
            state: knownStatus(domain.bareStatus),
            checkedAt: domain.bareCheckedAt,
            added: ownHostnames.has(shape.bare),
        },
    };
}

/**
 * The business's own hostnames among `candidates`, for {@link bareRead}.
 * Scoped to the organization: another business's claim on the bare domain
 * is never reported.
 */
export async function ownHostnamesAmong(
    organizationId: string,
    candidates: string[],
): Promise<Set<string>> {
    if (candidates.length === 0) return new Set();
    const rows = await prisma.domain.findMany({
        where: { organizationId, hostname: { in: candidates } },
        select: { hostname: true },
    });
    return new Set(rows.map((r) => r.hostname));
}

/** The bare domain a hostname is the `www` of, as a list of none or one. */
export function bareCandidates(hostname: string): string[] {
    const shape = hostnameShape(hostname);
    return shape.kind === "www" && shape.bare ? [shape.bare] : [];
}
