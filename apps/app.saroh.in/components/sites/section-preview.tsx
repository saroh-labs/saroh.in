import type { Section } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
// From the pure module, not the service: `lib/sites/service` reaches for
// `next/headers` and cannot be pulled into a client component.
import { resolveStyleVariables } from "@/lib/sites/style";

/**
 * Presentational renderers for draft sections — what the editor shows before
 * publishing. Renders client editor state, so there is no network round-trip.
 * The real public render is S2-006 in saroh.app.
 *
 * EVERY colour and measurement here comes from the `--site-*` layer, never from
 * Saroh's tokens. `PRODUCT.md` is explicit: saroh.app renders merchants'
 * storefronts and must never inherit Saroh's brand, and that token layer is
 * separate by design.
 *
 * This preview used to be built from `bg-primary`, `text-muted-foreground` and
 * friends — 35 usages of Saroh's own palette — so a merchant previewing their
 * bakery saw Saroh's colours and nothing they chose could change them. Reading
 * the site layer is what makes the Style panel mean anything, and it is the
 * same layer the published site already uses.
 *
 * richText HTML is NOT sanitized here because this only ever shows the author
 * their own draft, never third-party content.
 */

/*
 * Shorthands for the site layer.
 *
 * Written out rather than hidden behind a helper because Tailwind needs to see
 * the literal class to emit it. The alpha variants derive from the text colour
 * so a dark palette gets light hairlines and a light one gets dark, without a
 * separate border swatch for the merchant to choose wrongly.
 */
const SURFACE = "bg-[hsl(var(--site-bg))] text-[hsl(var(--site-fg))]";
/*
 * Hairlines and muted copy read the DERIVED variables rather than an alpha of
 * the text colour. Both approaches look right on their own; the reason to pick
 * one is that saroh.app has its own `--site-border` and `--site-muted` tokens,
 * and a preview using a different rule from the site it previews is a preview
 * that lies about something small on every screen.
 */
const BORDER = "border border-[hsl(var(--site-border))]";
const MUTED = "text-[hsl(var(--site-muted))]";
const FILL = "bg-[hsl(var(--site-fg)/0.04)]";
const RADIUS = "rounded-[var(--site-radius)]";
const PAD = "p-[var(--site-section-padding)]";
/** Headings scale together, so one slider moves the whole page's voice. */
const H2 = "text-[calc(1.875rem*var(--site-heading-scale))] leading-tight";
const H3 = "text-[calc(1.125rem*var(--site-heading-scale))] leading-snug";
const BUTTON =
    "inline-block rounded-[var(--site-radius)] bg-[hsl(var(--site-accent))] px-5 py-2 text-sm font-medium text-[hsl(var(--site-accent-fg))]";

