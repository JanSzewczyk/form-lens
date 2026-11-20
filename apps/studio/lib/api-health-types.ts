export const ApiHealthStatus = {
  connected: "connected",
  unavailable: "unavailable"
} as const;

export type ApiHealthStatus = (typeof ApiHealthStatus)[keyof typeof ApiHealthStatus];

export type ApiHealth = {
  status: ApiHealthStatus;
  /** Host (and port) of the FormLens API, never the full URL. */
  host: string;
};
