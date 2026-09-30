import type { RenderedProjects } from "@saroh/block-contract";
import { isSafeHref, resolveVariant } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import { listCard, listPhoto } from "./list-layout";

/**
 * `projects` v1 — the merchant's own work (K11, DEC-070): a photo, a title, a
 * line about it and a link to more.
 *
 * A static block (KTD-13): everything it draws was typed by the merchant, so
 * it reads nothing live and has no loading or failed state.
 *
 * Two looks, the same content. `cards` puts the projects side by side with
 * the photo on top, as the Journal's cards do; `list` gives each a row with
 * the photo on the left, the list rows Product grid and Journal share
 * (`list-layout.ts`). A project with no photo draws without a gap where one
 * would be, and one with no link has no "View project".
 *
 * The card is not itself a link, because the link is optional: "View
 * project" is, and it carries the project's title for a screen reader so
 * three of them on a page aren't three identical links. A link to another
 * site opens in the same tab, with `rel="noopener"`. The link is re-checked
 * here, as Contact re-checks its map link, rather than trusting that the
 * snapshot was written by today's contract.
 *
 * Everything is drawn from the `--site-*` layer (gate G2) and set in the
 * site's faces (G7): merchant sites never inherit Saroh's brand.
 */

/** The words on a project's link. */
export const PROJECTS_LINK = "View project";

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const linkClasses = cn(
    "text-site-accent mx-4 mt-1 inline-flex cursor-pointer items-center gap-1 justify-self-start rounded-[var(--site-radius)] text-sm font-semibold underline-offset-4 transition-opacity hover:underline active:opacity-70",
    focusRing,
);

type Project = RenderedProjects["items"][number];

/** Text a merchant actually wrote, or null for blank. */
function said(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** A link that is safe to draw, or null. */
function safeLink(value: string | undefined): string | null {
    const href = said(value);
    return href && isSafeHref(href) ? href : null;
}

export default function ProjectsSection({
    content,
}: {
    content: RenderedProjects;
}) {
    const items = Array.isArray(content.items)
        ? content.items.filter((item) => said(item.title) !== null)
        : [];
    if (items.length === 0) return null;
    const list = resolveVariant("projects", content) === "list";
    const title = said(content.title);

    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {title ? (
                <h2 className="font-site-heading text-site-fg mb-3.5 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]">
                    {title}
                </h2>
            ) : null}
            <ul
                className={cn(
                    "grid",
                    list
                        ? "grid-cols-1 gap-2.5"
                        : "gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]",
                )}
            >
                {items.map((item, i) => (
                    <li key={i} className="min-w-0">
                        {list ? (
                            <ProjectRow item={item} />
                        ) : (
                            <ProjectCard item={item} />
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function ProjectCard({ item }: { item: Project }) {
    const src = said(item.image?.src);
    return (
        <article
            className={cn(
                "border-site-border bg-site-surface text-site-fg grid h-full min-w-0 content-start gap-1.5 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border pb-4",
                src ? null : "pt-4",
            )}
        >
            {src ? (
                // A merchant's own photo, a plain <img> as every block's:
                // next/image would need each origin allowlisted.
                <img
                    src={src}
                    alt={item.image?.alt ?? ""}
                    loading="lazy"
                    className="mb-1.5 aspect-[4/3] w-full object-cover"
                />
            ) : null}
            <ProjectWords item={item} />
        </article>
    );
}

function ProjectRow({ item }: { item: Project }) {
    const src = said(item.image?.src);
    return (
        <article className={listCard(Boolean(src))}>
            {src ? (
                <img
                    src={src}
                    alt={item.image?.alt ?? ""}
                    loading="lazy"
                    className={listPhoto}
                />
            ) : null}
            <div className="grid min-w-0 content-start gap-1.5 py-4">
                <ProjectWords item={item} />
            </div>
        </article>
    );
}

function ProjectWords({ item }: { item: Project }) {
    const title = said(item.title) ?? "";
    const summary = said(item.summary);
    const href = safeLink(item.link);
    return (
        <>
            <h3 className="font-site-heading px-4 text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em] [overflow-wrap:anywhere]">
                {title}
            </h3>
            {summary ? (
                <p className="text-site-body whitespace-pre-line px-4 text-[13.5px] leading-normal [overflow-wrap:anywhere] [text-wrap:pretty]">
                    {summary}
                </p>
            ) : null}
            {href ? (
                <a
                    href={href}
                    rel={/^https?:\/\//i.test(href) ? "noopener" : undefined}
                    className={linkClasses}
                >
                    {PROJECTS_LINK}
                    <span className="sr-only">: {title}</span>
                    <span aria-hidden="true">→</span>
                </a>
            ) : null}
        </>
    );
}
