import { AccessDenied } from "@/components/shared/states/access-denied";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { PostFrameAway } from "@/components/sites/posts/editor/post-frame";

/**
 * `blogdesk/WXWStates`, `blogphone/WXYStates` "No access": a teammate whose
 * role can't write posts follows a link here. The shared denial, named for
 * the menu's place, and the way back is Website.
 */
export default function Forbidden() {
    // The refusal has the screen: no editor frame around it.
    return (
        <>
            <PostFrameAway off />
            <AccessDenied
                {...whoCanChange({ thing: "Blog and other writing" })}
                backHref="/sites"
                backLabel="Back to Website"
            />
        </>
    );
}
