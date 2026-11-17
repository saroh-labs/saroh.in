import type { ReactNode } from "react";

import { ButtonLink } from "../buttons/button";
import { TextLink } from "../links/text-link";
import { Mark } from "../sections/mark";
import { SplitHero } from "../sections/split-hero";
import type { HomeHeroScene } from "./hero-stage";
import { HeroStage } from "./hero-stage";
import type { HomeWords } from "./words";

/** The hero's start button: the phone's sticky bar shows once it scrolls away. */
export const HERO_CTA_ID = "home-hero-cta";

/**
 * The landing's opening (LAHomeDesk, LAHomePhone2): the one h1, the lead
 * (the category phrase first), Start free, "See how it works", the live
 * demo where one is on and the tour once there is one, then the trade
 * switcher and the three phones. Centred on desk, left on a phone.
 */
export function HomeHero({
    words: home,
    scenes,
    start,
    extra,
    tour,
}: {
    words: Pick<
        HomeWords,
        | "title"
        | "eyebrow"
        | "lede"
        | "phoneLede"
        | "how"
        | "freeNote"
        | "trade"
        | "appTabs"
    >;
    scenes: readonly HomeHeroScene[];
    /** The site's start button (`cta()`), its sticky bar's watch. */
    start: ReactNode;
    /** What the site adds after "See how it works": its live demo. */
    extra?: ReactNode;
    /** The tour button's words, once the site has a tour video. */
    tour?: string | null;
}) {
    return (
        <section
            aria-labelledby="home-title"
            className="pt-6 min-[760px]:pt-11"
        >
            <SplitHero
                as="div"
                id="home-title"
                layout="center"
                title={
                    <>
                        {home.title.before}
                        <Mark>{home.title.mark}</Mark>
                        {home.title.after}
                    </>
                }
                titleClassName="min-[760px]:max-w-[20ch]"
                lede={
                    <>
                        {home.eyebrow}.{" "}
                        <span className="max-[759px]:hidden">{home.lede}</span>
                        <span className="min-[760px]:hidden">
                            {home.phoneLede}
                        </span>
                    </>
                }
                primary={
                    <span
                        id={HERO_CTA_ID}
                        className="max-[759px]:flex-1 [&>a]:w-full"
                    >
                        {start}
                    </span>
                }
                secondary={
                    <>
                        <ButtonLink
                            href="/features"
                            variant="secondary"
                            size="kit"
                            className="max-[759px]:hidden"
                        >
                            {home.how.label}
                        </ButtonLink>
                        <TextLink
                            href="/features"
                            tone="ink"
                            arrow
                            className="text-[15px] min-[760px]:hidden"
                        >
                            {home.how.short}
                        </TextLink>
                        {extra}
                        {tour ? (
                            <ButtonLink
                                href="#video"
                                variant="secondary"
                                size="kit"
                                play
                            >
                                {tour}
                            </ButtonLink>
                        ) : null}
                    </>
                }
                foot={home.freeNote}
            />
            <HeroStage
                scenes={scenes}
                legend={home.trade.legend}
                label={home.trade.phones}
                tabs={home.appTabs}
            />
        </section>
    );
}
