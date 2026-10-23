"use client";

import { SettingsSectionError } from "@/components/settings/page/settings-section-error";

/** This tab could not be read: said here, with the other tabs still in reach (F12). */
export default function Error(props: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return <SettingsSectionError section="share" {...props} />;
}
