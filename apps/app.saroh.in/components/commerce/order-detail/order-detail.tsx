"use client";

import { Button } from "@saroh/ui/button";
import type { ReactNode } from "react";
import { useState } from "react";

import type { OrderMenuPending } from "@/components/commerce/order-actions";
import { OrderActions } from "@/components/commerce/order-actions";
import { formatMoney, formatMoneyMajor } from "@/lib/format/money";
import { useClock } from "@/lib/hooks/use-clock";
import {
    allergenWords,
    allergyCheck,
    eventText,
    flowOf,
    isOpen,
    kitchenStanding,
    STEP_LABEL,
    waiting,
} from "@/lib/orders/lifecycle";
import type { AllergyNote, KitchenStage, OrderRead } from "@/lib/orders/read";
import { providerName } from "@/lib/payments/providers";
import type { OrderPaymentsSummary } from "@/lib/payments/service";

import { ChangeCard, PaymentBanner } from "./change-panels";
import { CourierPanel } from "./courier-panel";
import { CustomerCard } from "./customer-card";
import { EditPanel } from "./edit-panel";
import { HoldCard } from "./hold-card";
import { AllergyBanner, OrderItems } from "./items";
import { MoneyCard } from "./money-card";
import { OrderCrumbs, OrderHeading } from "./order-header";
import type { PillTone } from "./parts";
import { actionClass } from "./parts";
import { RefundPanel } from "./refund-panel";
import { KitchenStepper } from "./stepper";
import type { TimelineStep } from "./timeline";
import { OrderTimeline } from "./timeline";
import type { Panel } from "./use-kitchen";
import { useKitchen } from "./use-kitchen";

export interface OrderPermissions {
    /** Move kitchen stages (`order:stage`) — a Member may. */
    stage: boolean;
    /** Change items, address, cancel, record a payment (`order:write`). */
    write: boolean;
    /** Refund (`payment:manage`). */
    refund: boolean;
}

