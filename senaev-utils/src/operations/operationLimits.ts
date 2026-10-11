/** Shared transport defaults; this module has no Node dependencies. */
export const OBSERVATION_MS = 5000;
export const DEFAULT_TIMEOUT_SECONDS = 60;

/** Transport observes a handle; execution deadlines belong to the backend. */
export const TRANSPORT_TIMEOUT_MS = OBSERVATION_MS + 10_000;
