"use client";

import { Button } from "@saroh/ui/button";
import { PlanLockedState } from "@saroh/ui/data-state";
import { showError } from "@saroh/ui/toast";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { PlanLockedCard } from "@/components/billing/plan-way";
import { runAction } from "@/lib/api/run-action";
import { FREE_NOTE } from "@/lib/saroh-billing/global-free";
import { tellMeWhenPaidPlans } from "@/lib/saroh-billing/paid-plans-actions";
import { plansShown } from "@/lib/saroh-billing/plans-shown";

/**
 * Connections or Notifications on a plan without them ("API and AI apps"
 * boards, 7). The tab stays, so people know it exists. On an edition
 * before its paid plans (Global) it is "Coming with paid plans" with Tell
 * me when, never a price; otherwise the plan that has it, and the way there.
 */
export function DevelopersLocked({
    name,
    what,
    plan,
    href,
    beforePaidPlans,
    docsHref,
}: {
    /** "Connections", "Notifications to your systems". */
    name: string;
    /** One sentence: what it is for. */
    what: string;
    plan?: string | null;
    href: string;
    beforePaidPlans: boolean;
    docsHref: string;
}) {
    const [busy, setBusy] = useState(false);
    const [asked, setAsked] = useState(false);
    const docs = (
        <Button asChild variant="outline" size="sm">
            <a href={docsHref} target="_blank" rel="noreferrer">
                What this is for{" "}
                <ExternalLink aria-hidden className="size-3.5" />
            </a>
        </Button>
    );
    if (!beforePaidPlans && !plansShown()) {
        // No plans to show (DEC-136): the lock, and what it's for.
        return (
            <PlanLockedState
                size="panel"
                className="max-w-[600px]"
                name={name}
                href={href}
                canChangePlan={false}
                description={what}
                way={docs}
            />
        );
    }
    if (!beforePaidPlans) {
        return (
            <PlanLockedCard
                size="panel"
                className="max-w-[600px]"
                name={name}
                plan={plan}
                href={href}
                description={what}
                secondary={docs}
            />
        );
    }

    async function ask() {
        const res = await runAction(tellMeWhenPaidPlans, { setBusy });
        if (!res) return;
        if (!res.ok) return showError(FREE_NOTE.failed);
        setAsked(true);
    }

    return (
        <PlanLockedState
            size="panel"
            className="max-w-[600px]"
            name={name}
            href={href}
            canChangePlan={false}
            title="Coming with paid plans"
            description={`${what} Paid plans aren't available yet. AI assistants work on Free today.`}
            way={
                <>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void ask()}
                        disabled={asked}
                        busy={busy}
                        busyLabel="Sending…"
                    >
                        {asked ? FREE_NOTE.asked : FREE_NOTE.ask}
                    </Button>
                    {asked ? (
                        <p
                            role="status"
                            className="text-[12.5px] text-muted-foreground"
                        >
                            {FREE_NOTE.askedLine}
                        </p>
                    ) : null}
                </>
            }
            secondary={docs}
        />
    );
}
