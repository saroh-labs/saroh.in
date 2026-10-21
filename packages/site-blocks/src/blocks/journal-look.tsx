import type { LookId } from "@saroh/block-contract";

import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { FRONT_RING, FRONT_TYPE, FRONT_WRAP, frontButton } from "./look-front";

/**
 * The Journal under a look (DEC-172, plan U7, #1096), as VA06, VD06 and
 * VB06 draw it ("More from the journal", desk and phone):
 *
 * - **Cards**: three across on a desk, one under another on a phone; the
 *   post's photo at 3:2 in the look's photo corners, its title in the
 *   display face as the link, who wrote it and how long it takes to read.
 *   Folio and Quiet set them on the ground; Live on white cards.
 * - **A post with no photo is a text card**: a hairline over the title,
 *   never an empty frame (VD06 "No photos").
 * - **Lead** (Quiet's default): the newest post in depth, its photo wide
 *   above it when it has one.
 * - **Archive** (Folio's default) is the Classic archive's rows, set in
 *   the look's type by `JournalArchive`.
 *
 * The block (`journal.tsx`) works out every word (dates, excerpts, the
 * reading time); this only draws them. Labels are 12px at least
 * (VA-23). Drawn from `--site-*` only (G2, G7).
 */

/** One post as a look's card draws it. */
export interface LookPostCard {
    key: string;
    href: string;
    title: string;
    image: string | null;
    excerpt: string | null;
    /** "Meera Iyer · 3 min", or "Not published" in a preview. */
    meta: string | null;
    /** The merchant's own button words, when they set some. */
    label: string | null;
}

