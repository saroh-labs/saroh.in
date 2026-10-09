import { notFound } from "next/navigation";

/**
 * An address on a merchant's site that no route draws (`/shop/a/b`,
 * `/anything/at/all`).
 *
 * Without this, an unmatched path skips `[domain]` altogether and lands on
 * the root 404, outside the site's header and footer, saying there is no
 * website here, which is wrong for a site that is live. Matched last (a
 * static or `[slug]` route always wins), it hands the miss to
 * `[domain]/not-found.tsx`, inside the site's chrome, with a 404.
 */
export default function MissingPage(): never {
    notFound();
}
