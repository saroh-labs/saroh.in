import type { Domain, Prisma } from "@saroh/database";

import { HOSTING_WORDS } from "../domains/domain-hosting-sync";
import { cleanBusinessName } from "../site-accounts/sender-name";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";
import { enqueueTeamAlert } from "./team-alerts";

/**
 * A live custom domain that stops reaching its site, and comes back (#917).
 *
 * The domain's hosting check (`DomainsService.check`: the background
 * `domains.recheck` run, #860, and "Check now") queues a `team.alert`
 * `{ event: "domain" }` on the same transaction as the write that moved
 * the domain out of live, or back into it. The alert is told on the Your
 * website row (`site:publish`), bell and email on by default.
 *
 * **Once per incident.** Each told change is claimed as a `TEAM_TOLD`
 * `CustomerNotice` keyed `team:domain:<domainId>:<down|back>:<at>`, and
 * the last one told decides what may be told next: "down" only when the
 * last told wasn't "down", "back" only when it was. So a domain that stays
 * down says nothing more however often it is checked, one that comes back
 * before anyone was told says nothing either way, and a domain that first
 * goes live never hears "working again". Telling one domain is serialised
 * on an advisory lock (`domain-alert:<domainId>`, `backend-jobs.md`), so a
 * "Check now" and a run that both saw the change tell it once.
 */

/** The inbox notice types, on the Your website row (`alert-preferences.ts`). */
export const DOMAIN_DOWN_NOTIFICATION_TYPE = "domain.down";
export const DOMAIN_BACK_NOTIFICATION_TYPE = "domain.back";

export type DomainAlertChange = "down" | "back";

type Tx = Prisma.TransactionClient;
type DomainAlert = Extract<TeamAlertPayload, { event: "domain" }>;

const LIVE = "ACTIVE";

/** The claim key's prefix for one domain's alerts. */
function keyPrefix(domainId: string): string {
    return `team:domain:${domainId}:`;
}

/**
 * What a check changed, as an alert would say it: "down" when a live
 * domain stopped being live, "back" when one not live became live, null
 * otherwise (pure).
 */
export function domainAlertChange(
    before: string | null,
    after: string | null,
): DomainAlertChange | null {
    if (before === LIVE && after !== LIVE) return "down";
    if (before !== LIVE && after === LIVE) return "back";
    return null;
}

/** The change last told for this domain, or null when none was. */
export async function lastToldChange(
    tx: Pick<Tx, "customerNotice">,
    organizationId: string,
    domainId: string,
): Promise<DomainAlertChange | null> {
    const last = await tx.customerNotice.findFirst({
        where: {
            organizationId,
            kind: "TEAM_TOLD",
            eventKey: { startsWith: keyPrefix(domainId) },
        },
        orderBy: { createdAt: "desc" },
        select: { eventKey: true },
    });
    const change = last?.eventKey
        .slice(keyPrefix(domainId).length)
        .split(":")[0];
    return change === "down" || change === "back" ? change : null;
}

/** Whether `change` may be told after `last` (one per incident). */
function mayTell(
    change: DomainAlertChange,
    last: DomainAlertChange | null,
): boolean {
    return change === "down" ? last !== "down" : last === "down";
}

/**
 * Queue the alert for a check that moved a domain into or out of live, on
 * the check's own transaction. Nothing is queued when there is nothing to
 * tell: no change, a domain going live for the first time, or one still
 * down from an incident already told. `actorUserId` is who pressed "Check
 * now"; they see it on the screen, so they aren't emailed.
 */
export async function queueDomainAlert(
    tx: Pick<Tx, "customerNotice" | "job">,
    before: Pick<Domain, "hostingStatus">,
    after: Pick<
        Domain,
        "id" | "organizationId" | "hostingStatus" | "hostingCheckedAt"
    >,
    actorUserId: string | null = null,
): Promise<DomainAlertChange | null> {
    const change = domainAlertChange(before.hostingStatus, after.hostingStatus);
    if (!change) return null;
    const last = await lastToldChange(tx, after.organizationId, after.id);
    if (!mayTell(change, last)) return null;
    await enqueueTeamAlert(tx, after.organizationId, {
        event: "domain",
        domainId: after.id,
        change,
        at: (after.hostingCheckedAt ?? new Date()).toISOString(),
        actorUserId,
    });
    return change;
}

