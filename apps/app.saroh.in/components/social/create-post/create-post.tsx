"use client";

import { Button } from "@saroh/ui/button";
import { PartialRead } from "@saroh/ui/failed-read";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { useState } from "react";

import type { ShareSetup } from "@/lib/share-item/share";
import { cardImageUrl, cardsFor } from "@/lib/share-item/share";
import type { LinkChoice } from "@/lib/social/links";
import type { PickRow } from "@/lib/social/pick";
import { CONTINUE_WITH } from "@/lib/social/pick";
import { POST_WORDS } from "@/lib/social/words";

import { ComposerFoot } from "./composer-foot";
import { ItemComposer } from "./item-composer";
import { OwnComposer } from "./own-composer";
import { PickStep } from "./pick-step";

type Step =
    | { at: "pick" }
    | { at: "item"; key: string }
    | { at: "own"; mode: "photo" | "text" };

/**
 * Create post (#1378, plan 2026-11-12-003 U7): pick something live from the
 * business, or make your own post, then its cards and caption, shared now
 * on any plan. Saroh Social adds channels and scheduling to this same page
 * later: until then both are drawn locked (SFCLocked*).
 */
export function CreatePost({
    rows,
    setup,
    origin,
    fixedLinks,
    pageLinks,
    canPost,
    business,
    failed,
}: {
    rows: PickRow[];
    setup: ShareSetup;
    origin: string;
    fixedLinks: LinkChoice[];
    pageLinks: LinkChoice[];
    /** `social:post`: may make an own post. */
    canPost: boolean;
    business: string;
    failed: string[];
}) {
    const narrow = useNarrow();
    const [step, setStep] = useState<Step>({ at: "pick" });
    const [picked, setPicked] = useState<string | null>(null);
    const row = rows.find((r) => r.key === picked) ?? null;
    const pickedItem = row?.item ? row : null;
    const toPick = () => setStep({ at: "pick" });

    const own = step.at === "own";
    const header = (
        <PageHeader
            className="mb-5"
            holdsData={false}
            breadcrumb={[POST_WORDS.social, POST_WORDS.title]}
            title={own ? POST_WORDS.ownTitle : POST_WORDS.title}
            description={
                own ? POST_WORDS.ownDescription : POST_WORDS.description
            }
        />
    );

    if (step.at === "own") {
        return (
            <div>
                {header}
                <OwnComposer
                    mode={step.mode}
                    setup={setup}
                    origin={origin}
                    fixedLinks={fixedLinks}
                    pageLinks={pageLinks}
                    narrow={narrow}
                    onPickInstead={toPick}
                    renderFoot={(parts, note) => (
                        <ComposerFoot
                            parts={parts}
                            lock={setup.schedule}
                            narrow={narrow}
                            note={note}
                        />
                    )}
                />
            </div>
        );
    }

    if (step.at === "item") {
        const chosen = rows.find((r) => r.key === step.key);
        if (chosen?.item) {
            return (
                <div>
                    {header}
                    <ItemComposer
                        key={chosen.key}
                        row={{ ...chosen, item: chosen.item }}
                        setup={setup}
                        business={business}
                        narrow={narrow}
                        onChange={toPick}
                    />
                </div>
            );
        }
    }

    const go = () => {
        if (pickedItem) setStep({ at: "item", key: pickedItem.key });
    };
    return (
        <div>
            {header}
            {failed.length > 0 ? (
                <PartialRead className="mb-4" things={failed.join(", ")} />
            ) : null}
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
                <PickStep
                    rows={rows}
                    picked={picked}
                    onPick={setPicked}
                    canPost={canPost}
                    onOwn={(mode) => setStep({ at: "own", mode })}
                />
                {pickedItem?.item && !narrow ? (
                    <ItsPosts
                        key={pickedItem.key}
                        setup={setup}
                        row={{ ...pickedItem, item: pickedItem.item }}
                    />
                ) : null}
            </div>
            <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-end gap-3 border-t border-border bg-background px-4 py-3 sm:-mx-[26px] sm:px-[26px]">
                {narrow ? (
                    <Button
                        type="button"
                        size="lg"
                        className="h-11 w-full"
                        disabled={!pickedItem}
                        onClick={go}
                        data-continue=""
                        data-ph-unmask=""
                    >
                        {pickedItem
                            ? CONTINUE_WITH[pickedItem.kind]
                            : POST_WORDS.continue}
                    </Button>
                ) : (
                    <>
                        {pickedItem ? null : (
                            <p className="mr-auto text-[12.5px] text-muted-foreground">
                                {POST_WORDS.pickOne}
                            </p>
                        )}
                        <Button asChild variant="outline">
                            <Link href="/">{POST_WORDS.cancel}</Link>
                        </Button>
                        <Button
                            type="button"
                            disabled={!pickedItem}
                            onClick={go}
                            data-continue=""
                        >
                            {POST_WORDS.continue}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

/** The picked thing's cards, small (SGPickDesk's "Its posts"). */
function ItsPosts({
    setup,
    row,
}: {
    setup: ShareSetup;
    row: PickRow & { item: NonNullable<PickRow["item"]> };
}) {
    const cards = cardsFor(row.item);
    return (
        <section aria-label={POST_WORDS.itsPosts} className="grid gap-3">
            <h2 className="text-[15px] font-semibold">{POST_WORDS.itsPosts}</h2>
            <div className="flex flex-wrap gap-3">
                {cards.map((style) => (
                    <Thumb
                        key={style}
                        src={cardImageUrl(setup, row.item, style, "post", {
                            w: 240,
                        })}
                    />
                ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
                {POST_WORDS.itsPostsNext}
            </p>
        </section>
    );
}

function Thumb({ src }: { src: string }) {
    return (
        <span className="block aspect-[4/5] w-[150px] overflow-hidden rounded-[6px] bg-muted shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- a PNG the API draws */}
            <img src={src} alt="" className="size-full object-cover" />
        </span>
    );
}
