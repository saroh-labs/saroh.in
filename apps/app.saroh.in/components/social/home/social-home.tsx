"use client";

import { Button } from "@saroh/ui/button";
import { PartialRead } from "@saroh/ui/failed-read";
import { IconButton } from "@saroh/ui/icon-button";
import { IntentLink } from "@saroh/ui/intent-link";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { TextLink } from "@saroh/ui/text-link";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { DeleteMenu } from "@/components/shared/confirm/delete-menu";
import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { PageLoading } from "@/components/shared/page/page-loading";
import { DrawnCard } from "@/components/shared/share-item/insta-frame";
import { SocialLine } from "@/components/shared/share-item/schedule-lock";
import { formatRelative } from "@/lib/format/datetime";
import type { ShareItem, ShareSetup } from "@/lib/share-item/share";
import { cardImageUrl, firstStyle } from "@/lib/share-item/share";
import { removeOwnPost } from "@/lib/social/actions";
import type { OwnPost } from "@/lib/social/own-posts";
import type { PickRow } from "@/lib/social/pick";
import { ownPostsRead } from "@/lib/social/queries";
import type { FirstPick } from "@/lib/social/today";
import { firstPicks, worthPosting } from "@/lib/social/today";
import { useSocialSave } from "@/lib/social/use-social";
import { POST_WORDS } from "@/lib/social/words";

import { OwnThumb } from "../create-post/pick-step";

const NEW = "/social/new";
const openItem = (key: string) => `${NEW}?item=${encodeURIComponent(key)}`;
const openPost = (id: string) => `${NEW}?post=${encodeURIComponent(id)}`;

/** An own post as a share item, for its picture. */
const ownItem = (p: OwnPost): ShareItem => ({
    kind: "own",
    ref: p.id,
    name: p.headline ?? POST_WORDS.ownTitle,
    price: null,
    url: "",
    offerId: null,
    hasPhoto: Boolean(p.mediaId),
});

/**
 * Social (boards BSocialHome*, BSocialEmpty*): what is worth posting today,
 * and Your posts, each reopened by a tap. A first visit, with no posts yet,
 * shows posts already drawn from the business, ready to share.
 *
 * Your posts are the business's own posts (`share-posts`): Saroh keeps no
 * record of a share it didn't make, so there is no Shared state or visit
 * count here until Saroh Social posts for the business.
 */
