import type { RenderedPerson } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import { CtaButton } from "./cta";

/**
 * `person` v1 — one practitioner (industry templates U2): a photo, their
 * name, what they do, their qualifications and a few lines about them, as
 * the dietician design introduces its doctor.
 *
 * A static block: everything it draws was typed by the merchant, so it reads
 * nothing live and has no loading or failed state. The photo sits beside
 * the words from the tablet width up and above them on a phone; with no
 * photo (or only a brief, KTD-5) the words take the width, with no gap.
 * Qualifications are a list, the bio plain text with its line breaks kept.
 *
 * The name is the section's heading (`h2`), so a page of practitioners reads
 * as one heading per person — or the page's `h1` when `asTitle` says this
 * person opens the page (template polish).
 *
 * Template polish adds two looks: `portrait` (a 300px portrait column with
 * the qualifications under it, the words beside) and `team` (the person and
 * `people` side by side, 3:4 photos, four across on a desk and two on a
 * phone). A qualification may be a row, its title and where it came from,
 * under a visible label. Drawn from `--site-*` only (gate G2).
 */
function said(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** One qualification, as a title and an optional line under it. */
interface Credential {
    title: string;
    detail: string | null;
}

/** The qualifications with something in them, lines and rows alike. */
export function credentialsOf(
    credentials: RenderedPerson["credentials"],
): Credential[] {
    return (credentials ?? []).flatMap((c) => {
        if (typeof c === "string") {
            const title = said(c);
            return title ? [{ title, detail: null }] : [];
        }
        const title = said(c.title);
        return title ? [{ title, detail: said(c.detail) }] : [];
    });
}

/** The label the qualifications go under when a look shows one. */
export const PERSON_CREDENTIALS_LABEL = "Qualifications";

export default function PersonSection({
    content,
}: {
    content: RenderedPerson;
}) {
    const name = said(content.name);
    if (!name) return null;
    const look = resolveVariant("person", content);
    if (look === "team") return <TeamGrid content={content} />;
    if (look === "portrait") return <PortraitColumn content={content} />;
    const src = said(content.image?.src);
    const role = said(content.role);
    const bio = said(content.bio);
    const credentials = credentialsOf(content.credentials);
    const label = said(content.credentialsLabel);
    const Name = content.asTitle ? "h1" : "h2";

    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div
                className={
                    src
                        ? "grid items-start gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-10"
                        : "max-w-2xl"
                }
            >
                {src ? (
                    // A merchant's own photo, a plain <img> as every block's.
                    <img
                        src={src}
                        alt={content.image?.alt ?? ""}
                        width={content.image?.width}
                        height={content.image?.height}
                        loading="lazy"
                        className="aspect-[4/5] w-full max-w-sm rounded-[calc(var(--site-radius)*1.4)] object-cover"
                    />
                ) : null}
                <div className="min-w-0">
                    <Name className="font-site-heading text-[calc(2rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.025em] [overflow-wrap:anywhere]">
                        {name}
                    </Name>
                    {role ? (
                        <p className="text-site-body mt-1 text-[17px]">
                            {role}
                        </p>
                    ) : null}
                    {credentials.length > 0 ? (
                        <>
                            {label ? (
                                <p className="text-site-muted mt-4 text-[12px] font-semibold uppercase tracking-[0.1em]">
                                    {label}
                                </p>
                            ) : null}
                            <ul
                                aria-label={label ?? PERSON_CREDENTIALS_LABEL}
                                className={
                                    label
                                        ? "border-site-border mt-2 grid gap-1.5 border-t pt-4"
                                        : "border-site-border mt-4 grid gap-1.5 border-t pt-4"
                                }
                            >
                                {credentials.map((c, i) => (
                                    <li
                                        key={i}
                                        className="flex gap-2.5 text-[14.5px] leading-snug"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="bg-site-accent mt-[0.45em] inline-block size-1.5 shrink-0 rounded-full"
                                        />
                                        <span className="min-w-0 [overflow-wrap:anywhere]">
                                            {c.title}
                                            {c.detail ? (
                                                <span className="text-site-muted block text-[13px]">
                                                    {c.detail}
                                                </span>
                                            ) : null}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : null}
                    {bio ? (
                        <p className="text-site-body mt-4 max-w-[var(--site-measure,60ch)] whitespace-pre-line text-[length:var(--site-body-size,15.5px)] leading-relaxed [overflow-wrap:anywhere]">
                            {bio}
                        </p>
                    ) : null}
                    {content.cta ? (
                        <div className="mt-6">
                            <CtaButton content={content.cta} />
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

/**
 * The `portrait` look (template polish), as the dietician design opens:
 * a 300px column with the 4:5 portrait and, under it, the qualifications as
 * rows (title / where) under their label; beside it the name set large,
 * the role and the words. On a phone the portrait comes first.
 */
function PortraitColumn({ content }: { content: RenderedPerson }) {
    const name = said(content.name) ?? "";
    const src = said(content.image?.src);
    const role = said(content.role);
    const bio = said(content.bio);
    const credentials = credentialsOf(content.credentials);
    const label = said(content.credentialsLabel) ?? PERSON_CREDENTIALS_LABEL;
    const Name = content.asTitle ? "h1" : "h2";
    const aside = src || credentials.length > 0;
    const rows =
        credentials.length > 0 ? (
            <div className={src ? "mt-6" : undefined}>
                <p className="text-site-muted text-[12px] font-semibold uppercase tracking-[0.1em]">
                    {label}
                </p>
                <ul aria-label={label} className="mt-2">
                    {credentials.map((c, i) => (
                        <li
                            key={i}
                            className="border-site-border grid gap-0.5 border-t py-2.5"
                        >
                            <span className="text-[14px] font-medium leading-snug [overflow-wrap:anywhere]">
                                {c.title}
                            </span>
                            {c.detail ? (
                                <span className="text-site-muted text-[13px] leading-snug [overflow-wrap:anywhere]">
                                    {c.detail}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
            </div>
        ) : null;

    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div
                className={
                    aside
                        ? "grid items-start gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:gap-[46px]"
                        : "max-w-[var(--site-measure,65ch)]"
                }
            >
                {aside ? (
                    <div className="min-w-0 max-w-[300px]">
                        {src ? (
                            <img
                                src={src}
                                alt={content.image?.alt ?? ""}
                                width={content.image?.width}
                                height={content.image?.height}
                                loading="lazy"
                                className="bg-site-surface aspect-[4/5] w-full rounded-[var(--site-radius)] object-cover"
                            />
                        ) : null}
                        {rows}
                    </div>
                ) : null}
                <div className="min-w-0">
                    <Name className="font-site-heading text-[calc(2.5rem*var(--site-heading-scale))] font-medium leading-[1.1] tracking-[-0.02em] [overflow-wrap:anywhere]">
                        {name}
                    </Name>
                    {role ? (
                        <p className="text-site-muted mt-2 text-[16px]">
                            {role}
                        </p>
                    ) : null}
                    {bio ? (
                        <p className="text-site-body mt-5 max-w-[var(--site-measure,62ch)] whitespace-pre-line text-[length:var(--site-body-size,17px)] leading-[1.72] [overflow-wrap:anywhere]">
                            {bio}
                        </p>
                    ) : null}
                    {content.cta ? (
                        <div className="mt-6">
                            <CtaButton content={content.cta} />
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

/**
 * The `team` look (template polish), as the gym design shows its coaches:
 * the block's own person first, then `people`, each with a 3:4 photo, their
 * name, what they do and a line. Four across on a desk, two on a phone.
 * Photo frames are drawn only when someone has a photo, so a team still
 * waiting for its photographs is a row of words, not of empty boxes.
 */
function TeamGrid({ content }: { content: RenderedPerson }) {
    const members = [
        {
            image: content.image,
            name: content.name,
            role: content.role,
            bio: content.bio,
        },
        ...(content.people ?? []),
    ].filter((m) => said(m.name) !== null);
    const framed = members.some((m) => said(m.image?.src) !== null);
    const title = said(content.title);
    const Title = content.asTitle ? "h1" : "h2";

    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {title ? (
                <Title
                    data-site-title=""
                    className="font-site-heading mb-5 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                >
                    {title}
                </Title>
            ) : null}
            <ul className="grid grid-cols-2 gap-x-[var(--site-grid-gap)] gap-y-8 lg:grid-cols-4">
                {members.map((m, i) => {
                    const src = said(m.image?.src);
                    const role = said(m.role);
                    const bio = said(m.bio);
                    return (
                        <li key={i} className="min-w-0">
                            {framed ? (
                                <div className="bg-site-surface mb-3 aspect-[3/4] overflow-hidden rounded-[var(--site-radius)]">
                                    {src ? (
                                        <img
                                            src={src}
                                            alt={m.image?.alt ?? ""}
                                            loading="lazy"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : null}
                                </div>
                            ) : null}
                            <h3 className="font-site-heading text-[calc(1.0625rem*var(--site-heading-scale))] font-semibold leading-tight [overflow-wrap:anywhere]">
                                {said(m.name)}
                            </h3>
                            {role ? (
                                <p className="text-site-muted mt-1 text-[12.5px] font-semibold uppercase tracking-[0.06em]">
                                    {role}
                                </p>
                            ) : null}
                            {bio ? (
                                <p className="text-site-body mt-2 whitespace-pre-line text-[13.5px] leading-relaxed [overflow-wrap:anywhere] [text-wrap:pretty]">
                                    {bio}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
