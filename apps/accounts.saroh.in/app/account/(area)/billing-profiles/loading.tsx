import { ListHead } from "@/components/billing-profiles/profile-list";
import { LoadingProfiles } from "@/components/billing-profiles/states";

/** The list's frame and title while it is read (F7). */
export default function Loading() {
    return (
        <div className="flex max-w-[760px] flex-col gap-4">
            <ListHead />
            <LoadingProfiles />
        </div>
    );
}
