import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useStore } from "../store";
import { Alert, Field, useAsync } from "../components/ui";
import GoogleButton from "../components/GoogleButton";
import OtpStep from "../components/OtpStep";

// 1) verify an email or mobile with a code  2) name + password  -> account
export default function Register() {
  const { finishLogin } = useStore();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/";
  const [providers, setProviders] = useState(null);
  const [verified, setVerified] = useState(null); // { verificationToken, channel, destination }
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const { busy, error, run, setError } = useAsync();

  useEffect(() => {
    api.auth.providers().then(setProviders).catch(() => setProviders({ password: true, otp: { email: true, sms: false } }));
  }, []);

  const onVerified = (r, { channel, destination }) => {
    setVerified({ verificationToken: r.verificationToken, channel, destination: r.destination || destination });
    setForm((f) => (channel === "email" ? { ...f, email: destination } : { ...f, phone: destination }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError(new Error("Passwords don't match"));
    try {
      const result = await run(() => api.auth.register({ name: form.name, email: form.email, phone: form.phone || undefined, password: form.password, verificationToken: verified.verificationToken }));
      await finishLogin(result); // GuestOnly then redirects to ?next=
    } catch {}
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section className="section auth">
      <div className="auth__card">
        <h1>Create an account</h1>
        <ol className="steps">
          <li className={!verified ? "is-current" : "is-done"}>Verify contact</li>
          <li className={verified ? "is-current" : ""}>Your details</li>
        </ol>

        {!verified ? (
          <>
            {providers && <OtpStep purpose="register" channels={providers.otp} onVerified={onVerified} submitLabel="Continue" />}
            <GoogleButton text="signup_with" />
          </>
        ) : (
          <form onSubmit={submit} className="otp">
            <Alert kind="success">{verified.channel === "email" ? "Email" : "Mobile"} verified: {verified.destination}</Alert>
            {error && <Alert kind="error">{error.message}{error.details && <ul>{Object.entries(error.details).map(([k, v]) => <li key={k}>{k} {v}</li>)}</ul>}</Alert>}
            <Field label="Name"><input value={form.name} onChange={set("name")} autoComplete="name" required autoFocus /></Field>
            {verified.channel === "sms" ? (
              <Field label="Email" hint="For order updates and receipts"><input type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
            ) : (
              <Field label="Mobile (optional)" hint="Lets you sign in with an SMS code too"><input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" /></Field>
            )}
            <Field label="Password" hint="At least 8 characters"><input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" required minLength={8} /></Field>
            <Field label="Confirm password"><input type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" required minLength={8} /></Field>
            <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
          </form>
        )}
        <p className="muted small">Already have one? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
      </div>
    </section>
  );
}
