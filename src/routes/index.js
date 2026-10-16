import { Router } from 'express';
import { healthRouter } from './health.routes.js';

/** Builds the `/api/v1` router. Resource routers are mounted here as phases are added. */
export function createApiRouter() {
  const router = Router();

  router.use('/health', healthRouter);

  return router;
}
