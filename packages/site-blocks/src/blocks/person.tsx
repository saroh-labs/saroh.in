import type { RenderedPerson } from "@saroh/block-contract";

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
 * as one heading per person. Drawn from `--site-*` only (gate G2).
 */
function said(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

export default function PersonSection({
    content,
}: {
    content: RenderedPerson;
}) {
    const name = said(content.name);
    if (!name) return null;
    const src = said(content.image?.src);
    const role = said(content.role);
    const bio = said(content.bio);
    const credentials = (content.credentials ?? [])
        .map((c) => c.trim())
        .filter(Boolean);

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
                    <h2 className="font-site-heading text-[calc(2rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.025em] [overflow-wrap:anywhere]">
                        {name}
                    </h2>
                    {role ? (
                        <p className="text-site-body mt-1 text-[17px]">
                            {role}
                        </p>
                    ) : null}
                    {credentials.length > 0 ? (
                        <ul
                            aria-label="Qualifications"
                            className="border-site-border mt-4 grid gap-1.5 border-t pt-4"
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
                                        {c}
                                    </span>
                                </li>
                            ))}
                        </ul>
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
