/** The eight avatar colours of the settings swatch row (client-safe; profile-service validates against the same list). */
export const AVATAR_SWATCHES = ["#2d6cdf", "#e50914", "#46d369", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#64748b"] as const;
export type AvatarSwatch = (typeof AVATAR_SWATCHES)[number];
