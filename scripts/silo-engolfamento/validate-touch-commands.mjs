// Touch commands use the same current contracts, with native CDP touch gestures.
process.env.SILO_TOUCH_ONLY = "1";
await import("./validate-upgrade.mjs");
