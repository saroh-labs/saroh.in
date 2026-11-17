import { Container } from "../layout/container";

/** The tour: a site's `TOUR_VIDEO`, null until there is one. */
export interface TourVideoFile {
    src: string;
    poster?: string;
    label: string;
}

/**
 * Home's `#video`: the 2-minute tour in the design's Ink 16:9 frame. Renders
 * nothing until the site has a video (KTD-12, deviation D-3), so the design's
 * empty "Slot for the 2-minute tour video" never ships.
 */
export function TourVideo({ video }: { video: TourVideoFile | null }) {
    if (!video) return null;
    return (
        <Container as="section" id="video" className="scroll-mt-6 pt-10">
            <video
                controls
                preload="metadata"
                poster={video.poster}
                aria-label={video.label}
                className="block aspect-video w-full rounded-[18px] bg-foreground"
            >
                <source src={video.src} />
            </video>
        </Container>
    );
}
