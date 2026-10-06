import { Fragment } from "react";

import type { LegalBlock } from "@/lib/legal-markdown";
import { inlineRuns } from "@/lib/legal-markdown";

const EMAIL = /([a-z0-9._-]+@[a-z0-9-]+\.[a-z.]+[a-z])/i;

/** A line of the owner's text: bold where written, and the email address as a link. */
function Inline({ text }: { text: string }) {
    return (
        <>
            {inlineRuns(text).map((run, i) => {
                const parts = run.text.split(EMAIL).map((part, j) =>
                    EMAIL.test(part) && j % 2 === 1 ? (
                        <a key={j} href={`mailto:${part}`}>
                            {part}
                        </a>
                    ) : (
                        <Fragment key={j}>{part}</Fragment>
                    ),
                );
                return run.bold ? (
                    <strong key={i} className="font-semibold text-foreground">
                        {parts}
                    </strong>
                ) : (
                    <Fragment key={i}>{parts}</Fragment>
                );
            })}
        </>
    );
}

/** Words wrap whole, hyphenated by the page's `lang`; a long address may break as a last resort. */
const WRAP = "break-words hyphens-auto";

/**
 * A pipe table, drawn twice and switched by CSS so nothing flashes on
 * hydration (audit T1). Below `sm` each row is a card in a list: its first
 * cell the card's bold heading, every other cell under its column name in a
 * `<dl>`, so a screen reader hears label and value. From `sm` up it is a
 * real `<table>`. The hidden one is `display: none`, out of the
 * accessibility tree too, so neither needs `aria-hidden`.
 */
function LegalTable({ head, rows }: { head: string[]; rows: string[][] }) {
    return (
        <>
            <ul
                role="list"
                data-legal-cards
                className="m-0 grid list-none gap-3 p-0 sm:hidden"
            >
                {rows.map((row, j) => (
                    <li
                        key={j}
                        className="rounded-mk-card border border-border bg-card px-4 py-3.5"
                    >
                        <p
                            className={`m-0 text-[16px] font-semibold leading-[1.4] text-foreground ${WRAP}`}
                        >
                            <Inline text={row[0] ?? ""} />
                        </p>
                        <dl className="m-0 mt-2.5 grid gap-2.5">
                            {row.slice(1).map((cell, k) => (
                                <div key={k}>
                                    <dt className="text-[13px] font-semibold text-muted-foreground">
                                        {head[k + 1]}
                                    </dt>
                                    <dd
                                        className={`m-0 mt-0.5 text-[15px] leading-[1.55] text-mk-copy ${WRAP}`}
                                    >
                                        <Inline text={cell} />
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </li>
                ))}
            </ul>
            <div className="hidden rounded-mk-card border border-border bg-card sm:block">
                <table
                    className={`w-full border-collapse text-left text-[15px] leading-[1.55] ${WRAP}`}
                >
                    <thead>
                        <tr>
                            {head.map((cell, j) => (
                                <th
                                    key={j}
                                    scope="col"
                                    className="border-b border-border px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground"
                                >
                                    {cell}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, j) => (
                            <tr
                                key={j}
                                className="border-b border-mk-line-row last:border-b-0"
                            >
                                {row.map((cell, k) =>
                                    k === 0 ? (
                                        <th
                                            key={k}
                                            scope="row"
                                            className="px-4 py-3 text-left align-top font-semibold text-foreground"
                                        >
                                            <Inline text={cell} />
                                        </th>
                                    ) : (
                                        <td
                                            key={k}
                                            className="px-4 py-3 align-top text-mk-copy"
                                        >
                                            <Inline text={cell} />
                                        </td>
                                    ),
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/**
 * A legal page's text (plan U1, `/privacy`): headings in Space Grotesk with
 * a rule above, running copy at reading size, lists, and tables that keep
 * to the column: cards on a phone, a table from `sm` up (audit T1).
 */
export function LegalText({ blocks }: { blocks: LegalBlock[] }) {
    return (
        <div className="grid gap-4 text-mk-body text-mk-prose [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:hover:text-foreground">
            {blocks.map((block, i) => {
                switch (block.kind) {
                    case "heading":
                        return (
                            <h2
                                key={i}
                                id={block.id}
                                className="m-0 mt-6 scroll-mt-6 border-t border-border pt-6 font-display text-mk-card-lg font-bold text-foreground"
                            >
                                {block.text}
                            </h2>
                        );
                    case "paragraph":
                        return (
                            <p
                                key={i}
                                className="m-0 leading-[1.7] [text-wrap:pretty]"
                            >
                                <Inline text={block.text} />
                            </p>
                        );
                    case "list":
                        return (
                            <ul
                                key={i}
                                className="m-0 grid list-disc gap-2 pl-6 leading-[1.7] marker:text-muted-foreground"
                            >
                                {block.items.map((item, j) => (
                                    <li key={j}>
                                        <Inline text={item} />
                                    </li>
                                ))}
                            </ul>
                        );
                    case "table":
                        return (
                            <LegalTable
                                key={i}
                                head={block.head}
                                rows={block.rows}
                            />
                        );
                }
            })}
        </div>
    );
}
