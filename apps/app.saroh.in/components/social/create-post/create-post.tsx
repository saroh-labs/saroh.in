"use client";

import { Button } from "@saroh/ui/button";
import { PartialRead } from "@saroh/ui/failed-read";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { useState } from "react";

import type { ShareSetup } from "@/lib/share-item/share";
import type { LinkChoice } from "@/lib/social/links";
import type { OwnPost } from "@/lib/social/own-posts";
import type { PickRow } from "@/lib/social/pick";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";
import type { SocialCompose } from "@/lib/social/use-social-post";
import { POST_WORDS } from "@/lib/social/words";

import { ItemComposer } from "./item-composer";
import { OwnComposer } from "./own-composer";
import { PickStep } from "./pick-step";

export type Step =
    | { at: "pick" }
    | { at: "item"; key: string }
    | { at: "own"; photo: boolean; post: OwnPost | null };

/**
 * Create post (#1378; boards BPick*, BPost*, BCaption*, BOwn*, BDone*,
 * 16 Nov): pick something live from the business, or write your own post,
 * and it opens finished: the post as Instagram shows it, Ready to share
 * beside it. Shared now on any plan; Saroh Social's channels are drawn
 * locked. `start` opens it on a thing (Social's Make this post) or on a
 * saved own post (Your posts).
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
    ownCount,
    start = { at: "pick" },
    social = null,
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
    ownCount: number;
    start?: Step;
    /** Saroh Social, when it is on for the business: post it, not only share it. */
    social?: SocialCompose | null;
}) {
    const narrow = useNarrow();
    const [step, setStep] = useState<Step>(start);
    const [done, setDone] = useState(false);
    const toPick = () => {
        setDone(false);
        setStep({ at: "pick" });
    };
    const shown = setup.business ?? business;

    const row =
        step.at === "item"
            ? rows.find((r) => r.key === step.key && r.item !== null)
            : undefined;
    const own = step.at === "own";
    const picking = step.at === "pick" || (step.at === "item" && !row);

    const header = (
        <PageHeader
            className="mb-5"
            holdsData={false}
            compactOnPhone
            breadcrumb={[
                <Link key="social" href="/social">
                    {POST_WORDS.social}
                </Link>,
                POST_WORDS.title,
            ]}
            title={own ? POST_WORDS.ownTitle : POST_WORDS.title}
            description={
                done || narrow
                    ? undefined
                    : picking
                      ? POST_WORDS.pickDescription
                      : own
                        ? POST_WORDS.ownDescription
                        : social
                          ? SOCIAL_WORDS.readyFor
                          : POST_WORDS.readyDescription
            }
            actions={
                narrow && row && !done ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="bg-card"
                        onClick={toPick}
                    >
                        {POST_WORDS.change}
                    </Button>
                ) : undefined
            }
        />
    );

    if (step.at === "own") {
        return (
            <div>
                {header}
                <OwnComposer
                    initial={step.post}
                    startWithPhoto={step.photo}
                    setup={setup}
                    origin={origin}
                    fixedLinks={fixedLinks}
                    pageLinks={pageLinks}
                    business={shown}
                    ownCount={ownCount}
                    narrow={narrow}
                    onAnother={toPick}
                    onDone={setDone}
                    social={social}
                />
            </div>
        );
    }

    if (row?.item) {
        return (
            <div>
                {header}
                <ItemComposer
                    key={row.key}
                    row={{ ...row, item: row.item }}
                    setup={setup}
                    business={shown}
                    narrow={narrow}
                    onChange={toPick}
                    onAnother={toPick}
                    onDone={setDone}
                    social={social}
                />
            </div>
        );
    }

    return (
        <div>
            {header}
            {failed.length > 0 ? (
                <PartialRead className="mb-4" things={failed.join(", ")} />
            ) : null}
            <PickStep
                rows={rows}
                setup={setup}
                canPost={canPost}
                narrow={narrow}
                onOpen={(key) => setStep({ at: "item", key })}
                onOwn={(mode) =>
                    setStep({ at: "own", photo: mode === "photo", post: null })
                }
            />
        </div>
    );
}
