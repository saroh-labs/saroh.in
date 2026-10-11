import { webImageUrl } from "@saroh/ui/share-cards";
import { ImageIcon } from "lucide-react";

/** The share image, small: in its row, and in its sheet as it is chosen. */
export function ShareImageThumb({ url }: { url: string }) {
    const src = webImageUrl(url);
    return (
        <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted text-muted-foreground">
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
                <img src={src} alt="" className="h-full w-full object-cover" />
            ) : (
                <ImageIcon aria-hidden className="h-4 w-4" />
            )}
        </div>
    );
}
