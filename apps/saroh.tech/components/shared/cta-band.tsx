import { buttonClasses } from "@saroh/marketing/button";
import Link from "next/link";

/**
 * The closing band, in saroh.in's look (`@saroh/marketing/cta-band`). Its own
 * markup until U9: that one brings its own gutter, and these pages already have one.
 */
export function CtaBand({
    title,
    line,
    action,
    href,
    from,
}: {
    title: string;
    line?: string;
    action: string;
    href: string;
    /** What PostHog calls this click. */
    from: string;
}) {
    return (
        <section className="flex flex-wrap items-end justify-between gap-10 rounded-mk-band bg-foreground p-mk-band text-background">
            <div className="grid flex-[1_1_420px] gap-4">
                <h2 className="m-0 font-display text-mk-band font-bold [text-wrap:balance]">
                    {title}
                </h2>
                {line ? (
                    <p className="m-0 max-w-[46ch] text-mk-band-body text-mk-on-ink [text-wrap:pretty]">
                        {line}
                    </p>
                ) : null}
            </div>
            <Link
                prefetch={false}
                href={href}
                data-cta={from}
                className={buttonClasses({ variant: "saffron" })}
            >
                {action}
            </Link>
        </section>
    );
}
