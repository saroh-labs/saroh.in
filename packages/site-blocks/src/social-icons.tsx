import type { SocialNetwork } from "@saroh/block-contract";
import { SOCIAL_LABELS } from "@saroh/block-contract";

/**
 * The marks of a business's social links (DEC-125), for a merchant's page.
 *
 * Inline line drawings in `currentColor`, so each takes the colour of the
 * text it sits in: the site's own footer or page colours (`--site-*`),
 * never a network's brand colour and never Saroh's. No icon font, no image
 * and no script is fetched from anyone, so nothing here tells a network
 * that a page was opened.
 *
 * The outlines follow Tabler Icons (MIT), on a 24 × 24 grid.
 */
const PATHS: Readonly<Record<SocialNetwork, readonly string[]>> = {
    instagram: [
        "M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z",
        "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
        "M16.5 7.5v.01",
    ],
    facebook: [
        "M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3",
    ],
    whatsapp: [
        "M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9",
        "M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1",
    ],
    youtube: [
        "M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4z",
        "M10 9l5 3l-5 3z",
    ],
    x: [
        "M4 4l11.733 16h4.267l-11.733 -16z",
        "M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772",
    ],
    linkedin: [
        "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z",
        "M8 11v5",
        "M8 8v.01",
        "M12 16v-5",
        "M16 16v-3a2 2 0 0 0 -4 0",
    ],
    pinterest: [
        "M8 20l4 -9",
        "M10.7 14c.437 1.263 1.43 2 2.55 2c2.071 0 3.75 -1.554 3.75 -4a5 5 0 1 0 -9.7 1.7",
        "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    ],
    telegram: ["M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4"],
};

/** One network's mark. Decorative: the link around it carries the name. */
export function SocialIcon({
    network,
    className = "size-5",
}: {
    network: SocialNetwork;
    className?: string;
}) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            {PATHS[network].map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}

/**
 * A row of social links: each an icon in a 44px target, named for a screen
 * reader ("Instagram"), opening in a new tab. `rel="me"` says the account
 * is this business's own; `noopener noreferrer` keeps the page it opens
 * from reaching back or learning where the visitor came from.
 *
 * `ring` is the focus ring's colour class, the ground's own text colour.
 */
export function SocialLinkRow({
    links,
    ring,
    className = "",
}: {
    links: readonly { network: SocialNetwork; url: string }[];
    ring: string;
    className?: string;
}) {
    if (links.length === 0) return null;
    return (
        <ul
            aria-label="Find us on"
            className={`flex list-none flex-wrap items-center gap-1 p-0 ${className}`}
        >
            {links.map((link) => (
                <li key={link.network}>
                    <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer me"
                        aria-label={SOCIAL_LABELS[link.network]}
                        title={SOCIAL_LABELS[link.network]}
                        data-social={link.network}
                        className={`${ring} inline-flex size-11 cursor-pointer items-center justify-center rounded-[var(--site-radius)] hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 active:opacity-50`}
                    >
                        <SocialIcon network={link.network} />
                    </a>
                </li>
            ))}
        </ul>
    );
}
