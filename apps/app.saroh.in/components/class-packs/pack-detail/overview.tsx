import { Button } from "@saroh/ui/button";
import Link from "next/link";

import type { PackDetailTab } from "@/lib/class-packs/pack-detail";
import type {
    AboutRow,
    LinkedCard,
    Tile,
} from "@/lib/class-packs/pack-overview";

const H2 = "m-0 font-display text-[15px] font-semibold tracking-[-0.015em]";
const CARD = "rounded-[12px] border border-border bg-card";
const QUIET_LINK =
    "rounded-[4px] text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70";

function Pencil() {
    return (
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
                d="M4 20 H8 L19 9 L15 5 L4 16 Z M13 7 L17 11"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Pack Detail's Overview (E16, after the design): four figures, the cards
 * for what is linked to the pack — each opening its tab, the customer view
 * or the page it is managed on — and everything about it.
 */
export function PackOverviewTab({
    tiles,
    linked,
    about,
    editHref,
    onTab,
    onCustomerView,
}: {
    tiles: Tile[];
    linked: LinkedCard[];
    about: AboutRow[][];
    /** Null for someone who can't change packs, or an archived pack. */
    editHref: string | null;
    onTab: (tab: PackDetailTab) => void;
    onCustomerView: () => void;
}) {
    return (
        <>
            <div className="mb-4 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
                {tiles.map((t) => (
                    <div
                        key={t.k}
                        className={`${CARD} min-w-0 px-[15px] py-[13px]`}
                    >
                        <div className="text-[11.5px] text-muted-foreground">
                            {t.k}
                        </div>
                        <div className="mt-1 font-display text-[22px] font-semibold tabular-nums">
                            {t.v}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                            {t.sub}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mb-2.5 mt-1 flex flex-wrap items-baseline gap-2.5">
                <h2 className={H2}>Linked to this pack</h2>
                <span className="text-[12px] text-muted-foreground">
                    Read-only here. Each has its own tab, or links on to where
                    it is managed.
                </span>
            </div>
            <div className="mb-5 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
                {linked.map((c) => (
                    <section
                        key={c.key}
                        aria-label={c.k}
                        className={`${CARD} flex min-w-0 flex-col gap-[7px] px-[15px] py-[13px]`}
                    >
                        <div className="flex items-baseline gap-2">
                            <span className="flex-1 text-[11.5px] text-muted-foreground">
                                {c.k}
                            </span>
                            {"href" in c.open ? (
                                <Link
                                    href={c.open.href}
                                    aria-label={`Open ${c.k}`}
                                    className={`${QUIET_LINK} text-[12px] coarse:inline-flex coarse:min-h-11 coarse:items-center`}
                                >
                                    Open
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    aria-label={`Open ${c.k}`}
                                    onClick={() => {
                                        const open = c.open;
                                        if ("tab" in open) onTab(open.tab);
                                        else onCustomerView();
                                    }}
                                    className={`${QUIET_LINK} cursor-pointer border-0 bg-transparent p-0 text-[12px] coarse:min-h-11`}
                                >
                                    Open
                                </button>
                            )}
                        </div>
                        <div className="text-pretty text-[14px] font-semibold">
                            {c.v}
                        </div>
                        {c.lines.length > 0 ? (
                            <div className="flex flex-col gap-1 text-[12px] leading-[1.45] text-muted-foreground">
                                {c.lines.map((l) =>
                                    l.href ? (
                                        <Link
                                            key={l.text}
                                            href={l.href}
                                            className="rounded-[4px] text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground/70"
                                        >
                                            {l.text}
                                        </Link>
                                    ) : (
                                        <span key={l.text}>{l.text}</span>
                                    ),
                                )}
                            </div>
                        ) : null}
                    </section>
                ))}
            </div>

            <div className="mb-2.5 mt-1 flex flex-wrap items-baseline gap-2.5">
                <h2 className={H2}>Everything about it</h2>
                {editHref ? (
                    <Button asChild variant="outline" size="sm">
                        <Link href={editHref}>
                            <Pencil />
                            Edit
                        </Link>
                    </Button>
                ) : null}
                <span className="flex-[1_1_220px] text-[12px] text-muted-foreground">
                    Changes only affect new sales — packs already sold keep
                    their terms.
                </span>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
                {about.map((rows, i) => (
                    <dl
                        key={i}
                        className={`${CARD} m-0 min-w-0 px-[18px] py-1`}
                    >
                        {rows.map((r) => (
                            <div
                                key={r.k}
                                className="flex gap-3 border-b border-border/70 py-[11px]"
                            >
                                <dt className="flex-[0_0_116px] text-[12.5px] text-muted-foreground">
                                    {r.k}
                                </dt>
                                <dd className="m-0 min-w-0 flex-1 text-pretty text-[13.5px]">
                                    {r.v}
                                </dd>
                            </div>
                        ))}
                    </dl>
                ))}
            </div>
        </>
    );
}
