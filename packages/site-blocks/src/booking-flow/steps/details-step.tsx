import type { SignedInCustomer } from "../../account/api";
import { cn } from "../../lib/utils";
import type { BookingWhere } from "../model";
import { card, focusRing } from "../styles";
import { Field } from "./field";
import { StepHead } from "./step-head";
import { WhereAndNote } from "./where-and-note";

/**
 * Step 3: who is booking, then where (for a service offered either way) and
 * anything the team should know (E7).
 *
 * Sign-in is always on (A9, ADR-011): nobody types an email here. A
 * signed-in customer reads "Booking as ‹name› · Not you?"; a visitor who
 * isn't signed in yet gives their name, and confirms their email with a
 * code at the last step. A name is asked for only while the account has
 * none, so the team never gets a booking without one. A phone is optional
 * (UX-049): the business can call them, and paying online starts with it.
 */
export function DetailsStep({
    ids,
    business,
    customer,
    name,
    touched,
    signingOut,
    onName,
    onNotYou,
    asksWhere,
    where,
    onlyWhere = null,
    note,
    onWhere,
    onNote,
    phone = "",
    onPhone,
    forWaitlist = false,
}: {
    /** The flow's `useId()`, so each field's id is its own. */
    ids: string;
    business: string;
    /** Who is signed in on this site, or null. */
    customer: SignedInCustomer | null;
    name: string;
    touched: boolean;
    /** "Not you?" is signing them out. */
    signingOut: boolean;
    onName: (value: string) => void;
    onNotYou: () => void;
    asksWhere: boolean;
    where: BookingWhere;
    /** The one way the chosen time can be had, or null for either. */
    onlyWhere?: BookingWhere | null;
    note: string;
    onWhere: (where: BookingWhere) => void;
    onNote: (note: string) => void;
    /** A phone to reach them on, optional (UX-049). */
    phone?: string;
    onPhone?: (phone: string) => void;
    /**
     * Joining a full class's waitlist (A12): who they are is all it needs,
     * so Where and the note wait for the booking.
     */
    forWaitlist?: boolean;
}) {
    const asksName = !customer?.name;
    return (
        <div className={card}>
            <StepHead n={3} title="Your details" />
            {customer ? (
                <p className="text-site-body -mt-1.5 mb-3 ml-[38px] text-[13.5px]">
                    Booking as{" "}
                    <span className="text-site-fg font-semibold">
                        {customer.name ?? customer.email}
                    </span>{" "}
                    ·{" "}
                    <button
                        type="button"
                        onClick={onNotYou}
                        disabled={signingOut}
                        className={cn(
                            "text-site-fg cursor-pointer font-semibold underline disabled:cursor-default disabled:opacity-60",
                            focusRing,
                        )}
                    >
                        Not you?
                    </button>
                </p>
            ) : (
                <p className="text-site-muted -mt-1.5 mb-3 ml-[38px] text-[13px]">
                    You&apos;ll confirm your email with a code. No password.
                    Only used so {business} can reach you about this{" "}
                    {forWaitlist ? "class" : "booking"}.
                </p>
            )}
            {asksName ? (
                <Field
                    id={`${ids}-name`}
                    label="Name"
                    autoComplete="name"
                    value={name}
                    onChange={onName}
                    error={
                        touched && name.trim().length < 2
                            ? "Add your name."
                            : null
                    }
                />
            ) : null}
            {forWaitlist || !onPhone ? null : (
                <Field
                    id={`${ids}-phone`}
                    label="Phone (optional)"
                    type="tel"
                    autoComplete="tel"
                    placeholder={`So ${business} can call you about it`}
                    value={phone}
                    onChange={onPhone}
                    error={null}
                />
            )}
            {forWaitlist ? null : (
                <WhereAndNote
                    ids={ids}
                    business={business}
                    asksWhere={asksWhere}
                    where={where}
                    onlyWhere={onlyWhere}
                    note={note}
                    onWhere={onWhere}
                    onNote={onNote}
                />
            )}
        </div>
    );
}
