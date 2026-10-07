import Image from "next/image";

import { templateShot } from "@/content/template-shots";
import type { GalleryTemplate, PreviewPage } from "@/content/templates";

import type { PreviewDevice } from "./template-preview";
import { TemplatePreview } from "./template-preview";

/**
 * One page of a template: its 2× render when U14 has captured it
 * (`content/template-shots.ts`), otherwise the drawing from its data.
 * Either way the image's name says which template, page and device it is.
 */
export function TemplatePageView({
    template,
    page,
    device = "desktop",
    sizes,
    priority = false,
    decorative = false,
}: {
    template: GalleryTemplate;
    page: PreviewPage;
    device?: PreviewDevice;
    sizes: string;
    priority?: boolean;
    /** Inside a link that names it already (a gallery card): no alt of its own. */
    decorative?: boolean;
}) {
    const alt = decorative ? "" : templatePageAlt(template, page, device);
    const shot = templateShot(template.slug, page.path, device);
    if (shot) {
        return (
            <Image
                src={shot.src}
                alt={alt}
                width={shot.width}
                height={shot.height}
                sizes={sizes}
                priority={priority}
                className="block h-auto w-full"
            />
        );
    }
    if (decorative) {
        return (
            <TemplatePreview template={template} page={page} device={device} />
        );
    }
    return (
        <span role="img" aria-label={alt} className="block">
            <TemplatePreview template={template} page={page} device={device} />
        </span>
    );
}

/** "The Gym template's Timetable page on a phone, shown for Iron & Oak, a sample gym." */
export function templatePageAlt(
    template: GalleryTemplate,
    page: PreviewPage,
    device: PreviewDevice,
): string {
    const where = device === "phone" ? "on a phone" : "on a computer";
    return `The ${template.name} template's ${page.title} page ${where}, shown for ${template.sample.name}, a sample business.`;
}
