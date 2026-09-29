import { SettingsSkeleton } from "@/components/settings/settings-skeleton";

/** Settings → Team while it loads: the roster's shape, in the panel (F12). */
export default function Loading() {
    return <SettingsSkeleton variant="team" />;
}
