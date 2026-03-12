import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseDocument } from 'yaml';

const ROOT = process.cwd();
const SCHEMAS_DIR = path.join(ROOT, 'schemas');
const VALID_OUTPUT_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'datetime',
  'array',
  'object',
]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i;

function addError(errors, file, message) {
  errors.push(`${file}: ${message}`);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateStringMap(errors, file, label, value) {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    addError(errors, file, `"${label}" must be a non-empty mapping`);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      addError(errors, file, `"${label}.${key}" must be a non-empty string`);
    }
  }
}

function validateNestedStringArrays(errors, file, label, value) {
  if (!isPlainObject(value)) {
    addError(errors, file, `"${label}" must be a mapping when present`);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (!Array.isArray(entry) || entry.length === 0) {
      addError(errors, file, `"${label}.${key}" must be a non-empty array`);
      continue;
    }

    for (const item of entry) {
      if (typeof item !== 'string' || item.trim() === '') {
        addError(errors, file, `"${label}.${key}" entries must be non-empty strings`);
      }
    }
  }
}

function validateNestedObjects(errors, file, label, value) {
  if (!isPlainObject(value)) {
    addError(errors, file, `"${label}" must be a mapping when present`);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (!isPlainObject(entry) || Object.keys(entry).length === 0) {
      addError(errors, file, `"${label}.${key}" must be a non-empty mapping`);
    }
  }
}

function validateSchema(file, schema, errors) {
  const isTemplate = file === 'TEMPLATE.yaml';

  if (!isPlainObject(schema)) {
    addError(errors, file, 'schema root must be a mapping');
    return;
  }

  if (typeof schema.site !== 'string' || !DOMAIN_RE.test(schema.site)) {
    addError(errors, file, '"site" must be a domain-like string');
  }

  if (typeof schema.version !== 'string' || schema.version.trim() === '') {
    addError(errors, file, '"version" must be a non-empty string');
  }

  if (typeof schema.updated !== 'string' || (!isTemplate && !ISO_DATE_RE.test(schema.updated))) {
    addError(errors, file, '"updated" must be a YYYY-MM-DD string');
  }

  if (typeof schema.maintainer !== 'string' || schema.maintainer.trim() === '') {
    addError(errors, file, '"maintainer" must be a non-empty string');
  }

  if (schema.path_pattern !== undefined) {
    if (typeof schema.path_pattern !== 'string' || !schema.path_pattern.startsWith('/')) {
      addError(errors, file, '"path_pattern" must be a string starting with "/"');
    }
  }

  if (!isPlainObject(schema.output) || Object.keys(schema.output).length === 0) {
    addError(errors, file, '"output" must be a non-empty mapping');
  } else {
    for (const [key, value] of Object.entries(schema.output)) {
      if (typeof value !== 'string' || !VALID_OUTPUT_TYPES.has(value)) {
        addError(
          errors,
          file,
          `"output.${key}" must be one of: ${Array.from(VALID_OUTPUT_TYPES).join(', ')}`,
        );
      }
    }
  }

  validateStringMap(errors, file, 'selectors', schema.selectors);

  if (schema.fallback_selectors !== undefined) {
    validateNestedStringArrays(errors, file, 'fallback_selectors', schema.fallback_selectors);
  }

  if (schema.transformations !== undefined) {
    validateNestedObjects(errors, file, 'transformations', schema.transformations);
  }

  if (schema.derived !== undefined) {
    validateStringMap(errors, file, 'derived', schema.derived);
  }

  if (!Array.isArray(schema.test_urls) || schema.test_urls.length < 3) {
    addError(errors, file, '"test_urls" must contain at least 3 URLs');
  } else {
    for (const url of schema.test_urls) {
      if (typeof url !== 'string' || !validateUrl(url)) {
        addError(errors, file, '"test_urls" entries must be valid http(s) URLs');
        break;
      }
    }
  }
}

async function main() {
  const errors = [];
  const entries = await readdir(SCHEMAS_DIR);
  const files = entries.filter(file => file.endsWith('.yaml')).sort();

  for (const file of files) {
    const source = await readFile(path.join(SCHEMAS_DIR, file), 'utf8');
    const document = parseDocument(source);

    if (document.errors.length > 0) {
      for (const error of document.errors) {
        addError(errors, file, `YAML parse error: ${error.message}`);
      }
      continue;
    }

    validateSchema(file, document.toJS(), errors);
  }

  if (errors.length > 0) {
    console.error(`Schema validation failed with ${errors.length} issue(s):`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${files.length} schema files successfully.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
