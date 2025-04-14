import { describe, it, expect } from 'bun:test';
import { errorHandler } from '../../../middleware/errorHandler';
import { ValidationError, ProcessingError } from '../../../types/errors';
import { NotFoundError, ParseError } from 'elysia';

describe('Error Handler Middleware', () => {
  it('should handle ValidationError with 400 status', async () => {
    const error = new ValidationError('Invalid input');
    const response = errorHandler(error);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('ValidationError');
    expect(body.message).toBe('Invalid input');
  });

  it('should handle NotFoundError with 404 status', async () => {
    const error = new NotFoundError('Resource not found');
    error.name = 'NotFoundError'; // Ensure name is set correctly
    const response = errorHandler(error);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe('NotFoundError');
    expect(body.message).toBe('Resource not found');
  });

  it('should handle ParseError with 400 status', async () => {
    const error = new ParseError();
    error.name = 'ParseError'; // Ensure name is set correctly
    const response = errorHandler(error);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('ParseError');
    expect(body.message).toBe('Invalid request format');
  });

  it('should handle ProcessingError with 422 status', async () => {
    const error = new ProcessingError('Processing failed');
    const response = errorHandler(error);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error).toBe('ProcessingError');
    expect(body.message).toBe('Processing failed');
  });

  it('should handle unknown errors with 500 status', async () => {
    const error = new Error('Unknown error');
    const response = errorHandler(error);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe('InternalServerError');
    expect(body.message).toBe('Unknown error');
  });

  it('should handle errors without message', async () => {
    const error = { name: 'CustomError' };
    const response = errorHandler(error);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe('InternalServerError');
    expect(body.message).toBe('An unexpected error occurred');
  });
});
