import { readBusinessCurrency } from "@/lib/organizations/business-currency";
import { forbidden } from "next/navigation";

import { LeadDetailContainer } from "@/components/crm/lead-detail-container";
import { canOrUnknown } from "@/lib/access/require-can";
import { composerGate } from "@/lib/messages/composer-gate";
import type { MessageChannel } from "@/lib/messages/service";
import { rolledOut } from "@/lib/modules/rollout";
import { listModules } from "@/lib/modules/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listCommsProviders } from "@/lib/providers/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

/** The tab's title (UX-081): without one it read the bare "Saroh". */
// "Lead", never their name: a tab's title shows in a screen share, in
// history and in bookmarks (`lib/page-title.ts`).
export const metadata = { title: "Lead" };

/**
 * Lead detail (S3-005 + S3-007): the lead's contact + current stage, a
 * move-stage control, a status control, a note composer + follow-up task form,
 * and the full activity timeline (newest first). Stage movement, notes, and
 * follow-up tasks all go through server actions; the api validates + logs the
 * matching Activity, then the client refreshes this view so the timeline stays
 * in sync.
 *
 * S6-002 adds messaging: a channel-aware message composer, a consent /
 * unsubscribe control for the contact, and a message history panel showing each
 * message's CURRENT delivery state (delivery is async — the api queues it and a
 * worker drives it to a terminal state, so the panel reflects live status,
 * never a faked SENT). A REVOKED consent makes the composer warn and the send
 * gate SUPPRESS.
 *
 * UX-067: the composer shows only while Communications is on, and a channel
 * with nothing connected to send it says so up front — connect it where the
 * plan has room, or the plan that has it (DEC-086, DEC-091) — rather than
 * letting the owner write into a refusal (`composerGate`). The modules,
 * providers and plan are aids, read best-effort: unread, the composer shows
 * as before.
 *
 * Read first (owner, 10 Oct): the page shows the lead and its history, and
 * the note, follow-up and message forms open in side sheets from one row of
 * buttons under the header (`LeadActions`). Consent is a readout with its
 * own switches, so it stays on the page, under the history.
 *
 * On React Query (DEC-259), loaded in the browser: the gates (the layout's
 * CRM `ModuleGate`, `lead:read`, what this role may do), the currency and
 * what each channel can send are the page's; the lead, its messages and
 * its contact's consent (`/api/leads/[leadId]`) are `LeadDetailContainer`'s
 * query, read behind the route's loader and again after every write.
 */
export default async function LeadDetailPage({
    params,
}: {
    params: Promise<{ leadId: string }>;
}) {
    await requireSession();
    const [{ leadId }, organization, currency, modules] = await Promise.all([
        params,
        resolveActiveOrganization(),
        // A lead's Worth is in the business's currency (owner, 11 Oct).
        readBusinessCurrency(),
        listModules().catch(() => null),
    ]);
    // A role without leads is refused, not "not found" (UX-027).
    if (!canOrUnknown(organization, "lead:read")) forbidden();

    /*
     * Each control asks what the API asks of its write (`leads.service.ts`,
     * `communications.service.ts`): editing, deleting, moving a stage and
     * the status are `lead:write`, a note, a follow-up and marking one done
     * `activity:write`, a message `message:write`, consent `consent:write`.
     * Someone who reads the lead without them reads it: no button that would
     * only be refused.
     */
    const comms = modules
        ? rolledOut(modules).find((m) => m.key === "COMMUNICATIONS")
        : undefined;
    const communicationsOn = modules ? comms?.lifecycle === "ENABLED" : null;
    // Providers and plan matter only while it is on; a read refused for
    // this role is unknown, never a reason to hide the composer.
    const [providers, access] = communicationsOn
        ? await Promise.all([
              listCommsProviders().catch(() => null),
              billingAccessOrNull(),
          ])
        : [null, null];
    const gateFor = (channel: MessageChannel) =>
        composerGate({
            channel,
            communicationsOn,
            canManageModules: comms?.canManage ?? false,
            providers,
            access,
        });

    return (
        <LeadDetailContainer
            skeleton={<Loading />}
            ask={{ leadId }}
            canWrite={canOrUnknown(organization, "lead:write")}
            canLog={canOrUnknown(organization, "activity:write")}
            canMessage={canOrUnknown(organization, "message:write")}
            canConsent={canOrUnknown(organization, "consent:write")}
            currency={currency}
            gates={{ EMAIL: gateFor("EMAIL"), WHATSAPP: gateFor("WHATSAPP") }}
        />
    );
}
