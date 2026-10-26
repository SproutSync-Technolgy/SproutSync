# SproutSync Archived Email Verification Assets

## Summary
Per user direction ("Remove the Anything related to email verification just archive it all for now google sso login in/out"), all email verification requirements, OTP modal steps, and database-level gating have been bypassed and archived.

Google SSO and direct credentials log in and out seamlessly directly into the SproutSync workspace without encountering rate limits or email verification roadblocks.

---

## Archived Components & Snippets

1. **`GoogleVerification.archived.tsx`**  
   - **Path**: `frontend/dashboard/src/assets/archive/GoogleVerification.archived.tsx`  
   - **Description**: The dedicated 6-digit OTP verification screen that supported cooldown timers, multi-attempt retries, and resending codes.  
   - **Active Replacement**: In `frontend/dashboard/src/components/GoogleVerification.tsx`, replaced with an immediate no-op resolution.

2. **`verificationRouting.archived.tsx`**  
   - **Path**: `frontend/dashboard/src/assets/archive/verificationRouting.archived.tsx`  
   - **Description**: The conditional routing gate in `App.tsx` that previously redirected users with `!profile.onboarding_email_verified_at` to the `<GoogleVerification />` screen.  
   - **Active Replacement**: Removed from active routing so users transition directly to `PersonalDetails` (if profile incomplete) or `Workspace`.

3. **`ProtoAuth.archived.tsx`**  
   - **Path**: `frontend/dashboard/src/assets/archive/ProtoAuth.archived.tsx`  
   - **Description**: The original authentication modal containing `verify` and `verify-recovery` modes, OTP inputs, countdown timers, and Supabase Auth `verifyOtp` calls.  
   - **Active Replacement**: `ProtoAuth.tsx` now supports direct login, registration, and Google SSO without OTP interruption.

4. **`PersonalDetailsVerification.archived.tsx`**  
   - **Path**: `frontend/dashboard/src/assets/archive/PersonalDetailsVerification.archived.tsx`  
   - **Description**: The `"Email verified"` status badge previously rendered above personal details.  
   - **Active Replacement**: Replaced with `"Profile details"` to eliminate all verification wording.

---

## Restoration Guide (When Re-Enabling Verification)

When custom SMTP is configured and project email rate limits are lifted:
1. Restore routing in `frontend/dashboard/src/App.tsx` from `verificationRouting.archived.tsx`.
2. Restore `frontend/dashboard/src/components/GoogleVerification.tsx` from `GoogleVerification.archived.tsx`.
3. Restore `frontend/dashboard/src/components/ProtoAuth.tsx` from `ProtoAuth.archived.tsx`.
4. Restore `PersonalDetails.tsx` header from `PersonalDetailsVerification.archived.tsx`.