function SectionPreview({ section }: { section: Section }) {
    /*
     * A section's own padding, when it has one (#189).
     *
     * Set as an inline custom property rather than a class so it overrides the
     * site-wide `--site-section-padding` for this subtree only — the same
     * mechanism the site style uses, one level down. Absent leaves the site
     * setting in force, which is what "Following the site setting" means.
     */
    const override = section.content.padding;
    const pad: React.CSSProperties | undefined =
        override === undefined
            ? undefined
            : ({
                  "--site-section-padding": `${override}px`,
              } as React.CSSProperties);

    switch (section.type) {
        case "hero": {
            const { heading, subheading, cta, image } = section.content;
            return (
                <section
                    className={`${BORDER} ${RADIUS} ${PAD} bg-[hsl(var(--site-hero-bg))] text-center text-[hsl(var(--site-hero-fg))]`}
                    style={pad}
                >
                    {image?.src && (
                        // eslint-disable-next-line @next/next/no-img-element -- merchant-supplied absolute URL, not a project asset
                        <img
                            src={image.src}
                            alt={image.alt ?? ""}
                            className={`mx-auto mb-6 max-h-56 object-cover ${RADIUS}`}
                        />
                    )}
                    <h2 className={`${H2} font-bold tracking-tight`}>
                        {heading}
                    </h2>
                    {subheading && (
                        <p className="mx-auto mt-3 max-w-xl opacity-75">
                            {subheading}
                        </p>
                    )}
                    {cta?.label && (
                        <span className={`mt-6 ${BUTTON}`}>{cta.label}</span>
                    )}
                </section>
            );
        }
        case "richText": {
            const { format, value } = section.content;
            return (
                <section
                    className={`${SURFACE} ${BORDER} ${RADIUS} ${PAD}`}
                    style={pad}
                >
                    {format === "html" ? (
                        <div
                            className="prose prose-sm max-w-none prose-headings:text-[hsl(var(--site-fg))] prose-p:text-[hsl(var(--site-fg)/0.8)]"
                            dangerouslySetInnerHTML={{ __html: value }}
                        />
                    ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm">
                            {value}
                        </pre>
                    )}
                </section>
            );
        }
        case "cta": {
            const { label } = section.content;
            return (
                <section
                    className={`${BORDER} ${RADIUS} ${PAD} bg-[hsl(var(--site-cta-bg))] text-center text-[hsl(var(--site-cta-fg))]`}
                    style={pad}
                >
                    <span
                        className={`inline-block rounded-[var(--site-radius)] bg-[hsl(var(--site-cta-fg))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--site-cta-bg))]`}
                    >
                        {label}
                    </span>
                </section>
            );
        }
        case "gallery": {
            const { images, layout } = section.content;
            return (
                <section
                    className={`${SURFACE} ${BORDER} ${RADIUS} ${PAD}`}
                    style={pad}
                >
                    <div
                        className={
                            layout === "carousel"
                                ? "flex gap-[var(--site-grid-gap)] overflow-x-auto"
                                : "grid grid-cols-2 gap-[var(--site-grid-gap)] sm:grid-cols-3"
                        }
                    >
                        {images.map((img, i) => (
                            <div
                                key={i}
                                className={
                                    layout === "carousel"
                                        ? "h-32 w-48 shrink-0"
                                        : "aspect-square"
                                }
                            >
                                {img.src ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- merchant-supplied absolute URL
                                    <img
                                        src={img.src}
                                        alt={img.alt ?? ""}
                                        className={`h-full w-full object-cover ${RADIUS}`}
                                    />
                                ) : (
                                    <div
                                        className={`flex h-full w-full items-center justify-center text-xs ${FILL} ${RADIUS} ${MUTED}`}
                                    >
                                        image
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            );
        }
        case "enquiry": {
            const { title, description, submitLabel, fields } = section.content;
            return (
                <section
                    className={`${SURFACE} ${BORDER} ${RADIUS} ${PAD}`}
                    style={pad}
                >
                    {title && (
                        <h3 className={`${H3} font-semibold`}>{title}</h3>
                    )}
                    {description && (
                        <p className={`mt-1 text-sm ${MUTED}`}>{description}</p>
                    )}
                    {/* A non-submitting mockup: shows the author their fields. */}
                    <div className="mt-4 grid gap-[var(--site-grid-gap)]">
                        {fields.map((field, i) => (
                            <div key={i} className="grid gap-1.5">
                                <span className="text-sm font-medium">
                                    {[field.label, field.name].find((s) => s) ??
                                        "Field"}
                                    {field.required && (
                                        <span className="text-[hsl(var(--site-accent))]">
                                            {" *"}
                                        </span>
                                    )}
                                </span>
                                <div
                                    className={`${field.type === "textarea" ? "h-16" : "h-9"} ${BORDER} ${RADIUS} ${FILL}`}
                                />
                            </div>
                        ))}
                        <span className={`mt-1 w-fit ${BUTTON}`}>
                            {[submitLabel].find((s) => s) ?? "Send"}
                        </span>
                    </div>
                </section>
            );
        }
        case "booking": {
            const { title, description, serviceId, submitLabel } =
                section.content;
            return (
                <section
                    className={`${SURFACE} ${BORDER} ${RADIUS} ${PAD}`}
                    style={pad}
                >
                    {title && (
                        <h3 className={`${H3} font-semibold`}>{title}</h3>
                    )}
                    {description && (
                        <p className={`mt-1 text-sm ${MUTED}`}>{description}</p>
                    )}
                    {serviceId ? (
                        <div className="mt-4 grid gap-[var(--site-grid-gap)]">
                            {/* A non-interactive mockup of the slot picker. */}
                            <div className="flex flex-wrap gap-2">
                                {["9:00", "9:30", "10:00", "10:30"].map(
                                    (slot) => (
                                        <span
                                            key={slot}
                                            className={`px-3 py-1.5 text-sm ${BORDER} ${RADIUS} ${FILL} ${MUTED}`}
                                        >
                                            {slot}
                                        </span>
                                    ),
                                )}
                            </div>
                            <div
                                className={`h-9 ${BORDER} ${RADIUS} ${FILL}`}
                            />
                            <div
                                className={`h-9 ${BORDER} ${RADIUS} ${FILL}`}
                            />
                            <span className={`mt-1 w-fit ${BUTTON}`}>
                                {[submitLabel].find((s) => s) ?? "Book"}
                            </span>
                        </div>
                    ) : (
                        <p className={`mt-4 text-sm ${MUTED}`}>
                            Pick a service for this booking section to preview
                            its available times.
                        </p>
                    )}
                </section>
            );
        }
        default:
            return null;
    }
}

/**
 * Render an ordered list of draft sections as a page preview.
 *
 * The style resolves to inline custom properties on this subtree rather than a
 * stylesheet, so dragging a slider re-renders without a round trip — the whole
 * point of the Style panel — and so two previews on one screen could never
 * fight over a global.
 */
export function DraftPreview({
    sections,
    style,
    styleOptions,
    selectedIndex,
    onSelect,
}: {
    sections: Section[];
    style?: SiteStyle;
    styleOptions?: SiteStyleOptions;
    /** Index into `sections` (not the visible subset) of the open section. */
    selectedIndex?: number | null;
    /**
     * "Clicking a section in the preview selects it; rail and field panel
     * follow" (spec §2). Omitted where the preview is not an editing surface.
     */
    onSelect?: (index: number) => void;
}) {
    // React accepts custom properties on the style object, so the resolved
    // record needs no assertion to be used as one.
    const vars: React.CSSProperties =
        style && styleOptions ? resolveStyleVariables(style, styleOptions) : {};

    /*
     * The preview answers "what will visitors see", so a hidden section is
     * absent here exactly as it will be absent from the published snapshot.
     *
     * The ORIGINAL index travels with each one: filtering renumbers the list,
     * and a click on the third visible section has to select the third section
     * of the real list, not the third of what survived the filter.
     */
    const visible = sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => section.hidden !== true);

    if (visible.length === 0) {
        return (
            <p
                style={vars}
                className={`border border-dashed p-8 text-center text-sm ${RADIUS} ${MUTED}`}
            >
                {sections.length === 0
                    ? "No sections yet. Add one to preview it here."
                    : /*
                       * Distinguishing the two empties matters: "you have not
                       * built anything" and "you have hidden everything you
                       * built" call for opposite next moves, and the second is
                       * recoverable from the rail one click away.
                       */
                      "Every section on this page is hidden, so visitors would see an empty page."}
            </p>
        );
    }
    return (
        <div
            style={vars}
            className={`space-y-4 p-[var(--site-page-margin)] ${SURFACE} ${RADIUS}`}
        >
            {visible.map(({ section, index }) =>
                onSelect === undefined ? (
                    <SectionPreview key={index} section={section} />
                ) : (
                    /*
                     * A plain div with a click, not a <button>: a section holds
                     * headings, links and form fields, and nesting those inside
                     * a button is invalid and breaks the keyboard. The rail is
                     * the keyboard-reachable way to select a section; this is
                     * the pointer shortcut for what you can already see.
                     */
                    <div
                        key={index}
                        onClick={() => onSelect(index)}
                        className={`cursor-pointer rounded-[2px] outline-offset-2 transition-[outline-color] ${
                            selectedIndex === index
                                ? "outline outline-1 outline-[#8a5a3c]"
                                : "outline outline-1 outline-transparent hover:outline-[#8a5a3c]/40"
                        }`}
                    >
                        <SectionPreview section={section} />
                    </div>
                ),
            )}
        </div>
    );
}