/**
 * What is wrong, in the merchant's words: fixed words only, so Saroh's
 * email may carry them too. From the row's hosting state, as the Domains
 * screen reads it (`domain-hosting-sync.ts`).
 */
export function domainProblemWords(
    domain: Pick<Domain, "hostingStatus" | "hostingError">,
): string {
    switch (domain.hostingStatus) {
        case "FAILED":
            return domain.hostingError === HOSTING_WORDS.blocked
                ? "Our hosting provider blocked it. Contact support and we'll look into it."
                : "The secure certificate for it couldn't be issued. Check the CNAME record at your domain provider still points to Saroh.";
        case "REGISTER_FAILED":
            return "We couldn't connect it to our hosting provider. We'll keep trying.";
        default:
            return "It doesn't point to Saroh any more. Check its CNAME record at your domain provider.";
    }
}

/**
 * The alert, read now and worded; null when it no longer stands — the
 * domain is gone, is live again before "down" was told, went down again
 * before "back" was, or this change was told already for the incident.
 * Takes the domain's lock first, so its changes are told one at a time.
 *
 * The bell names the domain. Saroh's email doesn't: it carries fixed
 * words and the business's own names, cleaned (`cleanName`), and a domain
 * is exactly what cleaning takes out (`site-accounts/sender-name.ts`), so
 * it names the site instead and links to its settings.
 */
export async function wordDomain(
    tx: Tx,
    organizationId: string,
    p: DomainAlert,
): Promise<WordedAlert | null> {
    const lock = `domain-alert:${p.domainId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
    const domain = await tx.domain.findFirst({
        where: { id: p.domainId, organizationId },
        select: {
            id: true,
            hostname: true,
            siteId: true,
            status: true,
            hostingStatus: true,
            hostingError: true,
            site: { select: { name: true } },
        },
    });
    if (domain?.status !== "VERIFIED") return null;
    const live = domain.hostingStatus === LIVE;
    if (live !== (p.change === "back")) return null;
    if (
        !mayTell(p.change, await lastToldChange(tx, organizationId, domain.id))
    ) {
        return null;
    }

    const site = domain.site?.name.trim() ? domain.site.name.trim() : null;
    const mailSite = cleanBusinessName(site ?? "", "your website");
    const base = {
        event: "site" as const,
        eventKey: `${keyPrefix(domain.id)}${p.change}:${p.at}`,
        notificationId: null,
        path: domain.siteId ? `/sites/${domain.siteId}/settings` : "/sites",
        cta: "Open site settings",
        skipUserId: p.actorUserId ?? null,
    };
    if (p.change === "back") {
        return {
            ...base,
            type: DOMAIN_BACK_NOTIFICATION_TYPE,
            title: `${domain.hostname} is working again`,
            body: `Visitors reach ${site ?? "your website"} at ${domain.hostname} again.`,
            mail: {
                heading: `Your own domain for ${mailSite} is working again`,
                body: "Visitors reach your website at your own domain again.",
            },
        };
    }
    const problem = domainProblemWords(domain);
    return {
        ...base,
        type: DOMAIN_DOWN_NOTIFICATION_TYPE,
        title: `${domain.hostname} stopped working`,
        body: `Visitors can't reach ${site ?? "your website"} at ${domain.hostname}. ${problem} You'll find it in the site's Settings, under Your own domain. We'll tell you when it works again.`,
        mail: {
            heading: `Your own domain for ${mailSite} stopped working`,
            body: `Visitors can't reach your website at your own domain. ${problem} We'll tell you when it works again.`,
        },
    };
}
