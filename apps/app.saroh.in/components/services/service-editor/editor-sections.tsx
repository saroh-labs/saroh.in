"use client";

import { Field } from "@saroh/ui/field";
import { MoneyInput } from "@saroh/ui/money-input";
import { useId } from "react";

import type { PlanLock } from "@/lib/billing/access";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import { onlineBookingProblem } from "@/lib/services/online-booking";
import type { DepositMode } from "@/lib/services/service";
import type { ServiceCharged } from "@/lib/services/service-editor";
import {
    draftVisits,
    gstGoesOnTop,
    toMinor,
} from "@/lib/services/service-editor";
import type { BookingPaymentView } from "@/lib/staff/types";

import { DepositField } from "./deposit-field";
import type { Edit } from "./fields";
import { Section } from "./fields";
import { GstFields } from "./gst-fields";

/**
 * Price, GST and "At booking, they pay" (E8, 12 Oct 2026): a saved
 * service's Money panel draws `PriceFields` (U16). `PriceSection` is the
 * same in a titled card.
 */
export function PriceSection(props: PriceProps) {
    return (
        <Section title="Price">
            <PriceFields {...props} />
        </Section>
    );
}

type PriceProps = Edit & {
    currency: string;
    /** A GST-registered business: the GST rate and SAC code sit here. */
    withGst?: boolean;
    /** How the business's prices carry GST; null when it couldn't be told. */
    businessPriceMode?: GstPriceMode | null;
    /** The API's amounts for the price as saved; null once it is changed. */
    charged?: ServiceCharged | null;
    canEdit?: boolean;
    /** The deposit the service has saved. */
    savedDeposit?: DepositMode;
    /** The plan's lock on online payments (deposits are taken online). */
    paymentsLock?: PlanLock | null;
    /** How people pay when they book (DEC-088); null when unknown. */
    payment: BookingPaymentView | null;
};

export function PriceFields({
    draft,
    set,
    problem: fieldProblem,
    leave,
    currency,
    savedDeposit,
    paymentsLock = null,
    payment,
    withGst = false,
    canEdit = true,
    businessPriceMode = null,
    charged = null,
}: PriceProps) {
    const id = useId();
    // Only a service on the booking page is booked online at all.
    const problem = draft.showOnBookingPage
        ? onlineBookingProblem(
              {
                  priceCents: toMinor(draft.price),
                  depositMode: draft.deposit,
              },
              payment,
          )
        : null;
    return (
        <>
            {/* A GST-registered business answers the rate where the price
                is (12 Oct 2026): the price includes it, and a priced
                service can't be saved without one. */}
            <div className="flex flex-wrap items-start gap-3">
                <Field
                    label="Price"
                    className="w-[160px] max-w-full"
                    error={fieldProblem("price")}
                    onBlur={() => leave("price")}
                >
                    <MoneyInput
                        id={id}
                        currency={currency}
                        value={draft.price}
                        placeholder="0 if it's free"
                        onValueChange={(price) => set({ price })}
                    />
                </Field>
                {withGst ? (
                    <GstFields
                        draft={draft}
                        set={set}
                        problem={fieldProblem}
                        leave={leave}
                        asked
                        canEdit={canEdit}
                        businessPriceMode={businessPriceMode}
                    />
                ) : null}
            </div>
            <DepositField
                deposit={draft.deposit}
                price={draft.price}
                currency={currency}
                visits={draftVisits(draft)}
                saved={savedDeposit}
                paymentsLock={paymentsLock}
                way={payment?.bookingPayment}
                problem={problem}
                charged={charged}
                gstOnTop={gstGoesOnTop(draft, businessPriceMode, withGst)}
                onChange={(deposit) => set({ deposit })}
            />
        </>
    );
}
