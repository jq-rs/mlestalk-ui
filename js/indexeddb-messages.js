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

    /**
     * Initialize the IndexedDB database
     */
    init: function() {
        const request = indexedDB.open('mlestalk-messages', 1);

        request.onerror = () => {
            console.error('IndexedDB failed to open');
        };

        request.onsuccess = (event) => {
            this.db = event.target.result;
            console.log('IndexedDB opened successfully');
            // Initialize message counts cache
            this.initializeMessageCounts();
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
    saveMessage: function(channel, uid, message, timestamp, msgtype, dataUrl = null, msgChksum = '', isOwn = false, fsEnabled = false) {
        if (!this.db) return;

        // Only save full messages (check MSGISFULL flag)
        const MSGISFULL = 1;
        if (!(msgtype & MSGISFULL)) return;

        const transaction = this.db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');

        // Message type constants
        const MSGISDATA = 4;
        const AUDIODATASTR = 'data:audio';
        const IMGDATASTR = 'data:image';

        const msg = {
            id: channel + '_' + timestamp + '_' + uid + '_' + msgChksum,
            channel: channel,
            uid: uid,
            message: message,
            timestamp: timestamp,
            msgtype: msgtype,
            dataUrl: dataUrl,
            msgChksum: msgChksum,
            isAudio: msgtype & MSGISDATA && message.startsWith(AUDIODATASTR),
            isImage: msgtype & MSGISDATA && message.startsWith(IMGDATASTR),
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
        if (!this.db) {
            callback([]);
            return;
        }

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
    },

    /**
     * Display stored messages in the DOM
     *
     * @param {string} channel - Channel name
     * @param {object} autolinker - Autolinker instance for URL parsing
     */
    getFileExtensionFromDataUrl: function(dataUrl) {
        // Extract MIME type from data URL (format: data:mime/type;base64,...)
        const match = dataUrl.match(/^data:([^;]+)/);
        if (!match) return 'dat';

        const mimeType = match[1];

        // Map common MIME types to extensions
        const mimeToExt = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/bmp': 'bmp',
            'image/svg+xml': 'svg',
        };

        return mimeToExt[mimeType] || mimeType.split('/')[1] || 'dat';
    },

    displayStoredMessages: function(channel, autolinker) {
        const getFileExtensionFromDataUrl = this.getFileExtensionFromDataUrl;
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

            // Get forward secrecy color if available
            const FSFONTCOLOR = (typeof window.FSFONTCOLOR !== 'undefined') ? window.FSFONTCOLOR : '#8bac89';

            let lastDate = null;
            let prevUser = null;
            let prevTime = null;

            // Helper function to format date with weekday (matching stampTime)
            // Use the global gWeekday array that's set by language.js
            const stampTime = function(msgdate) {
                let dd = msgdate.getDate(),
                    mm = msgdate.getMonth() + 1,
                    yyyy = msgdate.getFullYear(),
                    h = msgdate.getHours(),
                    m = msgdate.getMinutes(),
                    day = gWeekday[msgdate.getDay()];
                if (dd < 10) dd = "0" + dd;
                if (mm < 10) mm = "0" + mm;
                if (m < 10) m = "0" + m;
                return day + " " + dd + "." + mm + "." + yyyy + " " + h + ":" + m;
            };

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

                // Build message HTML matching original format
                let li = '';
                const liClass = msg.isOwn ? 'own' : 'new';
                const liStyle = msg.fsEnabled ? ' style="color: ' + FSFONTCOLOR + ' !important;"' : '';

                if (msg.isImage && msg.dataUrl) {
                    // Image message
                    const imgExt = getFileExtensionFromDataUrl(msg.dataUrl);
                    li = '<div><li class="' + liClass + '"' + liStyle + '><span class="name">' + msg.uid +
                         '</span> ' + displayTime + '<a href="' + msg.dataUrl +
                         '" download="image.' + imgExt + '" style="text-decoration:none;">💾</a> <img class="image" src="' + msg.dataUrl +
                         '" height="100px" data-action="zoom" alt=""></li></div>';
                } else if (msg.isAudio && msg.dataUrl) {
                    // Audio message
                    li = '<div><li class="' + liClass + '"' + liStyle + '><span class="name">' + msg.uid +
                         '</span> ' + displayTime + '🎙 <audio controls src="' + msg.dataUrl + '" /></li></div>';
                } else {
                    // Text message
                    let linkedMessage = autolinker ? autolinker.link(msg.message) : msg.message;
                    // Convert newlines to <br> tags
                    linkedMessage = linkedMessage.replace(/\n/g, '<br>');

                    li = '<div><li class="' + liClass + '"' + liStyle + '><span class="name">' + msg.uid +
                         '</span> ' + displayTime + linkedMessage + '</li></div>';
                }

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
