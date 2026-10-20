import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FINDINGS_SCHEMA = fileURLToPath(new URL('../../schemas/review-findings.schema.json', import.meta.url));

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function violations(schema, value, at) {
  if (schema.type && typeOf(value) !== schema.type && !(schema.type === 'number' && typeOf(value) === 'integer')) {
    return [`${at} is ${typeOf(value)}, not ${schema.type}`];
  }
  const found = [];
  if (schema.enum && !schema.enum.includes(value)) found.push(`${at} is not one of ${schema.enum.join(', ')}`);
  if (schema.minLength !== undefined && value.length < schema.minLength) found.push(`${at} is shorter than ${schema.minLength}`);
  if (schema.minimum !== undefined && value < schema.minimum) found.push(`${at} is below ${schema.minimum}`);
  if (schema.items) value.forEach((item, i) => found.push(...violations(schema.items, item, `${at}[${i}]`)));
  if (schema.type === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) found.push(`${at} lacks ${key}`);
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) found.push(...violations(schema.properties[key], child, `${at}.${key}`));
      else if (schema.additionalProperties === false) found.push(`${at} has the unexpected field ${key}`);
    }
  }
  return found;
}

export function findingsViolations(output) {
  if (output === undefined) return ['agy returned no structured output'];
  return violations(JSON.parse(readFileSync(FINDINGS_SCHEMA, 'utf8')), output, '$');
}
