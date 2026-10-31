import type { ReactNode } from "react";

import type { Block, Inline } from "../blocks/types";
import { Callout, Figure, Section } from "./content-blocks";
import { DataTable } from "./data-table";

type Resolve = (href: string) => string | undefined;

/** A run of words; a link goes through `resolve`, or nowhere without it. */
function Words({ inline, resolve }: { inline: Inline[]; resolve?: Resolve }) {
    return inline.map((r, i) =>
        r.t === "link" ? (
            <a key={i} href={resolve?.(r.href)}>
                {r.text}
            </a>
        ) : r.t === "bold" ? (
            <b key={i}>{r.text}</b>
        ) : (
            <span key={i}>{r.text}</span>
        ),
    );
}

/**
 * A page's parsed text (U2's blocks): each H2 opens a `Section` with the
 * H2's id, so OnThisPage can link to it. Links go through `resolve`;
 * without it (the admin preview) they go nowhere.
 */
export function Prose({
    blocks,
    resolve,
}: {
    blocks: readonly Block[];
    resolve?: Resolve;
}) {
    const w = (inline: Inline[]) => <Words inline={inline} resolve={resolve} />;
    const draw = (b: Block, i: number, title = "Table"): ReactNode => {
        switch (b.type) {
            case "h2":
                return null;
            case "p":
                return (
                    <p key={i} className="sp-prose-p">
                        {w(b.inline)}
                    </p>
                );
            case "ul":
            case "ol": {
                const List = b.type;
                return (
                    <List key={i} className="sp-prose-list">
                        {b.items.map((it, j) => (
                            <li key={j}>{w(it)}</li>
                        ))}
                    </List>
                );
            }
            case "table":
                return (
                    <DataTable
                        key={i}
                        variant="simple"
                        caption={title}
                        columns={b.head.map((h) => ({
                            label: h.map((r) => r.text).join(""),
                        }))}
                        rows={b.rows.map((r) => ({ cells: r.map(w) }))}
                    />
                );
            case "callout":
                return <Callout key={i}>{w(b.inline)}</Callout>;
            case "image":
                return <Figure key={i} src={b.src} alt={b.alt} />;
        }
    };
    const sections: {
        head?: { id: string; text: string };
        body: Block[];
    }[] = [];
    for (const b of blocks) {
        if (b.type === "h2") sections.push({ head: b, body: [] });
        else if (sections.length) sections[sections.length - 1]?.body.push(b);
        else sections.push({ body: [b] });
    }
    return (
        <>
            {sections.map((s, i) =>
                s.head ? (
                    <Section key={i} title={s.head.text} id={s.head.id}>
                        {s.body.map((b, j) => draw(b, j, s.head?.text))}
                    </Section>
                ) : (
                    <div key={i} className="sp-prose">
                        {s.body.map((b, j) => draw(b, j))}
                    </div>
                ),
            )}
        </>
    );
}
