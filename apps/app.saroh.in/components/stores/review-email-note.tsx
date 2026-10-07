import Link from "next/link";

import type { ReviewEmailNote } from "@/lib/product-reviews/describe";

/**
 * Why review invitations can't go (D11), and the way to fix it: connect the
 * business's own email, or see the plans where its plan can't (DEC-091).
 */
export function ReviewEmailNoteText({ note }: { note: ReviewEmailNote }) {
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
