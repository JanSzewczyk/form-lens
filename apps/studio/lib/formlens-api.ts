import "server-only";

import { configureApiClient } from "@form-lens/api-client";
import { env } from "~/data/env/server";

// Importing this module points the generated client at the FormLens API; only server code may import it.
configureApiClient({ baseUrl: env.FORMLENS_API_URL });

export * from "@form-lens/api-client";