const STANDING: Record<string, { label: string; tone: PillTone }> = {
    UNFULFILLED: { label: "Unfulfilled", tone: "brand" },
    FULFILLED: { label: "Fulfilled", tone: "success" },
    REFUNDED: { label: "Refunded", tone: "neutral" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const firstName = (name: string | null | undefined) =>
    (name ?? "").trim().split(/\s+/)[0] || "the customer";

/**
 * Order Detail, layout 1d — the two-column desk (the "Saroh Order Detail"
 * design). The kitchen stepper leads, the allergy check sits above Items,
 * the change panels under Items, the timeline below them; the right column is
 * the customer and — for a money role only — the money.
 *
 * Every rule comes from the API's order read (`next`: which stages, whether
 * Undo is still open, whether items can change); this screen only says it.
 * Ready and refunds are held ten seconds before they are recorded (ADR-008),
 * and nothing is ever sent to the customer — the step shows on the order.
 */
export function OrderDetail({
    order,
    notes,
    payments,
    can,
    customerHref,
    aside,
}: {
    order: OrderRead;
    /** Allergy notes; "unavailable" when they could not be read. */
    notes: AllergyNote[] | "unavailable";
    payments: OrderPaymentsSummary | null;
    can: OrderPermissions;
    customerHref: string | null;
    /** Extra panels for the right column (reviews). */
    aside?: ReactNode;
}) {
    const [panel, setPanel] = useState<Panel>(null);
    const [menu, setMenu] = useState<OrderMenuPending | null>(null);
    const clock = useClock(30_000);

    const number = `#${order.orderId}`;
    const first = firstName(order.customer?.name);
    const currency = order.money?.currency ?? "INR";
    const format = (n: number) => formatMoneyMajor(n, currency) ?? String(n);
    const flow = flowOf(order.fulfilment);
    const standing = STANDING[kitchenStanding(order)];
    const refundedFull = order.refundStanding === "REFUNDED";
    const unpaid =
        order.status !== "CANCELLED" &&
        (order.paymentStatus === "FAILED" ||
            (order.paymentStatus === "UNPAID" && order.stage === "NEW"));
    const next: KitchenStage | null =
        can.stage && !unpaid ? (order.next.stages[0] ?? null) : null;
    const open = isOpen(order);
    const age = open && clock !== null ? waiting(order.placedAt, clock) : null;
    const delivery = order.fulfilment === "DELIVERY";
    const provider =
        payments?.intents.find((i) => i.status === "SUCCEEDED")?.provider ??
        null;
    const refundTo = order.money?.recordedByHand
        ? "the till"
        : provider
          ? providerName(provider)
          : "how they paid";

    const noteList = notes === "unavailable" ? [] : notes;
    const check = allergyCheck(order.items, noteList);

    const kitchen = useKitchen({
        order,
        first,
        currency,
        format,
        refundTo,
        setPanel,
    });
    const { hold, busy } = kitchen;

    const advance = () => {
        if (!next || hold) return;
        if (next === "HANDED_TO_COURIER") setPanel("courier");
        else if (next === "READY") kitchen.holdReady();
        else void kitchen.move(next);
    };

    const print = () => window.print();

    const heading = (
        <OrderHeading
            order={order}
            number={number}
            standing={standing}
            age={age}
        >
            <Button
                type="button"
                variant="outline"
                className={actionClass("ghost")}
                onClick={print}
            >
                {delivery ? "Packing slip" : "Print ticket"}
            </Button>
            {can.write ? (
                <OrderActions
                    storeId={order.store.id}
                    orderId={order.id}
                    orderRef={number}
                    status={order.status}
                    paymentStatus={order.paymentStatus}
                    pending={menu}
                    onPendingChange={setMenu}
                />
            ) : null}
            {next && !hold ? (
                <Button
                    type="button"
                    className={actionClass("primary")}
                    disabled={busy}
                    onClick={advance}
                >
                    {STEP_LABEL[next]}
                </Button>
            ) : null}
            {!open && !hold ? (
                <span className="text-[13px] font-semibold text-success-subtle-foreground">
                    Nothing left to do
                </span>
            ) : null}
        </OrderHeading>
    );

    const steps: TimelineStep[] = [
        ...order.events.map((e) => ({
            key: e.id,
            what: eventText(e, (c) => formatMoney(c, currency)),
            at: e.at,
            who: e.actor?.name ? firstName(e.actor.name) : null,
        })),
        ...(payments?.intents ?? [])
            .filter((i) => i.status === "SUCCEEDED")
            .map((i) => ({
                key: `pay-${i.id}`,
                what: `Paid by ${providerName(i.provider)}`,
                at: i.createdAt,
                who: null,
            })),
        {
            key: "placed",
            what: `Placed at ${order.store.name}`,
            at: order.placedAt,
            who: order.customer ? first : null,
        },
    ].sort((a, b) => b.at.localeCompare(a.at));

    const money = order.money;
    const remaining = money ? Number(money.paid) - Number(money.refunded) : 0;
    const refundBlock: string | null = !can.refund
        ? "Refunds are for owners and admins."
        : refundedFull
          ? "Refunded in full."
          : !money || remaining <= 0
            ? "Nothing has been paid to refund."
            : money.recordedByHand
              ? "Paid by hand — hand it back by hand, then record it from the menu."
              : hold?.kind === "refund"
                ? "A refund is on its way."
                : null;

    const addressText = order.deliveryAddress
        ? [
              order.deliveryAddress.line1,
              order.deliveryAddress.line2,
              [order.deliveryAddress.city, order.deliveryAddress.postalCode]
                  .filter(Boolean)
                  .join(" "),
              order.deliveryAddress.state,
          ]
              .filter(Boolean)
              .join("\n")
        : null;
    const handover = [...order.events]
        .reverse()
        .find((e) => e.kind === "STAGE" && e.toStage === "HANDED_TO_COURIER");

    return (
        <main className="w-full">
            <OrderCrumbs number={number} />
            <div className="flex flex-col gap-4 px-4 pb-[26px] pt-5 sm:px-6">
                {heading}
                {unpaid ? (
                    <PaymentBanner
                        failed={order.paymentStatus === "FAILED"}
                        first={first}
                        canRecord={can.write}
                        onCash={() => setMenu({ kind: "payment", to: "PAID" })}
                    />
                ) : null}
                <KitchenStepper
                    flow={flow}
                    stage={order.stage}
                    refunded={refundedFull}
                    next={hold ? null : next}
                    busy={busy}
                    onAdvance={advance}
                />
                {hold?.kind === "refund" ? (
                    <HoldCard
                        hold={hold}
                        title={(s) =>
                            `Refunding ${format(hold.amount ?? 0)} in ${s}s`
                        }
                        body={`Back to ${refundTo}. Once it goes, money can only come back as a new charge.`}
                        nowLabel="Refund now"
                        onUndo={() =>
                            kitchen.cancelHold(
                                "Refund cancelled. Nothing was sent back.",
                            )
                        }
                        onNow={kitchen.commitHold}
                        onDone={kitchen.commitHold}
                    />
                ) : null}
                {hold?.kind === "ready" ? (
                    <HoldCard
                        hold={hold}
                        title={(s) => `Marking ready in ${s}s`}
                        note="Leave this page and it's marked ready straight away. Undo is only here."
                        body={`Nothing is sent to ${first} — the step shows on the order.`}
                        nowLabel="Mark now"
                        onUndo={() =>
                            kitchen.cancelHold(
                                "Still preparing. Nothing was recorded.",
                            )
                        }
                        onNow={kitchen.commitHold}
                        onDone={kitchen.commitHold}
                    />
                ) : null}
                <div className="flex flex-wrap items-start gap-4">
                    <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-3.5">
                        <AllergyBanner
                            first={first}
                            hits={allergenWords(check.hits)}
                            named={check.named}
                            unchecked={notes === "unavailable"}
                        />
                        <OrderItems
                            lines={order.items}
                            storeId={order.store.id}
                            clashes={check.lines}
                            money={money ? format : null}
                        />
                        {panel === "courier" ? (
                            <CourierPanel
                                to={addressText?.replace(/\n/g, ", ") ?? first}
                                first={first}
                                busy={busy}
                                onPrint={print}
                                onCancel={() => setPanel(null)}
                                onHandOver={({ courier, trackingUrl }) =>
                                    void kitchen.move(
                                        "HANDED_TO_COURIER",
                                        { note: courier, trackingUrl },
                                        courier === "Our own driver"
                                            ? "Out with your own driver."
                                            : `Handed to ${courier}.${trackingUrl ? " The tracking link is on the order." : ""}`,
                                    )
                                }
                            />
                        ) : null}
                        {panel === "edit" ? (
                            <EditPanel
                                number={number}
                                first={first}
                                lines={order.items}
                                address={order.deliveryAddress}
                                delivery={delivery}
                                refundTo={refundTo}
                                format={money ? format : null}
                                busy={busy}
                                onCancel={() => setPanel(null)}
                                onSave={kitchen.saveEdit}
                            />
                        ) : null}
                        {panel === "refund" && money ? (
                            <RefundPanel
                                lines={order.items}
                                remaining={remaining}
                                shipping={Number(money.shipping)}
                                how={
                                    money.recordedByHand
                                        ? "Give it back from the till."
                                        : `Back to ${refundTo}, in 3–5 days.`
                                }
                                format={format}
                                onCancel={() => setPanel(null)}
                                onRefund={kitchen.startRefund}
                            />
                        ) : null}
                        {can.write || can.refund ? (
                            <ChangeCard
                                canEdit={can.write}
                                editable={order.next.editable}
                                canRefund={refundBlock}
                                onEdit={() => setPanel("edit")}
                                onRefund={() => setPanel("refund")}
                            />
                        ) : null}
                        <OrderTimeline steps={steps} />
                    </div>
                    <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-3.5">
                        {order.customer ? (
                            <CustomerCard
                                customer={order.customer}
                                href={customerHref ?? "/commerce/customers"}
                                notes={
                                    notes === "unavailable" ? null : noteList
                                }
                                address={delivery ? addressText : null}
                                tracking={
                                    order.trackingUrl
                                        ? {
                                              url: order.trackingUrl,
                                              courier: handover?.note ?? null,
                                          }
                                        : null
                                }
                                orderNote={order.notes}
                            />
                        ) : (
                            <p className="rounded-xl border border-border bg-card px-4 py-[13px] text-[12.5px] text-muted-foreground">
                                This customer&apos;s record is gone. The order
                                keeps what was bought.
                            </p>
                        )}
                        {money ? (
                            <MoneyCard
                                money={money}
                                fulfilment={order.fulfilment}
                                paymentStatus={order.paymentStatus}
                                refundStanding={order.refundStanding}
                                invoices={order.invoices}
                                payments={payments}
                                format={format}
                                onRetryRefund={
                                    can.refund ? kitchen.retryRefund : undefined
                                }
                                busy={busy}
                            />
                        ) : null}
                        {aside}
                    </div>
                </div>
            </div>
        </main>
    );
}
