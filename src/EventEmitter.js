'use strict';

class EventEmitter {
  /**
   * @param {string[]} [allowedEvents] If given, only these event names are accepted.
   */
  constructor(allowedEvents) {
    this._listeners = new Map(); // eventName -> Array<{ fn, once }>
    this._allowed = allowedEvents ? new Set(allowedEvents) : null;
  }

  _assertKnown(event) {
    if (this._allowed && !this._allowed.has(event)) {
      throw new Error(
        `Unknown event "${event}". Expected one of: ${[...this._allowed].join(', ')}`
      );
    }
  }

  _add(event, fn, once) {
    this._assertKnown(event);
    if (typeof fn !== 'function') throw new TypeError('Listener must be a function');
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push({ fn, once });
    return this;
  }

  on(event, fn) {
    return this._add(event, fn, false);
  }

  once(event, fn) {
    return this._add(event, fn, true);
  }

  off(event, fn) {
    const list = this._listeners.get(event);
    if (!list) return this;
    this._listeners.set(event, list.filter((l) => l.fn !== fn));
    return this;
  }

  removeAllListeners(event) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
    return this;
  }

  /** @returns {boolean} true if at least one listener was called */
  emit(event, payload) {
    this._assertKnown(event);
    const list = this._listeners.get(event);
    if (!list || list.length === 0) return false;

    // Copy so listeners that call off()/once() during emit don't break iteration.
    for (const entry of [...list]) {
      if (entry.once) this.off(event, entry.fn);
      try {
        entry.fn(payload);
      } catch (err) {
        // A buggy listener must never break the download loop or other listeners.
        console.error(`[EventEmitter] Listener for "${event}" threw:`, err);
      }
    }
    return true;
  }
}

module.exports = { EventEmitter };
