/**
 * Validation logic for CoMapeo Config Builder API v2.0.0 JSON mode
 */

import type { BuildRequest, Icon, Category, Field, TranslationsByLocale } from '../types/schema';
import { validateIconUrl } from '../utils/urlValidator';
import { isValidSvgStructure } from '../utils/svgSanitizer';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates that an ID is safe for use as a filename component.
 * Rejects IDs containing path separators, control characters, or other unsafe characters.
 */
function isValidId(id: string): { valid: boolean; error?: string } {
  // Check for path separators
  if (id.includes('/') || id.includes('\\')) {
    return { valid: false, error: 'contains path separators' };
  }
  // Check for path traversal
  if (id === '.' || id === '..' || id.startsWith('./') || id.startsWith('../')) {
    return { valid: false, error: 'contains path traversal' };
  }
  // Check for leading dots (hidden files)
  if (id.startsWith('.')) {
    return { valid: false, error: 'cannot start with a dot' };
  }
  // Check for control characters
  if (/[\x00-\x1f\x7f]/.test(id)) {
    return { valid: false, error: 'contains control characters' };
  }
  // Check for characters that would be sanitized (only allow alphanumeric, hyphen, underscore, dot)
  if (!/^[a-zA-Z0-9\-_.]+$/.test(id)) {
    return { valid: false, error: 'contains invalid characters (only alphanumeric, hyphen, underscore, dot allowed)' };
  }
  return { valid: true };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a BuildRequest payload
 */
export function validateBuildRequest(request: BuildRequest): ValidationResult {
  const errors: string[] = [];

  // Type check the request structure
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return {
      valid: false,
      errors: ['Request body must be a valid JSON object']
    };
  }

  // Validate metadata
  validateMetadata(request, errors);

  // Collect all IDs for cross-reference validation
  const iconIds = new Set<string>();
  const categoryIds = new Set<string>();
  const fieldIds = new Set<string>();

  // Validate icons and collect IDs
  if (request.icons) {
    if (!Array.isArray(request.icons)) {
      errors.push('icons must be an array');
    } else {
      validateIcons(request.icons, errors, iconIds);
    }
  }

  // Validate categories and collect IDs
  if (!request.categories) {
    errors.push('categories is required');
  } else if (!Array.isArray(request.categories)) {
    errors.push('categories must be an array');
  } else {
    validateCategories(request.categories, errors, categoryIds, iconIds, fieldIds);
  }

  // Validate fields and collect IDs
  if (!request.fields) {
    errors.push('fields is required');
  } else if (!Array.isArray(request.fields)) {
    errors.push('fields must be an array');
  } else {
    validateFields(request.fields, errors, fieldIds, iconIds);
  }

  // Now validate cross-references after collecting all IDs
  if (Array.isArray(request.categories)) {
    validateCategoryReferences(request.categories, categoryIds, fieldIds, errors);
  }

  // Validate translations
  if (request.translations) {
    validateTranslations(request.translations, categoryIds, fieldIds, iconIds, errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates metadata
 */
function validateMetadata(request: BuildRequest, errors: string[]): void {
  if (!request.metadata) {
    errors.push('metadata is required');
    return;
  }

  const { name, version } = request.metadata;

  // Type check name
  if (typeof name !== 'string') {
    errors.push('metadata.name must be a string');
  } else if (!name || name.trim() === '') {
    errors.push('metadata.name is required and must be non-empty');
  }

  // Type check version
  if (typeof version !== 'string') {
    errors.push('metadata.version must be a string');
  } else if (!version || version.trim() === '') {
    errors.push('metadata.version is required and must be non-empty');
  } else if (!isValidSemanticVersion(version)) {
    errors.push('metadata.version must follow semantic versioning format (MAJOR.MINOR.PATCH)');
  }
}

/**
 * Validates icons
 */
function validateIcons(icons: Icon[], errors: string[], iconIds: Set<string>): void {
  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i];

    // Validate required fields exist and are correct types
    if (!icon || typeof icon !== 'object') {
      errors.push(`Icon at index ${i} must be an object`);
      continue;
    }

    if (typeof icon.id !== 'string' || icon.id.trim() === '') {
      errors.push(`Icon at index ${i} must have a non-empty string 'id'`);
      continue; // Skip further validation for this icon
    }

    // Validate ID is filesystem-safe
    const idCheck = isValidId(icon.id);
    if (!idCheck.valid) {
      errors.push(`Icon '${icon.id}' has invalid ID: ${idCheck.error}`);
    }

    // Check for duplicate IDs
    if (iconIds.has(icon.id)) {
      errors.push(`duplicate icon ID: ${icon.id}`);
    } else {
      iconIds.add(icon.id);
    }

    // Validate svgData or svgUrl (exactly one must be present, must be string)
    const hasSvgData = typeof icon.svgData === 'string' && icon.svgData !== '';
    const hasSvgUrl = typeof icon.svgUrl === 'string' && icon.svgUrl !== '';

    // Check for wrong types
    if (icon.svgData !== undefined && icon.svgData !== null && typeof icon.svgData !== 'string') {
      errors.push(`Icon ${icon.id} svgData must be a string`);
    }
    if (icon.svgUrl !== undefined && icon.svgUrl !== null && typeof icon.svgUrl !== 'string') {
      errors.push(`Icon ${icon.id} svgUrl must be a string`);
    }

    if (!hasSvgData && !hasSvgUrl) {
      errors.push(`Icon ${icon.id} must have either svgData or svgUrl`);
    } else if (hasSvgData && hasSvgUrl) {
      errors.push(`Icon ${icon.id} cannot have both svgData and svgUrl`);
    }

    // Validate svgData format if present (only if it's a string)
    if (hasSvgData) {
      const svgCheck = isValidSvgStructure(icon.svgData!);
      if (!svgCheck.valid) {
        errors.push(`Icon ${icon.id} has invalid SVG data: ${svgCheck.error}`);
      }
    }

    // Validate svgUrl format if present (only if it's a string)
    if (hasSvgUrl) {
      const urlCheck = validateIconUrl(icon.svgUrl!);
      if (!urlCheck.valid) {
        errors.push(`Icon ${icon.id} has invalid or unsafe URL: ${urlCheck.error}`);
      }
    }
  }
}

/**
 * Validates categories (first pass - collect IDs and basic validation)
 */
function validateCategories(
  categories: Category[],
  errors: string[],
  categoryIds: Set<string>,
  iconIds: Set<string>,
  fieldIds: Set<string>
): void {
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];

    // Validate required fields exist and are correct types
    if (!category || typeof category !== 'object') {
      errors.push(`Category at index ${i} must be an object`);
      continue;
    }

    if (typeof category.id !== 'string' || category.id.trim() === '') {
      errors.push(`Category at index ${i} must have a non-empty string 'id'`);
      continue; // Skip further validation for this category
    }

    // Validate ID is filesystem-safe
    const idCheck = isValidId(category.id);
    if (!idCheck.valid) {
      errors.push(`Category '${category.id}' has invalid ID: ${idCheck.error}`);
    }

    if (typeof category.name !== 'string' || category.name.trim() === '') {
      errors.push(`Category '${category.id}' must have a non-empty string 'name'`);
    }

    // Check for duplicate IDs
    if (categoryIds.has(category.id)) {
      errors.push(`duplicate category ID: ${category.id}`);
    } else {
      categoryIds.add(category.id);
    }

    // Validate iconId reference (if present)
    if (category.iconId && !iconIds.has(category.iconId)) {
      errors.push(`Category ${category.id} references non-existent iconId: ${category.iconId}`);
    }

    // Note: parentCategoryId and defaultFieldIds will be validated in second pass
    // after all IDs are collected
  }
}

