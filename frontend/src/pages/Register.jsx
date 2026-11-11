import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { Alert, Field, useAsync } from "../components/ui";
import GoogleButton from "../components/GoogleButton";

export default function Register() {
  const { register } = useStore();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/";
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const { busy, error, run, setError } = useAsync();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError(new Error("Passwords don't match"));
    try {
      await run(() => register(form.name, form.email, form.password));
      navigate(next, { replace: true });
    } catch {
      /* shown below */
    }
  };

  return (
    <section className="section auth">
      <form className="auth__card" onSubmit={submit}>
        <h1>Create an account</h1>
        {error && <Alert kind="error">{error.message}{error.details && <ul>{Object.entries(error.details).map(([k, v]) => <li key={k}>{k} {v}</li>)}</ul>}</Alert>}
        <Field label="Name"><input value={form.name} onChange={set("name")} autoComplete="name" required autoFocus /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
        <Field label="Password" hint="At least 8 characters"><input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" required minLength={8} /></Field>
        <Field label="Confirm password"><input type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" required minLength={8} /></Field>
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <GoogleButton text="signup_with" onSuccess={() => navigate(next, { replace: true })} />
        <p className="muted small">Already have one? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
      </form>
    </section>
  );
}
