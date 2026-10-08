import { cn } from "../../lib/utils";
import type { BookingWhere } from "../model";
import { MAX_INTAKE_NOTE, whereLabel } from "../model";
import { focusRing, inputFill, optionClasses } from "../styles";

/**
 * The details step's own questions (E7), under who the booker is: Where,
 * for a service offered either way, and "Anything we should know?". They
 * sit apart from who is booking on purpose: sign-in replaced the name,
 * email and phone fields (A9), and these stayed.
 */
export function WhereAndNote({
    ids,
    business,
    asksWhere,
    where,
    onlyWhere = null,
    note,
    onWhere,
    onNote,
}: {
    /** The flow's `useId()`, so each field's id is its own. */
    ids: string;
    business: string;
    /** Only a service offered either way asks Where. */
    asksWhere: boolean;
    where: BookingWhere;
    /**
     * The one way the chosen time can be had (DEC-087), or null: the other
     * is shown but can't be picked, and the page says why.
     */
    onlyWhere?: BookingWhere | null;
    note: string;
    onWhere: (where: BookingWhere) => void;
    onNote: (note: string) => void;
}) {
    const whereId = `${ids}-where`;
    const noteId = `${ids}-note`;
    return (
        <>
            {asksWhere ? (
                <div className="mt-3.5">
                    <p
                        id={whereId}
                        className="text-site-fg text-[13.5px] font-medium"
                    >
                        Where
                    </p>
                    <div
                        role="radiogroup"
                        aria-labelledby={whereId}
                        className="mt-1.5 flex flex-wrap gap-2"
                    >
                        {(["IN_PERSON", "ONLINE"] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={where === option}
                                disabled={
                                    onlyWhere !== null && onlyWhere !== option
                                }
                                onClick={() => onWhere(option)}
                                className={cn(
                                    optionClasses(where === option),
                                    "text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                                )}
                            >
                                {whereLabel(option, business)}
                            </button>
                        ))}
                    </div>
                    {onlyWhere ? (
                        <p className="text-site-muted mt-1.5 text-[12.5px]">
                            {onlyWhere === "ONLINE"
                                ? `${business} is closed then, so this time is online only.`
                                : "This time is in person only."}
                        </p>
                    ) : null}
                    {where === "ONLINE" ? (
                        <p className="text-site-muted mt-1.5 text-[12.5px]">
                            The link to join shows here once you&apos;re booked.
                        </p>
                    ) : null}
                </div>
            ) : null}
            <div className="mt-3.5">
                <label
                    htmlFor={noteId}
                    className="text-site-fg block text-[13.5px] font-medium"
                >
                    Anything we should know?
                </label>
                <p
                    id={`${noteId}-hint`}
                    className="text-site-muted mt-0.5 text-[12.5px]"
                >
                    Medicines, allergies, pregnancy, or if you&apos;re nervous.
                    Only {business}&apos;s team sees this.
                </p>
                <textarea
                    id={noteId}
                    rows={3}
                    maxLength={MAX_INTAKE_NOTE}
                    placeholder="e.g. I take blood thinners"
                    value={note}
                    onChange={(e) => onNote(e.target.value)}
                    aria-describedby={`${noteId}-hint`}
                    className={cn(
                        "border-site-border text-site-fg placeholder:text-site-muted mt-1.5 block w-full resize-y rounded-[calc(var(--site-radius)+7px)] border px-3.5 py-2.5 text-[15px]",
                        inputFill,
                        focusRing,
                    )}
                />
            </div>
        </>
    );
}
