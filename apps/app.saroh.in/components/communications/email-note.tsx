import Link from "next/link";

import type { EmailNote } from "@/lib/communications/email-setup";

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
                    <Link
                        href={note.action.href}
                        className="font-medium text-foreground underline underline-offset-4 hover:decoration-2 active:text-muted-foreground"
                    >
                        {note.action.label}
                    </Link>
                </>
            ) : null}
        </span>
    );
}
