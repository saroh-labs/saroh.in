import type { LookId, RenderedHero } from "@saroh/block-contract";
import Link from "next/link";
import type { ReactNode } from "react";

import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { HeroHeading } from "./hero-heading";
import type { HeroLevel } from "./hero-level";
import type { FrontDoor, PageProof } from "./look-front";
import { FRONT_RING, FRONT_WRAP, FrontCta, frontButton } from "./look-front";
import { OwnerPhotoNote } from "./no-photo";

/**
 * The hero under a look (DEC-172, plan U6, #1094), as each look's fixed
 * Home board draws it (VA01, VD01, VB01; desk and phone):
 *
 * - **Folio** (VA01, VA-01): on a phone, the headline, the proof line, the
 *   card with the next booking and the button, then the photo at 3:2, and
 *   the line under the headline last. From 700px, the headline, its line
 *   and the proof beside a tall 4:5 photo, the card across under them.
 * - **Quiet** (VD01, D-04): on a phone, the photo at 3:2 first, then the
 *   headline, the button, the next booking and the proof line, and the
 *   line under the headline last. From 700px, all of it centred, words
 *   first, the photo wide (16:9) below.
 * - **Live** (VB01): the next booking first (the Now strip's place), then
 *   the headline and its line, the photo in a rounded card, the button full
 *   width and the proof line; from 700px the words beside a tall photo.
 *
 * THE PHONE'S FIRST SCREEN (390×844) holds the photo (or the type-led hero
 * when there is none), the next booking (or the shop's entry) and one proof
 * line, in that look's order.
 *
 * WITH NO PHOTO the hero is led by its type: no frame, nothing empty, the
 * next booking moving up into the photo's place. Only the owner's preview
 * says "No photo yet", where the photo would be.
 *
 * THE NEXT BOOKING is a slot (`data-site-next-free`) with its height kept
 * from the first paint. Live facts are fetched in the browser (U8, #1042):
 * until they are, the slot holds the plain way in, "See times", from the
 * cached page, and never a made-up time. A site that sells but takes no
 * bookings gets the shop's entry there instead; one that does neither gets
 * no slot.
 *
 * THE PROOF LINE is the first quote of the page's own testimonials
 * (owner-entered; they stand in for service reviews until Phase 2), passed
 * by `PageSections`. A page with none shows none: nothing is invented.
 *
 * ONE FILLED BUTTON: the hero's own button, marked `data-site-primary`.
 * ONE H1: the headline is the page's `h1` only on its first hero.
 *
 * Drawn from `--site-*` only (gates G2 and G7).
 */
export default function LookHero({
    content,
    look,
    level = 1,
    priority = false,
    isOwnerPreview = false,
    frontDoor = null,
    proof = null,
}: {
    content: RenderedHero;
    look: LookId;
    level?: HeroLevel;
    priority?: boolean;
    isOwnerPreview?: boolean;
    frontDoor?: FrontDoor | null;
    proof?: PageProof | null;
}) {
    const src = content.image?.src.trim() ? content.image : null;
    const parts: HeroParts = {
        heading: (
            <HeroHeading
                level={level}
                className={cn(HEADING[look], "[overflow-wrap:anywhere]")}
            >
                {content.heading}
            </HeroHeading>
        ),
        line: content.subheading ? (
            <p className={LINE[look]}>{content.subheading}</p>
        ) : null,
        button: content.cta ? (
            <FrontCta
                content={content.cta}
                look={look}
                className={BUTTON_WIDTH[look]}
            />
        ) : null,
        door: frontDoor ? <FrontDoorSlot door={frontDoor} look={look} /> : null,
        proof: proof ? <ProofLine proof={proof} look={look} /> : null,
        photo: (aspect: string, sizes: string, className?: string) =>
            src ? (
                // Remote images from any tenant origin: a plain <img>, as
                // every hero's.
                <img
                    src={src.src}
                    alt={src.alt ?? ""}
                    width={src.width}
                    height={src.height}
                    data-hero-photo=""
                    {...siteImage(priority ? "first-hero" : "below", {
                        src: src.src,
                        width: src.width,
                        sizes,
                    })}
                    className={cn(
                        "rounded-site-photo bg-site-surface block w-full object-cover",
                        aspect,
                        className,
                    )}
                />
            ) : (
                <OwnerPhotoNote
                    isOwnerPreview={isOwnerPreview}
                    what={content.imageBrief}
                    className={className}
                />
            ),
        hasPhoto: src !== null,
        photoSlot: src !== null || isOwnerPreview,
    };

    return (
        <section
            data-site-look-hero={look}
            data-hero-photo={src ? "" : undefined}
            // It sits on the page's own ground, not the hero band's (its
            // colours are the page's), but keeps its own spacing: the
            // section after it is not drawn up as a neighbour.
            data-site-ground="page"
            className="bg-site-bg text-site-fg w-full"
        >
            {look === "folio" ? (
                <FolioHero {...parts} />
            ) : look === "quiet" ? (
                <QuietHero {...parts} />
            ) : (
                <LiveHero {...parts} />
            )}
        </section>
    );
}

