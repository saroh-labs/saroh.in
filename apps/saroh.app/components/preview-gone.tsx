/**
 * A dead preview link explains itself; it does not 404 (#198).
 *
 * Shared by the preview layout AND every page under it (#284). Next keeps a
 * layout mounted while a reviewer navigates inside the preview, so a link
 * revoked mid-session is only noticed by the page they click to next. Before
 * this lived in one place, those pages returned nothing, leaving an empty page
 * under the draft bar.
 *
 * Deliberately NOT drawn in the merchant's palette: this is Saroh speaking
 * about a link, not part of the site.
 */
export function PreviewGone({ reason }: { reason: "expired" | "revoked" }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-neutral-900">
            <div className="max-w-md space-y-3 text-center">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Draft preview
                </p>
                <h1 className="text-xl font-semibold">
                    {reason === "revoked"
                        ? "This preview link was taken back."
                        : "This preview link has stopped working."}
                </h1>
                <p className="text-sm text-neutral-600">
                    {reason === "revoked"
                        ? "Whoever shared it with you turned it off. Ask them for a new one if you still need to look."
                        : "Preview links last a set number of days. Ask whoever shared it for a new one."}
                </p>
            </div>
        </main>
    );
}
