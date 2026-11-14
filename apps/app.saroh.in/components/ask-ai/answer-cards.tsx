import type {
    AskAiInfoCard,
    AskAiProductsCard,
    AskAiTableCard,
} from "@saroh/api-contract";
import { cn } from "@saroh/ui/lib/utils";
import { ListTable, listTable, ListTableHead } from "@saroh/ui/list-table";
import { Info } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import { initials } from "@/lib/products/catalogue";

/**
 * The cards under an answer (14 Nov; board 3's mini table and source
 * line): what a tool found, typed by the API, never the model's text. The
 * only pictures are product covers on Saroh's own media host and the only
 * links are the app's own pages; anything else is dropped here too.
 */

/** Where business media is served from: the CSP's img-src media (`@saroh/auth/security-headers`). */
export const MEDIA_ORIGINS = [
    "https://media.saroh.in",
    "https://media.saroh.io",
];

/** A cover on Saroh's media host, else null. */
export function mediaSrc(url: string | null): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        return MEDIA_ORIGINS.includes(u.origin) ? u.toString() : null;
    } catch {
        return null;
    }
}

/** An app route ("/commerce/orders"), never another site. */
const appHref = (href: string | undefined) =>
    // A backslash or a second slash would leave the app ("/\\evil.com").
    href && /^\/(?![/\\])[^\s\\]*$/.test(href) ? href : null;

export function AnswerCard({ card }: { card: AskAiInfoCard }) {
    return card.kind === "products" ? (
        <ProductsCard card={card.data} />
    ) : (
        <TableCard card={card.data} />
    );
}

function Foot({
    more,
    link,
}: {
    more?: number;
    link?: { label: string; href: string };
}) {
    const href = appHref(link?.href);
    if (!more && !href) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {more ? <span>+{more} more</span> : null}
            {href && link ? (
                <Link
                    href={href}
                    className="font-medium text-foreground underline underline-offset-2"
                >
                    {link.label} ›
                </Link>
            ) : null}
        </div>
    );
}

function ProductsCard({ card }: { card: AskAiProductsCard }) {
    return (
        <section aria-label={card.title} className="flex flex-col gap-2">
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 p-0">
                {card.items.map((p) => {
                    const src = mediaSrc(p.imageUrl);
                    const href = appHref(p.href);
                    const body = (
                        <>
                            {src ? (
                                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photo on Saroh's media host, outside next/image's allowlist
                                <img
                                    src={src}
                                    alt=""
                                    aria-hidden
                                    loading="lazy"
                                    className="aspect-square w-full rounded-[8px] bg-muted object-cover"
                                />
                            ) : (
                                <span
                                    aria-hidden
                                    className="flex aspect-square w-full items-center justify-center rounded-[8px] bg-muted font-display text-lg font-semibold text-neutral-700 dark:text-foreground"
                                >
                                    {initials(p.name)}
                                </span>
                            )}
                            <span className="line-clamp-2 text-[13px] font-medium leading-snug">
                                {p.name}
                            </span>
                            <span className="flex flex-col text-[12px] tabular-nums leading-snug text-muted-foreground">
                                {p.price ? <span>{p.price}</span> : null}
                                {p.sold !== null ? (
                                    <span className="text-foreground">
                                        {p.sold} sold
                                        {p.amount ? ` · ${p.amount}` : ""}
                                    </span>
                                ) : null}
                                {p.stock !== null ? (
                                    <span>
                                        {p.stock > 0
                                            ? `${p.stock} in stock`
                                            : "Out of stock"}
                                    </span>
                                ) : null}
                            </span>
                        </>
                    );
                    const box =
                        "flex h-full flex-col gap-1.5 rounded-[10px] border border-border bg-card p-2";
                    return (
                        <li key={p.id}>
                            {href ? (
                                <Link
                                    href={href}
                                    className={cn(
                                        box,
                                        listTable.wash,
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    )}
                                >
                                    {body}
                                </Link>
                            ) : (
                                <div className={box}>{body}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
            <Foot more={card.more} link={card.link} />
        </section>
    );
}

function TableCard({ card }: { card: AskAiTableCard }) {
    const numeric = new Set(card.numeric ?? []);
    const rowHref = (r: number) => appHref(card.hrefs?.[r] ?? undefined);
    // One grid for the table, the head and rows on its columns (subgrid),
    // so every row lines up. The first column takes the room it needs; on a
    // phone the rest are narrow (cut, the card scrolls sideways), at the
    // desk they share what's left.
    const cols = {
        "--cols": Math.max(1, card.columns.length - 1),
    } as React.CSSProperties;
    const onColumns = "col-span-full grid grid-cols-subgrid";
    const cell = (i: number, last: boolean) =>
        cn(
            "px-2 first:pl-3 last:pr-3 sm:px-2.5",
            numeric.has(i) && listTable.numeric,
            !numeric.has(i) && i > 0 && !last && "truncate",
        );
    return (
        <section className="flex flex-col gap-2">
            <ListTable scroll className="overflow-x-auto">
                <div
                    role="table"
                    aria-label={card.title}
                    style={cols}
                    className="grid min-w-max grid-cols-[max-content_repeat(var(--cols),minmax(56px,112px))] text-[13px] sm:min-w-0 sm:grid-cols-[minmax(max-content,1.3fr)_repeat(var(--cols),minmax(0,1fr))]"
                >
                    <ListTableHead
                        role="row"
                        className={cn(onColumns, "px-0 py-0")}
                    >
                        {card.columns.map((c, i) => (
                            <span
                                key={c}
                                role="columnheader"
                                className={cell(
                                    i,
                                    i === card.columns.length - 1,
                                )}
                            >
                                {c}
                            </span>
                        ))}
                    </ListTableHead>
                    <div role="rowgroup" className="contents">
                        {card.rows.map((row, r) => (
                            <div
                                key={r}
                                role="row"
                                className={cn(
                                    listTable.row,
                                    onColumns,
                                    "items-center px-0 py-2",
                                )}
                            >
                                {row.map((value, i) => (
                                    <span
                                        key={i}
                                        role="cell"
                                        title={value}
                                        className={cn(
                                            // One line a row: a long name is cut, never wrapped to three.
                                            "whitespace-nowrap",
                                            cell(i, i === row.length - 1),
                                            i === 0 && "font-medium",
                                        )}
                                    >
                                        {/* The first cell carries the row's link, as DataView's rows. */}
                                        {i === 0 && rowHref(r) ? (
                                            <Link
                                                href={rowHref(r) ?? ""}
                                                className="block rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {value}
                                            </Link>
                                        ) : (
                                            value
                                        )}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </ListTable>
            <Foot more={card.more} link={card.link} />
        </section>
    );
}
