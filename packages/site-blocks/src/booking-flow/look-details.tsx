"use client";

import { phoneNumberProblem } from "@saroh/block-contract";
import type { Ref } from "react";

import type {
    SignedInCustomer,
    SignInApi,
    SignInOptions,
} from "../account/api";
import { cn } from "../lib/utils";
import { SitePhoneInput } from "../phone-input";
import type { InlineCodeHandle } from "./inline-code";
import { InlineCode } from "./inline-code";
import { lookField, lookFieldBad, lookLink } from "./look-styles";
import type { BookingWhere } from "./model";
import { WhereAndNote } from "./steps/where-and-note";

/**
 * Your details in a look (DEC-172, KD9, U10): signed in, "Booking as Asha
 * · Not you?"; else a name and the email, with the code asked under it
 * (`inline-code.tsx`) — the same words for every email. Then the phone,
 * optional, and the step's own questions (Where, the note).
 */

export function LookDetails({
    ids,
    business,
    customer,
    name,
    touched,
    signingOut,
    onName,
    onNotYou,
    signIn,
    codeRef,
    onSignedIn,
    phone,
    onPhone,
    where,
    forWaitlist,
}: {
    ids: string;
    business: string;
    customer: SignedInCustomer | null;
    name: string;
    touched: boolean;
    signingOut: boolean;
    onName: (name: string) => void;
    onNotYou: () => void;
    signIn: { options: SignInOptions; api: SignInApi };
    codeRef: Ref<InlineCodeHandle>;
    onSignedIn: (who: SignedInCustomer) => void;
    phone: string;
    onPhone: (phone: string) => void;
    where: {
        asksWhere: boolean;
        where: BookingWhere;
        onlyWhere: BookingWhere | null;
        note: string;
        onWhere: (where: BookingWhere) => void;
        onNote: (note: string) => void;
    };
    /** A full class's line: who they are is all it needs. */
    forWaitlist: boolean;
}) {
    // Asked of everyone not signed in (the words are the same for every
    // email), and after signing in only of an account with no name.
    const asksName = !customer?.name;
    const nameBad = touched && asksName && name.trim().length < 2;
    const phoneError = touched ? phoneNumberProblem(phone) : null;
    return (
        <div>
            {customer ? (
                <div
                    data-booking-as=""
                    className="border-site-border bg-site-surface rounded-site-s flex items-center gap-3 border p-4"
                >
                    <span
                        aria-hidden="true"
                        className="bg-site-accent-soft text-site-fg font-site-heading flex size-11 shrink-0 items-center justify-center rounded-full text-[17px]"
                    >
                        {(customer.name ?? customer.email)
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">
                            Booking as {customer.name ?? customer.email}
                        </span>
                        {customer.name ? (
                            <span className="text-site-body block text-[13.5px] [overflow-wrap:anywhere]">
                                {customer.email}
                            </span>
                        ) : null}
                    </span>
                    <button
                        type="button"
                        onClick={onNotYou}
                        aria-disabled={signingOut}
                        className={cn(lookLink, signingOut && "opacity-60")}
                    >
                        Not you?
                    </button>
                </div>
            ) : null}

            {asksName ? (
                <div className={customer ? "mt-4" : ""}>
                    <label
                        htmlFor={`${ids}-name`}
                        className="text-site-fg block text-[13.5px] font-semibold"
                    >
                        Your name
                    </label>
                    <input
                        id={`${ids}-name`}
                        autoComplete="name"
                        value={name}
                        onChange={(e) => onName(e.target.value)}
                        aria-invalid={nameBad ? true : undefined}
                        aria-describedby={
                            nameBad ? `${ids}-name-error` : undefined
                        }
                        className={cn(
                            lookField,
                            "mt-1.5 w-full",
                            nameBad && lookFieldBad,
                        )}
                    />
                    {nameBad ? (
                        <p
                            id={`${ids}-name-error`}
                            className="text-site-fg mt-1.5 text-[13px] font-semibold"
                        >
                            Add your name.
                        </p>
                    ) : null}
                </div>
            ) : null}

            {customer ? null : (
                <InlineCode
                    ids={ids}
                    options={signIn.options}
                    api={signIn.api}
                    onSignedIn={onSignedIn}
                    handle={codeRef}
                />
            )}

            {forWaitlist ? null : (
                <>
                    <div className="mt-4">
                        <label
                            htmlFor={`${ids}-phone`}
                            className="text-site-fg block text-[13.5px] font-semibold"
                        >
                            Phone{" "}
                            <span className="text-site-muted font-normal">
                                Optional
                            </span>
                        </label>
                        <SitePhoneInput
                            id={`${ids}-phone`}
                            className="mt-1.5"
                            box={cn(lookField, "w-full")}
                            value={phone}
                            onValueChange={onPhone}
                            placeholder={`So ${business} can call you`}
                            invalid={Boolean(phoneError)}
                            describedBy={
                                phoneError ? `${ids}-phone-error` : undefined
                            }
                        />
                        {phoneError ? (
                            <p
                                id={`${ids}-phone-error`}
                                className="text-site-fg mt-1.5 text-[13px] font-semibold"
                            >
                                {phoneError}
                            </p>
                        ) : null}
                    </div>
                    <WhereAndNote ids={ids} business={business} {...where} />
                </>
            )}
        </div>
    );
}
