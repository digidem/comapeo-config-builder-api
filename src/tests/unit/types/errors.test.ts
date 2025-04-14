import { describe, it, expect } from 'bun:test';
import { ValidationError, ProcessingError } from '../../../types/errors';

describe('Custom Error Types', () => {
  describe('ValidationError', () => {
    it('should create an error with the correct name and message', () => {
      const errorMessage = 'Invalid input data';
      const error = new ValidationError(errorMessage);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe(errorMessage);
    });
    
    it('should be catchable as a standard Error', () => {
      const error = new ValidationError('Test error');
      
      try {
        throw error;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(ValidationError);
      }
    });
  });
  
  describe('ProcessingError', () => {
    it('should create an error with the correct name and message', () => {
      const errorMessage = 'Processing failed';
      const error = new ProcessingError(errorMessage);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ProcessingError');
      expect(error.message).toBe(errorMessage);
    });
    
    it('should be catchable as a standard Error', () => {
      const error = new ProcessingError('Test error');
      
      try {
        throw error;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(ProcessingError);
      }
    });
  });
});
