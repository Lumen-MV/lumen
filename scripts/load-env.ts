// Loads .env.local / .env exactly like Next does, for CLI scripts run with tsx. Import first.
// Scripts run as `tsx -C react-server …` so the `import "server-only"` guards in src/lib resolve to the package's empty build.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
