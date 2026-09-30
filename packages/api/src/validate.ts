import type { ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import type { z } from "zod";

/** `%term%` for ILIKE with the user's %, _ and \ escaped. */
export function likePattern(term: string) {
  return `%${term.replace(/[%_\\]/g, "\\$&")}%`;
}

/** zod validation for Hono routes; responds 400 with field errors. */
export function validate<T extends keyof ValidationTargets, S extends z.ZodType>(target: T, schema: S) {
  return validator(target, (value) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new HTTPException(400, {
        res: Response.json(
          { error: "Invalid request", issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          { status: 400 },
        ),
      });
    }
    return result.data as z.output<S>;
  });
}
