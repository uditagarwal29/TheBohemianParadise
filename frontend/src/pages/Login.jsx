import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { Alert, Field, useAsync } from "../components/ui";

export default function Login() {
  const { login } = useStore();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAsync();

  const submit = async (e) => {
    e.preventDefault();
    try {
      await run(() => login(email, password));
      navigate(next, { replace: true });
    } catch {
      /* error shown below */
    }
  };

  return (
    <section className="section auth">
      <form className="auth__card" onSubmit={submit}>
        <h1>Sign in</h1>
        {error && <Alert kind="error">{error.message}</Alert>}
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus /></Field>
        <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required minLength={8} /></Field>
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="muted small">New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
      </form>
    </section>
  );
}
