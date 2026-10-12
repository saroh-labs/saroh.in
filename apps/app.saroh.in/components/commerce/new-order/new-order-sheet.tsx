"use client";

import { FailedRead } from "@/components/shared/failed-read";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import { Chip } from "@/components/shared/chip";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
    useFormSheetDirty,
} from "@/components/shared/form-sheet";
import type { CustomerPick } from "@/lib/customers/picker";
import { pickName } from "@/lib/customers/picker";
import { orderHref } from "@/lib/orders/links";
import { centsOf, createLabel, partyOf, payNote } from "@/lib/orders/new-order";
import { makeNewOrder } from "@/lib/orders/new-order-actions";

import { runAction } from "@/lib/api/run-action";
import { Notice } from "@saroh/ui/notice";
import { CustomerStep } from "./customer-step";
import { LeavesStep } from "./leaves-step";
import { LinesStep } from "./lines-step";
import { LinkMade } from "./link-made";
import { PayStep } from "./pay-step";
import type { NewOrderState } from "./use-new-order";
import { useNewOrder } from "./use-new-order";

interface Store {
    id: string;
    name: string;
}

/**
 * New order v2 (plan B, B13), the design's sheet on the Orders screen: at
 * the counter or on the phone. Who it is for (a customer, someone new, or
 * a walk-in), the items with any allergy clash, how it leaves, and how it
 * is paid, then one button that says what it will do. Stock is promised
 * when it is made (DEC-032) and a paid order's invoice is written as today
 * (DEC-023). Each opening starts blank. It is the app's one sheet frame
 * (`FormSheet`, wide): a press outside does nothing once the order is
 * started, and Cancel, Escape and the close button drop it.
 */
export function NewOrderSheet({
    open,
    onOpenChange,
    stores,
    initialStoreId,
    canLink,
    online = true,
    canSearch,
    initialPick = null,
    noMoneyAt,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stores: Store[];
    initialStoreId: string;
    canLink: boolean;
    /** Locations where the order is taken and its money isn't (DEC-106). */
    noMoneyAt?: readonly string[];
    /** The plan takes payment online (R33); else no link is offered. */
    online?: boolean;
    canSearch: boolean;
    /**
     * Who it is for, already chosen (#247): each opening starts with them
     * picked, and Change still picks anyone else.
     */
    initialPick?: CustomerPick | null;
}) {
    const [session, setSession] = useState(0);
    const close = () => {
        onOpenChange(false);
        setSession((n) => n + 1);
    };
    return (
        <FormSheet
            wide
            open={open}
            title="New order"
            description="At the counter or on the phone."
            onClose={close}
        >
            {open ? (
                <NewOrderBody
                    key={session}
                    stores={stores}
                    initialStoreId={initialStoreId}
                    canLink={canLink}
                    online={online}
                    canSearch={canSearch}
                    initialPick={initialPick}
                    noMoneyAt={noMoneyAt}
                    onClose={close}
                />
            ) : null}
        </FormSheet>
    );
}

