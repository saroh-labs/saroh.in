import type { PublicToday } from "./blocks/on-today";
import type { PublicService } from "./blocks/services-list";
import type { PublicVisit } from "./lib/public-visit";
import type { PublicTimetable } from "./lib/timetable-read";

/**
 * A business's live data, given rather than read (industry templates U14).
 *
 * The bound blocks that read the public API from the visitor's browser —
 * Services, Visit us, Opening hours, the Timetable, the hero's On today and
 * its open line — each already take a sample to draw instead of fetching
 * (the catalog's previews pass them one block at a time). `PageSections`
 * hands these to every section of a page, so a whole page can be drawn
 * from fixtures with no request made: the renderer's template renders for
 * the gallery and the picker, which have no business behind them.
 *
 * A live site never passes this; its blocks read as they always have.
 * Plain data, so it crosses from a server page to the client blocks.
 */
export interface SiteFixtures {
    /** For every Services list, in place of `/public/…/services`. */
    services?: PublicService[];
    /** For Visit us, Opening hours and the full-bleed hero's open line. */
    visit?: PublicVisit;
    /** For the Timetable. */
    timetable?: PublicTimetable;
    /** For the hero's On today panel. */
    today?: PublicToday;
    /**
     * The moment the page is drawn for, as an ISO instant: "Open now", today
     * in Opening hours and the Journal's short dates are worked out for it
     * instead of the clock, so a render taken at night still reads as the
     * fixtures' morning. A live site never passes it (`now ?? new Date()`).
     */
    now?: string;
}
