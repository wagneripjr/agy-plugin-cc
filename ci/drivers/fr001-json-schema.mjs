import { InstrumentError } from '../lib/feature-runner.mjs';

const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples']);
const EVALUATED = new Set(['type', 'required', 'properties', 'additionalProperties', 'items', 'enum', 'const', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern']);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

export function validate(schema, value, at = '$') {
  if (typeof schema === 'boolean') return schema ? [] : [`${at} is not allowed`];
  for (const keyword of Object.keys(schema)) {
    if (!ANNOTATIONS.has(keyword) && !EVALUATED.has(keyword)) throw new InstrumentError(`the driver cannot evaluate the schema keyword ${keyword} at ${at}`);
  }
  const errors = [];
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) return [`${at} is ${typeOf(value)}, not ${types.join(' or ')}`];
  }
  if (schema.enum && !schema.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))) errors.push(`${at} is not one of ${JSON.stringify(schema.enum)}`);
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${at} is not ${JSON.stringify(schema.const)}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at} is shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at} is longer than ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at} does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at} is above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at} has fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at} has more than ${schema.maxItems} items`);
    if (schema.items !== undefined) value.forEach((item, i) => errors.push(...validate(schema.items, item, `${at}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at} lacks ${key}`);
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (key in properties) errors.push(...validate(properties[key], child, `${at}.${key}`));
      else if (schema.additionalProperties !== undefined) errors.push(...validate(schema.additionalProperties, child, `${at}.${key}`));
    }
  }
  return errors;
}
