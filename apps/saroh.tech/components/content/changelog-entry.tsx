import Link from "next/link";

import { ConfirmTag } from "@/components/shared/confirm-tag";
import type { ChangelogEntry } from "@/content/changelog";
import { placeholders } from "@/content/placeholders";
import { formatDate } from "@/lib/tools/dates";

export function EntryMeta({ entry }: { entry: ChangelogEntry }) {
    return (
        <>
            <time
                dateTime={entry.date}
                className="font-mono text-sm text-quiet"
            >
                {formatDate(entry.date)}
            </time>
            <span
                className={`self-start rounded-full border px-[9px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.08em] ${
                    entry.tag === "Global"
                        ? "border-ink bg-ink text-paper"
                        : "border-ink text-ink"
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
            <p className="m-0 text-[17px] leading-[1.6] text-body">
                {entry.summary}
            </p>
            {entry.example ? (
                <div>
                    <ConfirmTag>{`Example ${placeholders.changelog}`}</ConfirmTag>
                </div>
            ) : null}
            {entry.try ? (
                <Link
                    prefetch={false}
                    href={entry.try.href}
                    className="inline-flex min-h-11 items-center self-start font-semibold md:min-h-0"
                >
                    {entry.try.label} →
                </Link>
            ) : null}
        </>
    );
}
