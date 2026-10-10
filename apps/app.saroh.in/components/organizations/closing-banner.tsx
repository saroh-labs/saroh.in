import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { ClosingView } from "@/lib/organizations/closing";
import { closingBanner } from "@/lib/organizations/closing";

/** Rows shown before the rest fold under "Show all". */
const FIRST_ROWS = 3;

/**
 * Above every page while the business is scheduled for deletion (#921,
 * owner 9 Oct): when, what still works, the refunds not yet back with its
 * customers — each linked to its order or invoice, with what to find it by
 * in the provider's dashboard — and the autopay memberships deletion won't
 * cancel at the provider. Said in words, never only a colour. The API
 * decides what this reader may see (`GET …/closing`); nothing when the
 * business isn't closing or the read failed.
 */
export function ClosingBanner({ view }: { view: ClosingView | null }) {
    const b = closingBanner(view);
    if (!b) return null;
    return (
        <div
            role="status"
            className="grid gap-2.5 border-b border-border/70 bg-warning-subtle px-4 py-3 text-[13px] leading-normal text-warning-subtle-foreground sm:px-6"
        >
            <p className="text-pretty">
                <span className="font-semibold">
                    {b.title}
                    {b.deletesOn ? (
                        <>
                            {" "}
                            on <ViewerDate iso={b.deletesOn} />
                        </>
                    ) : null}
                    .
                </span>{" "}
                {b.body}
            </p>

            {b.refunds ? (
                <section aria-label="Refunds not yet back with customers">
                    <p className="text-pretty font-medium">{b.refunds.intro}</p>
                    <Rows
                        rows={b.refunds.lines.map((line) => ({
                            key: line.key,
                            body: (
                                <>
                                    {line.href ? (
                                        <Link
                                            href={line.href}
                                            className="font-medium underline underline-offset-2"
                                        >
                                            {line.label}
                                        </Link>
                                    ) : (
                                        <span className="font-medium">
                                            {line.label}
                                        </span>
                                    )}
                                    {line.detail ? ` · ${line.detail}` : null}
                                    {line.reference ? (
                                        <>
                                            {" · "}
                                            <span className="font-mono text-[12px]">
                                                {line.reference}
                                            </span>
                                        </>
                                    ) : null}
                                </>
                            ),
                        }))}
                        what="refunds"
                    />
                    {b.refunds.more ? (
                        <p className="mt-1">{b.refunds.more}</p>
                    ) : null}
                </section>
            ) : null}

            {b.memberships ? (
                <section aria-label="Autopay memberships at the provider">
                    {b.memberships.warnings.map((w) => (
                        <p key={w} className="text-pretty font-medium">
                            {w}
                        </p>
                    ))}
                    <Rows
                        rows={b.memberships.lines.map((line) => ({
                            key: line.key,
                            body: (
                                <Link
                                    href={line.href}
                                    className="underline underline-offset-2"
                                >
                                    {line.label}
                                </Link>
                            ),
                        }))}
                        what="memberships"
                    />
                </section>
            ) : null}
        </div>
    );
}

/** A short list, the rest behind "Show all N" so the page stays in reach. */
function Rows({
    rows,
    what,
}: {
    rows: { key: string; body: React.ReactNode }[];
    what: string;
}) {
    if (rows.length === 0) return null;
    const first = rows.slice(0, FIRST_ROWS);
    const rest = rows.slice(FIRST_ROWS);
    return (
        <>
            <ul className="mt-1 grid list-disc gap-0.5 pl-4">
                {first.map((r) => (
                    <li key={r.key} className="break-words">
                        {r.body}
                    </li>
                ))}
            </ul>
            {rest.length > 0 ? (
                <details className="mt-1">
                    <summary className="cursor-pointer font-medium underline underline-offset-2">
                        Show all {rows.length} {what}
                    </summary>
                    <ul className="mt-1 grid list-disc gap-0.5 pl-4">
                        {rest.map((r) => (
                            <li key={r.key} className="break-words">
                                {r.body}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </>
    );
}
