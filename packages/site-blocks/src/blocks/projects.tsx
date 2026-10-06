import type { RenderedProjects } from "@saroh/block-contract";
import { isSafeHref, resolveVariant } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import { listCard, listPhoto } from "./list-layout";
import { RhythmGallery } from "./projects-rhythm";
import { ProjectRows, projectsCount } from "./projects-rows";

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
 * The template polish adds two looks, `rhythm` (`projects-rhythm.tsx`) and
 * `rows` (`projects-rows.tsx`), a `meta` line under the summary in every
 * look, and an optional count beside the title ("5 projects across 8
 * years"), counted from the projects shown.
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
    const look = resolveVariant("projects", content);
    const list = look === "list";
    const title = said(content.title);
    // Words over the photo (DEC-090): the cards look only; a row keeps its
    // words beside the photo, where there is room for them.
    const over = !list && content.captionPlacement === "over";
    // A count beside the title (template polish), from the projects shown.
    const count = content.showCount ? projectsCount(items) : null;
    const heading = title ? (
        <h2
            data-site-title=""
            className={
                count
                    ? "font-site-heading text-site-fg text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                    : "font-site-heading text-site-fg mb-3.5 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
            }
        >
            {title}
        </h2>
    ) : null;
    const header = count ? (
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            {heading}
            <span
                data-project-count=""
                className="text-site-muted text-[13.5px]"
            >
                {count}
            </span>
        </div>
    ) : (
        heading
    );

    if (look === "rhythm" || look === "rows") {
        return (
            <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                {header}
                {look === "rhythm" ? (
                    <RhythmGallery items={items} over={over} />
                ) : (
                    <ProjectRows items={items} linkWords={PROJECTS_LINK} />
                )}
            </section>
        );
    }

    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {header}
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
                            <ProjectCard item={item} over={over} />
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function ProjectCard({ item, over }: { item: Project; over: boolean }) {
    const src = said(item.image?.src);
    if (over && src) return <ProjectPlate item={item} src={src} />;
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
            {src ? <PhotoCaption text={item.caption} /> : null}
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
                {src ? <PhotoCaption text={item.caption} /> : null}
                <ProjectWords item={item} />
            </div>
        </article>
    );
}

/**
 * A card whose title and caption sit over its photo (DEC-090), on a band of
 * a fixed 66px: one line each, an ellipsis past it, the page colour on a
 * scrim of the text colour. What does not fit a band — the description and
 * the link — follows below, as on any card.
 */
function ProjectPlate({ item, src }: { item: Project; src: string }) {
    const caption = said(item.caption);
    const summary = said(item.summary);
    return (
        <article className="text-site-fg grid h-full min-w-0 content-start gap-1.5 overflow-hidden">
            <div className="bg-site-surface relative overflow-hidden rounded-[var(--site-radius)]">
                <img
                    src={src}
                    alt={item.image?.alt ?? ""}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                />
                <div
                    data-plate-band=""
                    className="from-site-fg/90 via-site-fg/85 to-site-fg/0 text-site-bg absolute inset-x-0 bottom-0 flex h-[66px] flex-col justify-end overflow-hidden bg-gradient-to-t px-3.5 pb-2.5"
                >
                    <h3 className="font-site-heading truncate text-[calc(0.9375rem*var(--site-heading-scale))] font-semibold leading-tight">
                        {said(item.title) ?? ""}
                    </h3>
                    {caption ? (
                        <p className="truncate text-[12.5px] leading-snug">
                            {caption}
                        </p>
                    ) : null}
                </div>
            </div>
            {summary || said(item.meta) || safeLink(item.link) ? (
                <div className="-mx-4 grid gap-1.5">
                    <ProjectWords item={item} titled={false} />
                </div>
            ) : null}
        </article>
    );
}

function ProjectWords({
    item,
    titled = true,
}: {
    item: Project;
    /** False where the title is already drawn, over the photo. */
    titled?: boolean;
}) {
    const title = said(item.title) ?? "";
    const summary = said(item.summary);
    const meta = said(item.meta);
    const href = safeLink(item.link);
    return (
        <>
            {titled ? (
                <h3 className="font-site-heading px-4 text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em] [overflow-wrap:anywhere]">
                    {title}
                </h3>
            ) : null}
            {summary ? (
                <p className="text-site-body whitespace-pre-line px-4 text-[13.5px] leading-normal [overflow-wrap:anywhere] [text-wrap:pretty]">
                    {summary}
                </p>
            ) : null}
            {meta ? (
                <p className="font-site-mono text-site-muted px-4 text-[12.5px] [overflow-wrap:anywhere]">
                    {meta}
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

/**
 * The line under a project's photo (U2): who took it, where. Drawn only
 * beside a photo, and as text: it is not the project's description.
 */
function PhotoCaption({ text }: { text?: string }) {
    const caption = said(text);
    if (!caption) return null;
    return (
        <p className="text-site-muted px-4 text-[12.5px] leading-snug [overflow-wrap:anywhere]">
            {caption}
        </p>
    );
}
