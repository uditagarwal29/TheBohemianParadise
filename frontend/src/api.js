const TOKEN_KEY = "tbp.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.details = body?.details;
    this.body = body;
  }
}

async function request(method, path, body, { auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = auth && getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("tbp:logout"));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}


const qs = (params) => {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => v !== undefined && v !== "" && v !== null && sp.set(k, v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const api = {
  get: (p, opts) => request("GET", p, undefined, opts),
  post: (p, b, opts) => request("POST", p, b, opts),
  put: (p, b, opts) => request("PUT", p, b, opts),
  patch: (p, b, opts) => request("PATCH", p, b, opts),
  delete: (p, opts) => request("DELETE", p, undefined, opts),

  products: {
    list: (params) => request("GET", `/products${qs({ limit: 12, ...params })}`),
    categories: () => request("GET", "/products/categories"),
    one: (idOrSlug) => request("GET", `/products/${encodeURIComponent(idOrSlug)}`),
  },
  auth: {
    login: (email, password) => request("POST", "/auth/login", { email, password }, { auth: false }),
    register: (name, email, password) => request("POST", "/auth/register", { name, email, password }, { auth: false }),
    me: () => request("GET", "/auth/me"),
  },
  cart: {
    validate: (items) => request("POST", "/carts/validate", { items }, { auth: false }),
    me: () => request("GET", "/carts/me"),
    replace: (items) => request("PUT", "/carts/me", { items }),
    merge: (items) => request("POST", "/carts/me/merge", { items }),
    add: (line) => request("POST", "/carts/me/items", line),
    setQty: (productId, size, qty) => request("PATCH", `/carts/me/items/${productId}${qs({ size })}`, { qty }),
    remove: (productId, size) => request("DELETE", `/carts/me/items/${productId}${qs({ size })}`),
  },
  orders: {
    paymentMethods: () => request("GET", "/orders/payment-methods", undefined, { auth: false }),
    checkout: (payload) => request("POST", "/orders/checkout", payload),
    mine: () => request("GET", "/orders/me"),
    one: (id) => request("GET", `/orders/${id}`),
    cancel: (id) => request("POST", `/orders/${id}/cancel`),
    paymentReference: (id, reference) => request("POST", `/orders/${id}/payment-reference`, { reference }),
  },
  users: {
    update: (data) => request("PATCH", "/users/me", data),
    changePassword: (currentPassword, newPassword) => request("POST", "/users/me/password", { currentPassword, newPassword }),
    addAddress: (a) => request("POST", "/users/me/addresses", a),
    removeAddress: (id) => request("DELETE", `/users/me/addresses/${id}`),
  },
};

export const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (n) => inr.format(n || 0);

// ---- admin ------------------------------------------------------------------
async function upload(path, files) {
  const fd = new FormData();
  for (const f of files) fd.append("images", f);
  const res = await fetch(`/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

api.admin = {
  dashboard: () => request("GET", "/admin/dashboard"),
  settings: () => request("GET", "/admin/settings"),
  revenueByDay: (days) => request("GET", `/admin/analytics/revenue-by-day${qs({ days })}`),
  products: (params) => request("GET", `/products/admin/list${qs(params)}`),
  product: (id) => request("GET", `/products/admin/${id}`),
  createProduct: (data) => request("POST", "/products", data),
  updateProduct: (id, data) => request("PATCH", `/products/${id}`, data),
  adjustStock: (id, delta, size) => request("POST", `/products/${id}/stock`, { delta, size }),
  hideProduct: (id) => request("DELETE", `/products/${id}`),
  restoreProduct: (id) => request("POST", `/products/${id}/restore`),
  uploadImages: (files) => upload("/products/images", files),
  uploadProductImages: (id, files) => upload(`/products/${id}/images`, files),
  removeImage: (id, url) => request("DELETE", `/products/${id}/images`, { url }),
  orders: (params) => request("GET", `/orders${qs(params)}`),
  order: (id) => request("GET", `/orders/admin/${id}`),
  setOrderStatus: (id, body) => request("PATCH", `/orders/${id}/status`, body),
  users: (params) => request("GET", `/users${qs(params)}`),
  user: (id) => request("GET", `/users/${id}`),
  updateUser: (id, body) => request("PATCH", `/users/${id}`, body),
};
