import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

// Renders Google's own "Continue with Google" button (Google Identity Services).
// The browser gets an ID token from Google; we post it to /api/auth/google.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let scriptPromise = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load Google sign-in"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function GoogleButton({ onSuccess, text = "continue_with" }) {
  const { finishLogin } = useStore();
  const ref = useRef(null);
  const [state, setState] = useState(CLIENT_ID ? "loading" : "off");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
          callback: async ({ credential }) => {
            setError(null);
            try {
              const result = await api.auth.google(credential);
              await finishLogin(result);
              onSuccess?.(result);
            } catch (e) {
              setError(e.message);
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", width: 360, text, shape: "rectangular", logo_alignment: "left" });
        setState("ready");
      })
      .catch((e) => {
        if (!cancelled) {
          setState("error");
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [text, finishLogin, onSuccess]);

  if (state === "off") return null;
  return (
    <div className="google-btn">
      <div className="or"><span>or</span></div>
      <div ref={ref} className="google-btn__slot" aria-label="Continue with Google" />
      {state === "loading" && <p className="muted small">Loading Google sign-in…</p>}
      {error && <p className="field__error">{error}</p>}
    </div>
  );
}
