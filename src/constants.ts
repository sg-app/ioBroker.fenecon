/**
 * Fallback RegExp of characters that are forbidden in ioBroker object IDs.
 *
 * The adapter normally uses `adapter.FORBIDDEN_CHARS`, which is provided by the
 * ioBroker core. This constant exists so that the helpers stay testable without
 * a running ioBroker instance.
 */
export const DEFAULT_FORBIDDEN_CHARS = /[.\s*?"]/g;
