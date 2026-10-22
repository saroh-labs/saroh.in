import type { ReadyChecklist } from "@/lib/settings/ready";

/** "Finish setup", for someone who may change the business. */
export interface HomeSetup {
    list: ReadyChecklist;
    businessId: string;
}
