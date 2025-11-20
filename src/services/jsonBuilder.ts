/**
 * Service for building .comapeocat files from JSON mode requests
 */

import type { BuildRequest, Icon } from '../types/schema';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runShellCommand } from '../utils/shell';
import { config } from '../config/app';
import { safeFetch } from '../utils/urlValidator';
import { validateAndSanitizeSvg } from '../utils/svgSanitizer';

export interface BuildResult {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Build a .comapeocat file from a JSON mode request
 * @param request The BuildRequest payload
 * @returns The path to the built .comapeocat file and cleanup function
 */
export async function buildFromJSON(request: BuildRequest): Promise<BuildResult> {
  // Create a temporary directory for the workspace
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), config.tempDirPrefix));
  console.log('JSON mode: Temporary directory created:', tmpDir);

  try {
    // 1. Write metadata.json
    await writeMetadata(tmpDir, request);

    // 2. Process and write icons
    if (request.icons && request.icons.length > 0) {
      await writeIcons(tmpDir, request.icons);
    }

    // 3. Write categories
    if (request.categories && request.categories.length > 0) {
      await writeCategories(tmpDir, request);
    }

    // 4. Write fields
    if (request.fields && request.fields.length > 0) {
      await writeFields(tmpDir, request);
    }

    // 5. Write translations
    if (request.translations) {
      await writeTranslations(tmpDir, request);
    }

    // 6. Build the .comapeocat file using mapeo-settings-builder
    const buildDir = path.join(tmpDir, 'build');
    await fs.mkdir(buildDir, { recursive: true });

    const buildFileName = `${request.metadata.name}-${request.metadata.version}.comapeocat`;
    const buildPath = path.join(buildDir, buildFileName);

    console.log('Building .comapeocat file:', buildPath);
    runShellCommand(`mapeo-settings-builder build ${tmpDir} -o ${buildPath}`);

    // 7. Poll for the output file
    console.log('Waiting for .comapeocat file...');
    const { maxAttempts, delayBetweenAttempts } = config;
    let builtSettingsPath = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const fileStats = await fs.stat(buildPath);
        if (fileStats.isFile() && fileStats.size > 0) {
          builtSettingsPath = buildPath;
          break;
        }
      } catch (error) {
        // File doesn't exist yet, continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
    }

    if (!builtSettingsPath) {
      throw new Error('No .comapeocat file found in the build directory after waiting');
    }

    console.log('.comapeocat file found:', builtSettingsPath);

    // Return path and cleanup function
    return {
      path: builtSettingsPath,
      cleanup: async () => {
        try {
          await fs.rm(tmpDir, { recursive: true, force: true });
          console.log('Cleaned up temporary directory:', tmpDir);
        } catch (cleanupError) {
          console.error('Error cleaning up temporary directory:', cleanupError);
        }
      }
    };

  } catch (error) {
    // Clean up on error
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Error cleaning up temporary directory:', cleanupError);
    }
    throw error;
  }
}

/**
 * Write metadata.json
 */
