"use client";

import { Button, buttonVariants } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyPanel } from "@/components/states/empty-panel";
import { todayIso } from "@/lib/format";
import type { LeadCard } from "@/lib/saroh-lead-words";
import { followUpWords, leadLine, STAGE_LABEL } from "@/lib/saroh-lead-words";

import { LogCallSheet } from "./log-call-sheet";

/**
 * The Leads tab (R33): the leads they work, still open, the soonest
 * follow-up first, each with its stage. On their own page, Log a call on
 * one (U20's sheet); it lands on Activity. Moving a lead's stage is on the
 * Leads board, linked.
 */
export function MemberLeads({
    leads,
    self,
    canLog,
}: {
    leads: LeadCard[];
    self: boolean;
    canLog: boolean;
}) {
    const router = useRouter();
    const [logging, setLogging] = useState<LeadCard | null>(null);
    const today = todayIso();

    return (
        <section aria-label="Leads" className="grid gap-3">
            {leads.length === 0 ? (
                <EmptyPanel
                    title="No open leads"
                    description={
                        self
                            ? "Leads you add, or that Saroh's team gives you, show here until they're won or lost."
                            : "Leads they add, or that Saroh's team gives them, show here until they're won or lost."
                    }
                />
            ) : (
                <ul
                    aria-label="Open leads"
                    className="rounded-xl border bg-card"
                >
                    {leads.map((lead) => {
                        const due = followUpWords(lead, today);
                        return (
                            <li
                                key={lead.id}
                                data-lead={lead.id}
                                className="grid gap-2 border-b px-4 py-3 last:border-0 md:grid-cols-[minmax(0,1.4fr)_8rem_minmax(0,1fr)_9rem] md:items-center md:gap-4"
                            >
                                <div className="grid min-w-0 gap-0.5">
                                    <span className="truncate font-medium">
                                        {lead.name}
                                    </span>
                                    <span className="truncate text-[13px] text-muted-foreground">
                                        {leadLine(lead)}
                                    </span>
                                </div>
                                <span className="text-[13px]">
                                    {STAGE_LABEL[lead.stage]}
                                </span>
                                <span
                                    className={
                                        lead.overdue
                                            ? "text-[13px] font-medium text-warning-subtle-foreground"
                                            : "text-[13px] text-muted-foreground"
                                    }
                                >
                                    {due ?? "No follow-up set"}
                                </span>
                                <div className="md:justify-self-end">
                                    {canLog ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setLogging(lead)}
                                        >
                                            Log a call
                                        </Button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <div>
                <Link
                    href="/leads"
                    className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                    })}
                >
                    Open the Leads board
                </Link>
            </div>
            {logging ? (
                <LogCallSheet
                    leadId={logging.id}
                    leadName={logging.name}
                    followUpOn={logging.followUpOn}
                    onOpenChange={(open) => {
                        if (!open) setLogging(null);
                    }}
                    onLogged={() => {
                        showSuccess(
                            `Logged with ${logging.name}`,
                            "It's on Activity.",
                        );
                        router.refresh();
                    }}
                />
            ) : null}
        </section>
    );
}
