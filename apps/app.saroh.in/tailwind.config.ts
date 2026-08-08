// Re-export the shared @saroh/tailwind-config preset instead of duplicating it.
// This gives app.saroh.in the same tokens (incl. the brand accent), the
// packages/ui content glob (so component-only classes aren't purged — #92), and
// keeps a single source of truth so new tokens land everywhere at once. Content
// globs resolve relative to this app's dir at build time.
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

export default sharedConfig;
