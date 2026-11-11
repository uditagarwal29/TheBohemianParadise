import { useState } from "react";

export function Qty({ value, max = 20, onChange, disabled }) {
  return (
    <div className="qty" role="group" aria-label="Quantity">
      <button type="button" onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label="Decrease">−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="Increase">+</button>
    </div>
  );
}

export function Field({ label, error, children, hint }) {
  return (
    <label className={`field ${error ? "field--error" : ""}`}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Alert({ kind = "info", children }) {
  return <div className={`alert alert--${kind}`}>{children}</div>;
}

export function Spinner({ label = "Loading…" }) {
  return <div className="page-loading">{label}</div>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export const EMPTY_ADDRESS = { fullName: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "IN" };

export function AddressForm({ value, onChange, errors = {} }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="address-form">
      <Field label="Full name" error={errors.fullName}><input value={value.fullName} onChange={set("fullName")} autoComplete="name" required /></Field>
      <Field label="Phone" error={errors.phone}><input value={value.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" required /></Field>
      <Field label="Address line 1" error={errors.line1}><input value={value.line1} onChange={set("line1")} autoComplete="address-line1" required /></Field>
      <Field label="Address line 2 (optional)" error={errors.line2}><input value={value.line2} onChange={set("line2")} autoComplete="address-line2" /></Field>
      <div className="address-form__row">
        <Field label="City" error={errors.city}><input value={value.city} onChange={set("city")} autoComplete="address-level2" required /></Field>
        <Field label="State" error={errors.state}><input value={value.state} onChange={set("state")} autoComplete="address-level1" required /></Field>
        <Field label="PIN code" error={errors.postalCode}><input value={value.postalCode} onChange={set("postalCode")} autoComplete="postal-code" inputMode="numeric" required /></Field>
      </div>
    </div>
  );
}

export function formatAddress(a) {
  if (!a) return "";
  return [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`, a.phone].filter(Boolean).join(" · ");
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

export const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  processing: "Being packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  payment_failed: "Payment failed",
  refunded: "Refunded",
};
