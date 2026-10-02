/**
 * Checks a value against a schema of the pinned admin contract (JSON Schema
 * 2020-12, as the API's zod schemas emit it). An interpreter rather than Ajv:
 * Ajv compiles schemas with `new Function`, which the Table Derby CSP forbids.
 * It knows exactly the keywords the pinned artifact uses (SUPPORTED_KEYWORDS);
 * a test runs every pinned validation case through it and fails on any
 * keyword it does not know.
 */

import { t } from "@/lib/td/i18n";

export type JsonSchema = Record<string, unknown>;

export interface SchemaIssue {
  /** Dot path into the value (`data.aliases.0`), the API's own issue format; empty for the whole value. */
  path: string;
  message: string;
}

export const SUPPORTED_KEYWORDS = new Set([
  "type",
  "enum",
  "const",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "anyOf",
  "oneOf",
  "allOf",
  "description",
  "$comment",
  "title",
]);

const patterns = new Map<string, RegExp>();
function compiled(pattern: string): RegExp {
  let regex = patterns.get(pattern);
  if (!regex) {
    // The contract's patterns are ECMAScript with the `u` flag: lengths in code points.
    regex = new RegExp(pattern, "u");
    patterns.set(pattern, regex);
  }
  return regex;
}

const join = (path: string, key: string | number) =>
  path ? `${path}.${key}` : String(key);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function hasType(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  if (type === "number")
    return (
      (actual === "number" || actual === "integer") &&
      Number.isFinite(value as number)
    );
  return actual === type;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

const codePoints = (text: string) => [...text].length;

/** A plain-language reading of the contract's pattern families. */
export function describePattern(pattern: string): string {
  let m = /^\^\\S\(\?:\[\\s\\S\]\{0,(\d+)\}\\S\)\?\$$/.exec(pattern);
  if (m)
    return t(
      "Required: at most {max} characters, with no spaces at the start or end",
      { max: Number(m[1]) + 2 },
    );
  m = /^\^\(\?:\\S\(\?:\[\\s\\S\]\{0,(\d+)\}\\S\)\?\)\?\$$/.exec(pattern);
  if (m)
    return t("At most {max} characters, with no spaces at the start or end", {
      max: Number(m[1]) + 2,
    });
  m = /^\^\[\\s\\S\]\{(\d+),(\d+)\}\$$/.exec(pattern);
  if (m)
    return Number(m[1]) === 0
      ? t("At most {max} characters", { max: m[2]! })
      : t("Between {min} and {max} characters", { min: m[1]!, max: m[2]! });
  if (pattern === "^[a-z0-9][a-z0-9_-]{0,63}$")
    return t(
      "Lower-case letters, digits, - and _ (starting with a letter or digit), at most 64",
    );
  if (pattern.includes("-02-29")) return t("A date (YYYY-MM-DD)");
  if (pattern === "^(?!0000)") return t("Year 0000 is not a date");
  if (pattern.includes("[0-9a-fA-F]{8}") || pattern.includes("[0-9a-f]{8}"))
    return t("An id (UUID)");
  if (pattern.startsWith("^(?:https?:\\/\\/|\\/)"))
    return t("A web address or a path starting with /");
  if (pattern.startsWith("^https?:\\/\\/"))
    return t("A web address (http or https)");
  if (pattern === "^[a-z0-9-]{1,120}\\.webp$")
    return t("A file name such as club-name.webp");
  if (pattern.includes("@")) return t("An email address");
  if (pattern.startsWith("^[A-Za-z0-9_"))
    return t("Letters, digits and - _ only");
  return t("Not in the expected format");
}

const TYPE_NAMES: Record<string, string> = {
  string: t("text"),
  number: t("a number"),
  integer: t("a whole number"),
  boolean: t("yes or no"),
  object: t("an object"),
  array: t("a list"),
  null: t("empty"),
};

function typeMessage(types: string[], value: unknown): string {
  if (value === null || value === undefined) return t("Required");
  return t("Expected {types}", {
    types: types.map((name) => TYPE_NAMES[name] ?? name).join(t(" or ")),
  });
}

/** The branch of a failed anyOf/oneOf whose issues say most about `value`. */
function closestBranch(
  branches: JsonSchema[],
  value: unknown,
  path: string,
): SchemaIssue[] {
  if (branches.every((branch) => branch.const !== undefined)) {
    return [
      {
        path,
        message: t("One of: {options}", {
          options: branches.map((branch) => String(branch.const)).join(", "),
        }),
      },
    ];
  }
  const typed = branches.filter((branch) => {
    const types =
      branch.type === undefined ? null : ([] as unknown[]).concat(branch.type);
    return types === null || types.some((name) => hasType(value, String(name)));
  });
  if (typed.length === 0) {
    const types = branches.flatMap((branch) =>
      branch.type === undefined
        ? []
        : ([] as string[]).concat(branch.type as string),
    );
    return [{ path, message: typeMessage([...new Set(types)], value) }];
  }
  // Branches told apart by a const (`kind: 'win'`) whose const does not match are the wrong shape.
  const ranked = typed
    .map((branch) => {
      const issues = validateSchema(branch, value, path);
      return {
        issues,
        missed: issues.some((issue) => issue.message.startsWith("Must be ")),
      };
    })
    .sort(
      (a, b) =>
        Number(a.missed) - Number(b.missed) ||
        a.issues.length - b.issues.length,
    );
  return ranked[0]?.issues ?? [{ path, message: t("Not a valid value") }];
}

/** Every issue of `value` against `schema`; empty when it is valid. */
export function validateSchema(
  schema: JsonSchema,
  value: unknown,
  path = "",
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  if (schema.type !== undefined) {
    const types = ([] as unknown[]).concat(schema.type).map(String);
    if (!types.some((name) => hasType(value, name)))
      return [{ path, message: typeMessage(types, value) }];
  }
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    return [
      {
        path,
        message: t("Must be {value}", { value: JSON.stringify(schema.const) }),
      },
    ];
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((option) => deepEqual(option, value))
  ) {
    return [
      {
        path,
        message: t("One of: {options}", {
          options: schema.enum.map((option) => String(option)).join(", "),
        }),
      },
    ];
  }

  if (typeof value === "string") {
    const length =
      schema.minLength !== undefined || schema.maxLength !== undefined
        ? codePoints(value)
        : 0;
    if (typeof schema.minLength === "number" && length < schema.minLength)
      issues.push({
        path,
        message:
          schema.minLength === 1
            ? t("Required")
            : t("At least {min} characters", { min: schema.minLength }),
      });
    if (typeof schema.maxLength === "number" && length > schema.maxLength)
      issues.push({
        path,
        message: t("At most {max} characters", { max: schema.maxLength }),
      });
    if (
      typeof schema.pattern === "string" &&
      !compiled(schema.pattern).test(value)
    )
      issues.push({
        path,
        message: value === "" ? t("Required") : describePattern(schema.pattern),
      });
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum)
      issues.push({
        path,
        message: t("At least {min}", { min: schema.minimum }),
      });
    if (typeof schema.maximum === "number" && value > schema.maximum)
      issues.push({
        path,
        message: t("At most {max}", { max: schema.maximum }),
      });
    if (
      typeof schema.exclusiveMinimum === "number" &&
      value <= schema.exclusiveMinimum
    )
      issues.push({
        path,
        message: t("More than {min}", { min: schema.exclusiveMinimum }),
      });
    if (
      typeof schema.exclusiveMaximum === "number" &&
      value >= schema.exclusiveMaximum
    )
      issues.push({
        path,
        message: t("Less than {max}", { max: schema.exclusiveMaximum }),
      });
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems)
      issues.push({
        path,
        message:
          schema.minItems === 1
            ? t("Add at least one")
            : t("At least {min} items", { min: schema.minItems }),
      });
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
      issues.push({
        path,
        message: t("At most {max} items", { max: schema.maxItems }),
      });
    if (schema.items && typeof schema.items === "object")
      value.forEach((item, index) =>
        issues.push(
          ...validateSchema(
            schema.items as JsonSchema,
            item,
            join(path, index),
          ),
        ),
      );
  }

  if (typeOf(value) === "object") {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    for (const key of (schema.required ?? []) as string[]) {
      if (!Object.hasOwn(record, key))
        issues.push({ path: join(path, key), message: t("Required") });
    }
    for (const [key, item] of Object.entries(record)) {
      if (Object.hasOwn(properties, key)) {
        issues.push(...validateSchema(properties[key], item, join(path, key)));
      } else if (schema.additionalProperties === false) {
        issues.push({
          path: join(path, key),
          message: t("Not a field of this type"),
        });
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        issues.push(
          ...validateSchema(
            schema.additionalProperties as JsonSchema,
            item,
            join(path, key),
          ),
        );
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf as JsonSchema[])
      issues.push(...validateSchema(branch, value, path));
  }
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as JsonSchema[];
    if (
      !branches.some(
        (branch) => validateSchema(branch, value, path).length === 0,
      )
    )
      issues.push(...closestBranch(branches, value, path));
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as JsonSchema[];
    const passing = branches.filter(
      (branch) => validateSchema(branch, value, path).length === 0,
    ).length;
    if (passing === 0) issues.push(...closestBranch(branches, value, path));
    else if (passing > 1)
      issues.push({ path, message: t("Matches more than one shape") });
  }

  return issues;
}

/** Keywords a schema uses that this interpreter does not know (for the pin test). */
export function unsupportedKeywords(
  schema: unknown,
  found = new Set<string>(),
): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) unsupportedKeywords(item, found);
  } else if (schema && typeof schema === "object") {
    for (const [key, value] of Object.entries(schema)) {
      if (!SUPPORTED_KEYWORDS.has(key)) found.add(key);
      if (key === "properties")
        for (const property of Object.values(value as object))
          unsupportedKeywords(property, found);
      else if (key !== "enum" && key !== "const" && key !== "required")
        unsupportedKeywords(value, found);
    }
  }
  return found;
}
