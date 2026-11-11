import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useStore } from "../store";
import { Alert, Field, useAsync } from "../components/ui";
import GoogleButton from "../components/GoogleButton";
import OtpStep from "../components/OtpStep";

export default function Login() {
  const { login, finishLogin } = useStore();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/";
  const [mode, setMode] = useState(sp.get("mode") === "code" ? "code" : "password");
  const [providers, setProviders] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAsync();

  useEffect(() => {
    api.auth.providers().then(setProviders).catch(() => setProviders({ password: true, otp: { email: true, sms: false } }));
  }, []);

  // After any successful sign-in the GuestOnly wrapper redirects to ?next=, so handlers only set the session.
  const submit = async (e) => {
    e.preventDefault();
    try {
      await run(() => login(email, password));
    } catch {}
  };
  const onCodeVerified = (result) => finishLogin(result);
  const forgot = () => {
    setMode("code");
    // Code sign-in, then straight to "choose a new password".
    navigate(`/login?mode=code&reset=1&next=${encodeURIComponent("/account?reset=1")}`, { replace: true });
  };

  return (
    <section className="section auth">
      <div className="auth__card">
        <h1>Sign in</h1>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "password"} className={mode === "password" ? "is-active" : ""} onClick={() => setMode("password")}>Password</button>
          <button type="button" role="tab" aria-selected={mode === "code"} className={mode === "code" ? "is-active" : ""} onClick={() => setMode("code")}>One-time code</button>
        </div>

        {mode === "password" ? (
          <form onSubmit={submit} className="otp">
            {error && <Alert kind="error">{error.message}</Alert>}
            <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required minLength={8} /></Field>
            <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <button type="button" className="link" onClick={forgot}>Forgot your password?</button>
          </form>
        ) : (
          <>
            {sp.get("reset") && <p className="small muted">Sign in with a code sent to your email or mobile, then choose a new password.</p>}
            {providers && <OtpStep purpose="login" channels={providers.otp} defaultDestination={email} onVerified={onCodeVerified} submitLabel="Sign in" />}
          </>
        )}

        <GoogleButton text="signin_with" />
        <p className="muted small">New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
      </div>
    </section>
  );
}
