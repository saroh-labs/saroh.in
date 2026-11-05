import type { ComponentProps } from "react";

import { ShotImage as MarketingShotImage } from "@saroh/marketing/shot-image";

import { sizedShot } from "@/lib/shot-sources";

/** `@saroh/marketing`'s `ShotImage`, with this site's sized copies (`lib/shot-sources.ts`). */
export function ShotImage({
    shot,
    ...rest
}: ComponentProps<typeof MarketingShotImage>) {
    return <MarketingShotImage shot={sizedShot(shot)} {...rest} />;
}
