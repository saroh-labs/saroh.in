"use client";

import { cancelMoney, cancelWords } from "@/lib/orders/cancel-money";
import type { OrderRead } from "@/lib/orders/read";

import { CancelPanel } from "./cancel-panel";
import { FulfilmentPanel } from "./fulfilment-panel";
import type { useOrderChanges } from "./use-order-changes";

/**
 * B9's two sheets under Items, one at a time: "Change how it's fulfilled"
 * and "Cancel #1063?". Their own file so Order Detail only says which is
 * open; what each may offer comes from the order read's `next`.
 */
export function ChangeSheets({
    panel,
    order,
    number,
    first,
    refundTo,
    linkable,
    format,
    changes,
    onClose,
}: {
    panel: "fulfilment" | "cancel";
    order: OrderRead;
    number: string;
    first: string;
    refundTo: string;
    /** A pay link can be made for more that is owed (B11). */
    linkable: boolean;
    /** Money in major units; null without a money read. */
    format: ((n: number) => string) | null;
    changes: ReturnType<typeof useOrderChanges>;
    onClose: () => void;
}) {
    const money = order.money;
    const paid =
        order.paymentStatus !== "PAID"
            ? "unpaid"
            : money?.recordedByHand
              ? "by-hand"
              : "online";

    if (panel === "fulfilment" && order.next.fulfilment) {
        const options = order.next.fulfilment.options;
        return (
            <FulfilmentPanel
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
        );
    }
    if (panel === "cancel") {
        // What is left on the order, refunds by hand counted (#918).
        const { amount, already } = cancelMoney(money, paid);
        const words = cancelWords({ paid, amount, already, refundTo, format });
        return (
            <CancelPanel
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
        );
    }
    return null;
}
