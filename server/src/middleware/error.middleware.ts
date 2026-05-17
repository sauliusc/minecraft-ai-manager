import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.errors[0]?.message ?? 'Invalid request body',
      details: err.errors,
      statusCode: 400,
    });
    return;
  }
  if ((err as any).code === 'P2025') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Record not found', statusCode: 404 });
    return;
  }
  const statusCode = err.statusCode ?? 500;
  const message = statusCode < 500 ? err.message : 'Internal server error';
  console.error(`[Error] ${err.message}`, err.stack);
  res.status(statusCode).json({
    error: err.code ?? 'INTERNAL_ERROR',
    message,
    statusCode,
  });
}

export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found', statusCode: 404 });
}
