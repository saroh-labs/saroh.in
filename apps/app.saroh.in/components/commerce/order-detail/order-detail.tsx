"use client";

import { Button } from "@saroh/ui/button";
import type { ReactNode } from "react";
import { useState } from "react";

import type { OrderMenuPending } from "@/components/commerce/order-actions";
import { OrderActions } from "@/components/commerce/order-actions";
import { useBusinessZone } from "@/components/shared/business-zone";
import { formatMoneyMajor } from "@/lib/format/money";
import { useClock } from "@/lib/hooks/use-clock";
import { readyNoticeText } from "@/lib/messages/notice-reach";
import { shipmentOf } from "@/lib/orders/courier";
import {
    allergenWords,
    allergyCheck,
    goesToAddress,
    headerStep,
    isOpen,
    STEP_LABEL,
    stepsOf,
    waiting,
} from "@/lib/orders/lifecycle";
import type { StepTone } from "@/lib/orders/list-row";
import { handoverPayment } from "@/lib/orders/pay-on-handover";
import type { AllergyNote, KitchenStage, OrderRead } from "@/lib/orders/read";
import type { Arrival } from "@/lib/orders/row-menu";
import type { Sellable } from "@/lib/orders/sellables";
import { orderTimelineSteps } from "@/lib/orders/timeline-steps";
import {
    isAppointment,
    TREATMENT_CHANGE_NOTE,
    visitsHow,
    visitsStanding,
} from "@/lib/orders/visits";
import { providerName } from "@/lib/payments/providers";
import type { OrderPaymentsSummary } from "@/lib/payments/service";

import { changeAccess } from "@/lib/orders/fulfilment-change";

import { ChangeCard, PaymentBanner } from "./change-panels";
import { ChangeSheets } from "./change-sheets";
import { CourierPanel } from "./courier-panel";
import { CustomerCard } from "./customer-card";
import { EditPanel } from "./edit-panel";
import { HoldCard } from "./hold-card";
import { AllergyBanner, OrderItems } from "./items";
import { KitchenPaymentCard } from "./kitchen-payment-card";
import { MoneyCard } from "./money-card";
import { OrderCrumbs, OrderHeading } from "./order-header";
import type { PillTone } from "./parts";
import { actionClass } from "./parts";
import { PayLinkBlock, usePayLink } from "./pay-link";
import { RefundPanel } from "./refund-panel";
import { KitchenStepper } from "./stepper";
import { OrderTimeline } from "./timeline";
import { useArrival } from "./use-arrival";
import type { Panel } from "./use-kitchen";
import { useKitchen } from "./use-kitchen";
import { useOrderChanges } from "./use-order-changes";
import { VisitsSection } from "./visits-card";
import { VisitsNextAction } from "./visits-next";
import { NoCustomerCard } from "./walk-in-card";

export interface OrderPermissions {
    /** Move steps and print (`order:stage`) — a Member may. */
    stage: boolean;
    /**
     * Change items, address, how it's fulfilled, and record a payment by
     * hand (`order:edit`, B16).
     */
    edit: boolean;
    /** Make or replace its pay link (`order:create` or `order:edit`). */
    payLink: boolean;
    /** Refund and cancel (`order:refund`, B16). */
    refund: boolean;
    /**
     * A provider can open the checkout window, so a pay link can be made
     * (B11, DEC-054). Making one also takes `payLink`.
     */
    payOnline?: boolean;
    /** May connect a provider in Settings (`payment:manage`). */
    manageProviders?: boolean;
    /**
     * Reads contacts (`contact:read`): the customer's own phone and email.
     * Without it the API sends neither (review #19), and the card says
     * nothing about them rather than "No phone". Unknown reads as true.
     */
    contact?: boolean;
    /** Opens a visit's booking (`booking:read`, B14). */
    bookingRead?: boolean;
    /** "Book visit N" (`booking:write`, B14). */
    bookingWrite?: boolean;
}

