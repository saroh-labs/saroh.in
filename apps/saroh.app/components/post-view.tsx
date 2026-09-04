import Link from "next/link";

import type { PublishedPost } from "@/lib/publication";

/**
 * A site's writing, on the site (#232).
 *
 * Drawn in the merchant's own palette through the same `--site-*` custom
 * properties every section reads, so a post looks like the site it is on
 * rather than like a blog bolted to it.
 *
 * `content` is rendered with `dangerouslySetInnerHTML`, and that is safe for
 * exactly one reason: publish sanitized it through the same allowlist as
 * `richText.value` before writing the immutable snapshot. This component never
 * receives author input.
 */

/** One date, pinned to a locale and zone so server and client agree. */
export function postDate(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(iso));
}

export function PostArticle({ post }: { post: PublishedPost }) {
    return (
        <article className="mx-auto w-full max-w-[68ch] px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <header className="mb-8">
                <h1 className="text-[calc(2.25rem*var(--site-heading-scale))] font-bold leading-tight tracking-tight text-site-fg sm:text-[calc(2.75rem*var(--site-heading-scale))]">
                    {post.title}
                </h1>
                <p className="mt-3 text-sm text-site-body">
                    <time dateTime={post.publishedAt}>
                        {postDate(post.publishedAt)}
                    </time>
                    {post.author ? ` · ${post.author}` : ""}
                    {post.category ? ` · ${post.category.name}` : ""}
                </p>
            </header>

            {post.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
                <img
                    src={post.image}
                    alt=""
                    className="mb-8 w-full rounded-[var(--site-radius)]"
                />
            ) : null}

            <div
                /* The same prose treatment a richText section uses (#189),
                   so a post reads like the rest of the site rather than like
                   a second typography system: the merchant's own text colour
                   at 80%, never the plugin's greys. */
                className="prose max-w-none prose-headings:text-site-fg prose-p:text-site-fg/80 prose-a:text-site-accent prose-strong:text-site-fg prose-li:text-site-fg/80"
                // Sanitized at publish — see the note above.
                dangerouslySetInnerHTML={{ __html: post.content }}
            />
        </article>
    );
}

/**
 * The index. Empty is a real state and says so plainly: a site that has turned
 * writing on but published nothing yet is normal, not broken.
 */
export function PostIndex({
    posts,
    basePath,
    title,
}: {
    posts: PublishedPost[];
    basePath: string;
    title: string;
}) {
    return (
        <div className="mx-auto w-full max-w-[68ch] px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h1 className="text-[calc(2rem*var(--site-heading-scale))] font-bold tracking-tight text-site-fg">
                {title}
            </h1>

            {posts.length === 0 ? (
                <p className="mt-6 text-site-body">Nothing here yet.</p>
            ) : (
                <ul className="mt-8 grid gap-8">
                    {posts.map((post) => (
                        <li key={post.slug}>
                            <Link
                                href={`${basePath}/${post.slug}`}
                                className="group flex gap-4"
                            >
                                {/* The cover, where a reader is choosing what
                                    to read — the one place a picture earns its
                                    space more than in the article. A post
                                    without one keeps the full width rather
                                    than leaving a hole where a picture would
                                    have been. */}
                                {post.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
                                    <img
                                        src={post.image}
                                        alt=""
                                        className="hidden aspect-[1.91/1] w-40 shrink-0 rounded-[var(--site-radius)] object-cover sm:block"
                                    />
                                ) : null}
                                <div className="min-w-0">
                                    <h2 className="text-[calc(1.35rem*var(--site-heading-scale))] font-semibold leading-snug text-site-fg group-hover:text-site-accent">
                                        {post.title}
                                    </h2>
                                    <p className="mt-1 text-sm text-site-body">
                                        <time dateTime={post.publishedAt}>
                                            {postDate(post.publishedAt)}
                                        </time>
                                        {post.author ? ` · ${post.author}` : ""}
                                    </p>
                                    {post.excerpt ? (
                                        <p className="mt-2 text-site-body">
                                            {post.excerpt}
                                        </p>
                                    ) : null}
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
