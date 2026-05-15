import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = (result.error as ZodError).errors;
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: errors[0]?.message ?? 'Invalid request body',
        details: errors,
        statusCode: 400,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