/**
 * Validates category cross-references (second pass)
 */
function validateCategoryReferences(
  categories: Category[],
  categoryIds: Set<string>,
  fieldIds: Set<string>,
  errors: string[]
): void {
  for (const category of categories) {
    // Validate parentCategoryId reference
    if (category.parentCategoryId) {
      if (!categoryIds.has(category.parentCategoryId)) {
        errors.push(`Category ${category.id} references non-existent parentCategoryId: ${category.parentCategoryId}`);
      } else {
        // Check for circular references
        if (hasCircularReference(category.id, category.parentCategoryId, categories)) {
          errors.push(`Category ${category.id} has circular parent reference`);
        }
      }
    }

    // Validate defaultFieldIds references
    if (category.defaultFieldIds) {
      for (const fieldId of category.defaultFieldIds) {
        if (!fieldIds.has(fieldId)) {
          errors.push(`Category ${category.id} references non-existent field in defaultFieldIds: ${fieldId}`);
        }
      }
    }
  }
}

/**
 * Checks for circular parent category references
 */
function hasCircularReference(
  startId: string,
  parentId: string,
  categories: Category[],
  visited: Set<string> = new Set()
): boolean {
  if (visited.has(parentId)) {
    return true;
  }

  if (parentId === startId) {
    return true;
  }

  visited.add(parentId);

  const parent = categories.find(c => c.id === parentId);
  if (parent && parent.parentCategoryId) {
    return hasCircularReference(startId, parent.parentCategoryId, categories, visited);
  }

  return false;
}

