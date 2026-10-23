import { notFound } from "next/navigation";
import { cache } from "react";

import { can, requireStaff } from "./console";
import type {
    AdminFlag,
    AdminOrganization,
    StaffIdentity,
} from "./control-plane";
import { listFlags, listOrganizations } from "./control-plane";

/**
 * The Releases screens' reads, once per request: the release page's layout
 * and its tab read the same gate and the same lists. Server-only: it reads
 * through `control-plane`.
 */
export const releasesGate = cache(() => requireStaff("flags:read"));

export type ReleasesRead =
    | { status: "ok"; flags: AdminFlag[]; organizations: AdminOrganization[] }
    /** The API said no (the gate already drew the refusal). */
    | { status: "denied" }
    /** The read failed: an outage, not a refusal. */
    | { status: "failed" };

export const readReleases = cache(async (): Promise<ReleasesRead> => {
    try {
        const [flags, organizations] = await Promise.all([
            listFlags(),
            listOrganizations(),
        ]);
        if (!flags || !organizations) return { status: "denied" };
        return { status: "ok", flags, organizations };
    } catch {
        return { status: "failed" };
    }
});

/**
 * What a release's tab needs, from the same once-per-request reads as its
 * layout. `null` when the layout is drawing a refusal or a failure instead,
 * so the tab draws nothing.
 */
export async function releaseForTab(params: Promise<{ key: string }>): Promise<{
    staff: StaffIdentity;
    flag: AdminFlag;
    organizations: AdminOrganization[];
    canPublish: boolean;
} | null> {
    const gate = await releasesGate();
    if (!gate.ok) return null;
    const read = await readReleases();
    if (read.status !== "ok") return null;
    const { key } = await params;
    const flag = read.flags.find((f) => f.key === decodeURIComponent(key));
    if (!flag) notFound();
    return {
        staff: gate.staff,
        flag,
        organizations: read.organizations,
        canPublish: can(gate.staff, "flags:publish"),
    };
}
