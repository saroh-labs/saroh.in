import type { ShotView } from "@saroh/marketing/shot";

import type { ShotKey } from "@/content/shots";
import { shots } from "@/content/shots";
import { sizedShot } from "@/lib/shot-sources";

/**
 * One shot from this site's manifest, as `@saroh/marketing` draws it. Read on
 * the server, so the browser gets this one shot, never the whole manifest.
 */
export function shotView(
    shot: ShotKey,
    alt?: string,
    phone?: ShotKey,
): ShotView {
    const image = sizedShot(shots[shot]);
    return {
        id: shot,
        image: phone ? { ...image, phone: sizedShot(shots[phone]) } : image,
        alt,
    };
}
