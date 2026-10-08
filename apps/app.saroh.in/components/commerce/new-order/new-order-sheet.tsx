"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showSuccess } from "@saroh/ui/toast";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { useBusinessDetailsStep } from "@/components/organizations/use-business-details-step";
import { Chip } from "@/components/shared/chip";
import { pickName } from "@/lib/customers/picker";
import { orderHref } from "@/lib/orders/links";
import { centsOf, createLabel, partyOf, payNote } from "@/lib/orders/new-order";
import { makeNewOrder } from "@/lib/orders/new-order-actions";

import { CustomerStep } from "./customer-step";
import { LeavesStep } from "./leaves-step";
import { LinesStep } from "./lines-step";
import { LinkMade } from "./link-made";
import { FOCUS } from "./parts";
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
 * (DEC-023). Each opening starts blank.
 */
export function NewOrderSheet({
    open,
    onOpenChange,
    stores,
    initialStoreId,
    canLink,
    online = true,
    canSearch,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stores: Store[];
    initialStoreId: string;
    canLink: boolean;
    /** The plan takes payment online (R33); else no link is offered. */
    online?: boolean;
    canSearch: boolean;
}) {
    const [session, setSession] = useState(0);
    const [dirty, setDirty] = useState(false);
    const guard = (event: Event) => {
        // A half-made order isn't dropped by a stray click or Esc; Close
        // says it plainly.
        if (dirty) event.preventDefault();
    };
    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) {
                    setSession((n) => n + 1);
                    setDirty(false);
                }
            }}
        >
            <SheetContent
                closeButton={false}
                onInteractOutside={guard}
                onEscapeKeyDown={guard}
                className="flex h-dvh w-full flex-col gap-0 bg-background p-0 sm:max-w-[560px]"
            >
                <div className="flex items-center gap-2.5 border-b border-border bg-card px-[18px] py-3.5">
                    <div className="min-w-0 flex-1">
                        <SheetTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                            New order
                        </SheetTitle>
                        <SheetDescription className="text-[12px] text-muted-foreground">
                            At the counter or on the phone
                        </SheetDescription>
                    </div>
                    <SheetClose
                        aria-label="Close"
                        className={cn(
                            FOCUS,
                            "grid size-[34px] cursor-pointer place-items-center rounded-[9px] bg-muted text-muted-foreground transition-colors duration-fast hover:bg-border hover:text-foreground active:scale-95 coarse:size-11",
                        )}
                    >
                        <X aria-hidden className="size-4" strokeWidth={2} />
                    </SheetClose>
                </div>
                {open ? (
                    <NewOrderBody
                        key={session}
                        stores={stores}
                        initialStoreId={initialStoreId}
                        canLink={canLink}
                        online={online}
                        canSearch={canSearch}
                        onDirty={setDirty}
                        onClose={() => {
                            onOpenChange(false);
                            setSession((n) => n + 1);
                            setDirty(false);
                        }}
                    />
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function NewOrderBody({
    stores,
    initialStoreId,
    canLink,
    online,
    canSearch,
    onDirty,
    onClose,
}: {
    stores: Store[];
    initialStoreId: string;
    canLink: boolean;
    online: boolean;
    canSearch: boolean;
    onDirty: (dirty: boolean) => void;
    onClose: () => void;
}) {
    const router = useRouter();
    const o = useNewOrder({
        initialStoreId,
        canLink,
        online,
        canSearch,
    });
    const [saving, setSaving] = useState(false);
    const details = useBusinessDetailsStep({
        then: "make the order and its pay link",
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
    const dirty = o.dirty && !made;
    useEffect(() => onDirty(dirty), [dirty, onDirty]);
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
        if (o.problem || saving || !o.pick || !o.way) return;
        setSaving(true);
        // A pay link waits for the registered address (DEC-068): asked in
        // place, then the order is made.
        const res = await details.run(() =>
            makeNewOrder(o.storeId, request(o)),
        );
        setSaving(false);
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
                ? `Order created — give ${o.format(o.change.cents)} change.`
                : "Order created.",
        );
        onClose();
    }

    if (made) {
        return (
            <div className="flex-1 overflow-y-auto px-[18px] py-4">
                <LinkMade
                    url={made.url}
                    reach={o.reach}
                    orderHref={orderHref(o.storeId, made.id)}
                    onDone={onClose}
                />
            </div>
        );
    }

    const shownProblem = o.lines.length > 0 ? (refusal ?? o.problem) : null;
    return (
        <>
            {details.step}
            {/*
              Rows are max-content: the Items card clips its corners
              (overflow-hidden), which lets a grid row shrink it to nothing
              once the steps outgrow a phone's height.
            */}
            <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-3.5 overflow-y-auto px-[18px] py-4">
                {stores.length > 1 ? (
                    <div>
                        <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Taken at
                        </div>
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
                    <p
                        role="status"
                        className="rounded-xl border border-border bg-card px-3.5 py-[13px] text-[12.5px] text-muted-foreground"
                    >
                        Reading what {storeName} sells…
                    </p>
                ) : !o.data ? (
                    <p
                        role="alert"
                        className="rounded-xl border border-border bg-card px-3.5 py-[13px] text-[12.5px] text-destructive-subtle-foreground"
                    >
                        Couldn&apos;t read what {storeName} sells.{" "}
                        <button
                            type="button"
                            onClick={o.retryCatalogue}
                            className={cn(
                                FOCUS,
                                "cursor-pointer rounded-sm font-semibold underline underline-offset-2 hover:text-foreground",
                            )}
                        >
                            Try again
                        </button>
                    </p>
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
                    loading={o.waysLoading}
                />
                <PayStep
                    options={o.options}
                    pay={o.pay}
                    onPay={o.setPay}
                    given={o.given}
                    onGiven={o.setGiven}
                    change={o.change}
                    total={total}
                    note={payNote(o.pay, total, o.reach)}
                    format={o.format}
                    discount={o.discount}
                    onDiscount={o.setDiscount}
                    handedOver={o.handedOver}
                    onHandedOver={o.setHandedOver}
                />
            </div>
            <div
                role="group"
                aria-label="Order total"
                className="border-t border-border bg-card px-[18px] py-3"
            >
                <div className="mb-[9px] flex items-baseline gap-2.5">
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
                        className="mb-2 text-[12px] text-destructive-subtle-foreground"
                    >
                        {shownProblem}
                    </div>
                ) : null}
                <button
                    type="button"
                    onClick={() => void create()}
                    disabled={o.problem !== null || saving}
                    aria-busy={saving}
                    className={cn(
                        FOCUS,
                        "h-[46px] w-full cursor-pointer rounded-[10px] bg-primary text-[14.5px] font-semibold text-primary-foreground transition-[background-color,transform] duration-fast hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:active:scale-100 coarse:h-12",
                    )}
                >
                    {saving
                        ? "Creating…"
                        : createLabel(o.pay, total, o.lines.length > 0)}
                </button>
            </div>
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
