import type { NoticeProps } from "@saroh/ui/notice";
import { Notice } from "@saroh/ui/notice";

import { isRoleRefusal } from "@/lib/api/role-denied";

/**
 * Why a save didn't go through, said inside the sheet, dialog or confirm
 * that is still open (UX audit, 10 Oct 2026).
 *
 * A refusal by the person's role is a quiet note: nothing broke, and red
 * with an alert tells someone to try again at a thing that will only be
 * refused again. Anything else is the error it always was. The sentence
 * decides (`isRoleRefusal`), so a caller passes `res.error` and words
 * nothing.
 *
 * Outside an overlay the same sentence is a toast: `showError(res.error)`
 * already says a refusal calmly (`setRefusalTest` in `app/providers.tsx`).
 */
export function Refusal({
    children,
    ...props
}: Omit<NoticeProps, "tone" | "children"> & {
    /** The sentence, as the write's result gave it. Nothing draws nothing. */
    children: string | null | undefined;
}) {
    if (!children?.trim()) return null;
    return (
        <Notice tone={isRoleRefusal(children) ? "neutral" : "error"} {...props}>
            {children}
        </Notice>
    );
}
