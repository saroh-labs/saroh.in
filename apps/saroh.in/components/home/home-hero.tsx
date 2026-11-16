import { HomeHero as Hero } from "@saroh/marketing/home/home-hero";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import { DemoLink } from "@/components/shared/buttons/demo-link";
import { home, TOUR_LABEL, TOUR_VIDEO } from "@/content/home";
import { HOME_HERO_SCENES } from "@/content/world";
import { demoHref } from "@/lib/demos";

/**
 * The landing's opening, India's: the shared hero (`@saroh/marketing/home/
 * home-hero`) with this site's words, world, start button and live demo.
 */
export function HomeHero() {
    return (
        <Hero
            words={home}
            scenes={HOME_HERO_SCENES}
            start={<CtaLink src="home-hero" size="kit" />}
            extra={
                <DemoLink href={demoHref("salon")} page="home" trade="salon" />
            }
            tour={TOUR_VIDEO ? TOUR_LABEL : null}
        />
    );
}
