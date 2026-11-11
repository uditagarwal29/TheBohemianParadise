import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, getToken, setToken } from "./api";

const LOCAL_CART = "tbp.cart";
const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CART) || "[]");
  } catch {
    return [];
  }
};
const writeLocal = (items) => localStorage.setItem(LOCAL_CART, JSON.stringify(items));
const lineKey = (l) => `${l.productId}|${l.size || ""}`;

const EMPTY = { items: [], problems: [], subtotal: 0, shipping: 0, total: 0, currency: "inr" };

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [cart, setCart] = useState(EMPTY);
  const [cartLoading, setCartLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message, kind = "info") => {
    setToast({ message, kind, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ---- auth --------------------------------------------------------------
  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const { user } = await api.auth.me();
          setUser(user);
        } catch {
          setToken(null);
        }
      }
      setAuthReady(true);
    })();
    const onLogout = () => setUser(null);
    window.addEventListener("tbp:logout", onLogout);
    return () => window.removeEventListener("tbp:logout", onLogout);
  }, []);

  // ---- cart --------------------------------------------------------------
  const refreshCart = useCallback(async (signedIn = Boolean(getToken())) => {
    setCartLoading(true);
    try {
      if (signedIn) {
        setCart(await api.cart.me());
      } else {
        const local = readLocal();
        if (!local.length) return setCart(EMPTY);
        const priced = await api.cart.validate(local);
        // keep the browser copy in sync with what the server says is still buyable
        writeLocal(priced.items.map(({ productId, size, qty, unitPrice }) => ({ productId, size, qty, unitPrice })));
        setCart(priced);
      }
    } catch (e) {
      if (e.status !== 401) notify(e.message, "error");
    } finally {
      setCartLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (authReady) refreshCart(Boolean(user));
  }, [authReady, user, refreshCart]);

  const addToCart = useCallback(
    async (product, size, qty = 1, unitPrice) => {
      const line = { productId: product._id || product.id, size: size || undefined, qty, unitPrice };
      if (user) {
        setCart(await api.cart.add({ productId: line.productId, size: line.size, qty }));
      } else {
        const local = readLocal();
        const i = local.findIndex((l) => lineKey(l) === lineKey(line));
        if (i >= 0) local[i].qty = Math.min(20, local[i].qty + qty);
        else local.push(line);
        writeLocal(local);
        setCart(await api.cart.validate(local));
      }
      notify(`${product.title} added to your bag`, "success");
    },
    [user, notify]
  );

  const setQty = useCallback(
    async (productId, size, qty) => {
      if (user) {
        setCart(await api.cart.setQty(productId, size, qty));
      } else {
        let local = readLocal();
        const i = local.findIndex((l) => lineKey(l) === lineKey({ productId, size }));
        if (i >= 0) {
          if (qty <= 0) local.splice(i, 1);
          else local[i].qty = qty;
        }
        writeLocal(local);
        setCart(local.length ? await api.cart.validate(local) : EMPTY);
      }
    },
    [user]
  );

  const clearLocalCart = () => writeLocal([]);

  // ---- session -----------------------------------------------------------
  const finishLogin = useCallback(
    async ({ user, accessToken }) => {
      setToken(accessToken);
      const local = readLocal();
      if (local.length) {
        try {
          await api.cart.merge(local.map(({ productId, size, qty }) => ({ productId, size, qty })));
          clearLocalCart();
        } catch {
          /* cart stays local; will be retried on next refresh */
        }
      }
      setUser(user);
    },
    []
  );

  const login = useCallback(async (email, password) => finishLogin(await api.auth.login(email, password)), [finishLogin]);
  const register = useCallback(async (name, email, password) => finishLogin(await api.auth.register(name, email, password)), [finishLogin]);
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setCart(EMPTY);
    notify("Signed out");
  }, [notify]);

  const value = useMemo(
    () => ({
      user,
      authReady,
      setUser,
      login,
      register,
      logout,
      cart,
      cartLoading,
      cartCount: cart.items.reduce((s, i) => s + i.qty, 0),
      refreshCart,
      addToCart,
      setQty,
      removeFromCart: (productId, size) => setQty(productId, size, 0),
      toast,
      notify,
    }),
    [user, authReady, login, register, logout, cart, cartLoading, refreshCart, addToCart, setQty, toast, notify]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
