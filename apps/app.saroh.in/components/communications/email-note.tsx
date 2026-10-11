import type { EmailNote } from "@/lib/communications/email-setup";
import { TextLink } from "@saroh/ui/text-link";

/**
 * Why a send can't go for want of the business's own email (DEC-011), and
 * the way to fix it: connect one, or see the plans where its plan can't
 * (DEC-091). Inline, in the line where the send is refused — review
 * invitations, an invoice's send.
 */
export function EmailNoteText({ note }: { note: EmailNote }) {
    return (
        <span className="text-pretty">
            {note.text}
            {note.action ? (
                <>
                    {" "}
                    <TextLink href={note.action.href}>
                        {note.action.label}
                    </TextLink>
                </>
            ) : null}
        </span>
    );
}
