/**
 * ARCHIVED VERIFICATION ROUTING
 * Original location: frontend/dashboard/src/App.tsx (inside SessionRouter)
 * Archived on: 2026-10-26
 *
 * This snippet was used in SessionRouter to gate accounts that hadn't verified
 * their email address through an OTP flow.
 */

/*
    const isGoogleAccount =
      profile.registration_provider === "google" ||
      session?.user?.app_metadata?.provider === "google" ||
      Boolean(
        (session?.user?.app_metadata?.providers as string[] | undefined)?.includes(
          "google",
        ),
      );

    if (
      !profile.profile_complete &&
      !isGoogleAccount &&
      !profile.onboarding_email_verified_at
    )
      return (
        <GoogleVerification
          profile={profile}
          onVerified={() => setAttempt((x) => x + 1)}
          onSignOut={signOut}
        />
      );
*/
