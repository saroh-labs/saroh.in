/** A screenshot's file and shape. The image files stay with each site. */
export interface Shot {
    /** Under the site's /public, e.g. `/shots/v2/s-home.webp`; null until captured. */
    src: string | null;
    alt: string;
    /** Intrinsic size of the captured image; the placeholder uses its shape too. */
    width: number;
    height: number;
    /** The sized copies the site has of it (`srcset`), when it has any. */
    srcSet?: string;
}

/** A screenshot as one place shows it. */
export interface ShotView {
    /** The site's key for the shot, drawn as `data-shot`. */
    id: string;
    image: Shot;
    /** This place's caption; defaults to the shot's own. */
    alt?: string;
}
