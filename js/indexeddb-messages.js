/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2019-2026 MlesTalk developers
 *
 * IndexedDB Message Persistence Module
 */

const MessageDB = {
    db: null,
    maxMessagesPerChannel: 2000,
    messageCounts: {}, // Cache of message counts per channel
    _readyCallbacks: [], // Queued callbacks waiting for DB to open

    /**
     * Run callback once DB is ready, or immediately if already open.
     */
    _whenReady: function(fn) {
        if (this.db) {
            fn();
        } else {
            this._readyCallbacks.push(fn);
        }
    },

    _flushReady: function() {
        const cbs = this._readyCallbacks.splice(0);
        cbs.forEach(fn => fn());
    },

    /**
     * Initialize the IndexedDB database
     */
     init: function(retried = false) {
         const request = indexedDB.open('mlestalk-messages', 1);
         request.onerror = () => {
             console.error('IndexedDB failed to open, attempting recovery...');
             if (retried) {
                 console.error('IndexedDB recovery failed, storage unavailable');
                 return;
             }
             const deleteRequest = indexedDB.deleteDatabase('mlestalk-messages');
             deleteRequest.onsuccess = () => {
                 console.log('IndexedDB deleted, retrying...');
                 MessageDB.init(true);
             };
             deleteRequest.onerror = () => {
                 console.error('IndexedDB recovery failed, storage unavailable');
             };
         };

        request.onsuccess = (event) => {
            this.db = event.target.result;
            console.log('IndexedDB opened successfully');
            // Initialize message counts cache
            this.initializeMessageCounts();
            // Flush any calls that arrived before DB was ready
            this._flushReady();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('messages')) {
                const store = db.createObjectStore('messages', { keyPath: 'id' });
                store.createIndex('channel', 'channel', { unique: false });
                store.createIndex('checksum', 'msgChksum', { unique: false });
                console.log('IndexedDB object store created');
            }
        };
    },

    /**
     * Initialize message counts for all channels
     */
    initializeMessageCounts: function() {
        if (!this.db) return;

        const transaction = this.db.transaction(['messages'], 'readonly');
        const store = transaction.objectStore('messages');
        const index = store.index('channel');
        const request = index.openCursor();
        const counts = {};

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const channel = cursor.value.channel;
                counts[channel] = (counts[channel] || 0) + 1;
                cursor.continue();
            } else {
                // All messages counted
                this.messageCounts = counts;
                //console.log('Message counts initialized:', counts);
            }
        };
    },

    /**
     * Get cached message count for a channel (synchronous)
     *
     * @param {string} channel - Channel name
     * @returns {number} Message count
     */
    getMessageCountSync: function(channel) {
        return this.messageCounts[channel] || 0;
    },

    /**
     * Save a message to IndexedDB
     * Only saves full messages (MSGISFULL flag)
     *
     * @param {string} channel - Channel name
     * @param {string} uid - User ID
     * @param {string} message - Message content
     * @param {number} timestamp - Message timestamp
     * @param {number} msgtype - Message type flags
     * @param {string} dataUrl - Optional data URL for images/audio
     * @param {string} msgChksum - Message checksum for unique ID
     */
    saveMessage: function(channel, uid, message, timestamp, msgtype, dataUrl = null, msgChksum = '', isOwn = false, fsEnabled = false, onSuccess = null) {
        if (!this.db) return;

        // Only save full messages (check MSGISFULL flag)
        if (!(msgtype & MSGISFULL)) return;

        const transaction = this.db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');

        const msg = {
            id: channel + '_' + timestamp + '_' + uid + '_' + msgChksum,
            channel: channel,
            uid: uid,
            message: message,
            timestamp: timestamp,
            msgtype: msgtype,
            dataUrl: dataUrl,
            msgChksum: msgChksum,
            isAudio: !!(msgtype & MSGISDATA) && message.startsWith('data:audio'),
            isImage: !!(msgtype & MSGISDATA) && message.startsWith('data:image'),
            isOwn: isOwn,
            fsEnabled: fsEnabled
        };

        // Check if message already exists to avoid incrementing count on updates
        const getRequest = store.get(msg.id);

        getRequest.onsuccess = () => {
            const exists = getRequest.result !== undefined;

            const putRequest = store.put(msg);

            putRequest.onsuccess = () => {
                // Only increment count for new messages, not updates
                if (!exists) {
                    this.messageCounts[channel] = (this.messageCounts[channel] || 0) + 1;
                }
                if (onSuccess) onSuccess();
            };
        };

        // After saving, check if we need to prune old messages
        this.pruneOldMessages(channel);
    },

    /**
     * Prune old messages to keep max 10000 per channel
     *
     * @param {string} channel - Channel name to prune
     */
    pruneOldMessages: function(channel) {
        if (!this.db) return;

        const transaction = this.db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const index = store.index('channel');
        const request = index.getAll(channel);

        request.onsuccess = () => {
            const messages = request.result || [];

            // If over max limit, delete oldest
            if (messages.length > this.maxMessagesPerChannel) {
                messages.sort((a, b) => a.timestamp - b.timestamp);

                // Delete oldest messages (keep newest maxMessagesPerChannel)
                const toDelete = messages.slice(0, messages.length - this.maxMessagesPerChannel);

                const deleteTx = this.db.transaction(['messages'], 'readwrite');
                const deleteStore = deleteTx.objectStore('messages');

                for (const msg of toDelete) {
                    deleteStore.delete(msg.id);
                }

                // Update cached count
                this.messageCounts[channel] = this.maxMessagesPerChannel;

                //console.log(`Pruned ${toDelete.length} old messages from ${channel}`);
            }
        };
    },

    /**
     * Load all messages for a channel
     *
     * @param {string} channel - Channel name
     * @param {function} callback - Callback function(messages)
     */
    loadMessages: function(channel, callback) {
        this._whenReady(() => {
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('channel');
            const request = index.getAll(channel);

            request.onsuccess = () => {
                const messages = request.result || [];
                messages.sort((a, b) => a.timestamp - b.timestamp);
                callback(messages);
            };

            request.onerror = () => {
                callback([]);
            };
        });
    },

    displayStoredMessages: function(channel, autolinker) {
        this.loadMessages(channel, (messages) => {
            if (messages.length === 0) return;

            console.log(`Loading ${messages.length} messages from IndexedDB for ${channel}`);

            const messagesContainer = document.getElementById('messages');
            if (!messagesContainer) return;

            // Clear existing messages in the UI
            messagesContainer.innerHTML = '';

            // Reset date separator counter if it exists globally
            if (typeof gDateSeparatorCnt !== 'undefined' && typeof gDateSeparatorCnt === 'object') {
                gDateSeparatorCnt[channel] = 0;
            }

            // Add channel header as first item
            if (typeof gMyName !== 'undefined' && gMyName[channel] && typeof gMyChannel !== 'undefined' && gMyChannel[channel]) {
                const channelHeader = '<li class="date"> - <span class="name">' + gMyName[channel] + '@' + gMyChannel[channel] + '</span> - </li>';
                messagesContainer.insertAdjacentHTML('beforeend', channelHeader);

                if (typeof gDateSeparatorCnt !== 'undefined' && typeof gDateSeparatorCnt === 'object') {
                    gDateSeparatorCnt[channel]++;
                }
            }

            let lastDate = null;
            let prevUser = null;
            let prevTime = null;

            for (const msg of messages) {
                // Reconstruct the message in the DOM
                const msgDate = new Date(msg.timestamp);
                const fullDateString = stampTime(msgDate);
                let dateString = "[" + fullDateString + "] ";
                updateDateval(msg.channel, dateString);

                // Extract just the date part for comparison (weekday + date, without time)
                const dateOnly = fullDateString.substring(0, fullDateString.lastIndexOf(' '));

                // Add date separator if date changed
                if (lastDate !== dateOnly) {
                    const dateSeparator = '<li class="date"> - <span class="name">' + dateOnly + '</span> - </li>';
                    messagesContainer.insertAdjacentHTML('beforeend', dateSeparator);
                    lastDate = dateOnly;

                    if (typeof gDateSeparatorCnt !== 'undefined' && typeof gDateSeparatorCnt === 'object') {
                        if (!gDateSeparatorCnt[channel]) gDateSeparatorCnt[channel] = 0;
                        gDateSeparatorCnt[channel]++;
                    }
                }

                // Format time with brackets
                const time = '[' + msgDate.getHours() + ':' +
                            ('0' + msgDate.getMinutes()).slice(-2) + '] ';

                // Check if we should skip time display (same user, same minute)
                let displayTime = time;
                if (prevUser === msg.uid && prevTime === time) {
                    displayTime = '';
                } else {
                    prevUser = msg.uid;
                    prevTime = time;
                }

                // Build message HTML using shared helper
                const msgContent = (msg.isImage || msg.isAudio) ? (msg.dataUrl || msg.message) :
                    (autolinker ? autolinker.link(msg.message) : msg.message).replace(/\n/g, '<br>');
                const li = buildMessageHtml(msg.uid, displayTime, msgContent, {
                    isOwn: msg.isOwn,
                    fsEnabled: msg.fsEnabled,
                    isAudio: !!(msg.isAudio && msg.dataUrl),
                    isImage: !!(msg.isImage && msg.dataUrl)
                });

                messagesContainer.insertAdjacentHTML('beforeend', li);
            }

            // Scroll to bottom if function exists
            if (typeof scrollToBottom === 'function') {
                scrollToBottom();
            }

        });
    },

    /**
     * Delete all messages for a channel
     *
     * @param {string} channel - Channel name
     */
    deleteChannel: function(channel) {
        if (!this.db) return;

        const transaction = this.db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const index = store.index('channel');
        const request = index.getAllKeys(channel);

        request.onsuccess = () => {
            const keys = request.result || [];

            if (keys.length > 0) {
                const deleteTx = this.db.transaction(['messages'], 'readwrite');
                const deleteStore = deleteTx.objectStore('messages');

                for (const key of keys) {
                    deleteStore.delete(key);
                }

                // Update cached count
                delete this.messageCounts[channel];

                console.log(`Deleted ${keys.length} messages from ${channel}`);
            }
        };
    },

    /**
     * Get message count for a channel
     *
     * @param {string} channel - Channel name
     * @param {function} callback - Callback function(count)
     */
    getMessageCount: function(channel, callback) {
        if (!this.db) {
            callback(0);
            return;
        }

        const transaction = this.db.transaction(['messages'], 'readonly');
        const store = transaction.objectStore('messages');
        const index = store.index('channel');
        const request = index.count(channel);

        request.onsuccess = () => {
            callback(request.result || 0);
        };

        request.onerror = () => {
            callback(0);
        };
    },

    /**
     * Check if a message already exists in IndexedDB
     *
     * @param {string} channel - Channel name
     * @param {string} uid - User ID
     * @param {number} timestamp - Message timestamp
     * @param {string} msgChksum - Message checksum for unique ID
     * @param {function} callback - Callback function(exists)
     */
    messageExists: function(channel, uid, timestamp, msgChksum, callback) {
        if (!this.db) {
            callback(false);
            return;
        }

        const messageId = channel + '_' + timestamp + '_' + uid + '_' + msgChksum;
        const transaction = this.db.transaction(['messages'], 'readonly');
        const store = transaction.objectStore('messages');
        const request = store.get(messageId);

        request.onsuccess = () => {
            callback(request.result !== undefined);
        };

        request.onerror = () => {
            callback(false);
        };
    },

    /**
     * Check if a message exists by checksum alone (ignores timestamp differences)
     *
     * @param {string} channel - Channel name
     * @param {string} msgChksum - Message checksum
     * @param {function} callback - Callback function(exists)
     */
    checksumExists: function(channel, msgChksum, callback) {
        if (!this.db) {
            callback(false);
            return;
        }

        const transaction = this.db.transaction(['messages'], 'readonly');
        const store = transaction.objectStore('messages');
        const index = store.index('checksum');
        const request = index.get(msgChksum);

        request.onsuccess = () => {
            const result = request.result;
            // Check if the result exists and is for the correct channel
            if (result && result.channel === channel) {
                callback(true);
            } else {
                callback(false);
            }
        };

        request.onerror = () => {
            callback(false);
        };
    },

    /**
     * Load all checksums for a channel into a Set in one bulk read.
     * Used at channel join time to pre-populate gSeenChksums so that
     * per-message checksumExists() calls are no longer needed during resync.
     */
    getAllChecksums: function(channel, callback) {
        this._whenReady(() => {
            const checksums = [];
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('channel');
            const request = index.openCursor(IDBKeyRange.only(channel));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.msgChksum) {
                        checksums.push(cursor.value.msgChksum);
                    }
                    cursor.continue();
                } else {
                    callback(checksums);
                }
            };

            request.onerror = () => {
                callback([]);
            };
        });
    },

    /**
     * Delete all messages from all channels (for debugging)
     */
    deleteAllMessages: function() {
        if (!this.db) return;

        const transaction = this.db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const request = store.clear();

        request.onsuccess = () => {
            // Clear cached counts
            this.messageCounts = {};
            console.log('All messages deleted from IndexedDB');
        };

        request.onerror = () => {
            console.error('Failed to delete all messages');
        };
    }
};
