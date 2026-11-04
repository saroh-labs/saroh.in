import { HomeHero as Hero } from "@saroh/marketing/home-hero";

import { home } from "@/content/home";
import { demoHref } from "@/lib/demos";

import { HeroActions } from "../shared/buttons/hero-actions";
import { shotView } from "../shared/media/shot-view";

/**
 * Home's opening, in this site's words. "See it in action · 2 min" shows only
 * once a tour video is configured (KTD-12, deviation D-3).
 */
export function HomeHero({ freeLine }: { freeLine: string }) {
    return (
        <Hero
            eyebrow={home.eyebrow}
            headlineLabel={home.headlineLabel}
            headline={home.headline}
            sub={home.sub}
            actions={
                <HeroActions
                    src="home-hero"
                    demo={{
                        href: demoHref("salon"),
                        page: "home",
                        trade: "salon",
                    }}
                    tourHref="#video"
                />
            }
            freeLine={freeLine}
            chips={home.chips}
            shot={shotView(home.hero.shot)}
        />
    );
}
