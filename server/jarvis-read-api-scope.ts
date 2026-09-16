import type { Request, Response, NextFunction } from "express";
import type { Router } from "express";

// Trailing slash defines the namespace boundary: the bare prefix
// "/api/integrations/jarvis/v1" (no route under it) and lookalikes like
// "/api/integrations/jarvis/v1-reader" must NOT enter the raw-body router.
const JARVIS_READ_API_PREFIX = "/api/integrations/jarvis/v1/";

/** Check whether a request path belongs to the Jarvis read API namespace. */
export function isJarvisReadApiPath(path: string): boolean {
  return path.toLowerCase().startsWith(JARVIS_READ_API_PREFIX);
}

/**
 * Express middleware that dispatches only Jarvis read-API paths into the
 * supplied router.  Unrelated paths skip the router (and its express.raw
 * middleware) entirely, so their bodies reach express.json() unpolluted.
 *
 * The check uses the same shared helper in tests and production so the
 * scoping logic cannot drift.
 */
export function createJarvisReadApiDispatcher(router: Router) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (isJarvisReadApiPath(request.path)) {
      return router(request, response, next);
    }
    return next();
  };
}
