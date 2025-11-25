import { NotFoundError, ParseError } from 'elysia';
import { ValidationError, ProcessingError } from '../types/errors';

/**
 * Error handler function to standardize error responses
 */
export const errorHandler = (error: any) => {
  console.error(`[ERROR] ${error.name || 'Unknown'}: ${error.message || 'No message'}`);

  // Handle both ValidationError class instances and generic errors with ValidationError name
  if (error instanceof ValidationError || error.name === 'ValidationError') {
    (error as any).status = 400;
    return new Response(JSON.stringify({
      status: 400,
      error: 'ValidationError',
      message: error.message
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (error instanceof NotFoundError) {
    return new Response(JSON.stringify({
      status: 404,
      error: error.name,
      message: error.message
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (error instanceof ParseError) {
    // Check if the underlying cause is a ValidationError (body size limit)
    // When onParse throws ValidationError, Elysia wraps it in ParseError
    const cause = error.cause as any;
    if (error.cause instanceof ValidationError || cause?.name === 'ValidationError') {
      return new Response(JSON.stringify({
        status: 400,
        error: 'ValidationError',
        message: cause.message
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      status: 400,
      error: error.name,
      message: error.message === 'Bad Request' ? 'Invalid request format' : error.message
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (error instanceof ProcessingError) {
    (error as any).status = 422;
    return new Response(JSON.stringify({
      status: 422,
      error: error.name,
      message: error.message
    }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Default server error
  return new Response(JSON.stringify({
    status: 500,
    error: 'InternalServerError',
    message: error.message || 'An unexpected error occurred'
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
};
