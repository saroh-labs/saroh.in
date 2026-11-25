import type { HomeNew } from "@/components/shared/navigation/quick-actions";
import type { HomeModel } from "@/lib/home/service";
import type { ModuleView } from "@/lib/modules/schema";
import type { MomentView } from "@/lib/moments/keys";

import { NewSpace } from "@/components/home/header/new-sheet";
import { Moment } from "@/components/shared/notices/moment";
import { HomeDashboard } from "./home-dashboard";

/**
 * A staff member's Home, as the Home design draws it for Arjun, Sana and
 * Dr. Arun (round 2, F11): the business's Home, narrowed to their own day.
 *
 * - The rows are the ones their role can act on. The API reads each part
 *   with the person's own capabilities (DEC-039) — open orders for whoever
 *   may read or move them, a booking-page note for whoever may add it to
 *   the record, sensitive labels only with `customer:sensitive`, takings
 *   only with `payment:read` — so nothing here hides anything.
 * - The storefronts are the ones they work on (DEC-048), and the header
 *   says so: "Friday 18 September · Rye & Co. · Hill Road only". There is
 *   no switch on Home; the narrowing is Team's to change.
 * - Today is their own diary when they are on it.
 *
 * No "Get ready to take money": its steps are for someone who may change
 * the business (`org:update`), which a staff member isn't.
 *
 * Below the header: `HomeContainer` draws the header (with "Hill Road
 * only") in the same place in every state, so New stays open across Home's
 * read.
 */
export function StaffHome({
    home,
    modules,
    businessName,
    newMenu = null,
    moment = null,
}: {
    home: HomeModel;
    /** Read only for a business with nothing on — the first-run state. */
    modules: ModuleView[] | null;
    businessName: string;
    /** What New offers them (`homeNewFor`); a staff member may book. */
    newMenu?: HomeNew | null;
    /** Home's one "New" card (release visibility U14), under the greeting. */
    moment?: MomentView | null;
}) {
    return (
        <>
            {moment ? <Moment moment={moment} className="mt-5" /> : null}
            <div className="mt-5">
                <HomeDashboard
                    home={home}
                    modules={modules}
                    businessName={businessName}
                    setup={null}
                />
            </div>
            {newMenu && newMenu.items.length > 0 ? <NewSpace /> : null}
        </>
    );
}
