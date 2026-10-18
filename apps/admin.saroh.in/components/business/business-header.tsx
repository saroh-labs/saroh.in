import { Badge } from "@saroh/ui/badge";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import type { BusinessRow, LegalHoldFacts } from "@/lib/businesses";
import { formatRelative, plural } from "@/lib/format";
import { planLine } from "@/lib/plan-words";

import type { BusinessTab, BusinessTabBadge } from "./business-tabs";
import { BusinessTabs } from "./business-tabs";
import { CloseAccess } from "./close-access";
import { LegalHoldNotice } from "./legal-hold-notice";
import {
    ATTENTION_LABEL,
    LegalHoldBadge,
    LifecycleBadge,
} from "./lifecycle-badge";
import { MoreActions } from "./more-actions";
import { ViewAsBusiness } from "./open-access";

/**
 * The top of a business's page, over every tab (admin plan U2, R1): its
 * name, its state and what needs attention, one summary line, View as the
 * business… (or Close support access while a session is open), ⋯ More
 * actions, the legal-hold notice when there is one (DEC-122: before
 * anything else the operator might act on), and the tabs.
 *
 * It stands on the directory row alone, so it draws without a support
 * session. Give a custom offer… joins the actions in U5; it is left out
 * until then rather than drawn as a button that does nothing.
 */
export function BusinessHeader({
    summary,
    hold = null,
    session,
    canViewAs,
    canLifecycle,
    canLiftHold,
    badges,
}: {
    summary: BusinessRow;
    /** Who placed the hold, when and why: read inside a support session. */
    hold?: LegalHoldFacts | null;
    /** The operator's support session on this business. */
    session: "open" | "closed";
    /** Holds `organization:view-as`. */
    canViewAs: boolean;
    /** Holds `organization:lifecycle:write`. */
    canLifecycle: boolean;
    /** Holds `organization:legal-hold:lift`. */
    canLiftHold: boolean;
    /** Each tab's count or "needs you" (U3); none until then. */
    badges?: Partial<Record<BusinessTab, BusinessTabBadge>>;
}) {
    const held = hold !== null || summary.legalHold === true;
    return (
        <>
            <PageHeader
                className="mb-5"
                breadcrumb={[
                    <Link key="list" href="/businesses">
                        Businesses
                    </Link>,
                    summary.name,
                ]}
                title={summary.name}
                badge={
                    <div className="flex flex-wrap items-center gap-2">
                        <LifecycleBadge status={summary.lifecycleStatus} />
                        {held && <LegalHoldBadge />}
                        {summary.attention.map((reason) => (
                            <Badge key={reason} variant="warning">
                                {ATTENTION_LABEL[reason]}
                            </Badge>
                        ))}
                    </div>
                }
                description={summaryLine(summary)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {canViewAs &&
                            (session === "open" ? (
                                <CloseAccess organizationId={summary.id} />
                            ) : (
                                <ViewAsBusiness organizationId={summary.id} />
                            ))}
                        <MoreActions
                            organizationId={summary.id}
                            name={summary.name}
                            status={summary.lifecycleStatus}
                            held={held}
                            canLifecycle={canLifecycle}
                            canLiftHold={canLiftHold}
                        />
                    </div>
                }
            />
            {hold && (
                <div className="mb-5">
                    <LegalHoldNotice hold={hold} />
                </div>
            )}
            <BusinessTabs organizationId={summary.id} badges={badges} />
        </>
    );
}

/** Its plan, its people and when it was last active, in one line. */
export function summaryLine(summary: BusinessRow): string {
    return `${planLine(summary.effectivePlan ?? null, summary.plan?.name)} · ${plural(summary.members, "person", "people")} · last active ${formatRelative(summary.lastActiveAt)}`;
}
