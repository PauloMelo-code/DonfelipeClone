import { NextResponse } from "next/server";
import type { z } from "zod/v4";

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

export function validateBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Dados invalidos",
          details: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
