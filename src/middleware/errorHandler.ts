import { NotFoundError, ParseError } from 'elysia';
import { ValidationError, ProcessingError } from '../types/errors';

/**
 * Error handler function to standardize error responses
 */
export const errorHandler = (error: any) => {
  console.error(`[ERROR] ${error.name || 'Unknown'}: ${error.message || 'No message'}`);

  if (error instanceof ValidationError) {
    return new Response(JSON.stringify({
      status: 400,
      error: error.name,
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
    return new Response(JSON.stringify({
      status: 400,
      error: error.name,
      message: 'Invalid request format'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (error instanceof ProcessingError) {
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
