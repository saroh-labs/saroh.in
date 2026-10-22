import type { LookId, RenderedPerson } from "@saroh/block-contract";

import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { FRONT_TYPE, FRONT_WRAP, FrontCta, said } from "./look-front";
import { InitialsPlate } from "./no-photo";

/**
 * A team under a look (DEC-172, plan U6, #1094), as each look's Home and
 * About boards draw the teachers (VA01/VA04, VD01/VD04, VB01/VB04):
 *
 * - **Folio**: square plates, two to a row on a phone and three on a desk;
 *   the name in the display face, what they do under it.
 * - **Quiet**: a list on a phone; three across, centred, on a desk.
 * - **Live**: round faces on white cards, in a row that scrolls sideways
 *   on a phone and three across on a desk.
 *
 * People with their own lines (bios) take the About boards' rows instead
 * (VA04: 120px plate, a 30px name; VD04: a calm list, one to a row), since
 * a line needs the room; Live keeps its cards.
 *
 * PEOPLE SHOW INITIALS (Phase 1): staff have a name and a title, and a
 * photo or a bio is Phase 2 (U19). A person whose own photo the owner set
 * on the block shows it, in the look's crop; everyone else shows their
 * initials, never an empty frame. The plate is decoration (`aria-hidden`):
 * the name is always text.
 *
 * Everything the block holds is kept: the title over the group, every
 * person in order, their role and their line.
 */

interface Member {
    name: string;
    role: string | null;
    bio: string | null;
    image: RenderedPerson["image"];
}

/** The block's own person, then its `people`, those with a name only. */
export function membersOf(content: RenderedPerson): Member[] {
    return [
        {
            name: content.name,
            role: content.role,
            bio: content.bio,
            image: content.image,
        },
        ...(content.people ?? []),
    ].flatMap((m) => {
        const name = said(m.name);
        return name
            ? [
                  {
                      name,
                      role: said(m.role),
                      bio: said(m.bio),
                      image: m.image,
                  },
              ]
            : [];
    });
}

/** A person's face: their own photo in the look's crop, else initials. */
export function PersonFace({
    member,
    look,
    className,
    plateClassName,
    sizes,
}: {
    member: Pick<Member, "name" | "image">;
    look: LookId;
    /** The box both take (size and shape). */
    className: string;
    /** The initials' type size. */
    plateClassName: string;
    sizes: string;
}) {
    const src = said(member.image?.src);
    if (src) {
        return (
            // A merchant's own photo, a plain <img> as every block's.
            <img
                src={src}
                alt={member.image?.alt ?? ""}
                width={member.image?.width}
                height={member.image?.height}
                {...siteImage("below", {
                    src,
                    width: member.image?.width,
                    sizes,
                })}
                className={cn(
                    "bg-site-surface shrink-0 object-cover",
                    look === "folio" ? "rounded-site-photo" : "rounded-full",
                    className,
                )}
            />
        );
    }
    return (
        <InitialsPlate
            name={member.name}
            look={look}
            className={cn(className, plateClassName)}
        />
    );
}

