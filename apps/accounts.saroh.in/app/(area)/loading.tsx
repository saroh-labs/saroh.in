import { AreaLoading } from "@/components/account-area/area-loading";

/**
 * Every page of the account area waits inside its frame (the layout above
 * stays drawn), never in the sign-in split of the root `loading.tsx`
 * (UX audit, 28 Oct: each page loaded in the sign-in layout, then jumped),
 * as a skeleton shaped like the page that is coming (21 Nov).
 */
export default function Loading() {
    return <AreaLoading />;
}
