/**
 * The one destructive-alert shape used across the merchant renderer.
 *
 * Saroh's own chrome — a rejected form, a receipt that would not load — has to
 * stay legible on a page whose palette is NOT ours. `--site-*` already flips to
 * a pure-black ground when the visitor's OS prefers dark, and once the
 * publication snapshot carries brand fields it becomes merchant data outright.
 * Red text cannot survive that: `--destructive` measures 5.43:1 on the merchant
 * light ground but only 3.87:1 on the dark one, and a `bg-destructive/10` tint
 * is worse still (3.71:1) because an alpha fill inherits the ground's luminance
 * along with its colour.
 *
 * Nor can `dark:` rescue it. This app never puts `.dark` on the document — it
 * has no theme toggle and no theme script — so Saroh's dark-scope tokens are
 * unreachable here and every `dark:` class in this app is inert. That is why the
 * checkout status map used to render only the light half of the pair it shipped.
 *
 * So the alert brings its OWN opaque ground: `--destructive` filled, with
 * `--destructive-foreground` on top. That pair is measured against itself
 * (5.43:1) and therefore reads identically whatever the merchant's palette turns
 * out to be — which is the only guarantee worth making about a surface we do not
 * control.
 */
export const destructiveAlertClasses =
    "rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground";