/** The section around a look's Journal: its title, and All posts. */
export function LookJournalFrame({
    look,
    title,
    more,
    children,
}: {
    look: LookId;
    title: string | null;
    more?: React.ReactNode;
    children: React.ReactNode;
}) {
    const type = FRONT_TYPE[look];
    return (
        <section
            data-site-look-journal={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                {title || more ? (
                    <div
                        className={cn(
                            "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-6 min-[700px]:pb-8",
                            look === "quiet" &&
                                "min-[700px]:flex-col min-[700px]:items-center min-[700px]:text-center",
                        )}
                    >
                        {title ? (
                            <h2 data-site-title="" className={type.h2}>
                                {title}
                            </h2>
                        ) : null}
                        {more ?? null}
                    </div>
                ) : null}
                {children}
            </div>
        </section>
    );
}

/** "All posts", in the look's link. */
export function LookAllPosts({
    look,
    href,
    children,
}: {
    look: LookId;
    href: string;
    children: React.ReactNode;
}) {
    return (
        <a href={href} className={frontButton(look, "link", "shrink-0")}>
            {children}
        </a>
    );
}

/** The cards (or, "Show as: list", rows) of a look's Journal. */
export function LookPostCards({
    look,
    posts,
    list,
}: {
    look: LookId;
    posts: LookPostCard[];
    /** The merchant chose one post per row (G16). */
    list: boolean;
}) {
    const type = FRONT_TYPE[look];
    const live = look === "live";
    return (
        <ul
            className={cn(
                "grid",
                list
                    ? "border-site-border grid-cols-1 border-t"
                    : "grid-cols-1 gap-8 min-[700px]:grid-cols-3 min-[700px]:gap-10",
                !list && live && "gap-3 min-[700px]:gap-4",
            )}
        >
            {posts.map((post) => {
                const photo = post.image ? (
                    <img
                        src={post.image}
                        alt=""
                        {...siteImage("below", {
                            src: post.image,
                            sizes: list
                                ? "(min-width: 700px) 200px, 33vw"
                                : "(min-width: 700px) 33vw, 100vw",
                        })}
                        className={cn(
                            "rounded-site-photo block aspect-[3/2] w-full object-cover",
                            list && "w-[120px] min-[700px]:w-[200px]",
                        )}
                    />
                ) : null;
                const words = (
                    <span className="grid min-w-0 content-start gap-2">
                        <span
                            className={cn(
                                type.name,
                                "[overflow-wrap:anywhere] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4",
                            )}
                        >
                            {post.title}
                        </span>
                        {post.excerpt ? (
                            <span
                                className={cn(type.meta, "[text-wrap:pretty]")}
                            >
                                {post.excerpt}
                            </span>
                        ) : null}
                        {post.meta ? (
                            <span className="text-site-muted text-[13px] tabular-nums">
                                {post.meta}
                            </span>
                        ) : null}
                        {post.label ? (
                            <span className="text-site-fg text-[14px] font-semibold underline decoration-1 underline-offset-4">
                                {post.label}
                            </span>
                        ) : null}
                    </span>
                );
                return (
                    <li
                        key={post.key}
                        data-journal-card={post.image ? "photo" : "text"}
                        className="min-w-0"
                    >
                        <a
                            href={post.href}
                            className={cn(
                                "text-site-fg group grid h-full min-w-0 cursor-pointer gap-3",
                                FRONT_RING,
                                list
                                    ? "border-site-border grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b py-5"
                                    : live
                                      ? "bg-site-surface rounded-site-s content-start p-3 pb-4"
                                      : "rounded-site-s content-start",
                                // No photo: a text card under a hairline,
                                // never an empty frame (VD06 "No photos").
                                !list &&
                                    !post.image &&
                                    !live &&
                                    "border-site-border border-t pt-5",
                            )}
                        >
                            {list ? (
                                <>
                                    {words}
                                    {photo}
                                </>
                            ) : (
                                <>
                                    {photo}
                                    {words}
                                </>
                            )}
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

/** The newest post in depth, under a look (the `lead` layout). */
export function LookLead({
    look,
    post,
    titled,
}: {
    look: LookId;
    post: {
        href: string;
        title: string;
        image: string | null;
        date: string | null;
        dateTime: string | null;
        dek: string | null;
        minutes: string | null;
        paragraphs: string[];
    };
    /** The section draws a title of its own above, so this is h3. */
    titled: boolean;
}) {
    const type = FRONT_TYPE[look];
    const Title = titled ? "h3" : "h2";
    const centred = look === "quiet";
    return (
        <article
            className={cn(
                "text-site-fg grid gap-5",
                centred && "mx-auto max-w-[var(--site-measure,40rem)]",
            )}
        >
            {post.image ? (
                <img
                    src={post.image}
                    alt=""
                    {...siteImage("below", {
                        src: post.image,
                        sizes: "(min-width: 700px) 66vw, 100vw",
                    })}
                    className="rounded-site-photo block aspect-[3/2] w-full object-cover min-[700px]:aspect-[21/9]"
                />
            ) : null}
            <div
                className={cn(
                    "grid max-w-[var(--site-measure,40rem)] gap-3",
                    centred && "mx-auto text-center",
                )}
            >
                {post.date ? (
                    <p className={type.eyebrow}>
                        {post.dateTime ? (
                            <time dateTime={post.dateTime}>{post.date}</time>
                        ) : (
                            post.date
                        )}
                    </p>
                ) : null}
                <Title className={cn(type.h2, "[overflow-wrap:anywhere]")}>
                    <a
                        href={post.href}
                        className={cn(
                            "rounded-site-s underline-offset-[6px] hover:underline hover:decoration-1",
                            FRONT_RING,
                        )}
                    >
                        {post.title}
                    </a>
                </Title>
                {post.dek ? (
                    <p className="text-site-body text-[19px] leading-snug [text-wrap:pretty]">
                        {post.dek}
                    </p>
                ) : null}
                {post.minutes ? (
                    <p className="text-site-muted text-[14px]">
                        {post.minutes}
                    </p>
                ) : null}
            </div>
            {post.paragraphs.length > 0 ? (
                <div
                    className={cn(
                        "grid max-w-[var(--site-measure,40rem)] gap-5",
                        centred && "mx-auto",
                    )}
                >
                    {post.paragraphs.map((text, i) => (
                        <p
                            key={i}
                            className="text-site-body text-[17px] leading-[1.75] [text-wrap:pretty] min-[700px]:text-[19px]"
                        >
                            {text}
                        </p>
                    ))}
                </div>
            ) : null}
            <p className={cn(centred && "text-center")}>
                <a href={post.href} className={frontButton(look, "link")}>
                    Continue reading
                    <span className="sr-only">: {post.title}</span>
                </a>
            </p>
        </article>
    );
}
