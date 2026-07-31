// Re-export the shared @saroh/tailwind-config preset. sites previously carried
// its own inline copy of the colour scale, which is how it drifted off the
// design tokens. Content globs resolve relative to this app's dir at build time.
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

export default sharedConfig;
