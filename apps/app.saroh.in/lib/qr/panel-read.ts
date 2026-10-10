import { apiFetch, orgBase } from "@/lib/api/http";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { readOrganizationSettings } from "@/lib/organizations/settings-service";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";

import { logoDataUrl } from "./logo-data";
import type { QrPanelRead, QrSavedLink } from "./panel";
import { findPanelCode } from "./panel";
import { initialsOf, pickShareSite } from "./pick";
import { mayChange } from "./screen";
import type { QrCodesView } from "./types";

/**
 * What a QR button's panel reads when it opens on a saved link (plan U7).
 * Server-only. A read and nothing else: opening a panel never writes.
 *
 * Tolerant on purpose, never `getJson`: the button sits on Orders, Bookings
 * and a product, where a role without `site:read`, a business with Website
 * off or one with no site yet must get a QR of the link on screen, not a
 * 403 page. So a refusal (403, 404) is `unavailable` and the panel draws an
 * instant QR; anything else that goes wrong is `failed`, which the panel
 * says and offers again. Never an empty answer standing in for a failure.
 */

type Got<T> = { ok: true; data: T } | { ok: false; refused: boolean };

async function read<T>(path: string): Promise<Got<T>> {
    const res = await apiFetch(path);
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    return { ok: false, refused: res.status === 403 || res.status === 404 };
}

const UNAVAILABLE: QrPanelRead = { state: "unavailable" };
const FAILED: QrPanelRead = { state: "failed" };

/** The site the link is on: the one named, else the business's own. */
async function siteOf(
    base: string,
    siteId: string | undefined,
): Promise<Got<string | null>> {
    if (siteId) return { ok: true, data: siteId };
    const [sites, links] = await Promise.all([
        read<{ id: string; subdomain?: string | null }[]>(`${base}/sites`),
        readWebAddressLinks(),
    ]);
    if (!sites.ok) return sites;
    const list = Array.isArray(sites.data) ? sites.data : [];
    return { ok: true, data: pickShareSite(list, links?.address)?.id ?? null };
}

export async function readQrPanel(
    want: Pick<QrSavedLink, "kind" | "ref" | "siteId" | "from">,
): Promise<QrPanelRead> {
    try {
        const base = await orgBase();
        if (!base) return UNAVAILABLE;
        const site = await siteOf(base, want.siteId);
        if (!site.ok) return site.refused ? UNAVAILABLE : FAILED;
        if (!site.data) return UNAVAILABLE;

        const [codes, org] = await Promise.all([
            read<QrCodesView>(
                `${base}/sites/${encodeURIComponent(site.data)}/qr-codes`,
            ),
            resolveActiveOrganization(),
        ]);
        if (!codes.ok) return codes.refused ? UNAVAILABLE : FAILED;
        const view = codes.data;
        if (!Array.isArray(view.codes)) return FAILED;

        const code = findPanelCode(view.codes, want);
        // Only a branded code draws the logo.
        const logo =
            code?.style === "BRANDED"
                ? await readOrganizationSettings()
                      .then((s) => logoDataUrl(s.ok ? s.data.logo?.url : null))
                      .catch(() => null)
                : null;
        const name = org?.name ?? "";
        return {
            state: "ready",
            siteId: site.data,
            live: view.live === true,
            canChange: mayChange(org),
            code,
            business: { name, initials: initialsOf(name), logo },
        };
    } catch {
        return FAILED;
    }
}
