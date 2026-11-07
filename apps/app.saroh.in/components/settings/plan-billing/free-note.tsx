"use client";

import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { FREE_NOTE } from "@/lib/saroh-billing/global-free";
import { tellMeWhenPaidPlans } from "@/lib/saroh-billing/paid-plans-actions";

/**
 * Plan and billing on an edition Saroh doesn't bill (Global, KTD7): the
 * business is on Free, paid plans aren't available yet, and one "Tell me
 * when". A press asks the API with the signed-in person's own address and
 * the button then says "We'll tell you". No price, no plan to buy.
 */
export function FreeNote() {
    const [busy, setBusy] = useState(false);
    const [asked, setAsked] = useState(false);

    async function ask() {
        const res = await runAction(tellMeWhenPaidPlans, { setBusy });
        if (!res) return;
        if (!res.ok) {
            showError(FREE_NOTE.failed);
            return;
        }
        setAsked(true);
    }

    return (
        <section
            data-free-note
            className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
            <h2 className="text-base font-semibold">{FREE_NOTE.title}</h2>
            <p className="text-pretty text-sm text-foreground/80">
                {FREE_NOTE.body}
            </p>
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    variant="outline"
                    onClick={() => void ask()}
                    disabled={asked}
                    busy={busy}
                    busyLabel="Sending…"
                >
                    {asked ? FREE_NOTE.asked : FREE_NOTE.ask}
                </Button>
                {asked ? (
                    <p role="status" className="text-sm text-muted-foreground">
                        {FREE_NOTE.askedLine}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