function NewOrderBody({
    stores,
    initialStoreId,
    canLink,
    online,
    canSearch,
    initialPick,
    noMoneyAt,
    onClose,
}: {
    stores: Store[];
    initialStoreId: string;
    canLink: boolean;
    noMoneyAt?: readonly string[];
    online: boolean;
    canSearch: boolean;
    initialPick: CustomerPick | null;
    onClose: () => void;
}) {
    const router = useRouter();
    const o = useNewOrder({
        initialStoreId,
        canLink,
        online,
        canSearch,
        initialPick,
        noMoneyAt,
    });
    const [saving, setSaving] = useState(false);
    // What is missing is said once the button is pressed.
    const [tried, setTried] = useState(false);
    const details = useBusinessDetailsStep({
        then: "make the order and its pay link",
        continueLabel: "Save and create order",
    });
    // Paid at the counter, with a product that has no GST rate: chosen
    // here and saved to the product, then the order is made as it was.
    const rates = useGstRateStep({
        then: "take this payment",
        continueLabel: "Save and create order",
    });
    const [failed, setFailed] = useState<{
        key: string;
        message: string;
    } | null>(null);
    const [made, setMade] = useState<{ id: string; url: string } | null>(null);
    const store = stores.find((s) => s.id === o.storeId);
    const storeName = store?.name ?? "";
    const total = o.format(o.total);

    // Tell the sheet when there is something to lose.
    useFormSheetDirty(o.dirty && !made);
    // A refusal is about the order as it was sent: any change clears it.
    const sent = JSON.stringify([
        o.storeId,
        o.lines,
        o.pick,
        o.way,
        o.address,
        o.pay,
        o.given,
        o.discount,
    ]);
    const refusal = failed?.key === sent ? failed.message : null;

    async function create() {
        setTried(true);
        if (o.problem || saving || !o.pick || !o.way) return;
        // A pay link waits for the registered address (DEC-068): asked in
        // place, then the order is made.
        const res = await runAction(
            () =>
                rates.run(() =>
                    details.run(() => makeNewOrder(o.storeId, request(o))),
                ),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) {
            // At the plan's orders-a-month limit (U13): its notice too.
            if (res.plan) showPlanRefusal(res.plan);
            setFailed({ key: sent, message: res.error });
            return;
        }
        router.refresh();
        if (res.data.payLink) {
            setMade({ id: res.data.id, url: res.data.payLink.url });
            return;
        }
        showSuccess(
            o.pay === "CASH" && o.change.kind === "change" && o.change.cents > 0
                ? `Order created. Give ${o.format(o.change.cents)} change.`
                : "Order created.",
        );
        onClose();
    }

    if (made) {
        return (
            <FormSheetBody>
                <LinkMade
                    url={made.url}
                    reach={o.reach}
                    orderHref={orderHref(o.storeId, made.id)}
                    onDone={onClose}
                />
            </FormSheetBody>
        );
    }

    const shownProblem =
        o.lines.length > 0 || tried ? (refusal ?? o.problem) : null;
    return (
        <>
            {details.step}
            {rates.step}
            {/*
              Rows are max-content: the Items card clips its corners
              (overflow-hidden), which lets a grid row shrink it to nothing
              once the steps outgrow a phone's height.
            */}
            <FormSheetBody className="auto-rows-max gap-3.5">
                {stores.length > 1 ? (
                    <div>
                        <div className="label mb-[7px]">Taken at</div>
                        <div
                            role="radiogroup"
                            aria-label="Location"
                            className="flex flex-wrap gap-1.5"
                        >
                            {stores.map((s) => (
                                <Chip
                                    key={s.id}
                                    on={o.storeId === s.id}
                                    onClick={() => o.setStoreId(s.id)}
                                    className="cursor-pointer active:scale-[0.97]"
                                >
                                    {s.name}
                                </Chip>
                            ))}
                        </div>
                    </div>
                ) : null}
                <CustomerStep
                    pick={o.pick}
                    onPick={o.setPick}
                    canSearch={canSearch}
                    attention={o.attentionNote}
                />
                {o.loading ? (
                    <Notice role="status">
                        Reading what {storeName} sells…
                    </Notice>
                ) : !o.data ? (
                    <FailedRead
                        things={`what ${storeName} sells`}
                        onRetry={o.retryCatalogue}
                    />
                ) : (
                    <LinesStep
                        products={o.data.products}
                        lines={o.lines}
                        byKey={o.byKey}
                        clashes={o.clashes}
                        storeName={storeName}
                        format={o.format}
                        onBump={o.bumpLine}
                    />
                )}
                <LeavesStep
                    ways={o.ways}
                    way={o.way}
                    onWay={o.setWay}
                    address={o.address}
                    onAddress={o.setAddress}
                    format={o.format}
                    failed={o.waysFailed}
                    onRetry={o.retryWays}
                    loading={o.waysLoading}
                />
                <PayStep
                    currency={o.data?.currency ?? null}
                    options={o.options}
                    pay={o.pay}
                    onPay={o.setPay}
                    given={o.given}
                    onGiven={o.setGiven}
                    change={o.change}
                    total={total}
                    note={payNote(o.pay, total, o.reach, o.money)}
                    format={o.format}
                    discount={o.discount}
                    onDiscount={o.setDiscount}
                    handedOver={o.handedOver}
                    onHandedOver={o.setHandedOver}
                />
            </FormSheetBody>
            <FormSheetFoot
                saveLabel={createLabel(o.pay, total, o.lines.length > 0)}
                savingLabel="Creating…"
                pending={saving}
                note={
                    <div role="group" aria-label="Order total">
                        <div className="flex items-baseline gap-2.5">
                            <span className="flex-1 text-[12.5px] text-muted-foreground">
                                {sumLine(o, storeName)}
                            </span>
                            <span className="font-display text-[20px] font-semibold tabular-nums tracking-[-0.02em]">
                                {total}
                            </span>
                        </div>
                        {shownProblem ? (
                            <div
                                role="status"
                                className="mt-2 text-[12px] text-destructive-subtle-foreground"
                            >
                                {shownProblem}
                            </div>
                        ) : null}
                    </div>
                }
                onSubmit={create}
            />
        </>
    );
}

