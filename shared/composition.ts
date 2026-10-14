import { z } from "zod";
export const phrasingSchema = z
  .object({
    opening: z.enum([
      "none",
      "got-you",
      "lets-stop",
      "heres-an-option",
      "on-it",
    ]),
    detail: z.enum(["brief", "compare"]),
  })
  .strict();
export type Phrasing = z.infer<typeof phrasingSchema>;
export const openings: Record<Phrasing["opening"], string> = {
  none: "",
  "got-you": "Got you. ",
  "lets-stop": "Let's make a stop. ",
  "heres-an-option": "Here's an option. ",
  "on-it": "On it. ",
};
export function composerInput(
  request: string,
  driving: boolean,
  receipts: unknown[],
) {
  return {
    request: request.slice(0, 1000),
    driving,
    verifiedReceipts: receipts.slice(-6),
    allowedOpenings: Object.keys(openings),
    allowedDetail: driving ? ["brief"] : ["brief", "compare"],
  };
}
export function groundedPhrasing(
  value: unknown,
  driving: boolean,
): Phrasing | null {
  const parsed = phrasingSchema.safeParse(value);
  return parsed.success
    ? { ...parsed.data, detail: driving ? "brief" : parsed.data.detail }
    : null;
}
