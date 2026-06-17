/**
 * json-schema-mini — a tiny, zero-dependency JSON Schema validator.
 *
 * It supports ONLY the subset of JSON Schema (draft-07) that this repo's contracts in
 * schemas/*.json actually use. It is intentionally small and readable, not a general
 * validator. Keep it in sync with the schemas: if a schema starts using a new keyword,
 * add support here (and a fixture in scripts/test-gate.mjs).
 *
 * Supported keywords: type (incl. union arrays like ["integer","null"]), required, enum,
 * pattern, minLength, minItems, items, properties. `format` and `additionalProperties` are
 * intentionally NOT enforced (we treat objects as open, matching `additionalProperties: true`).
 *
 * Usage:
 *   import { validate } from "./lib/json-schema-mini.mjs";
 *   const errors = validate(data, schema);   // => string[]; empty array means valid
 */

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer"; // integer is a refinement of number
  return typeof value; // "string" | "number" | "boolean" | "object" | "undefined"
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

/**
 * Validate `data` against `schema`. Returns an array of human-readable error strings,
 * each prefixed with a JSON path. An empty array means the data is valid.
 */
export function validate(data, schema, path = "(root)") {
  const errors = [];

  // type (string or array-of-strings for unions)
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => matchesType(data, t))) {
      errors.push(`${path}: expected type ${allowed.join("|")}, got ${typeOf(data)}`);
      return errors; // type is wrong — downstream checks would be noise
    }
  }

  // enum
  if (schema.enum !== undefined && !schema.enum.includes(data)) {
    errors.push(`${path}: ${JSON.stringify(data)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  // string constraints
  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(data)) {
      errors.push(`${path}: "${data}" does not match pattern ${schema.pattern}`);
    }
  }

  // array constraints
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`${path}: array has ${data.length} items, fewer than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      data.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
    }
  }

  // object constraints
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        const v = data[key];
        if (v === undefined) errors.push(`${path}: missing required property "${key}"`);
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (data[key] !== undefined) {
          errors.push(...validate(data[key], subSchema, `${path}.${key}`));
        }
      }
    }
  }

  return errors;
}