interface HeroParts {
    heading: ReactNode;
    line: ReactNode;
    button: ReactNode;
    door: ReactNode;
    proof: ReactNode;
    /** The photo at an aspect, or the owner's note, or nothing. */
    photo: (aspect: string, sizes: string, className?: string) => ReactNode;
    hasPhoto: boolean;
    /** Something goes where the photo would: the photo, or the owner's note. */
    photoSlot: boolean;
}

/**
 * A desk grid's areas from the parts a hero has (`null` for one it hasn't),
 * so a missing part leaves no empty row and no gap. Written inline: the
 * phone's layout is a flex column, which ignores it.
 */
export function gridAreas(rows: (string[] | null | false)[]): {
    gridTemplateAreas: string;
} {
    return {
        gridTemplateAreas: rows
            .filter((row): row is string[] => Array.isArray(row))
            .map((row) => `'${row.join(" ")}'`)
            .join(" "),
    };
}

/** The headline per look: the boards' display sizes, phone then desk. */
const HEADING: Record<LookId, string> = {
    folio: "font-site-heading text-[calc(clamp(3.25rem,10vw,9rem)*var(--site-heading-scale,1))] font-light leading-[0.95] tracking-[-0.045em] [text-wrap:balance] min-[700px]:leading-[0.9]",
    quiet: "font-site-heading text-[calc(clamp(3.75rem,8.9vw,8rem)*var(--site-heading-scale,1))] font-light leading-none tracking-[-0.02em] [font-variant-numeric:lining-nums] [text-wrap:balance] min-[700px]:leading-[0.95]",
    live: "font-site-heading text-[calc(clamp(2.5rem,7.8vw,7rem)*var(--site-heading-scale,1))] font-extrabold leading-[0.95] tracking-[-0.035em] [font-stretch:80%] [text-wrap:balance] min-[700px]:leading-[0.86] min-[700px]:tracking-[-0.045em]",
};

/** The line under the headline per look. */
const LINE: Record<LookId, string> = {
    folio: "font-site-heading text-site-body max-w-[640px] text-[20px] font-light leading-[1.38] [text-wrap:pretty] min-[700px]:text-[26px]",
    quiet: "text-site-body max-w-[600px] text-[18px] leading-[1.6] [text-wrap:pretty] min-[700px]:text-[20px]",
    live: "text-site-fg max-w-[620px] text-[16px] leading-[1.6] [text-wrap:pretty] min-[700px]:text-[19px] min-[700px]:leading-[1.5]",
};

/** How wide the hero's button is: full width at the thumb, where drawn so. */
const BUTTON_WIDTH: Record<LookId, string> = {
    folio: "flex w-full justify-between min-[700px]:inline-flex min-[700px]:w-auto",
    quiet: "flex w-full max-[699px]:min-h-[52px] min-[700px]:inline-flex min-[700px]:w-auto",
    live: "flex w-full min-[700px]:inline-flex min-[700px]:w-auto",
};

/**
 * Folio (VA01). The phone's order is set with `order`, the desk's with a
 * grid's areas, from one list of parts.
 */
