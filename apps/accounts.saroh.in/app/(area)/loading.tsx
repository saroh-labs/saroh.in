import { LoadingState } from "@saroh/ui/data-state";

/**
 * Every page of the account area waits inside its frame (the layout above
 * stays drawn), never in the sign-in split of the root `loading.tsx`
 * (UX audit, 28 Oct: each page loaded in the sign-in layout, then jumped).
 */
export default function Loading() {
    return (
        <div className="max-w-[760px]">
            <LoadingState rows={5} label="Loading your account" />
        </div>
    );
}
