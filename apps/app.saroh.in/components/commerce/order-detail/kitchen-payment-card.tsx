import { kitchenPayment } from "@/lib/orders/pay-on-handover";
import type { OrderRead } from "@/lib/orders/read";

import { Panel, PanelTitle, StatusPill } from "./parts";

/**
 * The money column for someone without the money read (UX-010): whether
 * the order is paid — Paid, To pay on collection, Not paid yet — and no
 * figure (DEC-024). Recording a payment stays with whoever may (D7 is
 * open), so an unpaid order says who to ask.
 */
export function KitchenPaymentCard({
    order,
    canRecord,
}: {
    order: OrderRead;
    canRecord: boolean;
}) {
    const state = kitchenPayment(order);
    if (!state) return null;
    return (
        <Panel aria-labelledby="kitchen-payment-title">
            <div className="flex items-center gap-2">
                <PanelTitle id="kitchen-payment-title" className="flex-1">
                    Payment
                </PanelTitle>
                <StatusPill tone={state.tone}>{state.label}</StatusPill>
            </div>
            {state.body ? (
                <p className="mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                    {state.body}
                    {canRecord
                        ? ""
                        : " Your role can't record payments — ask the owner or an admin to mark it paid."}
                </p>
            ) : null}
        </Panel>
    );
}
