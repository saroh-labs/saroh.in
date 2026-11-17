import { Arrow } from "@saroh/marketing/arrow";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { CtaBand } from "@/components/shared/cta-band";
import type { ChangelogEntry } from "@/content/changelog";
import { formatDate } from "@/lib/tools/dates";
import { signupHref } from "@/site.config";

export function EntryMeta({ entry }: { entry: ChangelogEntry }) {
    return (
        <>
            <time
                dateTime={entry.date}
                className="font-mono text-sm text-muted-foreground"
            >
                {formatDate(entry.date)}
            </time>
            <span
                className={`self-start rounded-full border px-[9px] py-[3px] text-[12px] font-semibold ${
                    entry.tag === "Global"
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground text-foreground"
                }`}
            >
                {entry.tag}
            </span>
        </>
    );
}

/** The words of an entry, on the list and on its own page. */
export function EntryBody({ entry }: { entry: ChangelogEntry }) {
    return (
        <>
            <p className="m-0 text-[17px] leading-[1.6] text-mk-copy">
                {entry.summary}
            </p>
            {entry.try ? (
                <Link
                    prefetch={false}
                    href={entry.try.href}
                    className={textLinkClasses({
                        tone: "ink",
                        className: "self-start",
                    })}
                >
                    {entry.try.label}
                    <Arrow />
                </Link>
            ) : null}
        </>
    );
}

export function ChangelogBand() {
    return (
        <CtaBand
            title="See what's new in Saroh."
            line="Try what's new on the free plan."
            action="Start free"
            href={signupHref("changelog")}
            from="start-free-band"
        />
    );
}
