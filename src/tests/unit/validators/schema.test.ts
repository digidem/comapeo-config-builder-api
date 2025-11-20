import { describe, it, expect } from 'bun:test';
import { validateBuildRequest, ValidationError } from '../../../validators/schema';
import type { BuildRequest, Metadata, Icon, Category, Field } from '../../../types/schema';

describe('Schema Validation', () => {
  describe('Metadata validation', () => {
    it('should accept valid metadata', () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test Config',
          version: '1.0.0'
        },
        categories: [],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject missing name', () => {
      const request: any = {
        metadata: {
          version: '1.0.0'
        },
        categories: [],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should reject empty name', () => {
      const request: BuildRequest = {
        metadata: {
          name: '',
          version: '1.0.0'
        },
        categories: [],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should reject missing version', () => {
      const request: any = {
        metadata: {
          name: 'Test Config'
        },
        categories: [],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });

    it('should reject invalid semantic version', () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test Config',
          version: '1.0' // Missing patch version
        },
        categories: [],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });

    it('should accept valid semantic versions', () => {
      const versions = ['1.0.0', '0.1.0', '10.20.30'];

      for (const version of versions) {
        const request: BuildRequest = {
          metadata: { name: 'Test', version },
          categories: [],
          fields: []
        };

        const result = validateBuildRequest(request);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept optional metadata fields', () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test Config',
          version: '1.0.0',
          builderName: 'Test Builder',
          builderVersion: '2.0.0',
          description: 'A test configuration'
        },
        categories: [],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });
  });

  describe('Icon validation', () => {
    it('should accept icon with svgData', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [],
        icons: [{
          id: 'icon1',
          svgData: '<svg>test</svg>'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should accept icon with svgUrl', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [],
        icons: [{
          id: 'icon1',
          svgUrl: 'https://example.com/icon.svg'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject icon without svgData or svgUrl', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [],
        icons: [{
          id: 'icon1'
        } as Icon]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('svg'))).toBe(true);
    });

    it('should reject icon with both svgData and svgUrl', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [],
        icons: [{
          id: 'icon1',
          svgData: '<svg>test</svg>',
          svgUrl: 'https://example.com/icon.svg'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('both'))).toBe(true);
    });

    it('should reject svgData not starting with <svg', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [],
        icons: [{
          id: 'icon1',
          svgData: 'not svg data'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('<svg'))).toBe(true);
    });

    it('should reject duplicate icon IDs', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [],
        icons: [
          { id: 'icon1', svgData: '<svg>test1</svg>' },
          { id: 'icon1', svgData: '<svg>test2</svg>' }
        ]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('duplicate') && e.includes('icon1'))).toBe(true);
    });
  });

  describe('Category validation', () => {
    it('should accept valid category', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [{
          id: 'cat1',
          name: 'Category 1'
        }],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject duplicate category IDs', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [
          { id: 'cat1', name: 'Category 1' },
          { id: 'cat1', name: 'Category 2' }
        ],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('duplicate') && e.includes('cat1'))).toBe(true);
    });

    it('should reject category with non-existent iconId', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [{
          id: 'cat1',
          name: 'Category 1',
          iconId: 'nonexistent'
        }],
        fields: [],
        icons: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('iconId') && e.includes('nonexistent'))).toBe(true);
    });

    it('should accept category with valid iconId', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [{
          id: 'cat1',
          name: 'Category 1',
          iconId: 'icon1'
        }],
        fields: [],
        icons: [{
          id: 'icon1',
          svgData: '<svg>test</svg>'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject category with non-existent parentCategoryId', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [{
          id: 'cat1',
          name: 'Category 1',
          parentCategoryId: 'nonexistent'
        }],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('parentCategoryId'))).toBe(true);
    });

    it('should accept category with valid parentCategoryId', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [
          { id: 'cat1', name: 'Category 1' },
          { id: 'cat2', name: 'Category 2', parentCategoryId: 'cat1' }
        ],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject circular parent category references', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [
          { id: 'cat1', name: 'Category 1', parentCategoryId: 'cat2' },
          { id: 'cat2', name: 'Category 2', parentCategoryId: 'cat1' }
        ],
        fields: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('circular') || e.includes('cycle'))).toBe(true);
    });

    it('should reject category with non-existent defaultFieldIds', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [{
          id: 'cat1',
          name: 'Category 1',
          defaultFieldIds: ['field1', 'nonexistent']
        }],
        fields: [
          { id: 'field1', name: 'Field 1', type: 'text' }
        ]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('defaultFieldIds') && e.includes('nonexistent'))).toBe(true);
    });
  });

  describe('Field validation', () => {
    it('should accept valid text field', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'text'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject duplicate field IDs', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [
          { id: 'field1', name: 'Field 1', type: 'text' },
          { id: 'field1', name: 'Field 2', type: 'text' }
        ]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('duplicate') && e.includes('field1'))).toBe(true);
    });

    it('should reject select field without options', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'select'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('options') && e.includes('select'))).toBe(true);
    });

    it('should reject multiselect field without options', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'multiselect'
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('options') && e.includes('multiselect'))).toBe(true);
    });

    it('should accept select field with options', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'select',
          options: [
            { value: 'opt1', label: 'Option 1' },
            { value: 'opt2', label: 'Option 2' }
          ]
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject number field with invalid min/max', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'number',
          min: 10,
          max: 5
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('min') && e.includes('max'))).toBe(true);
    });

    it('should reject number field with invalid step', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'number',
          step: 0
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('step'))).toBe(true);
    });

    it('should accept number field with valid constraints', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'number',
          min: 0,
          max: 100,
          step: 0.1
        }]
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject field with non-existent iconId', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{
          id: 'field1',
          name: 'Field 1',
          type: 'text',
          iconId: 'nonexistent'
        }],
        icons: []
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('iconId'))).toBe(true);
    });

    it('should accept all valid field types', () => {
      const types: Array<Field['type']> = [
        'text', 'textarea', 'number', 'integer',
        'select', 'multiselect', 'boolean',
        'date', 'datetime', 'photo', 'location'
      ];

      for (const type of types) {
        const field: Field = {
          id: `field_${type}`,
          name: `Field ${type}`,
          type
        };

        // Add options for select types
        if (type === 'select' || type === 'multiselect') {
          field.options = [{ value: 'opt1', label: 'Option 1' }];
        }

        const request: BuildRequest = {
          metadata: { name: 'Test', version: '1.0.0' },
          categories: [],
          fields: [field]
        };

        const result = validateBuildRequest(request);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Translation validation', () => {
    it('should accept valid translations', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [{ id: 'cat1', name: 'Category 1' }],
        fields: [{ id: 'field1', name: 'Field 1', type: 'text' }],
        icons: [{ id: 'icon1', svgData: '<svg>test</svg>' }],
        translations: {
          'pt-BR': {
            metadata: {
              name: 'Teste',
              description: 'Uma configuração de teste'
            },
            categories: {
              'cat1': {
                name: 'Categoria 1',
                description: 'Primeira categoria'
              }
            },
            fields: {
              'field1': {
                name: 'Campo 1',
                description: 'Primeiro campo'
              }
            },
            icons: {
              'icon1': {
                altText: 'Ícone de teste'
              }
            }
          }
        }
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject translations referencing non-existent category IDs', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [{ id: 'cat1', name: 'Category 1' }],
        fields: [],
        translations: {
          'en': {
            categories: {
              'nonexistent': {
                name: 'Non-existent category'
              }
            }
          }
        }
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('translation') && e.includes('nonexistent'))).toBe(true);
    });

    it('should reject translations referencing non-existent field IDs', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [{ id: 'field1', name: 'Field 1', type: 'text' }],
        translations: {
          'en': {
            fields: {
              'nonexistent': {
                name: 'Non-existent field'
              }
            }
          }
        }
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('translation') && e.includes('nonexistent'))).toBe(true);
    });

    it('should reject translations referencing non-existent icon IDs', () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: [],
        icons: [{ id: 'icon1', svgData: '<svg>test</svg>' }],
        translations: {
          'en': {
            icons: {
              'nonexistent': {
                altText: 'Non-existent icon'
              }
            }
          }
        }
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('translation') && e.includes('nonexistent'))).toBe(true);
    });
  });

  describe('Cross-entity validation', () => {
    it('should validate complete config with all relationships', () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Complete Config',
          version: '1.0.0',
          builderName: 'Test Builder',
          description: 'A complete configuration'
        },
        icons: [
          { id: 'tree_icon', svgData: '<svg>tree</svg>' },
          { id: 'oak_icon', svgUrl: 'https://example.com/oak.svg' }
        ],
        categories: [
          {
            id: 'trees',
            name: 'Trees',
            iconId: 'tree_icon',
            color: '#4CAF50',
            defaultFieldIds: ['species', 'dbh']
          },
          {
            id: 'oak_trees',
            name: 'Oak Trees',
            parentCategoryId: 'trees',
            iconId: 'oak_icon'
          }
        ],
        fields: [
          {
            id: 'species',
            name: 'Species',
            type: 'select',
            options: [
              { value: 'oak', label: 'Oak', iconId: 'oak_icon' },
              { value: 'pine', label: 'Pine' }
            ]
          },
          {
            id: 'dbh',
            name: 'Diameter at Breast Height',
            type: 'number',
            min: 0,
            max: 500,
            step: 0.1,
            required: true
          }
        ],
        translations: {
          'pt-BR': {
            metadata: {
              name: 'Configuração Completa'
            },
            categories: {
              'trees': { name: 'Árvores' },
              'oak_trees': { name: 'Carvalhos' }
            },
            fields: {
              'species': {
                name: 'Espécie',
                options: {
                  'oak': 'Carvalho',
                  'pine': 'Pinho'
                }
              },
              'dbh': { name: 'Diâmetro à Altura do Peito' }
            }
          }
        }
      };

      const result = validateBuildRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