/** A treatment's standing (B14), in the header pill's tones. */
const VISITS_TONE: Record<PillTone, StepTone> = {
    brand: "new",
    success: "done",
    neutral: "bad",
    danger: "bad",
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
    addable = null,
    aside,
    arrival = null,
}: {
    order: OrderRead;
    /** Their allergies (Needs attention); "unavailable" when not read. */
    notes: AllergyNote[] | "unavailable";
    payments: OrderPaymentsSummary | null;
    can: OrderPermissions;
    customerHref: string | null;
    /**
     * What "Add an item" offers while items can change (B8): the order's
     * storefront's catalogue, "unavailable" if it couldn't be read.
     */
    addable?: Sellable[] | "unavailable" | null;
    /** Extra panels for the right column (reviews). */
    aside?: ReactNode;
    /** Opened from the Orders list to refund, hand over or print (B5). */
    arrival?: Arrival;
}) {
    const [panel, setPanel] = useState<Panel>(null);
    const [menu, setMenu] = useState<OrderMenuPending | null>(null);
    const clock = useClock(30_000);

    const number = `#${order.orderId}`;
    const first = firstName(order.customer?.name ?? order.walkIn?.name);
    const currency = order.money?.currency ?? "INR";
    const format = (n: number) => formatMoneyMajor(n, currency) ?? String(n);
    const kitchenSteps = stepsOf(order);
    const refundedFull = order.refundStanding === "REFUNDED";
    // A treatment is fulfilled by its visits (B14): no kitchen stages.
    const appointment = isAppointment(order);
    const visits = appointment ? order.visits : undefined;
    const now = new Date(clock ?? Date.parse(order.updatedAt));
    // The service's zone, else the business's (UX-008), never UTC.
    const businessZone = useBusinessZone();
    const zone = visits?.service.timezone ?? businessZone;
    const standing = appointment
        ? (({ label, tone }) => ({ label, tone: VISITS_TONE[tone] }))(
              visitsStanding(
                  visits,
                  refundedFull,
                  order.status === "CANCELLED",
              ),
          )
        : headerStep(order);
    // Paid at the handover (website checkout): made and brought first.
    const handover = handoverPayment(order);
    const unpaid =
        order.status !== "CANCELLED" &&
        (order.paymentStatus === "FAILED" ||
            (order.paymentStatus === "UNPAID" &&
                (order.stage === "NEW" || handover !== null)));
    const next: KitchenStage | null =
        can.stage && (!unpaid || handover !== null) && !appointment
            ? (order.next.stages[0] ?? null)
            : null;
    const open = isOpen(order);
    const age =
        open && clock !== null && !appointment ? waiting(order, clock) : null;
    const delivery = goesToAddress(order);
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

    // The pay link (B11): for an order still owed money, made by someone
    // who may change orders. Its address is shown once, to its maker.
    const madeAt = order.payLinkCreatedAt ?? null;
    const payLink = usePayLink({ orderId: order.id, first, madeAt });
    // Owed: unpaid, or paid online and changed since to cost more (B9), a
    // site checkout's order too — its balance is taken by the same link.
    const owed =
        order.status !== "CANCELLED" &&
        (order.paymentStatus === "UNPAID" ||
            order.paymentStatus === "FAILED" ||
            (order.paymentStatus === "PAID" && !order.money?.recordedByHand)) &&
        Number(order.money?.due ?? 0) > 0;
    const linkable = can.payLink && owed;
    const changes = useOrderChanges({
        order,
        first,
        currency,
        refundTo,
        setPanel,
        startHold: kitchen.startHold,
        onOwed: can.payLink && can.payOnline ? payLink.ask : undefined,
    });
    const change = changeAccess(order, can);

    const advance = () => {
        if (!next || hold) return;
        if (next === "HANDED_TO_COURIER") setPanel("courier");
        else if (next === "READY") kitchen.holdReady();
        else void kitchen.move(next);
    };

    const print = () => window.print();
    const shipment = shipmentOf(order, can.stage);

    const heading = (
        <OrderHeading
            order={order}
            number={number}
            standing={standing}
            age={age}
            how={
                appointment
                    ? visitsHow(order.fulfilmentLabel, visits, zone, now)
                    : undefined
            }
        >
            {order.ticketName ? (
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    onClick={print}
                >
                    Print {order.ticketName.toLowerCase()}
                </Button>
            ) : null}
            {can.edit || can.refund ? (
                <OrderActions
                    storeId={order.store.id}
                    orderId={order.id}
                    orderRef={number}
                    status={order.status}
                    paymentStatus={order.paymentStatus}
                    pending={menu}
                    onPendingChange={setMenu}
                    withCancel={change.cancel === undefined}
                    canRecord={can.edit}
                    canRefund={can.refund}
                    refundLeft={
                        order.money
                            ? Number(
                                  order.money.leftToRefund ??
                                      Number(order.money.paid) -
                                          Number(order.money.refunded),
                              )
                            : undefined
                    }
                    format={order.money ? format : undefined}
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
            {visits && !refundedFull ? (
                <VisitsNextAction
                    orderId={order.id}
                    orderNumber={order.orderId}
                    visits={visits}
                    first={first}
                    canMark={can.stage}
                    canBook={can.bookingWrite ?? false}
                    now={now}
                />
            ) : null}
            {!open && !hold ? (
                <span className="text-[13px] font-semibold text-success-subtle-foreground">
                    Nothing left to do
                </span>
            ) : null}
            {handover && can.stage && !next && open && !hold ? (
                // Ready, and paid at the handover: Collected waits for the
                // payment (the API refuses it before then, UX-010).
                <span className="text-[13px] font-semibold text-muted-foreground">
                    {handover === "collection"
                        ? "Mark collected once it's paid"
                        : "Mark delivered once it's paid"}
                </span>
            ) : null}
        </OrderHeading>
    );

    const steps = orderTimelineSteps(order, payments, currency, firstName);

    const money = order.money;
    const remaining = money ? Number(money.paid) - Number(money.refunded) : 0;
    const refundBlock: string | null = !can.refund
        ? "Your role can't refund orders."
        : refundedFull
          ? "Refunded in full."
          : !money || remaining <= 0
            ? "Nothing has been paid to refund."
            : money.recordedByHand
              ? "Paid by hand — hand it back by hand, then record it from the menu."
              : hold?.kind === "refund"
                ? "A refund is on its way."
                : null;

    useArrival(
        arrival,
        {
            refund: refundBlock === null && money !== null,
            courier: next === "HANDED_TO_COURIER",
            print: order.ticketName !== null,
        },
        setPanel,
    );

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
    const to = addressText?.replace(/\n/g, ", ") ?? first;

    return (
        <main className="w-full">
            <OrderCrumbs number={number} />
            <div className="flex flex-col gap-4 px-4 pb-[26px] pt-5 sm:px-6">
                {heading}
                {unpaid ? (
                    <PaymentBanner
                        failed={order.paymentStatus === "FAILED"}
                        first={first}
                        canRecord={can.edit}
                        onCash={() =>
                            setMenu({
                                kind: "payment",
                                to: "PAID",
                                how: "CASH",
                            })
                        }
                        onSendLink={
                            linkable && can.payOnline ? payLink.ask : undefined
                        }
                        sending={payLink.busy}
                        handover={handover ?? undefined}
                        uncollectedDays={order.uncollectedDays}
                        onCancel={
                            change.cancel === null && !hold
                                ? () => setPanel("cancel")
                                : undefined
                        }
                    />
                ) : null}
                {appointment ? (
                    <VisitsSection
                        visits={visits ?? null}
                        refunded={refundedFull}
                        first={first}
                        attention={order.attention}
                        canOpenBooking={can.bookingRead ?? false}
                        now={now}
                    />
                ) : (
                    <KitchenStepper
                        steps={kitchenSteps}
                        stage={order.stage}
                        refunded={refundedFull}
                        next={hold ? null : next}
                        busy={busy}
                        onAdvance={advance}
                    />
                )}
                {hold?.kind === "refund" ? (
                    <HoldCard
                        hold={hold}
                        title={
                            hold.words?.title ??
                            ((s) =>
                                `Refunding ${format(hold.amount ?? 0)} in ${s}s`)
                        }
                        body={
                            hold.words?.body ??
                            `Back to ${refundTo}. Once it goes, money can only come back as a new charge.`
                        }
                        nowLabel={hold.words?.nowLabel ?? "Refund now"}
                        onUndo={() =>
                            kitchen.cancelHold(
                                hold.words?.undone ??
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
                        body={readyNoticeText(order.customerNotice, first)}
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
                                mode="handover"
                                to={to}
                                first={first}
                                busy={busy}
                                onPrint={print}
                                onCancel={() => setPanel(null)}
                                onSave={(fields) =>
                                    void kitchen.handOver(fields)
                                }
                            />
                        ) : null}
                        {panel === "tracking" && shipment ? (
                            <CourierPanel
                                mode="change"
                                to={to}
                                first={first}
                                busy={busy}
                                before={shipment}
                                onCancel={() => setPanel(null)}
                                onSave={kitchen.saveCourier}
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
                                addable={addable}
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
                        {panel === "fulfilment" || panel === "cancel" ? (
                            <ChangeSheets
                                panel={panel}
                                order={order}
                                number={number}
                                first={first}
                                refundTo={refundTo}
                                remaining={remaining}
                                linkable={
                                    can.payLink && (can.payOnline ?? false)
                                }
                                format={money ? format : null}
                                changes={changes}
                                onClose={() => setPanel(null)}
                            />
                        ) : null}
                        {can.edit || can.refund ? (
                            <ChangeCard
                                canEdit={can.edit}
                                editable={order.next.editable}
                                canRefund={refundBlock}
                                fulfilment={change.fulfilment}
                                cancel={
                                    hold && change.cancel !== undefined
                                        ? "A change is on its way."
                                        : change.cancel
                                }
                                onEdit={() => setPanel("edit")}
                                onRefund={() => setPanel("refund")}
                                onFulfilment={() => setPanel("fulfilment")}
                                onCancel={() => setPanel("cancel")}
                                note={
                                    appointment
                                        ? TREATMENT_CHANGE_NOTE
                                        : undefined
                                }
                            />
                        ) : null}
                        <OrderTimeline steps={steps} />
                    </div>
                    <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-3.5">
                        {order.customer ? (
                            <CustomerCard
                                customer={order.customer}
                                href={customerHref ?? "/commerce/customers"}
                                // A treatment's Needs attention is on its
                                // Visits card (B14) and here too, as the
                                // design shows (DEC-073).
                                notes={
                                    notes === "unavailable" ? null : noteList
                                }
                                attention={order.attention}
                                contact={can.contact ?? true}
                                address={delivery ? addressText : null}
                                deliveryPhone={
                                    delivery
                                        ? (order.deliveryAddress?.phone ?? null)
                                        : null
                                }
                                shipment={shipment}
                                onChangeTracking={() => setPanel("tracking")}
                                orderNote={order.notes}
                            />
                        ) : (
                            <NoCustomerCard
                                walkIn={order.walkIn ?? null}
                                contact={can.contact ?? true}
                                address={delivery ? addressText : null}
                                shipment={shipment}
                                onChangeTracking={() => setPanel("tracking")}
                                orderNote={order.notes}
                            />
                        )}
                        {money ? (
                            <MoneyCard
                                money={money}
                                delivery={delivery}
                                way={order.fulfilmentLabel}
                                handover={handover ?? undefined}
                                appointment={appointment}
                                paymentStatus={order.paymentStatus}
                                refundStanding={order.refundStanding}
                                invoices={order.invoices}
                                payments={payments}
                                format={format}
                                onRetryRefund={
                                    can.refund ? kitchen.retryRefund : undefined
                                }
                                busy={busy}
                                onRecordPayment={
                                    can.edit ? kitchen.recordPayment : undefined
                                }
                                payLink={
                                    linkable ? (
                                        <PayLinkBlock
                                            link={payLink}
                                            madeAt={madeAt}
                                            ready={can.payOnline ?? false}
                                            canManage={
                                                can.manageProviders ?? false
                                            }
                                        />
                                    ) : null
                                }
                            />
                        ) : (
                            <KitchenPaymentCard
                                order={order}
                                canRecord={can.edit}
                            />
                        )}
                        {aside}
                    </div>
                </div>
            </div>
            {payLink.dialog}
        </main>
    );
}
