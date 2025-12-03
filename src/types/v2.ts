export type LegacyFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'photo'
  | 'location';

export type ComapeoFieldType = 'text' | 'number' | 'selectOne' | 'selectMultiple';

export interface BuildRequestV2 {
  metadata: {
    name: string;
    version?: string;
    description?: string;
    builderName?: string;
    builderVersion?: string;
    legacyCompat?: boolean;
  };
  categories: CategoryInput[];
  fields: FieldInput[];
  icons?: IconInput[];
  translations?: Record<string, unknown>;
}

export interface CategoryInput {
  id: string;
  name: string;
  appliesTo?: string[];
  tags?: Record<string, unknown> | string[] | undefined;
  defaultFieldIds?: string[];
  fields?: string[];
  iconId?: string;
  color?: string;
  track?: boolean;
  addTags?: Record<string, unknown>;
  removeTags?: Record<string, unknown>;
  terms?: string[];
  // Legacy properties that we ignore gracefully
  description?: string;
  parentCategoryId?: string;
  visible?: boolean;
}

export interface FieldInput {
  id: string;
  name?: string;
  label?: string;
  tagKey?: string;
  type: LegacyFieldType | ComapeoFieldType;
  options?: Array<{ label: string; value: unknown }>;
  placeholder?: string;
  helperText?: string;
  appearance?: 'singleline' | 'multiline';
  // Legacy props that will be dropped
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  visible?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

export interface IconInput {
  id: string;
  svgData?: string;
  svgUrl?: string;
  altText?: string;
  tags?: Record<string, unknown>;
}

export interface MappedField {
  id: string;
  definition: {
    type: ComapeoFieldType;
    tagKey: string;
    label: string;
    options?: Array<{ label: string; value: unknown }>;
    placeholder?: string;
    helperText?: string;
    appearance?: 'singleline' | 'multiline';
  };
}

export interface MappedCategory {
  id: string;
  definition: {
    name: string;
    appliesTo: string[];
    tags: Record<string, unknown>;
    fields?: string[];
    icon?: string;
    addTags?: Record<string, unknown>;
    removeTags?: Record<string, unknown>;
    terms?: string[];
    color?: string;
  };
  track?: boolean;
}

export interface MappedIcon {
  id: string;
  svg: string;
}
