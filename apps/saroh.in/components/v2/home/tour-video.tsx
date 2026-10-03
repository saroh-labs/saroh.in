import { TOUR_VIDEO } from "@/content/home";

import { Container } from "../container";

/**
 * Home's `#video`: the 2-minute tour in the design's Ink 16:9 frame. Renders
 * nothing until `TOUR_VIDEO` is set (KTD-12, deviation D-3), so the design's
 * empty "Slot for the 2-minute tour video" never ships.
 */
export function TourVideo() {
    if (!TOUR_VIDEO) return null;
    return (
        <Container as="section" id="video" className="scroll-mt-6 pt-10">
            <video
                controls
                preload="metadata"
                poster={TOUR_VIDEO.poster}
                aria-label={TOUR_VIDEO.label}
                className="block aspect-video w-full rounded-[18px] bg-foreground"
            >
                <source src={TOUR_VIDEO.src} />
            </video>
        </Container>
    );
}
