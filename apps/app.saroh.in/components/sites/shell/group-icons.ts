import { FileText, Link2, Palette, Users } from "lucide-react";
import type { ComponentType } from "react";

import type { SiteGroupId } from "./group-map";

/** Each group's icon, the same on the desk's list and the phone's home. */
export const GROUP_ICONS: Record<
    SiteGroupId,
    ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
    "pages-and-posts": FileText,
    look: Palette,
    reach: Link2,
    "people-and-settings": Users,
};
