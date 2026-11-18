'use strict';

// Combine overlapping requests while preserving an explicit forced refresh.
function createRefreshGate(scan, now = Date.now, maxAge = 14000) {
 let last = 0, hasValue = false, value, pending = null, forcePending = false;
 return function request(force = false) {
  forcePending ||= force === true;
  if (pending) return pending;
  pending = new Promise((resolve, reject) => setImmediate(() => {
   try {
    if (forcePending || !hasValue || now() - last > maxAge) {
     value = scan();
     last = now();
     hasValue = true;
    }
    resolve(value);
   } catch (e) { reject(e); }
   finally { forcePending = false; pending = null; }
  }));
  return pending;
 };
}
module.exports = {createRefreshGate};
