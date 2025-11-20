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

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a BuildRequest payload
 */
export function validateBuildRequest(request: BuildRequest): ValidationResult {
  const errors: string[] = [];

  // Validate metadata
  validateMetadata(request, errors);

  // Collect all IDs for cross-reference validation
  const iconIds = new Set<string>();
  const categoryIds = new Set<string>();
  const fieldIds = new Set<string>();

  // Validate icons and collect IDs
  if (request.icons) {
    validateIcons(request.icons, errors, iconIds);
  }

  // Validate categories and collect IDs
  validateCategories(request.categories, errors, categoryIds, iconIds, fieldIds);

  // Validate fields and collect IDs
  validateFields(request.fields, errors, fieldIds, iconIds);

  // Now validate cross-references after collecting all IDs
  validateCategoryReferences(request.categories, categoryIds, fieldIds, errors);

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

  if (!name || name.trim() === '') {
    errors.push('metadata.name is required and must be non-empty');
  }

  if (!version || version.trim() === '') {
    errors.push('metadata.version is required and must be non-empty');
  } else if (!isValidSemanticVersion(version)) {
    errors.push('metadata.version must follow semantic versioning format (MAJOR.MINOR.PATCH)');
  }
}

/**
 * Validates icons
 */
function validateIcons(icons: Icon[], errors: string[], iconIds: Set<string>): void {
  for (const icon of icons) {
    // Check for duplicate IDs
    if (iconIds.has(icon.id)) {
      errors.push(`duplicate icon ID: ${icon.id}`);
    } else {
      iconIds.add(icon.id);
    }

    // Validate svgData or svgUrl (exactly one must be present)
    const hasSvgData = icon.svgData !== undefined && icon.svgData !== null && icon.svgData !== '';
    const hasSvgUrl = icon.svgUrl !== undefined && icon.svgUrl !== null && icon.svgUrl !== '';

    if (!hasSvgData && !hasSvgUrl) {
      errors.push(`Icon ${icon.id} must have either svgData or svgUrl`);
    } else if (hasSvgData && hasSvgUrl) {
      errors.push(`Icon ${icon.id} cannot have both svgData and svgUrl`);
    }

    // Validate svgData format if present
    if (hasSvgData) {
      const svgCheck = isValidSvgStructure(icon.svgData!);
      if (!svgCheck.valid) {
        errors.push(`Icon ${icon.id} has invalid SVG data: ${svgCheck.error}`);
      }
    }

    // Validate svgUrl format if present
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
  for (const category of categories) {
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
function validateFields(
  fields: Field[],
  errors: string[],
  fieldIds: Set<string>,
  iconIds: Set<string>
): void {
  for (const field of fields) {
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
