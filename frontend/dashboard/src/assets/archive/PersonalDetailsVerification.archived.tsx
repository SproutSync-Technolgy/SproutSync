/**
 * ARCHIVED: PersonalDetails verification UI snippet
 * Archived per user instruction to remove all email verification requirements.
 *
 * Original code snippet from frontend/dashboard/src/components/PersonalDetails.tsx (line 76):
 *
 * <p className="text-xs font-semibold uppercase tracking-widest text-primary">
 *   {editing ? "Your profile" : "Email verified"}
 * </p>
 *
 * Replaced with:
 * <p className="text-xs font-semibold uppercase tracking-widest text-primary">
 *   {editing ? "Your profile" : "Profile details"}
 * </p>
 */

export const ARCHIVED_VERIFICATION_HEADER = {
  original: `{editing ? "Your profile" : "Email verified"}`,
  replacement: `{editing ? "Your profile" : "Profile details"}`,
};