function FolioHero({
    heading,
    line,
    button,
    door,
    proof,
    photo,
    hasPhoto,
    photoSlot,
}: HeroParts) {
    const card =
        door || button ? (
            <div
                data-site-rise=""
                className="border-t-site-fg border-b-site-border grid gap-3 border-t pt-4 min-[700px]:grid-cols-[minmax(0,1fr)_auto] min-[700px]:items-center min-[700px]:gap-5 min-[700px]:border-b min-[700px]:py-[18px]"
            >
                {door ?? <span />}
                {button}
            </div>
        ) : null;
    return (
        <div
            className={cn(
                FRONT_WRAP,
                "flex flex-col gap-3 pb-7 pt-5 min-[700px]:grid min-[700px]:items-end min-[700px]:gap-x-14 min-[700px]:gap-y-8 min-[700px]:pb-12 min-[700px]:pt-[72px]",
                hasPhoto
                    ? "min-[700px]:grid-cols-[minmax(0,1fr)_minmax(220px,420px)]"
                    : "min-[700px]:grid-cols-[minmax(0,1fr)]",
            )}
            style={gridAreas(
                hasPhoto
                    ? [
                          ["h", "p"],
                          Boolean(line) && ["l", "p"],
                          Boolean(proof) && ["q", "p"],
                          Boolean(card) && ["c", "c"],
                      ]
                    : [
                          ["h"],
                          Boolean(line) && ["l"],
                          Boolean(proof) && ["q"],
                          photoSlot && ["p"],
                          Boolean(card) && ["c"],
                      ],
            )}
        >
            <div
                data-site-rise=""
                className="max-[699px]:order-1 min-[700px]:[grid-area:h]"
            >
                {heading}
            </div>
            {line ? (
                <div className="max-[699px]:order-5 max-[699px]:pt-4 min-[700px]:[grid-area:l]">
                    {line}
                </div>
            ) : null}
            {proof ? (
                <div className="max-[699px]:order-2 min-[700px]:[grid-area:q]">
                    {proof}
                </div>
            ) : null}
            {card ? (
                <div className="max-[699px]:order-3 max-[699px]:pt-[18px] min-[700px]:[grid-area:c]">
                    {card}
                </div>
            ) : null}
            <div className="empty:hidden max-[699px]:order-4 max-[699px]:pt-5 min-[700px]:self-end min-[700px]:[grid-area:p]">
                {photo(
                    "aspect-[3/2] min-[700px]:aspect-[4/5]",
                    "(min-width: 700px) 420px, 100vw",
                )}
            </div>
        </div>
    );
}

/**
 * Quiet (VD01). The photo leads on a phone and follows on a desk; the
 * line under the headline comes last on a phone, second on a desk.
 */
function QuietHero({
    heading,
    line,
    button,
    door,
    proof,
    photo,
    hasPhoto,
}: HeroParts) {
    return (
        <div className="flex flex-col">
            <div
                className={cn(
                    FRONT_WRAP,
                    "flex flex-col gap-3.5 pb-7 max-[699px]:order-2 min-[700px]:items-center min-[700px]:gap-6 min-[700px]:pb-[72px] min-[700px]:pt-[88px] min-[700px]:text-center",
                    hasPhoto ? "pt-6" : "pt-10",
                )}
            >
                <div data-site-rise="">{heading}</div>
                {line ? (
                    <div className="max-[699px]:order-last">{line}</div>
                ) : null}
                {button ? (
                    <div className="flex w-full justify-center pt-1 min-[700px]:w-auto">
                        {button}
                    </div>
                ) : null}
                {door ? (
                    <div className="w-full min-[700px]:flex min-[700px]:justify-center">
                        {door}
                    </div>
                ) : null}
                {proof}
            </div>
            <div
                className={cn(
                    "min-[700px]:max-w-site-content empty:hidden max-[699px]:order-1 min-[700px]:mx-auto min-[700px]:w-full min-[700px]:px-[var(--site-page-margin)]",
                    !hasPhoto &&
                        "max-[699px]:px-[var(--site-page-margin)] max-[699px]:pt-2",
                )}
            >
                {photo(
                    "aspect-[3/2] min-[700px]:aspect-video max-[699px]:rounded-none",
                    "(min-width: 1280px) 1184px, 100vw",
                )}
            </div>
        </div>
    );
}

