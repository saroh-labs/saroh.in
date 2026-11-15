import type { Trade } from "@/lib/organizations/trade";
import { Notice } from "@saroh/ui/notice";

import { templateThumbnail } from "@/lib/sites/template-thumbnails";

/** The gallery template setup was opened with (`?template=`, DEC-216). */
export interface GalleryTemplate {
    /** The template's id, which the business keeps for the website picker. */
    id: string;
    name: string;
    /** The trade it picks on the first step; null when none fits a business. */
    trade: Trade | null;
}

/**
 * The note on setup's first step (TPLD1): the template picked in the
 * gallery, its picture, and that the website starts from it.
 */
export function SetupGalleryNote({ template }: { template: GalleryTemplate }) {
    const picture = templateThumbnail(template.id);
    return (
        <Notice
            tone="info"
            data-gallery-template={template.id}
            data-ph-unmask=""
            icon={
                picture ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a small static picture, as the picker's cards draw it
                    <img
                        src={picture.src}
                        alt=""
                        width={72}
                        height={45}
                        className="-mt-0.5 h-[45px] w-[72px] rounded-[5px] border border-border object-cover object-top"
                    />
                ) : undefined
            }
        >
            You picked the <b>{template.name}</b> template from the gallery.
            Your website will start from it when you turn it on.
        </Notice>
    );
}
