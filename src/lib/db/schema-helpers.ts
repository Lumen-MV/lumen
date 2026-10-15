import { integer } from "drizzle-orm/sqlite-core";

/** Column helpers shared by schema-auth.ts and schema-media.ts. */
export const now = () => new Date();
export const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
export const bool = (name: string) => integer(name, { mode: "boolean" });
