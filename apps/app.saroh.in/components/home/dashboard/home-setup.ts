import type { FirstSteps, ReadyChecklist } from "@/lib/settings/ready";
import type { ShareLink } from "@/lib/sites/share-links";

/** "Finish setup", for someone who may change the business. */
export interface HomeSetup {
    list: ReadyChecklist;
    businessId: string;
    /** The 4 first steps (#1194); while any is left they lead Home. */
    first?: FirstSteps | null;
    /** The link "Share your booking link" hands over, while it is live. */
    share?: ShareLink | null;
}
