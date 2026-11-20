import { AccessDenied } from "@/components/shared/states/access-denied";
import { whoCanChange } from "@/components/shared/states/who-can-change";

/**
 * `blogdesk/WXWStates`, `blogphone/WXYStates` "No access": a teammate whose
 * role can't write posts follows a link here. The shared denial, named for
 * the menu's place, and the way back is Website.
 */
export default function Forbidden() {
    return (
        <AccessDenied
            {...whoCanChange({ thing: "Blog and other writing" })}
            backHref="/sites"
            backLabel="Back to Website"
        />
    );
}
