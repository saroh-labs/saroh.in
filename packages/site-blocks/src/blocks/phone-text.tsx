import type { ReactNode } from "react";

/**
 * Different words on a phone (KD9, DEC-237): a button's label, the hero's
 * line and a Text block's body may carry a shorter phone version. Both are
 * in the page and CSS shows one per width, so nothing loads on tap and
 * search engines read both. The hidden one is `display: none`, so a
 * button's accessible name is always the words on screen. The site's one
 * breakpoint is 700px (frontend-design-system.md).
 *
 * The heading never comes here: one h1, the same on every width.
 */
export const DESK_ONLY = "max-[699px]:hidden";
export const PHONE_ONLY = "min-[700px]:hidden";

/**
 * The phone version when it has words of its own, else null: empty,
 * whitespace, an empty paragraph or the desk's own words draw the desk's
 * text alone, with no second copy in the markup.
 */
export function phoneVersion(
    phone: string | null | undefined,
    desk: string,
): string | null {
    // `[^<>]`, not `[^>]`: a run of `<` with no `>` is then linear, not quadratic.
    if (!phone || phone.replace(/<[^<>]*>/g, " ").trim() === "") return null;
    return phone.trim() === desk.trim() ? null : phone;
}

/** A line or a label with its phone words, swapped at the breakpoint. */
export function PhoneText({
    text,
    phone,
}: {
    text: string;
    phone?: string | null;
}): ReactNode {
    const short = phoneVersion(phone, text);
    if (short === null) return text;
    return (
        <>
            <span className={DESK_ONLY}>{text}</span>
            <span className={PHONE_ONLY}>{short}</span>
        </>
    );
}
