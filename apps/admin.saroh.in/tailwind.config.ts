// Re-export the shared @saroh/tailwind-config preset instead of the stock
// scaffold config admin shipped with. Admin was the last app still on its own
// tokens, so @saroh/ui components rendered here unstyled (and its content glob
// was missing, purging component-only classes). Content globs resolve relative
// to this app's dir at build time.
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

export default sharedConfig;
