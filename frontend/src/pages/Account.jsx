import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { AddressForm, Alert, EMPTY_ADDRESS, Field, formatAddress, useAsync } from "../components/ui";

export default function Account() {
  const { user, setUser, notify, logout } = useStore();
  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [addr, setAddr] = useState(null); // null = closed, object = editing
  const p = useAsync();
  const s = useAsync();
  const a = useAsync();

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const { user: u } = await p.run(() => api.users.update(profile));
      setUser({ ...user, ...u });
      notify("Profile updated", "success");
    } catch {}
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await s.run(() => api.users.changePassword(pw.currentPassword, pw.newPassword));
      notify("Password changed. Please sign in again.", "success");
      logout();
    } catch {}
  };

  const addAddress = async (e) => {
    e.preventDefault();
    try {
      const { addresses } = await a.run(() => api.users.addAddress(addr));
      setUser({ ...user, addresses });
      setAddr(null);
    } catch {}
  };

  const removeAddress = async (id) => {
    const { addresses } = await api.users.removeAddress(id);
    setUser({ ...user, addresses });
  };

  return (
    <section className="section account">
      <h1>Your account</h1>
      <div className="account__grid">
        <form className="panel" onSubmit={saveProfile}>
          <h2>Profile</h2>
          {p.error && <Alert kind="error">{p.error.message}</Alert>}
          <Field label="Name"><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></Field>
          <Field label="Email"><input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required /></Field>
          <button className="btn btn--primary" disabled={p.busy}>Save</button>
        </form>

        <form className="panel" onSubmit={changePassword}>
          <h2>Password</h2>
          {s.error && <Alert kind="error">{s.error.message}</Alert>}
          <Field label="Current password"><input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" required /></Field>
          <Field label="New password" hint="At least 8 characters"><input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" minLength={8} required /></Field>
          <button className="btn btn--primary" disabled={s.busy}>Change password</button>
        </form>

        <div className="panel panel--wide">
          <h2>Addresses</h2>
          {user.addresses?.length ? (
            <ul className="addresses">
              {user.addresses.map((x) => (
                <li key={x._id}><span>{formatAddress(x)}</span><button className="link danger" onClick={() => removeAddress(x._id)}>Remove</button></li>
              ))}
            </ul>
          ) : (
            <p className="muted">No saved addresses yet.</p>
          )}
          {addr ? (
            <form onSubmit={addAddress}>
              {a.error && <Alert kind="error">{a.error.message}</Alert>}
              <AddressForm value={addr} onChange={setAddr} errors={a.error?.details || {}} />
              <div className="row">
                <button className="btn btn--primary" disabled={a.busy}>Save address</button>
                <button type="button" className="btn btn--ghost" onClick={() => setAddr(null)}>Cancel</button>
              </div>
            </form>
          ) : (
            user.addresses?.length < 5 && <button className="btn btn--ghost" onClick={() => setAddr(EMPTY_ADDRESS)}>Add an address</button>
          )}
        </div>
      </div>
    </section>
  );
}
