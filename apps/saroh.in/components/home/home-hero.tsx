import { home } from "@/content/home";
import { demoHref } from "@/lib/demos";

import { HeroActions } from "../shared/buttons/hero-actions";
import { Container } from "../shared/layout/container";
import { Pill } from "../shared/links/pill";
import { ScreenshotFrame } from "../shared/media/screenshot-frame";
import { Eyebrow } from "../shared/sections/eyebrow";

/**
 * Home's opening (Home design, "saroh" hero copy): the eyebrow, "Services,
 * Appointments, Retail, Orders. Handled." with its Saffron initials (read
 * whole through `aria-label`), the sub, the start button, the free-plan line
 * and the chips, beside the dashboard shot. Side by side from about 900px,
 * stacked below it, as the design's wrapping flex row does.
 *
 * "See it in action · 2 min" shows only once a tour video is configured
 * (KTD-12, deviation D-3).
 */
export function HomeHero({ freeLine }: { freeLine: string }) {
    return (
        <Container
            as="header"
            className="flex flex-wrap items-center gap-14 pt-[72px]"
        >
            <div className="grid flex-[1_1_380px] gap-[22px]">
                <Eyebrow>{home.eyebrow}</Eyebrow>
                <h1
                    aria-label={home.headlineLabel}
                    className="m-0 font-display text-mk-hero font-bold [text-wrap:balance]"
                >
                    {home.headline.map((w) => (
                        <span key={w.initial} aria-hidden>
                            <span className="text-brand-500">{w.initial}</span>
                            {w.rest}
                        </span>
                    ))}
                </h1>
                <p className="m-0 max-w-[50ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                    {home.sub}
                </p>
                <HeroActions
                    src="home-hero"
                    demo={{
                        href: demoHref("salon"),
                        page: "home",
                        trade: "salon",
                    }}
                    tourHref="#video"
                />
                <div className="grid gap-3">
                    <p className="m-0 text-mk-note text-muted-foreground">
                        {freeLine}
                    </p>
                    <ul
                        aria-label="Included"
                        className="m-0 flex list-none flex-wrap gap-2 p-0"
                    >
                        {home.chips.map((chip) => (
                            <li key={chip}>
                                <Pill>{chip}</Pill>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <ScreenshotFrame
                shot={home.hero.shot}
                variant="home"
                priority
                // Side by side from about 900px; below, the words come first.
                priorityFrom="(min-width: 900px)"
                sizes="(min-width: 1280px) 640px, 100vw"
                className="flex-[1.2_1_440px]"
            />
        </Container>
    );
}
