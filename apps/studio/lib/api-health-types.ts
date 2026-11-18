export type ApiHealth = {
  status: "connected" | "unavailable";
  /** Host (and port) of the FormLens API, never the full URL. */
  host: string;
};