async function writeMetadata(tmpDir: string, request: BuildRequest): Promise<void> {
  const metadata: any = {
    name: request.metadata.name,
    version: request.metadata.version
  };

  if (request.metadata.builderName) {
    metadata.builderName = request.metadata.builderName;
  }

  if (request.metadata.builderVersion) {
    metadata.builderVersion = request.metadata.builderVersion;
  }

  if (request.metadata.description) {
    metadata.description = request.metadata.description;
  }

  await fs.writeFile(
    path.join(tmpDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );
}

/**
 * Write icons to the icons directory
 */
async function writeIcons(tmpDir: string, icons: Icon[]): Promise<void> {
  const iconsDir = path.join(tmpDir, 'icons');
  await fs.mkdir(iconsDir, { recursive: true });

  for (const icon of icons) {
    let svgContent: string;

    if (icon.svgData) {
      // Use inline SVG data
      svgContent = icon.svgData;
    } else if (icon.svgUrl) {
      // Fetch SVG from URL with security restrictions
      try {
        svgContent = await safeFetch(icon.svgUrl, {
          maxSize: 1024 * 1024, // 1MB limit
          timeout: 10000 // 10 second timeout
        });
      } catch (error) {
        throw new Error(`Error fetching icon ${icon.id} from ${icon.svgUrl}: ${(error as Error).message}`);
      }
    } else {
      // This should never happen if validation is correct
      throw new Error(`Icon ${icon.id} has neither svgData nor svgUrl`);
    }

    // Sanitize SVG content to prevent XSS
    const sanitizationResult = validateAndSanitizeSvg(svgContent);
    if (sanitizationResult.error) {
      throw new Error(`Icon ${icon.id} failed sanitization: ${sanitizationResult.error}`);
    }

    // Write the sanitized SVG file
    const iconPath = path.join(iconsDir, `${icon.id}.svg`);
    await fs.writeFile(iconPath, sanitizationResult.sanitized, 'utf-8');
  }
}

/**
 * Write categories
 */
async function writeCategories(tmpDir: string, request: BuildRequest): Promise<void> {
  const categoriesDir = path.join(tmpDir, 'categories');
  await fs.mkdir(categoriesDir, { recursive: true });

  for (const category of request.categories) {
    const categoryData: any = {
      name: category.name
    };

    if (category.description) {
      categoryData.description = category.description;
    }

    if (category.color) {
      categoryData.color = category.color;
    }

    if (category.iconId) {
      categoryData.icon = category.iconId;
    }

    if (category.parentCategoryId) {
      categoryData.parent = category.parentCategoryId;
    }

    if (category.tags) {
      categoryData.tags = category.tags;
    }

    if (category.defaultFieldIds) {
      categoryData.fields = category.defaultFieldIds;
    }

    if (category.visible !== undefined) {
      categoryData.visible = category.visible;
    }

    const categoryPath = path.join(categoriesDir, `${category.id}.json`);
    await fs.writeFile(categoryPath, JSON.stringify(categoryData, null, 2), 'utf-8');
  }
}

/**
 * Write fields
 */
async function writeFields(tmpDir: string, request: BuildRequest): Promise<void> {
  const fieldsDir = path.join(tmpDir, 'fields');
  await fs.mkdir(fieldsDir, { recursive: true });

  for (const field of request.fields) {
    const fieldData: any = {
      name: field.name,
      type: field.type
    };

    if (field.description) {
      fieldData.description = field.description;
    }

    if (field.options) {
      fieldData.options = field.options.map(opt => ({
        value: opt.value,
        label: opt.label,
        ...(opt.iconId && { icon: opt.iconId }),
        ...(opt.tags && { tags: opt.tags })
      }));
    }

    if (field.iconId) {
      fieldData.icon = field.iconId;
    }

    if (field.tags) {
      fieldData.tags = field.tags;
    }

    if (field.required !== undefined) {
      fieldData.required = field.required;
    }

    if (field.defaultValue !== undefined) {
      fieldData.default = field.defaultValue;
    }

    if (field.visible !== undefined) {
      fieldData.visible = field.visible;
    }

    if (field.min !== undefined) {
      fieldData.min = field.min;
    }

    if (field.max !== undefined) {
      fieldData.max = field.max;
    }

    if (field.step !== undefined) {
      fieldData.step = field.step;
    }

    const fieldPath = path.join(fieldsDir, `${field.id}.json`);
    await fs.writeFile(fieldPath, JSON.stringify(fieldData, null, 2), 'utf-8');
  }
}

/**
 * Write translations
 */
async function writeTranslations(tmpDir: string, request: BuildRequest): Promise<void> {
  const translationsDir = path.join(tmpDir, 'translations');
  await fs.mkdir(translationsDir, { recursive: true });

  for (const [locale, translation] of Object.entries(request.translations!)) {
    const translationData: any = {};

    if (translation.metadata) {
      translationData.metadata = translation.metadata;
    }

    if (translation.categories) {
      translationData.categories = translation.categories;
    }

    if (translation.fields) {
      translationData.fields = translation.fields;
    }

    if (translation.icons) {
      translationData.icons = translation.icons;
    }

    const translationPath = path.join(translationsDir, `${locale}.json`);
    await fs.writeFile(translationPath, JSON.stringify(translationData, null, 2), 'utf-8');
  }
}
