import { buttonClasses } from "@saroh/marketing/button";
import { CtaBand as Band } from "@saroh/marketing/cta-band";
import Link from "next/link";

/** saroh.in's closing band, inside a page that already has its gutter. */
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
        <Band
            title={title}
            body={line}
            className="max-w-none px-0 pt-0"
            actions={
                <Link
                    prefetch={false}
                    href={href}
                    data-cta={from}
                    className={buttonClasses({ variant: "saffron" })}
                >
                    {action}
                </Link>
            }
        />
    );
}
