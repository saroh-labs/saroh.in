import { ring } from "@/lib/ring";

/** A quiet link in the Resources frame: Ink 500, Ink on hover, the site's ring. */
export const QUIET_LINK = `cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground active:text-mk-copy ${ring()}`;
