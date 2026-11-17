import { Closing } from "./closing";

/**
 * A closing inside a page that already has its gutter: the redesign's
 * ClosingCTA (`Closing`), its line read as the note.
 */
export function CtaBand({
    title,
    line,
    action,
    href,
    from,
}: {
    title: string;
    line: string;
    action: string;
    href: string;
    /** What PostHog calls this click. */
    from: string;
}) {
    return (
        <Closing
            id={from}
            inset
            title={title}
            href={href}
            from={from}
            action={action}
            note={line}
        />
    );
}
