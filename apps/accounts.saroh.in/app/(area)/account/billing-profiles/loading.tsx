import { AreaLoading } from "@/components/account-area/area-loading";

/**
 * Below the list: opening a profile changes this segment, so this boundary
 * shows for it too; the path draws the list or the profile's shape (F7).
 */
export default function Loading() {
    return <AreaLoading />;
}
