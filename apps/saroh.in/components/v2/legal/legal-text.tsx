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

/**
 * A legal page's text (plan U1, `/privacy`): headings in Space Grotesk with
 * a rule above, running copy at reading size, lists, and tables that keep
 * to the column (their cells wrap on a phone; nothing scrolls sideways).
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
                            <div
                                key={i}
                                className="overflow-hidden rounded-mk-card border border-border bg-card"
                            >
                                <table className="w-full border-collapse text-left text-[15px] leading-[1.55] [overflow-wrap:anywhere]">
                                    <thead>
                                        <tr>
                                            {block.head.map((cell, j) => (
                                                <th
                                                    key={j}
                                                    scope="col"
                                                    className="border-b border-border px-4 py-3 text-[13px] font-semibold text-muted-foreground"
                                                >
                                                    {cell}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {block.rows.map((row, j) => (
                                            <tr
                                                key={j}
                                                className="border-b border-mk-line-row last:border-b-0"
                                            >
                                                {row.map((cell, k) => (
                                                    <td
                                                        key={k}
                                                        className={
                                                            k === 0
                                                                ? "px-4 py-3 align-top font-semibold text-foreground"
                                                                : "px-4 py-3 align-top text-mk-copy"
                                                        }
                                                    >
                                                        <Inline text={cell} />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                }
            })}
        </div>
    );
}
