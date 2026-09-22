"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { SubscribeDialog } from "@/components/subscriptions/subscribe-dialog";
import { invoiceMoney } from "@/lib/invoices/money";
import { intervalWords, nextLine, standing } from "@/lib/subscriptions/renewal";
import type { Plan, Subscription } from "@/lib/subscriptions/service";

import { ContactPanelSection, ROW } from "./contact-panel";

const STATUS = {
    ACTIVE: { label: "Active", variant: "success" },
    OVERDUE: { label: "Overdue", variant: "error" },
    PAUSED: { label: "Paused", variant: "neutral" },
    CANCELLED: { label: "Cancelled", variant: "neutral" },
} as const;

/**
 * A person's subscriptions: the plan, where it stands, when it next renews
 * and what it still owes. Running ones first. "Subscribe" opens the
 * Subscriptions screen's own dialog with this person already chosen.
 */
export function SubscriptionsPanel({
    contact,
    subscriptions,
    plans,
}: {
    contact: ContactOption;
    /** Null when they could not be read. */
    subscriptions: Subscription[] | null;
    /** Plans to put them on; null when this person may not, or they failed. */
    plans: Plan[] | null;
}) {
    const [subscribing, setSubscribing] = useState(false);
    const rows = subscriptions
        ? [...subscriptions].sort(
              (a, b) =>
                  Number(a.status === "CANCELLED") -
                  Number(b.status === "CANCELLED"),
          )
        : null;

    return (
        <>
            <ContactPanelSection
                title="Subscriptions"
                count={rows ? rows.length : null}
                failed="Their subscriptions"
                empty={`${contact.name} is not on a plan.${plans ? " Subscribe them and their first invoice is issued." : ""}`}
                action={
                    plans ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSubscribing(true)}
                        >
                            Subscribe
                        </Button>
                    ) : null
                }
            >
                {rows ? (
                    <ul>
                        {rows.map((s) => {
                            const st = STATUS[standing(s)];
                            const owes = s.unpaidCount > 0;
                            return (
                                <li key={s.id} className={ROW}>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13.5px] font-medium">
                                            {s.plan.name}
                                        </span>
                                        <span className="block truncate text-[11.5px] text-muted-foreground">
                                            {intervalWords(s.interval).adj} ·{" "}
                                            {invoiceMoney(s.price, s.currency)}{" "}
                                            · {nextLine(s)}
                                        </span>
                                    </span>
                                    {owes ? (
                                        <span
                                            className={
                                                s.overdue
                                                    ? "text-[12.5px] font-medium text-destructive-subtle-foreground"
                                                    : "text-[12.5px] text-muted-foreground"
                                            }
                                        >
                                            {invoiceMoney(
                                                s.unpaidTotal,
                                                s.currency,
                                            )}{" "}
                                            owed
                                        </span>
                                    ) : null}
                                    <Badge variant={st.variant}>
                                        {st.label}
                                    </Badge>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
            </ContactPanelSection>
            {plans ? (
                <SubscribeDialog
                    open={subscribing}
                    onOpenChange={setSubscribing}
                    contacts={[contact]}
                    plans={plans}
                    initialContactId={contact.id}
                />
            ) : null}
        </>
    );
}
