// Observer: a tiny synchronous domain-event bus.
// Publishers (order state machine, catalog) emit facts; subscribers (inventory, analytics)
// react without the publisher knowing they exist (Open/Closed, Dependency Inversion).
// Listeners are awaited in registration order so side effects complete before the
// publisher continues (e.g. stock is released before the order is saved).
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter((h) => h !== handler));
  }

  async emit(event, payload) {
    const exact = this.listeners.get(event) || [];
    const wildcard = this.listeners.get("*") || [];
    for (const handler of [...exact, ...wildcard]) await handler(payload, event);
  }
}

module.exports = { EventBus };