export function SocialHome({
    rows,
    posts,
    setup,
    canPost,
    failed,
}: {
    /** Null, with `posts`, while their reads are on their way. */
    rows: PickRow[] | null;
    posts: OwnPost[] | null;
    setup: ShareSetup;
    canPost: boolean;
    failed: string[];
}) {
    const narrow = useNarrow();
    const zone = useBusinessZone();
    const suggestions = useDismissed(
        worthPosting(rows ?? [], zone),
        setup.siteId,
    );
    const shown = narrow ? suggestions.list.slice(0, 1) : suggestions.list;

    const header = (
        <PageHeader
            className="mb-5"
            holdsData={false}
            compactOnPhone
            breadcrumb={["Grow", POST_WORDS.social]}
            title={POST_WORDS.social}
            description={narrow ? undefined : POST_WORDS.socialDescription}
            actions={
                // Known once Your posts lands; a phone always has it.
                (posts && posts.length > 0) || narrow ? (
                    <Button asChild size={narrow ? "default" : "lg"}>
                        <IntentLink href={NEW} data-new-post="">
                            <Plus aria-hidden className="size-4" />
                            {POST_WORDS.newPost}
                        </IntentLink>
                    </Button>
                ) : undefined
            }
        />
    );

    if (!rows || !posts) {
        return (
            <div>
                {header}
                <PageLoading
                    bare
                    shape="panels"
                    width="full"
                    label={POST_WORDS.loading}
                />
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div>
                {header}
                {failed.length > 0 ? (
                    <PartialRead className="mb-4" things={failed.join(", ")} />
                ) : null}
                <FirstPosts
                    picks={firstPicks(rows)}
                    setup={setup}
                    canPost={canPost}
                    narrow={narrow}
                />
            </div>
        );
    }

    return (
        <div className="grid gap-7">
            <div>
                {header}
                {failed.length > 0 ? (
                    <PartialRead className="mb-4" things={failed.join(", ")} />
                ) : null}
                {shown.length > 0 ? (
                    <section aria-labelledby="worth" className="grid gap-3">
                        <h2
                            id="worth"
                            className="flex flex-wrap items-baseline gap-x-2.5 text-[18px] font-semibold tracking-[-0.01em] max-sm:sr-only"
                        >
                            {POST_WORDS.worthToday}
                            <span className="text-[13px] font-normal tracking-normal text-muted-foreground">
                                {POST_WORDS.worthFrom}
                            </span>
                        </h2>
                        <ul className="grid gap-3.5 md:grid-cols-3">
                            {shown.map((s) => (
                                <li
                                    key={s.key}
                                    data-worth={s.key}
                                    className="flex gap-4 rounded-2xl border border-border bg-card p-3"
                                >
                                    <Thumb
                                        src={cardImageUrl(
                                            setup,
                                            s.item,
                                            firstStyle(s.item),
                                            "post",
                                            { w: 160 },
                                        )}
                                        className="w-[72px]"
                                    />
                                    <div className="grid min-w-0 flex-1 content-start gap-1">
                                        <b
                                            data-ph-mask=""
                                            className="text-[15px] font-semibold leading-[1.3]"
                                        >
                                            {s.title}
                                        </b>
                                        <span className="text-[13px] text-muted-foreground">
                                            {s.line}
                                        </span>
                                        <Button asChild className="mt-2 w-fit">
                                            <IntentLink href={openItem(s.key)}>
                                                {POST_WORDS.makeThis}
                                            </IntentLink>
                                        </Button>
                                    </div>
                                    <IconButton
                                        label={POST_WORDS.notToday}
                                        icon={<X />}
                                        variant="ghost"
                                        className="-mr-1 -mt-1 shrink-0"
                                        onClick={() =>
                                            suggestions.dismiss(s.key)
                                        }
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
            <section aria-labelledby="your-posts" className="grid gap-4">
                <h2
                    id="your-posts"
                    className="text-[18px] font-semibold tracking-[-0.01em]"
                >
                    {POST_WORDS.yourPosts}
                </h2>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {posts.map((p) => (
                        <li key={p.id} data-own-post={p.id}>
                            <PostTile
                                post={p}
                                setup={setup}
                                canPost={canPost}
                            />
                        </li>
                    ))}
                </ul>
                <SocialLine
                    lock={setup.schedule}
                    words={POST_WORDS.socialSeeMore}
                    className="mt-2"
                />
            </section>
        </div>
    );
}

/** One own post: its picture with Draft, its line, and its menu. */
function PostTile({
    post,
    setup,
    canPost,
}: {
    post: OwnPost;
    setup: ShareSetup;
    canPost: boolean;
}) {
    const { orgId, saved } = useSocialSave();
    const name = post.headline ?? POST_WORDS.ownTitle;
    const item = ownItem(post);
    return (
        <div className="grid gap-2">
            <IntentLink
                href={openPost(post.id)}
                className="relative flex justify-center rounded-2xl bg-muted p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="absolute left-2 top-2 z-10 rounded-full bg-foreground px-2.5 py-1 text-[12px] font-semibold text-background">
                    {POST_WORDS.draft}
                </span>
                <span className="block aspect-[4/5] w-full max-w-[180px] overflow-hidden rounded-[4px] bg-card shadow-md">
                    <DrawnCard
                        src={cardImageUrl(setup, item, post.style, "post", {
                            w: 360,
                            v: post.updatedAt,
                        })}
                        lazy
                        className="size-full"
                    />
                </span>
                <span className="sr-only">{name}</span>
            </IntentLink>
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <b
                        data-ph-mask=""
                        className="line-clamp-2 text-[15px] font-semibold leading-[1.3]"
                    >
                        {name}
                    </b>
                    <span className="mt-1 block text-[13px] text-muted-foreground">
                        {POST_WORDS.ownSaved(formatRelative(post.updatedAt))}
                    </span>
                </div>
                {canPost ? (
                    <DeleteMenu
                        name={name}
                        verb={POST_WORDS.deleteConfirm}
                        keep={POST_WORDS.keepIt}
                        title={POST_WORDS.deleteTitle}
                        description={POST_WORDS.deleteWhat}
                        onDelete={async () => {
                            const res = await removeOwnPost(post.id, orgId);
                            // Your posts alone: what's worth posting is unchanged.
                            if (res.ok)
                                await saved(ownPostsRead.key(orgId, {}));
                            return res;
                        }}
                        done={() => POST_WORDS.deleted}
                    />
                ) : null}
            </div>
        </div>
    );
}

function Thumb({ src, className }: { src: string; className?: string }) {
    return (
        <span
            className={cn(
                "block aspect-[4/5] shrink-0 overflow-hidden rounded-[4px] bg-muted shadow-md",
                className,
            )}
        >
            <DrawnCard src={src} className="size-full" />
        </span>
    );
}

/**
 * The first visit (BSocialEmpty*): posts already drawn from the business,
 * and your own post, each one tap from finished. On a phone, one at a
 * time to swipe through, with Use this post.
 */
function FirstPosts({
    picks,
    setup,
    canPost,
    narrow,
}: {
    picks: FirstPick[];
    setup: ShareSetup;
    canPost: boolean;
    narrow: boolean;
}) {
    const router = useRouter();
    const cards = [
        ...picks.map((p) => ({
            key: p.key,
            href: openItem(p.key),
            name: p.name,
            why: p.why,
            picture: (
                <DrawnCard
                    src={cardImageUrl(
                        setup,
                        p.item,
                        firstStyle(p.item),
                        "post",
                        { w: 400 },
                    )}
                    className="aspect-[4/5] w-full rounded-[4px] shadow-md"
                />
            ),
        })),
        ...(canPost
            ? [
                  {
                      key: "own",
                      href: `${NEW}?own=text`,
                      name: POST_WORDS.own,
                      why: POST_WORDS.ownLine,
                      picture: (
                          <OwnThumb
                              setup={setup}
                              className="w-full text-[22px]"
                          />
                      ),
                  },
              ]
            : []),
    ];
    const [at, setAt] = useState(0);
    const track = useRef<HTMLUListElement | null>(null);
    const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (settle.current) clearTimeout(settle.current);
        },
        [],
    );
    const onScroll = () => {
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => {
            const box = track.current;
            const first = box?.children[0] as HTMLElement | undefined;
            if (!box || !first) return;
            setAt(
                Math.min(
                    cards.length - 1,
                    Math.round(box.scrollLeft / (first.offsetWidth + 12)),
                ),
            );
        }, 120);
    };
    const current = cards.at(at) ?? cards.at(0);

    if (narrow) {
        return (
            <div className="grid gap-4" data-first-posts="">
                <h2 className="text-center text-[24px] font-semibold tracking-[-0.01em]">
                    {POST_WORDS.firstReady}
                </h2>
                <p className="text-center text-[14px] text-muted-foreground">
                    {POST_WORDS.firstWhyPhone}
                </p>
                <ul
                    ref={track}
                    onScroll={onScroll}
                    className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[calc(50%-110px)] py-2 [scrollbar-width:none]"
                >
                    {cards.map((c, i) => (
                        <li
                            key={c.key}
                            className={cn(
                                "w-[220px] shrink-0 snap-center transition-opacity",
                                i !== at && "opacity-50",
                            )}
                        >
                            {c.picture}
                        </li>
                    ))}
                </ul>
                {current ? (
                    <p className="text-center text-[14.5px] font-semibold">
                        {current.name} · {current.why.toLowerCase()}
                    </p>
                ) : null}
                <div className="sticky bottom-[var(--tab-bar-inset)] z-10 -mx-4 mt-6 grid gap-3 border-t border-border bg-background px-4 pb-3.5 pt-2.5">
                    <Button
                        type="button"
                        size="lg"
                        className="h-12 rounded-xl text-[15px]"
                        disabled={!current}
                        onClick={() => current && router.push(current.href)}
                    >
                        {POST_WORDS.useThis}
                    </Button>
                    <TextLink href={NEW} className="mx-auto font-semibold">
                        {POST_WORDS.pickElse}
                    </TextLink>
                </div>
            </div>
        );
    }

    return (
        <section
            data-first-posts=""
            className="flex flex-col items-center gap-6 rounded-2xl bg-muted px-8 py-12 text-center"
        >
            <div className="grid max-w-[560px] gap-3">
                <h2 className="text-[30px] font-semibold tracking-[-0.02em]">
                    {POST_WORDS.firstReady}
                </h2>
                <p className="text-[14px] leading-[1.65] text-muted-foreground">
                    {POST_WORDS.firstWhy}
                </p>
            </div>
            <ul className="flex flex-wrap justify-center gap-[26px]">
                {cards.map((c) => (
                    <li key={c.key} className="w-[190px]">
                        <IntentLink
                            href={c.href}
                            className="grid gap-2 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
                        >
                            {c.picture}
                            <span>
                                <b
                                    data-ph-mask=""
                                    className="mt-2 block text-[14px] font-semibold"
                                >
                                    {c.name}
                                </b>
                                <span className="block text-[12.5px] text-muted-foreground">
                                    {c.why}
                                </span>
                            </span>
                        </IntentLink>
                    </li>
                ))}
            </ul>
            <TextLink href={NEW} className="font-semibold">
                {POST_WORDS.pickElseDesk}
            </TextLink>
        </section>
    );
}

/**
 * Suggestions put away with ×, remembered on this device for the day: a
 * per-viewer convenience, so browser storage, and the list still draws
 * without it.
 */
function useDismissed<T extends { key: string }>(list: T[], scope: string) {
    const storeKey = `saroh:social:dismissed:${scope}:${new Date().toISOString().slice(0, 10)}`;
    // Put away this visit when the browser keeps nothing.
    const [here, setHere] = useState<string[]>([]);
    const kept = useSyncExternalStore(
        subscribeDismissed,
        () => readKept(storeKey),
        () => null,
    );
    const gone = [...parseKept(kept), ...here];
    const dismiss = (key: string) => {
        try {
            window.localStorage.setItem(
                storeKey,
                JSON.stringify([...parseKept(readKept(storeKey)), key]),
            );
            window.dispatchEvent(new Event(DISMISSED_EVENT));
        } catch {
            setHere((h) => [...h, key]);
        }
    };
    return { list: list.filter((s) => !gone.includes(s.key)), dismiss };
}

const DISMISSED_EVENT = "saroh:social:dismissed";

function subscribeDismissed(change: () => void) {
    window.addEventListener(DISMISSED_EVENT, change);
    window.addEventListener("storage", change);
    return () => {
        window.removeEventListener(DISMISSED_EVENT, change);
        window.removeEventListener("storage", change);
    };
}

function readKept(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function parseKept(raw: string | null): string[] {
    try {
        const v: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
        return [];
    }
}
