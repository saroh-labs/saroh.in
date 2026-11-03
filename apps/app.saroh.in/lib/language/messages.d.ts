import type en from "./en.json";

// A key that isn't in en.json is a type error, not a blank on someone's screen.
declare module "use-intl" {
    interface AppConfig {
        Messages: typeof en;
    }
}
