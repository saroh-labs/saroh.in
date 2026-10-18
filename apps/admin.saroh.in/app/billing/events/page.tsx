import { PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";

import { businessBillingHref } from "@/components/billing/action-list";
import { NumberPager } from "@/components/billing/number-pager";
import { RefList } from "@/components/billing/razorpay-id";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { listProviderEvents } from "@/lib/billing";
import {
    RAZORPAY_LINK_HINT,
    readEventFilter,
    refLabel,
} from "@/lib/billing-action-words";
import { clearHref } from "@/lib/billing-filters";
import { billingHref, istDateTime, readPage } from "@/lib/billing-words";
import { requireStaff } from "@/lib/console";
import { param } from "@/lib/params";

export const metadata = { title: "Provider events · Billing" };

const BASE = "/billing/events";

/**
 * What Saroh's billing provider sent (DEC-166), across every business,
 * newest first: its type and id, the business it matched or none, whether
 * it was applied, and the provider's ids it names as dashboard links —
 * never the payload. "Not applied" is an event Saroh rejected or matched
 * to nothing; "No business" one it couldn't place. The filter and the
 * search are picked in Billing's toolbar. Read-only; needs
 * `saroh-billing:read`.
 */
export default async function BillingEventsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("saroh-billing:read");
    if (!gate.ok) return gate.screen;

    const raw = await searchParams;
    const filter = readEventFilter(raw.filter);
    const q = param(raw.q);
    const page = readPage(raw.page);
    const result = await listProviderEvents({ filter, q, page }).catch(
        () => undefined,
    );

    if (result === undefined) return <FailedPanel things="provider events" />;
    if (result === null) {
        return (
            <PermissionDeniedState
                size="panel"
                title="Provider events are not open to you"
                description="Your access does not cover Saroh's billing."
            />
        );
    }
    if (result.items.length === 0 && page === 1) {
        return filter || q ? (
            <EmptyPanel
                kind="no-results"
                things="events"
                cause={q ? "search" : "filters"}
                query={q}
                clearHref={clearHref("events")}
            />
        ) : (
            <EmptyPanel
                title="No events yet"
                description="An event is kept the moment the billing provider sends one."
            />
        );
    }

    return (
        <>
            <p className="text-sm text-muted-foreground">
                {RAZORPAY_LINK_HINT}
            </p>
            <ul className="grid gap-2">
                {result.items.map((e) => (
                    <li
                        key={e.id}
                        className="grid gap-1 rounded-lg border p-3 text-sm"
                    >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="font-mono text-[13px] font-medium">
                                {e.type}
                            </span>
                            <span className="text-[12px] text-muted-foreground">
                                {istDateTime(e.receivedAt)}
                                {e.processedAt
                                    ? " · applied"
                                    : " · not applied"}
                            </span>
                        </div>
                        <p className="text-muted-foreground">
                            {e.organization ? (
                                <Link
                                    href={businessBillingHref(
                                        e.organization.slug,
                                    )}
                                    className="underline underline-offset-4"
                                >
                                    {e.organization.name}
                                </Link>
                            ) : (
                                "No business"
                            )}{" "}
                            · {e.provider} ·{" "}
                            <span className="break-all font-mono text-[12px]">
                                {e.providerEventId}
                            </span>
                        </p>
                        <RefList
                            refs={{
                                ...e.refs,
                                provider: e.provider,
                            }}
                            labelOf={refLabel}
                        />
                    </li>
                ))}
            </ul>
            <NumberPager
                page={result.page}
                pages={Math.max(1, Math.ceil(result.total / result.limit))}
                hasNext={result.page * result.limit < result.total}
                href={(p) => billingHref(BASE, { filter, q, page: p })}
            />
        </>
    );
}
