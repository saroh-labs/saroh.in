import type { HomeModel } from "@/lib/home/service";
import { storesOnly } from "@/lib/home/staff";
import type { ModuleView } from "@/lib/modules/schema";

import { HomeDashboard } from "./home-dashboard";
import { HomeHeader } from "./home-header";

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
 */
export function StaffHome({
    home,
    modules,
    name,
    businessName,
}: {
    home: HomeModel;
    /** Read only for a business with nothing on — the first-run state. */
    modules: ModuleView[] | null;
    /** The viewer's own name, from their session. */
    name: string | null | undefined;
    businessName: string;
}) {
    return (
        <>
            <HomeHeader
                lastDay={home.lastDay}
                name={name}
                businessName={businessName}
                only={storesOnly(home.staff)}
            />
            <div className="mt-5">
                <HomeDashboard
                    home={home}
                    modules={modules}
                    businessName={businessName}
                    setup={null}
                />
            </div>
        </>
    );
}
