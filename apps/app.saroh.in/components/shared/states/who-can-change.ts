/**
 * The one sentence for "who can change this", beside the two components
 * that say it (`AccessDenied`, `ReadOnlyNote`). The words themselves are
 * pure and live in `lib/access/who-can-change.ts`, where the data layer
 * (`lib/api/role-denied.ts`, `lib/modules/blocker-copy.ts`) reads them too.
 */
export {
    ONLY_OWNER_CAN_CHANGE,
    WHO_CAN_CHANGE,
    readOnlyLine,
    whoCanChange,
    whoCanChangeLine,
} from "@/lib/access/who-can-change";
export type { WhoCanChange } from "@/lib/access/who-can-change";
