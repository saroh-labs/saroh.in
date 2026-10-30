import { LoadingProfiles } from "@/components/billing-profiles/states";

/** A profile's page while it is read. */
export default function Loading() {
    return (
        <div className="max-w-[980px]">
            <LoadingProfiles what="this billing profile" />
        </div>
    );
}