/**
 * Validates fields
 */
const VALID_FIELD_TYPES = ['text', 'textarea', 'number', 'integer', 'boolean', 'select', 'multiselect', 'date', 'datetime', 'photo', 'location'];

function validateFields(
  fields: Field[],
  errors: string[],
  fieldIds: Set<string>,
  iconIds: Set<string>
): void {
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];

    // Validate required fields exist and are correct types
    if (!field || typeof field !== 'object') {
      errors.push(`Field at index ${i} must be an object`);
      continue;
    }

    if (typeof field.id !== 'string' || field.id.trim() === '') {
      errors.push(`Field at index ${i} must have a non-empty string 'id'`);
      continue; // Skip further validation for this field
    }

    // Validate ID is filesystem-safe
    const idCheck = isValidId(field.id);
    if (!idCheck.valid) {
      errors.push(`Field '${field.id}' has invalid ID: ${idCheck.error}`);
    }

    if (typeof field.name !== 'string' || field.name.trim() === '') {
      errors.push(`Field '${field.id}' must have a non-empty string 'name'`);
    }

    if (typeof field.type !== 'string' || !VALID_FIELD_TYPES.includes(field.type)) {
      errors.push(`Field '${field.id}' must have a valid 'type' (one of: ${VALID_FIELD_TYPES.join(', ')})`);
    }

    // Check for duplicate IDs
    if (fieldIds.has(field.id)) {
      errors.push(`duplicate field ID: ${field.id}`);
    } else {
      fieldIds.add(field.id);
    }

    // Validate iconId reference (if present)
    if (field.iconId && !iconIds.has(field.iconId)) {
      errors.push(`Field ${field.id} references non-existent iconId: ${field.iconId}`);
    }

    // Validate select/multiselect options
    if (field.type === 'select' || field.type === 'multiselect') {
      if (!field.options || field.options.length === 0) {
        errors.push(`Field ${field.id} of type ${field.type} must have options`);
      } else {
        // Validate option iconIds
        for (const option of field.options) {
          if (option.iconId && !iconIds.has(option.iconId)) {
            errors.push(`Field ${field.id} option "${option.value}" references non-existent iconId: ${option.iconId}`);
          }
        }
      }
    }

    // Validate number/integer constraints
    if (field.type === 'number' || field.type === 'integer') {
      if (field.min !== undefined && field.max !== undefined && field.min >= field.max) {
        errors.push(`Field ${field.id} has invalid min/max: min must be less than max`);
      }

      if (field.step !== undefined && field.step <= 0) {
        errors.push(`Field ${field.id} has invalid step: must be greater than 0`);
      }
    }

    // Validate defaultValue type matches field type
    if (field.defaultValue !== undefined) {
      validateDefaultValue(field, errors);
    }
  }
}

/**
 * Validates that defaultValue matches the field type
 */
