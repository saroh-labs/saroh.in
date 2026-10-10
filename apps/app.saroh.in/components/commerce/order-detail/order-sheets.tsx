"use client";

import { cancelMoney, cancelWords } from "@/lib/orders/cancel-money";
import type { Shipment } from "@/lib/orders/courier";
import type { OrderRead } from "@/lib/orders/read";
import type { Sellable } from "@/lib/orders/sellables";

import { CancelPanel } from "./cancel-panel";
import { CourierPanel } from "./courier-panel";
import { EditPanel } from "./edit-panel";
import { FulfilmentPanel } from "./fulfilment-panel";
import { RefundPanel } from "./refund-panel";
import type { Panel, useKitchen } from "./use-kitchen";
import type { useOrderChanges } from "./use-order-changes";

/**
 * Every change to an order, each in its own side sheet and one at a time
 * (owner, 10 Oct): hand to courier, tracking, edit, refund, change how
 * it's fulfilled (B9) and cancel (B9). Their own file so Order Detail only
 * says which is open; what each may offer comes from the order read's
 * `next`, and what each does from `useKitchen` and `useOrderChanges`.
 *
 * `opening` keys each sheet, so one opened again starts from the order as
 * it is, never from the last draft.
 */
export function OrderSheets({
    panel,
    opening,
    order,
    number,
    first,
    to,
    delivery,
    refundTo,
    shipment,
    remaining,
    addable,
    linkable,
    format,
    kitchen,
    changes,
    onPrint,
    onClose,
    returnFocus,
}: {
    panel: Panel;
    opening: number;
    order: OrderRead;
    number: string;
    first: string;
    /** Where it is going, one line. */
    to: string;
    delivery: boolean;
    refundTo: string;
    shipment: Shipment | null;
    /** Paid and not yet refunded on the whole order. */
    remaining: number;
    addable: Sellable[] | "unavailable" | null;
    /** A pay link can be made for more that is owed (B11). */
    linkable: boolean;
    /** Money in major units; null without a money read. */
    format: ((n: number) => string) | null;
    kitchen: ReturnType<typeof useKitchen>;
    changes: ReturnType<typeof useOrderChanges>;
    onPrint: () => void;
    onClose: () => void;
    returnFocus: (from: Exclude<Panel, null>) => void;
}) {
    const money = order.money;
    const paid =
        order.paymentStatus !== "PAID"
            ? "unpaid"
            : money?.recordedByHand
              ? "by-hand"
              : "online";
    const options = order.next.fulfilment?.options ?? null;
    // What is left on the order, refunds by hand counted (#918).
    const { amount, already } = cancelMoney(money, paid);
    const words = cancelWords({ paid, amount, already, refundTo, format });

    return (
        <>
            <CourierPanel
                key={`courier-${opening}`}
                open={panel === "courier"}
                returnFocus={() => returnFocus("courier")}
                mode="handover"
                to={to}
                first={first}
                busy={kitchen.busy}
                onPrint={onPrint}
                onCancel={onClose}
                onSave={(fields) => void kitchen.handOver(fields)}
            />
            {shipment ? (
                <CourierPanel
                    key={`tracking-${opening}`}
                    open={panel === "tracking"}
                    returnFocus={() => returnFocus("tracking")}
                    mode="change"
                    to={to}
                    first={first}
                    busy={kitchen.busy}
                    before={shipment}
                    onCancel={onClose}
                    onSave={kitchen.saveCourier}
                />
            ) : null}
            <EditPanel
                key={`edit-${opening}`}
                open={panel === "edit"}
                returnFocus={() => returnFocus("edit")}
                number={number}
                first={first}
                lines={order.items}
                address={order.deliveryAddress}
                delivery={delivery}
                refundTo={refundTo}
                format={format}
                addable={addable}
                busy={kitchen.busy}
                onCancel={onClose}
                onSave={kitchen.saveEdit}
            />
            {money && format ? (
                <RefundPanel
                    key={`refund-${opening}`}
                    open={panel === "refund"}
                    returnFocus={() => returnFocus("refund")}
                    lines={order.items}
                    remaining={remaining}
                    shipping={Number(money.shipping)}
                    how={
                        money.recordedByHand
                            ? "Give it back from the till."
                            : `Back to ${refundTo}, in 3–5 days.`
                    }
                    format={format}
                    onCancel={onClose}
                    onRefund={kitchen.startRefund}
                />
            ) : null}
            {options ? (
                <FulfilmentPanel
                    key={`fulfilment-${opening}`}
                    open={panel === "fulfilment"}
                    returnFocus={() => returnFocus("fulfilment")}
                    current={order.fulfilmentType}
                    options={options}
                    first={first}
                    shipping={Number(money?.shipping ?? 0)}
                    address={order.deliveryAddress}
                    paid={paid}
                    refundTo={refundTo}
                    linkable={linkable}
                    canTell={order.next.tell ?? false}
                    format={format ? (cents) => format(cents / 100) : null}
                    busy={changes.busy}
                    onCancel={onClose}
                    onSave={(input) =>
                        changes.saveFulfilment(
                            input,
                            options.find((o) => o.type === input.fulfilment)
                                ?.label ?? "",
                        )
                    }
                />
            ) : null}
            <CancelPanel
                key={`cancel-${opening}`}
                open={panel === "cancel"}
                returnFocus={() => returnFocus("cancel")}
                number={number}
                first={first}
                lines={order.items}
                says={words.says}
                confirm={words.confirm}
                canTell={order.next.tell ?? false}
                format={format}
                onCancel={onClose}
                onConfirm={(choice) =>
                    changes.startCancel(choice, amount, format)
                }
            />
        </>
    );
}
