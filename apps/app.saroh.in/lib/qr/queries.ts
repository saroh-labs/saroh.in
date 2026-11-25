import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

import type { QrScreen } from "./screen";

/**
 * Settings › Share on React Query (DEC-259): the business's site, its QR
 * codes and what the maker offers, read on the server (`readQrScreen`).
 * `settings`: codes are made and changed here, and their saves say so.
 */
export const shareRead = defineRead<QrScreen>()({
    key: (orgId) => domainKey("settings", orgId, "share"),
    route: { path: "/api/settings/share", params: {} },
    tier: "settings",
});