/** "₹430 + ₹60 delivery · Local delivery · Hill Road" (the design's). */
function sumLine(o: NewOrderState, storeName: string): string {
    if (!o.subtotal) return storeName;
    const money = [
        o.format(o.subtotal),
        ...(o.fee ? [`${o.format(o.fee)} delivery`] : []),
        ...(o.tax ? [`${o.format(o.tax)} tax`] : []),
    ].join(" + ");
    const less = o.off
        ? ` − ${o.format(o.off)}`
        : o.code
          ? ` · ${o.code} taken off when it's made`
          : "";
    const way = o.ways.find((w) => w.type === o.way)?.label;
    return [`${money}${less}`, way, storeName].filter(Boolean).join(" · ");
}

const fromCents = (cents: number) => (cents / 100).toFixed(2);

/** What the API is sent. */
function request(o: NewOrderState): Parameters<typeof makeNewOrder>[1] {
    if (!o.pick || !o.way) throw new Error("Nothing to make");
    const received = o.pay === "CASH" ? centsOf(o.given) : Number.NaN;
    return {
        items: o.lines.flatMap((l) => {
            const s = o.byKey.get(l.key);
            return s
                ? [
                      {
                          productId: s.productId,
                          ...(s.variantId ? { variantId: s.variantId } : {}),
                          quantity: l.quantity,
                      },
                  ]
                : [];
        }),
        ...partyOf(o.pick),
        fulfilment: o.way,
        ...(o.delivers
            ? {
                  address: {
                      name: pickName(o.pick),
                      ...(o.reach && !o.reach.includes("@")
                          ? { phone: o.reach }
                          : {}),
                      line1: o.address.line1.trim(),
                      city: o.address.city.trim(),
                      state: o.address.state.trim(),
                      postalCode: o.address.postalCode.trim(),
                  },
              }
            : {}),
        ...(o.tax ? { tax: fromCents(o.tax) } : {}),
        ...(o.fee ? { shipping: fromCents(o.fee) } : {}),
        ...(o.off ? { discount: fromCents(o.off) } : {}),
        ...(o.code ? { discountCode: o.code } : {}),
        ...(o.data ? { currency: o.data.currency } : {}),
        // Handed over now (UX-059): made Collected at once.
        ...(o.handedOver ? { handedOver: true } : {}),
        payment: {
            kind: o.pay,
            ...(Number.isFinite(received)
                ? { received: fromCents(received) }
                : {}),
        },
    };
}
