import { notFound } from "next/navigation";

/**
 * An address in the workspace that no route draws (`/nothing`,
 * `/orders/a/b`).
 *
 * Without this, an unmatched path never enters `(shell)` and lands on the
 * root 404, without the rail. Matched last (every static or dynamic route
 * wins), it hands the miss to `(shell)/not-found.tsx`, inside the shell,
 * with a 404.
 */
export default function MissingPage(): never {
    notFound();
}
