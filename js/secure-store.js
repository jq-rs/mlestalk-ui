/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2019-2026 MlesTalk developers
 *
 * Secure Storage Wrapper
 *
 * Uses cordova-plugin-secure-storage on Android (hardware-backed keystore)
 * with automatic fallback to localStorage for browser environments.
 * Transparently migrates existing localStorage keys on first access.
 */

const SecureStore = (function () {
  let _storage = null;
  let _resolveReady = null;
  const _ready = new Promise(function (resolve) {
    _resolveReady = resolve;
  });

  // If cordova.js did not load (browser environment), resolve immediately
  // so callers don't block waiting for deviceready.
  if (typeof cordova === "undefined") {
    _resolveReady();
  }

  return {
    /**
     * Initialize the secure storage backend.
     * Must be called from the deviceready handler.
     */
    initCordova: function () {
      try {
        _storage = new cordova.plugins.SecureStorage(
          function () {
            _resolveReady();
          },
          function (error) {
            console.error(
              "SecureStorage init failed, using localStorage:",
              error,
            );
            _storage = null;
            _resolveReady();
          },
          "MlesTalk",
        );
      } catch (e) {
        console.error("SecureStorage unavailable:", e);
        _storage = null;
        _resolveReady();
      }
    },

    /**
     * Store a value.
     * @param {string} key
     * @param {string} value
     */
    set: function (key, value) {
      return _ready.then(function () {
        if (_storage) {
          return new Promise(function (resolve, reject) {
            _storage.set(
              function () {
                resolve();
              },
              function (err) {
                reject(err);
              },
              key,
              value,
            );
          });
        }
        window.localStorage.setItem(key, value);
      });
    },

    /**
     * Retrieve a value.  On first access after upgrade, transparently
     * migrates the key from localStorage into secure storage.
     * @param {string} key
     * @return {Promise<string|null>}
     */
    get: function (key) {
      return _ready.then(function () {
        if (_storage) {
          return new Promise(function (resolve, reject) {
            _storage.get(
              function (value) {
                resolve(value);
              },
              function () {
                // Not found in secure storage — try localStorage migration
                var fallback = window.localStorage.getItem(key);
                if (fallback !== null) {
                  _storage.set(
                    function () {
                      window.localStorage.removeItem(key);
                      resolve(fallback);
                    },
                    function () {
                      resolve(fallback);
                    },
                    key,
                    fallback,
                  );
                } else {
                  resolve(null);
                }
              },
              key,
            );
          });
        }
        return window.localStorage.getItem(key);
      });
    },

    /**
     * Remove a value from both secure storage and localStorage.
     * @param {string} key
     */
    remove: function (key) {
      return _ready.then(function () {
        // Always clean localStorage in case a migration left a remnant
        window.localStorage.removeItem(key);
        if (_storage) {
          return new Promise(function (resolve) {
            _storage.remove(
              function () {
                resolve();
              },
              function () {
                resolve();
              },
              key,
            );
          });
        }
      });
    },
  };
})();
