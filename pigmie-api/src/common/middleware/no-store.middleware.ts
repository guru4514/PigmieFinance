import type { Request, Response, NextFunction } from 'express';

export function noStoreMiddleware(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('Cache-Control', 'no-store, private');
  next();
}