export default function LookTeam({
    content,
    look,
}: {
    content: RenderedPerson;
    look: LookId;
}) {
    const members = membersOf(content);
    if (members.length === 0) return null;
    const type = FRONT_TYPE[look];
    const title = said(content.title);
    const Title = content.asTitle ? "h1" : "h2";
    // Each person's name is an h3 under the group's title, or an h2 when
    // the group has none, so the page's outline never skips a level.
    const Name = title ? "h3" : "h2";
    // People with their own lines take the About boards' rows (VA04, VD04);
    // names and roles alone take the Home boards' grid (VA01, VD01).
    const rows = members.some((m) => m.bio);

    return (
        <section
            data-site-look-team={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                {title ? (
                    <Title
                        data-site-title=""
                        className={cn(
                            type.h2,
                            "pb-6 min-[700px]:pb-10",
                            look === "quiet" && "min-[700px]:text-center",
                        )}
                    >
                        {title}
                    </Title>
                ) : null}
                {look === "folio" && rows ? (
                    <ul className="border-site-border border-b">
                        {members.map((m, i) => (
                            <li
                                key={i}
                                className="border-site-border grid grid-cols-[72px_minmax(0,1fr)] gap-5 border-t py-8 min-[700px]:grid-cols-[120px_minmax(0,1fr)] min-[700px]:gap-10 min-[700px]:py-12"
                            >
                                <PersonFace
                                    member={m}
                                    look={look}
                                    className="size-[72px] min-[700px]:size-[120px]"
                                    plateClassName="text-[30px] min-[700px]:text-[50px]"
                                    sizes="120px"
                                />
                                <div className="grid min-w-0 content-start gap-2">
                                    <Name className="font-site-heading text-site-fg text-[calc(24px*var(--site-heading-scale,1))] font-light leading-[1.12] tracking-[-0.015em] [overflow-wrap:anywhere] [text-wrap:balance] min-[700px]:text-[calc(30px*var(--site-heading-scale,1))]">
                                        {m.name}
                                    </Name>
                                    {m.role ? (
                                        <p className="text-site-muted text-[14px] leading-[1.55]">
                                            {m.role}
                                        </p>
                                    ) : null}
                                    {m.bio ? (
                                        <p className="text-site-body max-w-[62ch] whitespace-pre-line text-[16px] leading-[1.6] [overflow-wrap:anywhere]">
                                            {m.bio}
                                        </p>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : look === "folio" ? (
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-4 min-[700px]:grid-cols-3 min-[700px]:gap-x-10 min-[700px]:gap-y-10">
                        {members.map((m, i) => (
                            <li
                                key={i}
                                className="grid min-w-0 content-start gap-3"
                            >
                                <PersonFace
                                    member={m}
                                    look={look}
                                    className="size-[72px] min-[700px]:size-[120px]"
                                    plateClassName="text-[30px] min-[700px]:text-[50px]"
                                    sizes="120px"
                                />
                                <div className="grid gap-1">
                                    <Name
                                        className={cn(
                                            type.name,
                                            "[overflow-wrap:anywhere]",
                                        )}
                                    >
                                        {m.name}
                                    </Name>
                                    {m.role ? (
                                        <p className="text-site-muted text-[14px] leading-[1.55]">
                                            {m.role}
                                        </p>
                                    ) : null}
                                    {m.bio ? (
                                        <p className="text-site-body whitespace-pre-line text-[14px] leading-[1.55] [overflow-wrap:anywhere]">
                                            {m.bio}
                                        </p>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : look === "quiet" && !rows ? (
                    // VD01: a list on a phone; three across, centred, on a desk.
                    <ul className="border-site-border border-t min-[700px]:grid min-[700px]:grid-cols-3 min-[700px]:gap-12 min-[700px]:border-t-0">
                        {members.map((m, i) => (
                            <li
                                key={i}
                                className="border-site-border grid grid-cols-[48px_minmax(0,1fr)] items-center gap-4 border-b py-5 min-[700px]:grid-cols-1 min-[700px]:content-start min-[700px]:justify-items-center min-[700px]:gap-3 min-[700px]:border-b-0 min-[700px]:py-0 min-[700px]:text-center"
                            >
                                <PersonFace
                                    member={m}
                                    look={look}
                                    className="size-12 min-[700px]:size-[88px]"
                                    plateClassName="text-[19px] min-[700px]:text-[35px]"
                                    sizes="88px"
                                />
                                <div className="grid min-w-0 gap-0.5">
                                    <Name className="font-site-heading text-site-fg text-[calc(22px*var(--site-heading-scale,1))] font-medium leading-[1.2] [font-variant-numeric:lining-nums] [overflow-wrap:anywhere] min-[700px]:text-[calc(24px*var(--site-heading-scale,1))]">
                                        {m.name}
                                    </Name>
                                    {m.role ? (
                                        <p className="text-site-muted text-[13.5px] leading-[1.55]">
                                            {m.role}
                                        </p>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : look === "quiet" ? (
                    <ul className="border-site-border mx-auto max-w-[760px] border-t">
                        {members.map((m, i) => (
                            <li
                                key={i}
                                className="border-site-border grid grid-cols-[48px_minmax(0,1fr)] items-center gap-4 border-b py-5 min-[700px]:grid-cols-[96px_minmax(0,1fr)] min-[700px]:gap-10 min-[700px]:py-9"
                            >
                                <PersonFace
                                    member={m}
                                    look={look}
                                    className="size-12 min-[700px]:size-[96px]"
                                    plateClassName="text-[19px] min-[700px]:text-[38px]"
                                    sizes="96px"
                                />
                                <div className="grid min-w-0 gap-1">
                                    <Name className="font-site-heading text-site-fg text-[calc(22px*var(--site-heading-scale,1))] font-medium leading-[1.2] [font-variant-numeric:lining-nums] [overflow-wrap:anywhere] min-[700px]:text-[calc(34px*var(--site-heading-scale,1))] min-[700px]:font-normal">
                                        {m.name}
                                    </Name>
                                    {m.role ? (
                                        <p className="text-site-muted text-[13.5px] leading-[1.55]">
                                            {m.role}
                                        </p>
                                    ) : null}
                                    {m.bio ? (
                                        <p className="text-site-body whitespace-pre-line text-[15px] leading-[1.6] [overflow-wrap:anywhere]">
                                            {m.bio}
                                        </p>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <ul className="-mx-[var(--site-page-margin)] flex snap-x snap-mandatory scroll-px-[var(--site-page-margin)] gap-3 overflow-x-auto px-[var(--site-page-margin)] pb-1 [scrollbar-width:none] min-[700px]:mx-0 min-[700px]:grid min-[700px]:grid-cols-3 min-[700px]:gap-5 min-[700px]:overflow-visible min-[700px]:px-0">
                        {members.map((m, i) => (
                            <li
                                key={i}
                                className="bg-site-surface rounded-site-photo grid w-[200px] shrink-0 snap-start content-start justify-items-start gap-3 p-6 min-[700px]:w-auto"
                            >
                                <PersonFace
                                    member={m}
                                    look={look}
                                    className="size-[112px]"
                                    plateClassName="text-[30px]"
                                    sizes="112px"
                                />
                                {/* VB01: a 24px name at 80% width, the role as an eyebrow. */}
                                <Name className="font-site-heading text-site-fg text-[19px] font-bold leading-[1.1] tracking-[-0.02em] [font-stretch:80%] [overflow-wrap:anywhere] min-[700px]:text-[24px]">
                                    {m.name}
                                </Name>
                                {m.role ? (
                                    <p className="text-site-muted text-[14px] leading-[1.45] min-[700px]:text-[13px] min-[700px]:font-bold min-[700px]:tracking-[0.02em]">
                                        {m.role}
                                    </p>
                                ) : null}
                                {m.bio ? (
                                    <p className="text-site-body line-clamp-4 whitespace-pre-line text-[14px] leading-[1.45] [overflow-wrap:anywhere]">
                                        {m.bio}
                                    </p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
                {content.cta ? (
                    <div
                        className={cn(
                            "pt-6 min-[700px]:pt-10",
                            look === "quiet" && "min-[700px]:text-center",
                        )}
                    >
                        <FrontCta content={content.cta} look={look} />
                    </div>
                ) : null}
            </div>
        </section>
    );
}