/** Live (VB01): the next booking on top, the words beside a tall photo. */
function LiveHero({
    heading,
    line,
    button,
    door,
    proof,
    photo,
    hasPhoto,
    photoSlot,
}: HeroParts) {
    return (
        <div
            style={gridAreas(
                hasPhoto
                    ? [
                          Boolean(door) && ["s", "s"],
                          ["h", "f"],
                          Boolean(line) && ["l", "f"],
                          Boolean(button) && ["c", "f"],
                          Boolean(proof) && ["q", "f"],
                      ]
                    : [
                          Boolean(door) && ["s"],
                          ["h"],
                          Boolean(line) && ["l"],
                          Boolean(button) && ["c"],
                          Boolean(proof) && ["q"],
                          photoSlot && ["f"],
                      ],
            )}
            className={cn(
                FRONT_WRAP,
                "flex flex-col gap-4 pb-6 pt-1 min-[700px]:grid min-[700px]:gap-x-10 min-[700px]:gap-y-6 min-[700px]:pb-10 min-[700px]:pt-3",
                hasPhoto
                    ? "min-[700px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[1100px]:grid-cols-[minmax(0,1fr)_600px]"
                    : "min-[700px]:grid-cols-[minmax(0,1fr)]",
            )}
        >
            {door ? (
                <div className="min-[700px]:[grid-area:s]">{door}</div>
            ) : null}
            <div
                data-site-rise=""
                className="min-[700px]:pt-7 min-[700px]:[grid-area:h]"
            >
                {heading}
            </div>
            {line ? (
                <div className="min-[700px]:[grid-area:l]">{line}</div>
            ) : null}
            <div className="empty:hidden min-[700px]:[grid-area:f]">
                {photo(
                    "h-[220px] min-[700px]:h-[560px]",
                    "(min-width: 1100px) 600px, (min-width: 700px) 50vw, 100vw",
                )}
            </div>
            {button ? (
                <div className="min-[700px]:[grid-area:c]">{button}</div>
            ) : null}
            {proof ? (
                <div className="min-[700px]:[grid-area:q]">{proof}</div>
            ) : null}
        </div>
    );
}

/**
 * The next booking's place in the hero (U8 fills it, #1042), or the shop's
 * entry. Its height is kept from the first paint, so nothing moves when
 * the live facts arrive or fail; until then it holds the plain way in.
 */
function FrontDoorSlot({ door, look }: { door: FrontDoor; look: LookId }) {
    const label = door.kind === "book" ? "See times" : "See the shop";
    return (
        <div
            data-site-front-door={door.kind}
            {...(door.kind === "book"
                ? { "data-site-next-free": "", "data-book-href": door.href }
                : {})}
            className={cn(
                "flex min-h-11 items-center",
                DOOR[look],
                door.kind === "book" && DOOR_HEIGHT[look],
            )}
        >
            {look === "live" ? (
                <Link
                    href={door.href}
                    className={cn(
                        "bg-site-surface text-site-fg inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-[14px] font-semibold",
                        FRONT_RING,
                    )}
                >
                    {label}
                </Link>
            ) : (
                <Link
                    href={door.href}
                    className={frontButton(
                        look,
                        "link",
                        "text-site-accent-text",
                    )}
                >
                    {label}
                </Link>
            )}
        </div>
    );
}

/** Where the slot sits per look. */
const DOOR: Record<LookId, string> = {
    folio: "",
    quiet: "min-[700px]:justify-center",
    live: "min-h-[54px]",
};

/**
 * The height kept for the next booking (VD01's 96px on a phone and 72px
 * on a desk; VA01's card; VB01's Now strip).
 */
const DOOR_HEIGHT: Record<LookId, string> = {
    folio: "min-h-[72px]",
    quiet: "min-h-[72px]",
    live: "min-h-[54px]",
};

/** One proof line: the page's first testimonial, its words and its name. */
function ProofLine({ proof, look }: { proof: PageProof; look: LookId }) {
    if (look === "quiet") {
        return (
            <p
                data-site-proof=""
                className="text-site-body line-clamp-3 text-[14.5px] leading-[1.5] min-[700px]:text-center"
            >
                <i className="font-site-heading text-site-fg text-[18px] italic">
                    “{proof.quote}”
                </i>{" "}
                {proof.name}
            </p>
        );
    }
    if (look === "live") {
        return (
            <p
                data-site-proof=""
                className="text-site-fg line-clamp-3 text-[14px] leading-[1.45]"
            >
                “{proof.quote}”{" "}
                <span className="text-site-muted">{proof.name}</span>
            </p>
        );
    }
    return (
        <p
            data-site-proof=""
            className="text-site-body line-clamp-3 text-[14px] leading-[1.55]"
        >
            “{proof.quote}”{" "}
            <span className="text-site-muted">{proof.name}</span>
        </p>
    );
}