function validateDefaultValue(field: Field, errors: string[]): void {
  const value = field.defaultValue;

  switch (field.type) {
    case 'text':
    case 'textarea':
      if (typeof value !== 'string') {
        errors.push(`Field ${field.id} defaultValue must be a string (field type: ${field.type})`);
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        errors.push(`Field ${field.id} defaultValue must be a number (field type: number)`);
      } else if (!Number.isFinite(value)) {
        errors.push(`Field ${field.id} defaultValue must be a finite number (got: ${value})`);
      } else if (field.min !== undefined && value < field.min) {
        errors.push(`Field ${field.id} defaultValue ${value} is below minimum ${field.min}`);
      } else if (field.max !== undefined && value > field.max) {
        errors.push(`Field ${field.id} defaultValue ${value} is above maximum ${field.max}`);
      }
      break;

    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`Field ${field.id} defaultValue must be an integer (field type: integer)`);
      } else if (field.min !== undefined && value < field.min) {
        errors.push(`Field ${field.id} defaultValue ${value} is below minimum ${field.min}`);
      } else if (field.max !== undefined && value > field.max) {
        errors.push(`Field ${field.id} defaultValue ${value} is above maximum ${field.max}`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`Field ${field.id} defaultValue must be a boolean (field type: boolean)`);
      }
      break;

    case 'select':
      if (typeof value !== 'string') {
        errors.push(`Field ${field.id} defaultValue must be a string (field type: select)`);
      } else if (field.options) {
        const validValues = field.options.map(opt => opt.value);
        if (!validValues.includes(value)) {
          errors.push(`Field ${field.id} defaultValue "${value}" is not a valid option. Valid options: ${validValues.join(', ')}`);
        }
      }
      break;

    case 'multiselect':
      if (!Array.isArray(value)) {
        errors.push(`Field ${field.id} defaultValue must be an array (field type: multiselect)`);
      } else {
        // Check all array elements are strings
        const nonStringValues = value.filter(v => typeof v !== 'string');
        if (nonStringValues.length > 0) {
          errors.push(`Field ${field.id} defaultValue array must contain only strings`);
        } else if (field.options) {
          const validValues = field.options.map(opt => opt.value);
          const invalidValues = value.filter(v => !validValues.includes(v));
          if (invalidValues.length > 0) {
            errors.push(`Field ${field.id} defaultValue contains invalid options: ${invalidValues.join(', ')}. Valid options: ${validValues.join(', ')}`);
          }
        }
      }
      break;

    case 'date':
    case 'datetime':
      if (typeof value !== 'string') {
        errors.push(`Field ${field.id} defaultValue must be a string (field type: ${field.type})`);
      } else {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          errors.push(`Field ${field.id} defaultValue "${value}" is not a valid date`);
        }
      }
      break;

    case 'photo':
    case 'location':
      // These types typically don't have default values, but if they do, warn
      errors.push(`Field ${field.id} of type ${field.type} should not have a defaultValue`);
      break;

    default:
      // Unknown field type - already validated elsewhere
      break;
  }
}

/**
 * Validates translations
 */
function validateTranslations(
  translations: TranslationsByLocale,
  categoryIds: Set<string>,
  fieldIds: Set<string>,
  iconIds: Set<string>,
  errors: string[]
): void {
  for (const [locale, translation] of Object.entries(translations)) {
    // Validate category translations
    if (translation.categories) {
      for (const categoryId of Object.keys(translation.categories)) {
        if (!categoryIds.has(categoryId)) {
          errors.push(`translation for locale ${locale} references nonexistent category: ${categoryId}`);
        }
      }
    }

    // Validate field translations
    if (translation.fields) {
      for (const fieldId of Object.keys(translation.fields)) {
        if (!fieldIds.has(fieldId)) {
          errors.push(`translation for locale ${locale} references nonexistent field: ${fieldId}`);
        }
      }
    }

    // Validate icon translations
    if (translation.icons) {
      for (const iconId of Object.keys(translation.icons)) {
        if (!iconIds.has(iconId)) {
          errors.push(`translation for locale ${locale} references nonexistent icon: ${iconId}`);
        }
      }
    }
  }
}

/**
 * Validates semantic versioning format (MAJOR.MINOR.PATCH)
 */
function isValidSemanticVersion(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  return semverRegex.test(version);
}
