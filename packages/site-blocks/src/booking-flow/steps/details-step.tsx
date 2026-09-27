import type { BookingWhere } from "../model";
import { card } from "../styles";
import { Field } from "./field";
import { StepHead } from "./step-head";
import { WhereAndNote } from "./where-and-note";

/**
 * Step 3: who they are, then where (for a service offered either way) and
 * anything the team should know (E7).
 */
export function DetailsStep({
    ids,
    business,
    name,
    email,
    phoneNo,
    touched,
    emailOk,
    phoneError,
    onName,
    onEmail,
    onPhone,
    asksWhere,
    where,
    note,
    onWhere,
    onNote,
}: {
    /** The flow's `useId()`, so each field's id is its own. */
    ids: string;
    business: string;
    name: string;
    email: string;
    phoneNo: string;
    touched: boolean;
    emailOk: boolean;
    phoneError: string | null;
    onName: (value: string) => void;
    onEmail: (value: string) => void;
    onPhone: (value: string) => void;
    asksWhere: boolean;
    where: BookingWhere;
    note: string;
    onWhere: (where: BookingWhere) => void;
    onNote: (note: string) => void;
}) {
    return (
        <div className={card}>
            <StepHead n={3} title="Your details" />
            <p className="text-site-muted -mt-1.5 mb-3 ml-[38px] text-[13px]">
                Only used for this booking, so {business} can reach you about
                it.
            </p>
            <Field
                id={`${ids}-name`}
                label="Name"
                autoComplete="name"
                value={name}
                onChange={onName}
                error={
                    touched && name.trim().length < 2 ? "Add your name." : null
                }
            />
            <Field
                id={`${ids}-email`}
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.in"
                value={email}
                onChange={onEmail}
                error={
                    (touched || email.includes("@")) &&
                    email.trim() !== "" &&
                    !emailOk
                        ? "That email doesn't look right."
                        : touched && !email.trim()
                          ? "Add your email."
                          : null
                }
            />
            <Field
                id={`${ids}-phone`}
                label="Phone (optional)"
                type="tel"
                autoComplete="tel"
                placeholder="+91 98…"
                value={phoneNo}
                onChange={onPhone}
                error={
                    phoneNo.replace(/\D/g, "").length > 3 || touched
                        ? phoneError
                        : null
                }
            />
            <WhereAndNote
                ids={ids}
                business={business}
                asksWhere={asksWhere}
                where={where}
                note={note}
                onWhere={onWhere}
                onNote={onNote}
            />
        </div>
    );
}
