import { LINK_CODE_PATTERN } from '@/core/limits';

// A guardian link code is 6 letters and digits. A child reads it out, so the
// guardian may type it with spaces or dashes, in either case; the server takes
// it in one canonical form (backend authRoutes/methods/parentLinkMethods.ts).

/** The code as the server wants it: spaces and dashes dropped, in capitals. */
export function normalizeLinkCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** Whether a typed code, once normalised, has the 6-character link code form. */
export function isLinkCode(value: string): boolean {
  return new RegExp(LINK_CODE_PATTERN).test(normalizeLinkCode(value));
}

/** The code in two groups of three, for showing and reading aloud: "ABC234" -> ["ABC", "234"]. */
export function groupLinkCode(code: string): string[] {
  return code.length === 6 ? [code.slice(0, 3), code.slice(3)] : [code];
}
