import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Alert, Field, useAsync } from "./ui";

// Reusable "request a code, then type it" step.
// Props: purpose ('register'|'login'), channels ({email,sms} from providers), onVerified(result, {channel,destination})
export default function OtpStep({ purpose, channels, defaultChannel = "email", defaultDestination = "", onVerified, submitLabel = "Verify code" }) {
  const [channel, setChannel] = useState(channels?.[defaultChannel] ? defaultChannel : channels?.email ? "email" : "sms");
  const [destination, setDestination] = useState(defaultDestination);
  const [sentTo, setSentTo] = useState(null); // masked destination after a send
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const { busy, error, run, setError } = useAsync();
  const codeRef = useRef(null);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (e) => {
    e?.preventDefault();
    setError(null);
    try {
      const r = await run(() => api.auth.otpRequest({ purpose, channel, destination }));
      setSentTo(r.destination);
      setDevCode(r.devCode || null);
      setCooldown(45);
      setCode("");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {}
  };

  const verify = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await run(() => api.auth.otpVerify({ purpose, channel, destination, code }));
      onVerified(r, { channel, destination });
    } catch {}
  };

  const bothChannels = channels?.email && channels?.sms;

  if (!sentTo) {
    return (
      <form onSubmit={send} className="otp">
        {bothChannels && (
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={channel === "email"} className={channel === "email" ? "is-active" : ""} onClick={() => setChannel("email")}>Email</button>
            <button type="button" role="tab" aria-selected={channel === "sms"} className={channel === "sms" ? "is-active" : ""} onClick={() => setChannel("sms")}>Mobile (SMS)</button>
          </div>
        )}
        {error && <Alert kind="error">{error.message}</Alert>}
        {channel === "email" ? (
          <Field label="Email"><input type="email" value={destination} onChange={(e) => setDestination(e.target.value)} autoComplete="email" required autoFocus /></Field>
        ) : (
          <Field label="Mobile number" hint="10-digit Indian number, or include the country code"><input type="tel" value={destination} onChange={(e) => setDestination(e.target.value)} autoComplete="tel" inputMode="tel" required autoFocus /></Field>
        )}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Sending…" : `Send code by ${channel === "email" ? "email" : "SMS"}`}</button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="otp">
      <p className="small">We sent a 6-digit code to <strong>{sentTo}</strong>. <button type="button" className="link" onClick={() => { setSentTo(null); setError(null); }}>Change</button></p>
      {devCode && <Alert kind="info">Development mode: your code is <strong>{devCode}</strong></Alert>}
      {error && <Alert kind="error">{error.message}</Alert>}
      <Field label="Code">
        <input ref={codeRef} className="otp__code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      </Field>
      <button className="btn btn--primary btn--block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : submitLabel}</button>
      <button type="button" className="link" onClick={send} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>
    </form>
  );
}
