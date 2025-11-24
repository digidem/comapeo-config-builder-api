/**
 * Type definitions for CoMapeo Config Builder API v2.0.0 JSON mode
 */

/**
 * Metadata for the configuration
 */
export interface Metadata {
  name: string;           // e.g. "Forest Monitoring Categories"
  version: string;        // semantic version e.g. "1.0.0"
  builderName?: string;   // e.g. "SpreadsheetPlugin v3"
  builderVersion?: string;// e.g. "3.2.1"
  description?: string;   // optional human-readable description
}

/**
 * Icon definition
 */
export interface Icon {
  id: string;            // unique identifier e.g. "icon_tree"
  svgUrl?: string;       // URL to the SVG file
  svgData?: string;      // inline SVG text (must begin with "<svg")
  altText?: string;      // optional alt text for accessibility
  tags?: string[];       // optional keywords/tags
}

/**
 * Category definition
 */
export interface Category {
  id: string;                   // unique in config e.g. "tree_species"
  name: string;                 // human-readable name
  description?: string;
  color?: string;               // optional hex code e.g. "#4CAF50"
  iconId?: string;              // optional, must reference an Icon.id if provided
  parentCategoryId?: string;    // optional, referencing another Category.id
  tags?: string[];
  defaultFieldIds?: string[];   // optional list of Field.id that apply by default
  visible?: boolean;
}

/**
 * Field types
 */
export type FieldType =
   "text" | "textarea" | "number" | "integer" |
   "select" | "multiselect" | "boolean" |
   "date" | "datetime" | "photo" | "location";

/**
 * Option for select/multiselect fields
 */
export interface SelectOption {
  value: string;         // stored value e.g. "oak"
  label: string;         // display label e.g. "Oak"
  iconId?: string;       // optional icon reference
  tags?: string[];
}

/**
 * Field definition
 */
export interface Field {
  id: string;             // unique in config e.g. "dbh_cm"
  name: string;           // human-readable
  description?: string;
  type: FieldType;
  options?: SelectOption[];    // required if type is "select" or "multiselect"
  iconId?: string;
  tags?: string[];
  required?: boolean;
  defaultValue?: any;
  visible?: boolean;
  min?: number;           // for number/integer types
  max?: number;           // for number/integer types
  step?: number;          // for number/integer types
}

/**
 * Translation for a single locale
 */
export interface Translations {
  metadata?: {
    name?: string;
    description?: string;
  };
  categories?: {
    [categoryId: string]: {
      name?: string;
      description?: string;
    }
  };
  fields?: {
    [fieldId: string]: {
      name?: string;
      description?: string;
      options?: {
        [optionValue: string]: string;
      }
    }
  };
  icons?: {
    [iconId: string]: {
      altText?: string;
      tags?: string[];
    }
  };
}

/**
 * Translations by locale
 */
export interface TranslationsByLocale {
  [locale: string]: Translations;
}

/**
 * Build request payload for JSON mode
 */
export interface BuildRequest {
  metadata: Metadata;
  categories: Category[];
  fields: Field[];
  translations?: TranslationsByLocale;
  icons?: Icon[];
}

/**
 * Error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, any>;
}
