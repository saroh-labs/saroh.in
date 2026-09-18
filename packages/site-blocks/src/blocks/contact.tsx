import type { RenderedContact } from "@saroh/block-contract";
import { ctaHref, isSafeHref } from "@saroh/block-contract";

/**
 * `contact` v1 — where to find the business and how to reach it (#255).
 *
 * Links are built here from the values the contract validated, by the same
 * `ctaHref` a call or WhatsApp button uses, so a number behaves identically in
 * both places. `mapUrl` is checked again rather than trusted: a snapshot is
 * immutable and may predate today's rules, and no link beats a script. Without
 * one, the map link is a search for the address.
 *
 * Drawn from `--site-*` only; gate G2 fails the build otherwise.
 */
function mapHref(content: RenderedContact): string | null {
    const url = content.mapUrl?.trim();
    if (url && /^https?:\/\//i.test(url) && isSafeHref(url)) return url;
    const address = content.address?.trim();
    if (!address) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.replace(/\s*\n\s*/g, ", "))}`;
}

const noPage = () => undefined;

export default function ContactSection({
    content,
}: {
    content: RenderedContact;
}) {
    const channels = [
        content.phone
            ? {
                  label: "Phone",
                  value: content.phone,
                  href: ctaHref(
                      { kind: "call", number: content.phone },
                      noPage,
                  ),
              }
            : null,
        content.email
            ? {
                  label: "Email",
                  value: content.email,
                  href: ctaHref(
                      { kind: "email", address: content.email },
                      noPage,
                  ),
              }
            : null,
        content.whatsapp
            ? {
                  label: "WhatsApp",
                  value: content.whatsapp,
                  href: ctaHref(
                      { kind: "whatsapp", number: content.whatsapp },
                      noPage,
                  ),
              }
            : null,
    ].filter((c) => c !== null);
    const map = mapHref(content);
    const mapLink = map ? (
        <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="text-site-fg focus-visible:ring-site-accent mt-2 inline-block text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2"
        >
            Open in maps
        </a>
    ) : null;

    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.heading ? (
                <h2 className="text-site-fg text-[calc(1.875rem*var(--site-heading-scale))] font-bold tracking-tight">
                    {content.heading}
                </h2>
            ) : null}
            {content.intro ? (
                <p className="text-site-body mt-3 max-w-2xl text-lg">
                    {content.intro}
                </p>
            ) : null}

            <div className="mt-10 grid gap-[var(--site-grid-gap)] md:grid-cols-2">
                {content.address || content.hours || map ? (
                    <div className="grid content-start gap-6">
                        {content.address ? (
                            <div>
                                <h3 className="text-site-muted text-sm font-medium">
                                    Address
                                </h3>
                                <address className="text-site-fg mt-1 whitespace-pre-line not-italic leading-relaxed">
                                    {content.address}
                                </address>
                                {mapLink}
                            </div>
                        ) : mapLink ? (
                            // A map link with no address still earns its
                            // place: a merchant who pinned the shop but left
                            // the address out should not lose the pin.
                            <div>
                                <h3 className="text-site-muted text-sm font-medium">
                                    Location
                                </h3>
                                {mapLink}
                            </div>
                        ) : null}
                        {content.hours ? (
                            <div>
                                <h3 className="text-site-muted text-sm font-medium">
                                    Opening hours
                                </h3>
                                <p className="text-site-fg mt-1 whitespace-pre-line leading-relaxed">
                                    {content.hours}
                                </p>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {channels.length > 0 ? (
                    <dl className="grid content-start gap-4">
                        {channels.map((c) => (
                            <div key={c.label}>
                                <dt className="text-site-muted text-sm font-medium">
                                    {c.label}
                                </dt>
                                <dd className="mt-1">
                                    {c.href ? (
                                        <a
                                            href={c.href}
                                            // Only WhatsApp leaves the site.
                                            {...(c.label === "WhatsApp"
                                                ? {
                                                      target: "_blank",
                                                      rel: "noopener noreferrer",
                                                  }
                                                : {})}
                                            className="text-site-fg focus-visible:ring-site-accent break-words text-lg underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2"
                                        >
                                            {c.value}
                                        </a>
                                    ) : (
                                        <span className="text-site-fg text-lg">
                                            {c.value}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                ) : null}
            </div>
        </section>
    );
}
