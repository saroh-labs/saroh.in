import Link from "next/link";

/**
 * What this component needs of a post, which is less than either caller has.
 *
 * The live routes pass a `PublishedPost`, the preview routes a `PreviewPost`,
 * and both satisfy this. Two fields carry the difference: `publishedAt` is
 * null for a post that has never gone live, and `live` is absent on the live
 * site, where everything shown is live by definition.
 */
export interface PostViewModel {
    title: string;
    slug: string;
    excerpt?: string | null;
    content: string;
    image?: string | null;
    category?: { name: string; slug: string } | null;
    author?: string | null;
    publishedAt: string | null;
    live?: boolean;
}

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

/**
 * "Not published" — said once, in Saroh's own neutral, never the site's
 * palette. It is Saroh speaking about the post rather than part of the post,
 * the same distinction the preview bar makes, and it must stay legible on
 * whatever ground the merchant chose.
 */
function DraftChip() {
    return (
        <span className="inline-flex items-center rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-100">
            Not published
        </span>
    );
}

export function PostArticle({ post }: { post: PostViewModel }) {
    return (
        <article className="mx-auto w-full max-w-[68ch] px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <header className="mb-8">
                <h1 className="text-[calc(2.25rem*var(--site-heading-scale))] font-bold leading-tight tracking-tight text-site-fg sm:text-[calc(2.75rem*var(--site-heading-scale))]">
                    {post.title}
                </h1>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-site-body">
                    {post.live === false ? <DraftChip /> : null}
                    <span>
                        {post.publishedAt ? (
                            <time dateTime={post.publishedAt}>
                                {postDate(post.publishedAt)}
                            </time>
                        ) : (
                            "Not dated yet"
                        )}
                        {post.author ? ` · ${post.author}` : ""}
                        {post.category ? ` · ${post.category.name}` : ""}
                    </span>
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
    posts: PostViewModel[];
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
                                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-site-body">
                                        {post.live === false ? (
                                            <DraftChip />
                                        ) : null}
                                        <span>
                                            {post.publishedAt ? (
                                                <time
                                                    dateTime={post.publishedAt}
                                                >
                                                    {postDate(post.publishedAt)}
                                                </time>
                                            ) : (
                                                "Not dated yet"
                                            )}
                                            {post.author
                                                ? ` · ${post.author}`
                                                : ""}
                                        </span>
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
