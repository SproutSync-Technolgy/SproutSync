import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Pencil } from "lucide-react";
import { Btn, Logo } from "./ProtoPrimitives";
import { errorMessage, saveProfile, type Profile } from "../data/workspace";

export function PersonalDetails({
  profile,
  onSaved,
  onSignOut,
  editing = false,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onSignOut?: () => Promise<void>;
  editing?: boolean;
}) {
  const google = profile.registration_provider === "google";
  const [values, setValues] = useState({
    first_name: profile.first_name,
    last_name: profile.last_name,
    organization: profile.organization,
    phone: profile.phone,
  });
  const [editDetails, setEditDetails] = useState(
    editing || !google || !profile.first_name,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Profile | null>(null);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => onSaved(saved), 1000);
    return () => clearTimeout(timer);
  }, [saved, onSaved]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await saveProfile(values);
      if (editing) onSaved(next);
      else setSaved(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (saved)
    return (
      <main className="account-page">
        <div className="account-card text-center" role="status">
          <CheckCircle2 className="mx-auto mb-5 text-primary" size={52} />
          <h1 className="text-2xl font-bold">Your account is ready</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Opening your dashboard…
          </p>
        </div>
      </main>
    );
  const form = (
    <>
      <div className="flex items-center gap-4">
        {google && profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Your Google profile"
            className="h-16 w-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <Logo className="h-16 w-16" />
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {editing ? "Your profile" : "Profile details"}
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            {editing
              ? "Personal details"
              : google
                ? "Is this information correct?"
                : "Let’s get to know you"}
          </h1>
        </div>
      </div>
      <p className="mt-3 mb-6 text-sm text-muted-foreground break-all">
        {profile.email}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="space-y-4">
          {editDetails ? (
            (
              [
                ["first_name", "First name", 80, "given-name"],
                [
                  "last_name",
                  google ? "Last name (optional)" : "Last name",
                  80,
                  "family-name",
                ],
                [
                  "organization",
                  "Organization (optional)",
                  160,
                  "organization",
                ],
                ["phone", "Phone (optional)", 40, "tel"],
              ] as const
            ).map(([key, label, max, autocomplete]) => (
              <label className="field" key={key}>
                {label}
                <input
                  required={
                    key === "first_name" || (key === "last_name" && !google)
                  }
                  maxLength={max}
                  autoComplete={autocomplete}
                  type={key === "phone" ? "tel" : "text"}
                  value={values[key]}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                />
              </label>
            ))
          ) : (
            <>
              <dl className="detail-grid rounded-xl bg-secondary p-5">
                {[
                  ["First name", values.first_name],
                  ["Last name", values.last_name || "Not provided"],
                  ["Email", profile.email],
                  ["Organization", values.organization || "Not provided"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="table-link"
                onClick={() => setEditDetails(true)}
              >
                <Pencil size={15} />
                Edit information
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="feedback-error">
              {error}
            </p>
          )}
          <Btn type="submit" disabled={busy} className="w-full">
            {busy
              ? "Saving…"
              : editing
                ? "Save changes"
                : google
                  ? "Confirm & continue"
                  : "Open dashboard"}
          </Btn>
        </fieldset>
      </form>
      {onSignOut && (
        <button
          disabled={busy}
          className="mt-5 text-sm text-muted-foreground"
          onClick={() =>
            void onSignOut().catch((e) => setError(errorMessage(e)))
          }
        >
          Use another account
        </button>
      )}
    </>
  );
  return editing ? (
    <div>{form}</div>
  ) : (
    <main className="account-page">
      <div className="account-card">{form}</div>
    </main>
  );
}
