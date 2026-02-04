/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2019-2026 MlesTalk developers
 */
const VERSION = "3.3.1";
const UPGINFO_URL = "https://mles.io/mlestalk/mlestalk_version.json";

let gMyName = {};
let gMyNameEnc = {};
let gMyChannel = {};
let gMyChannelEnc = {};
let gMyKey = {};
let gMyAddr = {};
let gMyPort = {};
let gAddrPortInput = {};
let gOwnId = {};
let gOwnAppend = {};
let gIndex = {};
let gIdAppend = {};
let gIdTimestamp = {};
let gPresenceTs = {};
let gIdNotifyTs = {};
let gMsgTs = {};
let gIdLastMsgLen = {};
let gPrevBdKey = {};
let gForwardSecrecy = {};
let gActiveChannel = null;
let gActiveChannels = {};
let gPrevTime = {};
let gRecStatus = false;
let gRecorder = null;
let gPendingSentMessages = {};
let gDateSeparatorCnt = {};

/* Msg type flags */
const MSGISFULL = 0x1;
const MSGISPRESENCE = 0x1 << 1;
const MSGISDATA = 0x1 << 2;
const MSGISMULTIPART = 0x1 << 3;
const MSGISFIRST = 0x1 << 4;
const MSGISLAST = 0x1 << 5;
const MSGISPRESENCEACK = 0x1 << 6;
const RESERVED = 0x1 << 7;
const MSGISBDONE = 0x1 << 8;
const MSGISBDACK = 0x1 << 9;
const AUDIODATASTR = "data:audio/webm";
const IMGDATASTR = "data:image";

const DATESTART = '<li class="date">';

let gUidQueue = {};

const IMGMAXSIZE = 960; /* px */
const IMGFRAGSIZE = 512 * 1024;

let gInitOk = {};
const PRESENCETIME = (3 * 60 + 1) * 1000; /* ms */
const PRESENCEACKTIME = PRESENCETIME; /* ms */
const IDLETIME = (11 * 60 + 1) * 1000; /* ms */
const LISTING_SHOW_TIMER = 2000; /* ms */
const RETIMEOUT = 1500; /* ms */
const MAXTIMEOUT = 1000 * 60 * 4; /* ms */
const MAXQLEN = 3000;
const RESYNC_TIMEOUT = 2500; /* ms */
const LED_ON_TIME = 500; /* ms */
const LED_OFF_TIME = 2500; /* ms */
const SCROLL_TIME = 400; /* ms */
const ASYNC_SLEEP = 1; /* ms */
const CHECKUPG_SLEEP = 5000; /* ms */
const IMG_THUMBSZ = 100; /* px */
const IMG_MAXFRAGSZ = 2048; /* B */
const DATA_MAXINDEX = 4096;
let gReconnTimeout = {};
let gReconnAttempts = {};

let gMultipartDict = {};
let gMultipartIndex = {};

const DATELEN = 13;

let gSipKey = {};
let gSipKeyChan = {};
let gIsResync = {};
let gLastWrittenMsg = {};

let gJoinExistingComplete = false;
let gPrevScrollTop = {};

let gLastMessageSeenTs = {};
let gSeenChksums = {};
let gLastMessage = {};
let gLastMessageSendOrRcvdDate = {};

let gIsPresenceView = false;
let gIsChannelListView = false;
let gWasChannelListView = false;
let gIsInputView = false;
let gWasInputView = false;

let gCanNotify = false;
let gWillNotify = true;
let gIsPause = false;
let isCordova = false;
let gImageCnt = 0;

// IndexedDB for message persistence
let gDB = null;

//message-list of channels
let gMsgs = {};
let gNewMsgsCnt = {};

let gWeekday = new Array(7);
gWeekday[0] = "Sun";
gWeekday[1] = "Mon";
gWeekday[2] = "Tue";
gWeekday[3] = "Wed";
gWeekday[4] = "Thu";
gWeekday[5] = "Fri";
gWeekday[6] = "Sat";
let gBgTitle = "MlesTalk";
let gBgText = "New message";
let gExitConfirmText = "Are you sure you want to exit the channel?";
let gExitAllConfirmText = "Are you sure you want to exit all channels?";
let gRecordConfirmText = "Start recording audio message?";

const FSFONTCOLOR = "#8bac89";

let gRecTimeoutId = 0;
const REC_TIMEOUT = 1000 * 60 * 3; // Limit max recording to 3 mins

let qrcode = null;
const CAMERA_CONSTRAINTS = {
  video: {
    facingMode: { ideal: "environment" }, // Prefer back camera
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

const MIN_PASSWORD_LENGTH = 12;

class Queue {
  constructor(...elements) {
    this.elements = [...elements];
    this.qmax = MAXQLEN;
  }
  push(...args) {
    if (this.getLength() >= this.maxLength()) this.shift();
    return this.elements.push(...args);
  }
  insert(val, obj) {
    if (val >= 0 && val <= this.getLength()) {
      this.elements.splice(val, 0, obj);
    }
  }
  get(val) {
    if (val >= 0 && val < this.getLength()) {
      return this.elements[val];
    }
  }
  shift() {
    return this.elements.shift();
  }
  unshift() {
    return this.elements.unshift();
  }
  flush(val) {
    if (val > 0 && val <= this.getLength()) {
      this.elements.splice(0, val);
    }
  }
  remove(val) {
    if (val > 0 && val <= this.getLength()) {
      this.elements.splice(val, 1);
    }
  }
  getLength() {
    return this.elements.length;
  }
  maxLength() {
    return this.qmax;
  }
}

function hashMessage(uid, channel, data) {
  return SipHash.hash_hex(gSipKey[channel], uid + data);
}

function hashImage(uid, channel, data, cnt) {
  let hash = SipHash.hash_uint(gSipKey[channel], uid + data + cnt) & 0xffffffff;
  hash = hash >>> 0;
  while (hash > 0xffffe000 >>> 0 || (hash & (0xf000 >>> 0)) == 0xf000 >>> 0) {
    hash =
      SipHash.hash_uint(gSipKey[channel], uid + data + cnt + hash) & 0xffffffff;
    hash = hash >>> 0;
  }
  return hash;
}

function uidQueueGet(uid, channel) {
  if (!gUidQueue[channel]) gUidQueue[channel] = {};
  if (!gUidQueue[channel][uid]) gUidQueue[channel][uid] = new Queue();
  return gUidQueue[channel][uid];
}

function queueFindAndMatch(msgTimestamp, uid, channel, mHash) {
  let q = uidQueueGet(uid, channel);
  if (q) {
    let lastSeen = -1;
    const qlen = q.getLength();
    for (let i = 0; i < qlen; i++) {
      let obj = q.get(i);
      if (obj[0] > msgTimestamp) {
        break;
      }
      if (obj[2] == mHash) {
        lastSeen = i + 1;
        break;
      }
    }
    if (lastSeen != -1) {
      q.flush(lastSeen);
    }
  }
}

function queueFlush(uid, channel) {
  let q = uidQueueGet(uid, channel);
  if (q) {
    q.flush(q.getLength());
  }
}

async function queueSweepAndSend(uid, channel) {
  let q = uidQueueGet(uid, channel);
  let cnt = 0;
  if (q) {
    let len = q.getLength();
    for (let i = 0; i < len; i++) {
      let obj = q.get(i);
      let tmp = obj[1];
      if (tmp[2] == uid) {
        const fs = obj[4];
        if (fs) {
          tmp[0] = "resend_prev";
        }
        cnt++;
        gWebWorker.postMessage(tmp);
        if (fs) {
          q.remove(i);
          i -= 1;
          len -= 1;
        }
        await sleep(ASYNC_SLEEP);
      }
    }
  }
  console.log("Resync for " + channel + " complete: swept " + cnt + " msgs.");
}

function uidQueuePush(uid, channel, arr) {
  let q = uidQueueGet(uid, channel);
  q.push(arr);
}

function queuePostMsg(uid, channel, arr) {
  uidQueuePush(uid, channel, arr);
}

let autolinker = new Autolinker({
  urls: {
    schemeMatches: true,
    tldMatches: true,
  },
  email: true,
  phone: false,
  mention: false,
  hashtag: false,

  stripPrefix: true,
  stripTrailingSlash: true,
  newWindow: true,

  truncate: {
    length: 0,
    location: "end",
  },

  className: "",
});

function stampTime(msgdate) {
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
}

function timeNow() {
  return stampTime(new Date());
}

function get_uniq(uid, channel) {
  return SipHash.hash_hex(gSipKey[channel], uid + channel);
}

let gWebWorker = new Worker("zpinc-webworker/js/webworker.js");

function onPause() {
  gIsPause = true;
  if (isCordova) {
    // Build channel data
    const channelData = {};
    for (let channel in gActiveChannels) {
      if (channel && gMyChannel[channel]) {
        channelData[channel] = {
          name: gMyNameEnc[channel] || "",
          channel: gMyChannelEnc[channel] || "",
          channel_dec: gMyChannel[channel] || "",
          server: gAddrPortInput[channel] || "mles.io:443",
          msg_chksums: JSON.stringify(
            gSeenChksums[channel] ? [...gSeenChksums[channel]] : []
          ),
        };
      }
    }

    if (!cordova.plugins.backgroundMode.isActive()) {
      cordova.plugins.backgroundMode.enable();
    }

    // Pass channels via configure
    cordova.plugins.backgroundMode.configure({
      title: gBgTitle,
      text: gBgText,
      channels: channelData
    });

    cordova.plugins.notification.local.clearAll();
    cordova.plugins.backgroundMode.toBackground();
  }
}

function onResume() {
  gIsPause = false;
  if (isCordova) {
    cordova.plugins.notification.local.clearAll();
    cordova.plugins.backgroundMode.fromBackground();
  }
  // Reconnect all channels in case connections were dropped while backgrounded
  syncReconnect();
  if (gActiveChannel) scrollToBottom(gActiveChannel);
  else if (gIsPresenceView || gIsChannelListView) presenceChannelListShow();
}

function onBackKeyDown() {
  /* Open presence info */
  if (!gIsPresenceView) {
    gIsPresenceView = true;
    if (gIsChannelListView) {
      gWasChannelListView = true;
      gIsChannelListView = false;
    }
    if (gIsInputView) {
      gWasInputView = true;
    }
    presenceChannelListShow();
  } else {
    gIsPresenceView = false;
    if (gWasChannelListView) {
      gWasChannelListView = false;
      gIsChannelListView = true;
      presenceChannelListShow();
    } else if (gWasInputView) {
      gWasInputView = false;
      gIsInputView = true;
      $("#presence_cont").fadeOut(400, function () {
        $("#name_channel_cont").fadeIn();
      });
    } else {
      $("#presence_cont").fadeOut(400, function () {
        $("#message_cont").fadeIn();
      });
    }
  }
}

function newChannelShow() {
  getFront();
  gActiveChannel = null;

  gIsPresenceView = false;
  gIsChannelListView = false;
  gIsInputView = true;
  $("#input_channel").val("");
  $("#input_key").val("");
  $("#presence_cont").fadeOut(400, function () {
    $("#name_channel_cont").fadeIn();
  });
}

function onLoad() {
  // Initialize IndexedDB for message persistence
  MessageDB.init();

  document.addEventListener(
    "deviceready",
    function () {
      cordova.plugins.notification.local.requestPermission(function (granted) {
        gCanNotify = granted;
      });
      gCanNotify = true;

      cordova.plugins.backgroundMode.setDefaults({
        title: gBgTitle,
        text: gBgText,
      });

      cordova.plugins.notification.local.setDefaults({
        androidAllowWhileIdle: true,
        androidChannelEnableLights: true,
        androidChannelEnableVibration: true,
      });

      // sets a recurring alarm that keeps things rolling
      // cordova.plugins.backgroundMode.disableWebViewOptimizations();
      cordova.plugins.backgroundMode.enable();

      // Stop any background monitoring from previous session
      cordova.plugins.backgroundMode.configure({
	stopMonitoring: true
      });

      document.addEventListener("pause", onPause, false);
      document.addEventListener("resume", onResume, false);
      document.addEventListener("backbutton", onBackKeyDown, false);

      checkUpgrades();

      isCordova = true;
    },
    false,
  );

  getFront();
}

async function requestAudioPermission() {
  if (isCordova) {
    return new Promise((resolve, reject) => {
      var Permission = window.plugins.Permission;
      var permission = "android.permission.RECORD_AUDIO";

      Permission.has(
        permission,
        function (results) {
          if (!results[permission]) {
            Permission.request(
              permission,
              function (results) {
                if (results[permission]) {
                  resolve(true); // Permission granted
                } else {
                  resolve(false); // Permission denied
                }
              },
              function (error) {
                resolve(false); // Error during request
              },
            );
          } else {
            resolve(true); // Already had permission
          }
        },
        function (error) {
          resolve(false); // Error checking permission
        },
      );
    });
  } else {
    // Browser environment
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }
}

let wasReady = false;
$(document).ready(function () {
  if (false == wasReady) {
    getFront();
    getActiveChannels();
    if (gActiveChannels) joinExistingChannels(gActiveChannels);
    $("#channel_submit, #form_send_message").submit(function (e) {
      e.preventDefault();
      askChannelNew();
    });

    $("#input_key").on("input", function () {
      const password = $(this).val().trim();
      if (password.length < MIN_PASSWORD_LENGTH) {
        $(this).addClass("invalid");
      } else {
        $(this).removeClass("invalid");
      }
    });

    wasReady = true;
  }
});

function addrsplit(channel, addrport) {
  let addrarray = addrport.split(":");
  if (addrarray.length > 0) {
    gMyAddr[channel] = addrarray[0];
  }
  if (addrarray.length > 1) {
    gMyPort[channel] = addrarray[1];
  }
  if (gMyAddr[channel] == "") {
    gMyAddr[channel] = "mles.io";
  }
  if (gMyPort[channel] == "") {
    gMyPort[channel] = "443";
  }
}

function joinExistingChannels(channels) {
  if (!channels || gJoinExistingComplete) return;
  let cnt = 0;
  getNotifyTimestamps();
  getMsgTimestamps();
  for (let channel in channels) {
    if (channel) {
      cnt++;
      getLocalSession(channel);
      gAddrPortInput[channel] = getLocalAddrPortInput(channel);
      if (
        !gInitOk[channel] &&
        gMyName[channel] &&
        gMyChannel[channel] &&
        gMyKey[channel] &&
        gAddrPortInput[channel]
      ) {
        addrsplit(channel, gAddrPortInput[channel]);
        if (null == gOwnId[channel]) gOwnId[channel] = 0;
        if (null == gOwnAppend[channel]) gOwnAppend[channel] = false;
        gForwardSecrecy[channel] = false;
        gLastMessageSeenTs[channel] = 0;
        gSeenChksums[channel] = new Set();
        gIsResync[channel] = 0;
        gInitOk[channel] = true;

        initReconnect(channel);

        getLocalBdKey(channel);
        gWebWorker.postMessage([
          "init",
          null,
          utf8Encode(gMyAddr[channel]),
          utf8Encode(gMyPort[channel]),
          utf8Encode(gMyName[channel]),
          utf8Encode(gMyChannel[channel]),
          utf8Encode(gMyKey[channel]),
          gPrevBdKey[channel],
        ]);
      }
    }
  }
  if (0 == cnt) {
    newChannelShow();
  } else {
    channelListShow();
    $("#name_channel_cont").fadeOut(400, function () {
      $("#presence_cont").fadeIn();
    });
  }
  gJoinExistingComplete = true;
}

function askChannelNew() {
  if (gActiveChannel) return;

  if (
    $("#input_name").val().trim().length <= 0 ||
    $("#input_channel").val().trim().length <= 0 ||
    $("#input_key").val().trim().length < MIN_PASSWORD_LENGTH
  ) {
    //not enough input, alert
    popAlert();
  } else if (
    $("#input_channel").val().trim().length > 0 &&
    $("#input_channel").val().trim() ==
      gMyChannel[$("#input_channel").val().trim()]
  ) {
    popChannelAlert();
  } else {
    channel = $("#input_channel").val().trim();

    gMyChannel[channel] = channel;
    gOwnId[channel] = 0;
    gOwnAppend[channel] = false;
    gForwardSecrecy[channel] = false;
    gLastMessageSeenTs[channel] = 0;
    gSeenChksums[channel] = new Set();
    gIsResync[channel] = 0;
    gPrevScrollTop[channel] = 0;

    gMyName[channel] = $("#input_name").val().trim();
    gMyKey[channel] = $("#input_key").val().trim();
    gAddrPortInput[channel] = $("#input_addr_port").val().trim();
    let localization = $("#channel_localization").val().trim();

    //add to local storage
    if (gMyName[channel]) {
      window.localStorage.setItem("gMyName" + channel, gMyName[channel]);
    }
    if (gMyChannel[channel]) {
      window.localStorage.setItem("gMyChannel" + channel, gMyChannel[channel]);
    }
    if (gMyKey[channel]) {
      window.localStorage.setItem("gMyKey" + channel, gMyKey[channel]);
    }

    //add to local storage
    if (gAddrPortInput[channel].length > 0) {
      window.localStorage.setItem(
        "gAddrPortInput" + channel,
        gAddrPortInput[channel],
      );
    } else {
      window.localStorage.setItem("gAddrPortInput" + channel, "mles.io:443");
    }

    //add to local storage
    if (localization.length > 0) {
      window.localStorage.setItem("localization", localization);
    } else {
      window.localStorage.setItem("localization", "gb");
    }

    addrsplit(channel, gAddrPortInput[channel]);

    initReconnect(channel);

    /* Load keys from local storage */
    getLocalBdKey(channel);
    gWebWorker.postMessage([
      "init",
      null,
      utf8Encode(gMyAddr[channel]),
      utf8Encode(gMyPort[channel]),
      utf8Encode(gMyName[channel]),
      utf8Encode(gMyChannel[channel]),
      utf8Encode(gMyKey[channel]),
      gPrevBdKey[channel],
    ]);
    if (!gActiveChannels) gActiveChannels = {};
    gActiveChannels[channel] = channel;
    setActiveChannels();

    gActiveChannel = channel;
    $("#messages").html("");

    selectSipToken(channel);
    gIsInputView = false;
    $("#name_channel_cont").fadeOut(400, function () {
      $("#message_cont").fadeIn();
    });
  }
}

/* Presence */
function sendEmptyJoin(channel) {
  sendMessage(channel, "", false, true);
}

function sendPresAck(channel) {
  sendMessage(channel, "", false, true, true);
}

/* Join after disconnect */
function sendInitJoin(channel) {
  sendMessage(channel, "", true, true);
}

function send(isFull, optData) {
  const channel = gActiveChannel;

  let message = $("#input_message").val();
  let file = document.getElementById("input_file").files[0];

  if (file) {
    //send unsent full message before file
    if ($("#input_message").val().length > 0) {
      sendMessage(channel, message, true, false);
      updateAfterSend(channel, message, true, false, false);
    }
    sendImage(channel, file);
    document.getElementById("input_file").value = "";
  } else if (optData) {
    if (channel) {
      if (sendDataurl(optData, gMyName[channel], gMyChannel[channel]))
        updateAfterSend(channel, optData, isFull, true, true);
    }
  } else {
    sendMessage(channel, utf8Encode(message), isFull, false);
    updateAfterSend(channel, message, isFull, false, false);
  }
}

function chanExitAll() {
  if (!confirm(gExitAllConfirmText)) {
    return;
  }
  for (let val in gMyChannel) {
    if (val) {
      let channel = gMyChannel[val];
      if (channel) {
        closeChannel(channel);
      }
    }
  }
  $("#input_channel").val("");
  $("#input_key").val("");
  //$('#qrcode').fadeOut();

  clearActiveChannels();
  clearNotifyTimestamps();
  clearMsgTimestamps();

  $("#message_cont").fadeOut(400, function () {
    newChannelShow();
  });
}

function chanExit() {
  if (!confirm(gExitConfirmText)) {
    return;
  }

  const channel = gActiveChannel;
  closeChannel(channel);

  setActiveChannels();
  setNotifyTimestamps();
  setMsgTimestamps();

  $("#input_channel").val("");
  $("#input_key").val("");
  //$('#qrcode').fadeOut();

  if (Object.keys(gMyChannel).length > 0) {
    channelListShow();
    $("#message_cont").fadeOut(400, function () {
      $("#presence_cont").fadeIn();
    });
  } else
    $("#message_cont").fadeOut(400, function () {
      newChannelShow();
    });
}

function outputPresenceChannelList() {
  let date = Date.now();
  let msgcnt = 0;
  let cnt = 0;

  for (let val in gMyChannel) {
    if (val) {
      let channel = gMyChannel[val];
      if (channel) {
        let li;

        cnt++;

        // Get message count from IndexedDB (using cached synchronous count)
        const actualMsgCount = MessageDB.getMessageCountSync(channel);

        msgcnt += actualMsgCount;

        if (actualMsgCount > 0) {
          const newMsgCount = gNewMsgsCnt[channel] || 0;
          li =
            '<li class="new" id="' +
            channel +
            '"><button onclick="showQRCodeFor(\'' +
            channel +
            '\')" class="key-btn" title="QR code">🔳</button><span class="name">&#128274;' +
            channel +
            " (<b>" +
            newMsgCount +
            "</b>/" +
            actualMsgCount +
            ")</span></li>";
        } else {
          li =
            '<li class="new" id="' +
            channel +
            '"><button onclick="showQRCodeFor(\'' +
            channel +
            '\')" class="key-btn" title="QR code">🔳</button><span class="name">&#128274;' +
            channel +
            " (<b>-</b>/-)</span></li>";
        }

        $("#presence_avail").append(li);
        if (gIsPresenceView) {
          for (let uid in gPresenceTs[channel]) {
            let arr = gPresenceTs[channel][uid];
            if (!arr) continue;
            const ps_channel = arr[1];
            if (ps_channel != channel) continue;
            const user = arr[0];
            const timestamp = arr[2];
            if (user == gMyName[channel]) continue;
            if (timestamp.valueOf() + PRESENCETIME >= date.valueOf())
              li =
                '<li class="item"><span class="name"><img src="img/available.png" alt="green" style="vertical-align:middle;height:20px;" /> ' +
                user +
                "</span></li>";
            else if (timestamp.valueOf() + IDLETIME >= date.valueOf())
              li =
                '<li class="item"><span class="name"><img src="img/idle.png" alt="light green" style="vertical-align:middle;height:20px;" /> ' +
                user +
                "</span></li>";
            else
              li =
                '<li class="item"><span class="name"><img src="img/unavailable.png" alt="grey" style="vertical-align:middle;height:20px;" /> ' +
                user +
                "</span></li>";
            $("#presence_avail").append(li);
          }
        }
        document.getElementById(channel).onclick = function () {
          gActiveChannel = channel;
          $("#messages").html("");

          // Load and display stored messages from IndexedDB
          MessageDB.displayStoredMessages(channel, autolinker);

          // Continue with channel setup
          selectSipToken(channel);
          gIsChannelListView = false;
          gWasChannelListView = false;
          gIsInputView = false;
          gWasInputView = false;
          gIsPresenceView = false;
          if (gMsgs[channel]) gNewMsgsCnt[channel] = 0;
          const msgDate = parseInt(Date.now() / 1000) * 1000; //in seconds
          gMsgTs[channel] = msgDate.valueOf();
          setMsgTimestamps();
          $("#presence_cont").fadeOut(400, function () {
            $("#message_cont").fadeIn();
            scrollToBottom(channel);
          });
        };
      }
    }
  }
  if (cnt > 0) {
    if (gIsInputView) {
      gIsInputView = false;
      $("#name_channel_cont").fadeOut(400, function () {
        $("#presence_cont").fadeIn();
      });
    } else {
      $("#message_cont").fadeOut(400, function () {
        $("#presence_cont").fadeIn();
      });
    }
  } else newChannelShow();

  return msgcnt;
}

async function presenceChannelListShow() {
  while ((gIsPresenceView || gIsChannelListView) && gIsPause == false) {
    $("#presence_avail").html("");
    outputPresenceChannelList();
    await sleep(LISTING_SHOW_TIMER);
  }
}

function channelListShow() {
  gIsChannelListView = true;
  gActiveChannel = null;
  if (true == gRecStatus) record(); //stop recording
  presenceChannelListShow();
}

function closeChannel(channel) {
  initReconnect(channel);
  gInitOk[channel] = false;

  if (true == gRecStatus) record(); //stop recording

  //init all databases
  delete gIdTimestamp[channel];
  delete gPresenceTs[channel];
  delete gIdNotifyTs[channel];
  delete gMsgs[channel];
  delete gMsgTs[channel];
  delete gIndex[channel];
  delete gIdAppend[channel];

  delete gLastMessageSeenTs[channel];
  delete gSeenChksums[channel];
  delete gDateSeparatorCnt[channel];

  queueFlush(gMyName[channel], gMyChannel[channel]);
  clearLocalBdKey(channel);
  clearLocalSession(channel);

  // Delete messages from IndexedDB
  MessageDB.deleteChannel(channel);

  delete gForwardSecrecy[channel];
  delete gPrevBdKey[channel];
  delete gActiveChannels[channel];
  delete gOwnAppend[channel];
  delete gIsResync[channel];
  delete gPrevScrollTop[channel];
  delete gPrevTime[channel];

  gActiveChannel = null;

  //guarantee that websocket gets closed without reconnect
  let tmpname = gMyName[channel];
  let tmpchannel = gMyChannel[channel];
  delete gMyName[channel];
  delete gMyChannel[channel];
  gWebWorker.postMessage([
    "close",
    null,
    utf8Encode(tmpname),
    utf8Encode(tmpchannel),
  ]);
}

function initReconnect(channel) {
  gReconnTimeout[channel] = RETIMEOUT;
  gReconnAttempts[channel] = 0;
}

function processInit(uid, channel, enc_uid, enc_channelid, msgChksum) {
  if (uid.length > 0 && channel.length > 0) {
    gInitOk[channel] = true;
    createSipToken(channel);
    if (gActiveChannel == channel) selectSipToken(channel);

    //sendInitJoin(channel);

    if (!gMsgs[channel]) {
      gMsgs[channel] = new Queue();
      gNewMsgsCnt[channel] = 0;
    }

    gMyNameEnc[channel] = enc_uid;
    gMyChannelEnc[channel] = enc_channelid;

    if (gLastMessageSeenTs[channel] > 0) {
      //console.log("last message not zero")
    } else {
      let li =
        '<li class="new"> - <span class="name">' +
        uid +
        "@" +
        channel +
        "</span> - </li>";
      if (gActiveChannel == channel) $("#messages").append(li);
      gMsgs[channel].push(li);
    }

    if (0 == gIsResync[channel]) {
      console.log("Resyncing init " + channel);
      gIsResync[channel] += 1;
      resync(uid, channel);
    }

    return 0;
  }
  return -1;
}

function createSipToken(channel) {
  // Pad channel to exactly 16 bytes
  let bfchannel = channel.substring(0, 16).padEnd(16, '\0');
  gSipKey[channel] = SipHash.string16_to_key(bfchannel);
  gSipKeyChan[channel] = bfchannel;
}

function selectSipToken(channel) {
  /*
	if(gSipKey[channel] && gSipKeyChan[channel]) {
		let atoken = SipHash.hash_hex(gSipKey[channel], gSipKeyChan[channel]);
		let token = btoa(atoken);
		document.getElementById("qrcode_link").setAttribute("href", getToken(channel, token));
		qrcode.clear(); // clear the code.
		qrcode.makeCode(getToken(channel, token)); // make another code.
		$('#qrcode').fadeIn();
	}
	else
		$('#qrcode').fadeOut();
	*/
}

function get_duid(uid, channel) {
  return SipHash.hash_hex(gSipKey[channel], uid + channel);
}

function processForwardSecrecy(uid, channel, prevBdKey) {
  gPrevBdKey[channel] = prevBdKey;
  /* Save to local storage */
  setLocalBdKey(channel, prevBdKey);
  /* Update info about forward secrecy */
  gForwardSecrecy[channel] = true;
}

function processForwardSecrecyOff(uid, channel) {
  /* Update info about forward secrecy */
  gForwardSecrecy[channel] = false;
}

function msgHashHandle(uid, channel, msgTimestamp, mhash) {
  if (!gIdTimestamp[channel]) gIdTimestamp[channel] = {};
  let timedict = gIdTimestamp[channel][uid];
  if (!timedict) {
    gIdTimestamp[channel][uid] = {};
    timedict = gIdTimestamp[channel][uid];
  }
  let arr = timedict[msgTimestamp];
  if (!arr) {
    timedict[msgTimestamp] = [mhash];
    return true;
  }
  for (const hash of arr) {
    if (hash == mhash) {
      return false;
    }
  }
  arr.push(mhash);
  return true;
}

function checkTime(uid, channel, time, isFull) {
  if (!gPrevTime[channel]) {
    gPrevTime[channel] = [uid, ""];
  }
  const [ouid, otime] = gPrevTime[channel];
  /* Skip time output for the same minute */
  if (ouid == uid && otime == time) {
    return "";
  }
  if (isFull) {
    gPrevTime[channel] = [uid, time];
  }
  return time;
}

function processData(
  uid,
  channel,
  msgTimestamp,
  message,
  isFull,
  isPresence,
  isPresenceAck,
  isData,
  isMultipart,
  isFirst,
  isLast,
  fsEnabled,
  msgChksum
) {
  let isAudio = false;
  let isImage = false;
  //update hash
  let duid = get_duid(uid, channel);
  if (!gIndex[channel]) gIndex[channel] = {};
  if (null == gIndex[channel][uid]) {
    gIndex[channel][uid] = 0;
    if (!gIdAppend[channel]) gIdAppend[channel] = {};
    gIdAppend[channel][uid] = false;
    if (!gPresenceTs[channel]) gPresenceTs[channel] = {};
    gPresenceTs[channel][uid] = [uid, channel, msgTimestamp];
    if (!gIdNotifyTs[channel]) gIdNotifyTs[channel] = {};
    if (null == gIdNotifyTs[channel][uid]) gIdNotifyTs[channel][uid] = 0;
  }
  let li;

  let dateString = "[" + stampTime(new Date(msgTimestamp)) + "] ";

  if (gIsResync[channel] > 0) {
    gIsResync[channel] += 1;
  }
  const mHash = hashMessage(
    uid,
    channel,
    isFull ? msgTimestamp + message + "\n" : msgTimestamp + message,
  );
  if ((isFull && message.length > 0) || (!isFull && message.length == 0)) {
    /* Match full or presence messages */
    if (gLastMessageSeenTs[channel] > msgTimestamp && 0 == gIsResync[channel]) {
      gIsResync[channel] += 1;
      resync(uid, channel);
    }
    if (uid == gMyName[channel]) {
      queueFindAndMatch(msgTimestamp, uid, channel, mHash);
    }
  } else if (
    gOwnId[channel] > 0 &&
    message.length >= 0 &&
    gLastWrittenMsg[channel].length > 0
  ) {
    let end = "</li></div>";
    gLastWrittenMsg[channel] = gLastWrittenMsg[channel].substring(
      0,
      gLastWrittenMsg[channel].length - end.length,
    );
    gLastWrittenMsg[channel] += " &#x2713;" + end;
    if (gActiveChannel == channel) {
      $("#owner" + (gOwnId[channel] - 1)).replaceWith(gLastWrittenMsg[channel]);
    }
    gLastWrittenMsg[channel] = "";
    //update presence if current time per user is larger than begin presence
  }

  if (isMultipart) {
    //strip index
    const index = message.substr(0, 8);
    const dict = uid + message.substr(0, 4);
    const numIndex = parseInt(index, 16) >>> 0;
    message = message.substr(8);

    if (message.length > IMG_MAXFRAGSZ) {
      //invalid image
      return 0;
    }

    // handle multipart hashing here
    if (msgHashHandle(uid, channel, msgTimestamp, mHash)) {
      if (!gMultipartDict[get_uniq(dict, channel)]) {
        if (!isFirst) {
          //invalid frame
          return 0;
        }
        if (!gMsgs[channel]) {
          gMsgs[channel] = new Queue();
          gNewMsgsCnt[channel] = 0;
        }
        const dat = updateDateval(channel, dateString);
        if (dat) {
          /* Update new date header */
          li = DATESTART + ' - <span class="name">' + dat + "</span> - </li>";
          if (!gDateSeparatorCnt[channel]) gDateSeparatorCnt[channel] = 0;
          gDateSeparatorCnt[channel]++;
          gMsgs[channel].push(li);
          if (gActiveChannel == channel) {
            $("#messages").append(li);
          }
        }
        if (gActiveChannel == channel) {
          li = '<div id="' + duid + "" + numIndex.toString(16) + '"></div>';
          $("#messages").append(li);
        }
        const msgql = gMsgs[channel].getLength();
        const tim = updateTime(dateString);
        gMultipartDict[get_uniq(dict, channel)] = {};
        gMultipartIndex[get_uniq(dict, channel)] = [numIndex, msgql, dat, tim];
      }

      gPresenceTs[channel][uid] = [uid, channel, msgTimestamp];

      if (gLastMessageSeenTs[channel] < msgTimestamp) {
        gLastMessageSeenTs[channel] = msgTimestamp;
      }

      const [nIndex, msgqlen, dated, timed] =
        gMultipartIndex[get_uniq(dict, channel)];

      if (numIndex >= nIndex + DATA_MAXINDEX) {
        //invalid index
        return 0;
      }

      gMultipartDict[get_uniq(dict, channel)][numIndex - nIndex] = message;

      if (!isLast) {
        return 0;
      }

      const time = checkTime(uid, channel, timed, isFull);

      message = "";
      for (let i = 0; i <= numIndex - nIndex; i++) {
        const frag = gMultipartDict[get_uniq(dict, channel)][i];
        if (!frag) {
          //lost message, ignore image
          gMultipartDict[get_uniq(dict, channel)] = null;
          gMultipartIndex[get_uniq(dict, channel)] = null;
          return 0;
        }
        message += frag;
      }

      //match data types
      if (message.substring(0, AUDIODATASTR.length) == AUDIODATASTR) {
        isAudio = true;
        if (!fsEnabled) {
          if (uid != gMyName[channel]) {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="new"><span class="name">' +
              uid +
              "</span> " +
              time +
              '🎙 <audio controls src="' +
              message +
              '" />';
          } else {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="own"><span class="name">' +
              uid +
              "</span> " +
              time +
              '🎙 <audio controls src="' +
              message +
              '" />';
          }
        } else {
          if (uid != gMyName[channel]) {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="new" style="color: ' +
              FSFONTCOLOR +
              '"><span class="name">' +
              uid +
              '</span> ' +
              time +
              '🎙 <audio controls src="' +
              message +
              '" />';
          } else {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="own" style="color: ' +
              FSFONTCOLOR +
              '"><span class="name">' +
              uid +
              '</span> ' +
              time +
              '🎙 <audio controls src="' +
              message +
              '" />';
          }
        }
      } else if (message.substring(0, IMGDATASTR.length) == IMGDATASTR) {
        isImage = true;
        if (!fsEnabled) {
          if (uid != gMyName[channel]) {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="new"><span class="name">' +
              uid +
              "</span> " +
              time +
              '<img class="image" src="' +
              message +
              '" height="' +
              IMG_THUMBSZ +
              'px" data-action="zoom" alt="">';
          } else {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="own"><span class="name">' +
              uid +
              "</span> " +
              time +
              '<img class="image" src="' +
              message +
              '" height="' +
              IMG_THUMBSZ +
              'px" data-action="zoom" alt="">';
          }
        } else {
          if (uid != gMyName[channel]) {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="new" style="color: ' +
              FSFONTCOLOR +
              '"><span class="name">' +
              uid +
              '</span> ' +
              time +
              '<img class="image" src="' +
              message +
              '" height="100px" data-action="zoom" alt=""></li></div>';
          } else {
            li =
              '<div id="' +
              duid +
              "" +
              nIndex.toString(16) +
              '"><li class="own" style="color: ' +
              FSFONTCOLOR +
              '"><span class="name">' +
              uid +
              '</span> ' +
              time +
              '<img class="image" src="' +
              message +
              '" height="100px" data-action="zoom" alt=""></li></div>';
          }
        }
      } else {
        //unknown data type, ignore
        return 0;
      }

      li += "</li></div>";
      if (gActiveChannel == channel) {
        $("#" + duid + "" + nIndex.toString(16)).replaceWith(li);
      }

      const clen = gMsgs[channel].getLength();
      /* If current prev entry is date of the first message or there are more messages, do not insert before it */
      if (0 == clen || (clen == msgqlen + 1 && dated) || clen != msgqlen + 1) {
        gMsgs[channel].push(li);
      } else {
        gMsgs[channel].insert(msgqlen, li);
      }

      gMultipartDict[get_uniq(dict, channel)] = null;
      gMultipartIndex[get_uniq(dict, channel)] = null;

      finalize(uid, channel, msgTimestamp, message, isFull, isImage, isAudio, msgChksum, fsEnabled);
    }
    return 0;
  }

  if (msgHashHandle(uid, channel, msgTimestamp, mHash)) {
    gPresenceTs[channel][uid] = [uid, channel, msgTimestamp];

    if (gLastMessageSeenTs[channel] < msgTimestamp) {
      gLastMessageSeenTs[channel] = msgTimestamp;
    }

    /*
    if (isPresence) {
      let datenow = Date.now();
      let doSndPresAck = false;

      if (
        !isPresenceAck &&
        msgTimestamp.valueOf() < datenow.valueOf() - PRESENCEACKTIME
      ) {
        doSndPresAck = true;
      }

      if (0 == gIsResync[channel] && doSndPresAck) {
        //console.log("Sending presence ack for channel " + channel);
        sendPresAck(channel);
      }
      return 1;
    }*/

    if (0 == message.length) {
      return 0;
    }

    if (!gMsgs[channel]) {
      gMsgs[channel] = new Queue();
      gNewMsgsCnt[channel] = 0;
    }

    const date = updateDateval(channel, dateString);
    if (date) {
      /* Update new date header */
      li = DATESTART + ' - <span class="name">' + date + "</span> - </li>";
      if (!gDateSeparatorCnt[channel]) gDateSeparatorCnt[channel] = 0;
      gDateSeparatorCnt[channel]++;
      gMsgs[channel].push(li);
      if (gActiveChannel == channel) $("#messages").append(li);
    }
    let time = updateTime(dateString);
    time = checkTime(uid, channel, time, isFull);

    if (false == isData) message = utf8Decode(message);

    if (!fsEnabled) {
      if (uid != gMyName[channel]) {
        li =
          '<div id="' +
          duid +
          "" +
          gIndex[channel][uid] +
          '"><li class="new"><span class="name">' +
          uid +
          "</span> " +
          time +
          "" +
          autolinker.link(message) +
          "</li></div>";
      } else {
        li =
          '<div id="' +
          duid +
          "" +
          gIndex[channel][uid] +
          '"><li class="own"><span class="name">' +
          uid +
          "</span> " +
          time +
          "" +
          autolinker.link(message) +
          "</li></div>";
      }
    } else {
      if (uid != gMyName[channel]) {
        li =
          '<div id="' +
          duid +
          "" +
          gIndex[channel][uid] +
          '"><li class="new" style="color: ' +
          FSFONTCOLOR +
          '"><span class="name">' +
          uid +
          '</span> ' +
          time +
          "" +
          autolinker.link(message) +
          "</li></div>";
      } else {
        li =
          '<div id="' +
          duid +
          "" +
          gIndex[channel][uid] +
          '"><li class="own" style="color: ' +
          FSFONTCOLOR +
          '"><span class="name">' +
          uid +
          '</span> ' +
          time +
          "" +
          autolinker.link(message) +
          "</li></div>";
      }
    }

    if (gActiveChannel == channel) {
      if (false == gIdAppend[channel][uid]) {
        $("#messages").append(li);
        gIdAppend[channel][uid] = true;
      } else {
        $("#" + duid + "" + gIndex[channel][uid]).replaceWith(li);
      }
    } else {
      gIdAppend[channel][uid] = false;
    }

    if (isFull) {
      gMsgs[channel].push(li);
      gIndex[channel][uid] += 1;
      gIdAppend[channel][uid] = false;
    }

    finalize(uid, channel, msgTimestamp, message, isFull, isImage, isAudio, msgChksum, fsEnabled);
  }
  return 0;
}

function finalize(
  uid,
  channel,
  msgTimestamp,
  message,
  isFull,
  isImage,
  isAudio,
  msgChksum,
  fsEnabled,
) {
  if (
    gActiveChannel == channel &&
    (isFull || 0 == $("#input_message").val().length)
  ) {
    //if user has scrolled, do not scroll to bottom unless full message
    if (messages_list.scrollTop >= gPrevScrollTop[channel] - 400) {
      //webview is not accurate in scrolltop
      scrollToBottom(channel);
    }
  }

  if (gActiveChannel == channel) {
    gMsgTs[channel] = msgTimestamp;
    setMsgTimestamps();
  }

  if (
    isFull &&
    (gActiveChannel != channel || gIsPause) &&
    uid != gMyName[channel] &&
    gMsgTs[channel] < msgTimestamp
  ) {
    gNewMsgsCnt[channel] += 1;
  }

  const notifyTimestamp = parseInt(msgTimestamp / 1000 / 60); //one notify per minute
  if (
    uid != gMyName[channel] &&
    isFull &&
    gIdNotifyTs[channel][uid] < notifyTimestamp
  ) {
    if ((gActiveChannel != channel && !gIsChannelListView && !gIsPresenceView) || gIsPause) {
      if (gWillNotify && gCanNotify) {
        if (isAudio) message = "🎙";
        else if (isImage) message = "🖼️";
        doNotify(uid, channel, notifyTimestamp, message);
      }
    }
    gIdNotifyTs[channel][uid] = notifyTimestamp;
    setNotifyTimestamps();
  }

  // Save message to IndexedDB
  if (isFull) {
    let msgtype = MSGISFULL;
    if (isImage || isAudio) {
      msgtype |= MSGISDATA;
    }
    const dataUrl = (isImage || isAudio) ? message : null;
    const isOwn = (uid === gMyName[channel]);
    // Use fsEnabled from parameter (from server) instead of local gForwardSecrecy
    MessageDB.saveMessage(channel, uid, message, msgTimestamp, msgtype, dataUrl, msgChksum, isOwn, fsEnabled);
  }
}

function processClose(uid, channel) {
  if (uid == gMyName[channel] && channel == gMyChannel[channel]) {
    reconnect(uid, channel);
  }
}

gWebWorker.onmessage = function (e) {
  let cmd = e.data[0];
  switch (cmd) {
    case "init":
      {
        let uid = utf8Decode(e.data[1]);
        let channel = utf8Decode(e.data[2]);
        let enc_uid = e.data[3]; //base64
        let enc_channelid = e.data[4]; //base64
        let ret = processInit(uid, channel, enc_uid, enc_channelid);
        if (ret < 0) {
          console.log("Process init failed: " + ret);
        }
      }
      break;
    case "data":
      {
        let uid = utf8Decode(e.data[1]);
        let channel = utf8Decode(e.data[2]);
        let msgTimestamp = e.data[3];
        let message = e.data[4];
        let msgtype = e.data[5];
        let fsEnabled = e.data[6];
        let msgChksum = e.data[7];

        initReconnect(channel);

        const isFull = msgtype & MSGISFULL ? true : false;

        // Add to checksum set
        gSeenChksums[channel].add(msgChksum);

        if (gIsResync[channel] > 0) {
          if (!isFull)
            return;
          // During resync, check if message already exists in IndexedDB to prevent duplicates
          // After resync, all messages are new so no check needed
          MessageDB.checksumExists(channel, msgChksum, function(exists) {
            if (exists) {
              // Already in IndexedDB, skip processing
              return;
            }

            // Message is new, process it
            let ret = processData(
              uid,
              channel,
              msgTimestamp,
              message,
              isFull,
              msgtype & MSGISPRESENCE ? true : false,
              msgtype & MSGISPRESENCEACK ? true : false,
              msgtype & MSGISDATA ? true : false,
              msgtype & MSGISMULTIPART ? true : false,
              msgtype & MSGISFIRST ? true : false,
              msgtype & MSGISLAST ? true : false,
              fsEnabled,
              msgChksum
            );
            if (ret < 0) {
              console.log("Process data failed: " + ret);
            }
          });
        } else {
            // After resync, process all messages directly (all are new)
            let ret = processData(
              uid,
              channel,
              msgTimestamp,
              message,
              isFull,
              msgtype & MSGISPRESENCE ? true : false,
              msgtype & MSGISPRESENCEACK ? true : false,
              msgtype & MSGISDATA ? true : false,
              msgtype & MSGISMULTIPART ? true : false,
              msgtype & MSGISFIRST ? true : false,
              msgtype & MSGISLAST ? true : false,
              fsEnabled,
              msgChksum
            );
            if (ret < 0) {
              console.log("Process data failed: " + ret);
            }
          }
        }
        break;
      case "send":
        let uid = utf8Decode(e.data[1]);
        let channel = utf8Decode(e.data[2]);
        let msgType = e.data[3];
        let msgChksum = e.data[4];
        gSeenChksums[channel].add(msgChksum);

        // Save sent message to IndexedDB since server doesn't echo back own messages
        if (gPendingSentMessages[channel]) {
          const pending = gPendingSentMessages[channel];
          const isFull = msgType & MSGISFULL;
          if (isFull) {
            // Determine message type
            let msgtype = MSGISFULL;
            const isAudioMsg = pending.isAudio;
            const isImageMsg = pending.isImage;
            if (isImageMsg || isAudioMsg) {
              msgtype |= MSGISDATA;
            }
            const dataUrl = (isImageMsg || isAudioMsg) ? pending.message : null;
            const isOwn = true;
            const fsEnabled = pending.fsEnabled;

            // Save to IndexedDB with pending timestamp (client time)
            MessageDB.saveMessage(channel, uid, pending.message, pending.timestamp, msgtype, dataUrl, msgChksum, isOwn, fsEnabled);
          }
          delete gPendingSentMessages[channel];
        }
        break;
    case "close":
      {
        let uid = utf8Decode(e.data[1]);
        let channel = utf8Decode(e.data[2]);

        let ret = processClose(uid, channel);
        if (ret < 0) {
          console.log("Process close failed: " + ret);
        }
      }
      break;
    case "forwardsecrecy":
      {
        let uid = utf8Decode(e.data[1]);
        let channel = utf8Decode(e.data[2]);
        const prevBdKey = e.data[3];

        let ret = processForwardSecrecy(uid, channel, prevBdKey);
        if (ret < 0) {
          console.log("Process forward secrecy failed: " + ret);
        }
      }
      break;
    case "forwardsecrecyoff":
      {
        let uid = utf8Decode(e.data[1]);
        let channel = utf8Decode(e.data[2]);

        let ret = processForwardSecrecyOff(uid, channel);
        if (ret < 0) {
          console.log("Process forward secrecy off failed: " + ret);
        }
      }
      break;
    case "resync":
      {
        let channel = utf8Decode(e.data[2]);
        //sendEmptyJoin(channel);
      }
      break;
  }
};

function updateDateval(channel, dateString) {
  let lastDate = gLastMessageSendOrRcvdDate[channel];
  const begin = gWeekday[0].length + 2;
  const end = DATELEN + 1;
  if (lastDate && dateString.slice(begin, end) == lastDate.slice(begin, end)) {
    return null;
  } else {
    const dateval = dateString.slice(1, DATELEN + gWeekday[0].length - 1);
    gLastMessageSendOrRcvdDate[channel] = dateString;
    return dateval;
  }
}

function updateTime(dateString) {
  let time =
    "[" + dateString.slice(DATELEN + gWeekday[0].length, dateString.length);
  return time;
}

function doNotify(uid, channel, msgTimestamp, message) {
  gLastMessage[channel] = [msgTimestamp, uid, message];
  let msg = gLastMessage[channel];
  if (isCordova) {
    cordova.plugins.notification.local.schedule({
      title: msg[1] + "@" + channel,
      text: msg[2],
      icon: "res://large_micon.png",
      smallIcon: "res://micon.png",
      foreground: false,
      trigger: { in: 1, unit: "second" },
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrollToBottomWithTimer() {
  let channel = gActiveChannel;
  /* Scroll several times to update UI */
  await sleep(SCROLL_TIME);
  scrollToBottom(channel);
  await sleep(SCROLL_TIME);
  scrollToBottom(channel);
  await sleep(SCROLL_TIME);
  scrollToBottom(channel);
}

async function resync(uid, channel) {
  let cnt;
  do {
    cnt = gIsResync[channel];
    await sleep(RESYNC_TIMEOUT);
  } while (cnt < gIsResync[channel]);
  queueSweepAndSend(uid, channel);
  gIsResync[channel] = 0;
}

async function reconnect(uid, channel) {
  if (null == gMyChannel[channel]) {
    gWebWorker.postMessage([
      "close",
      null,
      utf8Encode(uid),
      utf8Encode(channel),
    ]);
    return;
  }
  if (gReconnTimeout[channel] > MAXTIMEOUT) {
    gReconnTimeout[channel] = MAXTIMEOUT;
    gReconnAttempts[channel] += 1;
  }

  await sleep(gReconnTimeout[channel]);
  gReconnTimeout[channel] *= 2;
  gWebWorker.postMessage([
    "reconnect",
    null,
    utf8Encode(uid),
    utf8Encode(channel),
    gPrevBdKey[channel],
  ]);
}

/* Called from the background thread */
function syncReconnect() {
  for (let channel in gMyChannel) {
    if (gInitOk[channel] && gMyName[channel] && gMyChannel[channel]) {
      gWebWorker.postMessage([
        "reconnect",
        null,
        utf8Encode(gMyName[channel]),
        utf8Encode(gMyChannel[channel]),
        gPrevBdKey[channel],
      ]);
      //sendEmptyJoin(gMyChannel[channel]);
    }
  }
}

function scrollToBottom(channel) {
  if (null == channel) return;
  messages_list.scrollTop = messages_list.scrollHeight;
  gPrevScrollTop[channel] = messages_list.scrollTop;
}

function sendData(cmd, uid, channel, data, msgtype) {
  if (gInitOk[channel]) {
    const msgDate = parseInt(Date.now() / 1000) * 1000; //in seconds
    let mHash;

    let arr = [
      cmd,
      data,
      utf8Encode(uid),
      utf8Encode(channel),
      msgtype,
      msgDate.valueOf(),
    ];

    if (!(msgtype & MSGISPRESENCE) && gSipKey[channel]) {
      mHash = hashMessage(
        uid,
        channel,
        msgtype & MSGISFULL
          ? msgDate.valueOf() + data + "\n"
          : msgDate.valueOf() + data,
      );
      msgHashHandle(uid, channel, msgDate.valueOf(), mHash);
    }

    if (0 == gIsResync[channel]) {
      gWebWorker.postMessage(arr);
    }
    if (msgtype & MSGISFULL && data.length > 0) {
      queuePostMsg(uid, channel, [
        msgDate.valueOf(),
        arr,
        mHash,
        msgtype & MSGISDATA ? true : false,
        gForwardSecrecy[channel],
      ]);
    }
  }
}

function updateAfterSend(channel, message, isFull, isImage, isAudio) {
  let dateString = "[" + timeNow() + "] ";
  let date = updateDateval(channel, dateString);
  let time = updateTime(dateString);
  let li;

  if (!gMsgs[channel]) {
    gMsgs[channel] = new Queue();
    gNewMsgsCnt[channel] = 0;
  }

  if (date) {
    /* Update new date header */
    li = DATESTART + ' - <span class="name">' + date + "</span> - </li>";
    if (!gDateSeparatorCnt[channel]) gDateSeparatorCnt[channel] = 0;
    gDateSeparatorCnt[channel]++;
    $("#messages").append(li);
    gMsgs[channel].push(li);
  }

  time = checkTime(gMyName[channel], gMyChannel[channel], time, isFull);

  if (!isImage) {
    if (!gForwardSecrecy[channel]) {
      li =
        '<div id="owner' +
        gOwnId[channel] +
        '"><li class="own"><span class="name">' +
        gMyName[channel] +
        "</span> " +
        time +
        "" +
        autolinker.link(message) +
        "</li></div>";
    } else {
      li =
        '<div id="owner' +
        gOwnId[channel] +
        '"><li class="own" style="color: ' +
        FSFONTCOLOR +
        '"><span class="name">' +
        gMyName[channel] +
        '</span> ' +
        time +
        "" +
        autolinker.link(message) +
        "</li></div>";
    }
  } else if (isAudio) {
    if (!gForwardSecrecy[channel]) {
      li =
        '<div id="owner' +
        gOwnId[channel] +
        '"><li class="own"><span class="name">' +
        gMyName[channel] +
        "</span> " +
        time +
        '🎙 <audio controls src="' +
        message +
        '" /></li></div>';
    } else {
      li =
        '<div id="owner' +
        gOwnId[channel] +
        '"><li class="own" style="color: ' +
        FSFONTCOLOR +
        '"><span class="name">' +
        gMyName[channel] +
        '</span> ' +
        time +
        '🎙 <audio controls src="' +
        message +
        '" /></li></div>';
    }
  } else {
    // This is for images
    if (!gForwardSecrecy[channel]) {
      li =
        '<div id="owner' +
        gOwnId[channel] +
        '"><li class="own"><span class="name">' +
        gMyName[channel] +
        "</span> " +
        time +
        '<img class="image" src="' +
        message +
        '" height="100px" data-action="zoom" alt=""></li></div>';
    } else {
      li =
        '<div id="owner' +
        gOwnId[channel] +
        '"><li class="own" style="color: ' +
        FSFONTCOLOR +
        '"><span class="name">' +
        gMyName[channel] +
        '</span> ' +
        time +
        '<img class="image" src="' +
        dataUrl +
        '" height="100px" data-action="zoom" alt=""></li></div>';
    }
  }

  if (isFull) {
    if (isImage) {
      $("#messages").append(li);
    }
    gMsgs[channel].push(li);
    gLastWrittenMsg[channel] = li;
    gOwnId[channel] += 1;
    gOwnAppend[channel] = false;
  } else {
    gLastWrittenMsg[channel] = "";
    if (false == gOwnAppend[channel]) {
      $("#messages").append(li);
      gOwnAppend[channel] = true;
    } else $("#owner" + gOwnId[channel]).replaceWith(li);
  }

  scrollToBottom(channel);
  if (isFull) $("#input_message").val("");

  // Store sent message details, waiting for msgChksum from webworker
  if (isFull) {
    gPendingSentMessages[channel] = {
      message: message,
      timestamp: Date.now(),
      isImage: isImage,
      isAudio: isAudio,
      fsEnabled: gForwardSecrecy[channel] || false
    };
  }
}

function sendMessage(
  channel,
  message,
  isFull,
  isPresence,
  isPresenceAck = false,
) {
  let msgtype = isFull ? MSGISFULL : 0;
  msgtype |= isPresence ? MSGISPRESENCE : 0;
  msgtype |= isPresenceAck ? MSGISPRESENCEACK : 0;
  sendData("send", gMyName[channel], gMyChannel[channel], message, msgtype);
}

function eightBytesString(val) {
  return ("00000000" + val.toString(16)).slice(-8);
}

async function sendDataurlMulti(dataUrl, uid, channel, image_cnt) {
  let msgtype = MSGISFULL | MSGISDATA | MSGISMULTIPART | MSGISFIRST;
  let limit = 2 ** 10;
  let size = limit;
  let index = 0;

  const image_hash = hashImage(uid, channel, dataUrl, image_cnt);
  for (let i = 0; i < dataUrl.length; i += size) {
    const hash = image_hash + index;
    let data = eightBytesString(hash);
    if (1 == i) msgtype &= ~MSGISFIRST;
    index++;

    if (i + size >= dataUrl.length) {
      msgtype |= MSGISLAST;
      data += dataUrl.slice(i, dataUrl.length);
      await sleep(ASYNC_SLEEP);
      sendData("send", gMyName[channel], gMyChannel[channel], data, msgtype);
      break;
    }
    data += dataUrl.slice(i, i + size);
    sendData("send", gMyName[channel], gMyChannel[channel], data, msgtype);
    await sleep(ASYNC_SLEEP);
  }
}

function sendDataurl(dataUrl, uid, channel) {
  if (!gSipKey[channel]) return 0;

  if (!gImageCnt) {
    gImageCnt = SipHash.hash_uint(gSipKey[channel], uid + Date.now());
  } else {
    gImageCnt++;
  }
  sendDataurlMulti(dataUrl, uid, channel, gImageCnt);
  return 1;
}

function sendImage(channel, file) {
  let fr = new FileReader();
  fr.onload = function (readerEvent) {
    if (file.size >= IMGFRAGSIZE) {
      //resize the image
      let image = new Image();
      image.onload = function (imageEvent) {
        let canvas = document.createElement("canvas"),
          max_size = IMGMAXSIZE,
          width = image.width,
          height = image.height;
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        let dataUrl = canvas.toDataURL(file.type);
        if (sendDataurl(dataUrl, gMyName[channel], gMyChannel[channel]))
          updateAfterSend(channel, dataUrl, true, true, false);
      };
      image.src = readerEvent.target.result;
    } else {
      //send directly without resize
      if (sendDataurl(fr.result, gMyName[channel], gMyChannel[channel]))
        updateAfterSend(channel, fr.result, true, true, false);
    }
  };
  fr.readAsDataURL(file);
}

function getToken(channel, token) {
  return (
    "https://" +
    getLocalAddrPortInput(channel) +
    "/mlestalk-web.html?token=" +
    token
  );
}

function getFront() {
  $("#channel_localization").val(getLocalLanguageSelection());
  setLanguage();
  $("#input_addr_port").val(getLocalAddrPortInput(null));
}

function getLocalAddrPortInput(channel) {
  if (null == channel) return "mles.io:443";
  let apinput = window.localStorage.getItem("gAddrPortInput" + channel);
  if (apinput != undefined && apinput != "" && apinput != "mles.io:80") {
    return apinput;
  } else {
    return "mles.io:443";
  }
}

function getMsgTimestamps() {
  gMsgTs = JSON.parse(window.localStorage.getItem("gMsgTsJSON"));
  if (!gMsgTs) gMsgTs = {};
}

function setMsgTimestamps() {
  window.localStorage.setItem("gMsgTsJSON", JSON.stringify(gMsgTs));
}

function clearMsgTimestamps() {
  window.localStorage.removeItem("gMsgTsJSON");
}

function getNotifyTimestamps() {
  gIdNotifyTs = JSON.parse(window.localStorage.getItem("gIdNotifyTsJSON"));
  if (!gIdNotifyTs) gIdNotifyTs = {};
}

function setNotifyTimestamps() {
  window.localStorage.setItem("gIdNotifyTsJSON", JSON.stringify(gIdNotifyTs));
}

function clearNotifyTimestamps() {
  window.localStorage.removeItem("gIdNotifyTsJSON");
}

function getActiveChannels() {
  gActiveChannels = JSON.parse(
    window.localStorage.getItem("gActiveChannelsJSON"),
  );
}

function setActiveChannels() {
  window.localStorage.setItem(
    "gActiveChannelsJSON",
    JSON.stringify(gActiveChannels),
  );
}

function clearActiveChannels() {
  window.localStorage.removeItem("gActiveChannelsJSON");
}

function getLocalSession(channel) {
  gMyName[channel] = window.localStorage.getItem("gMyName" + channel);
  gMyChannel[channel] = window.localStorage.getItem("gMyChannel" + channel);
  gMyKey[channel] = window.localStorage.getItem("gMyKey" + channel);
}

function clearLocalSession(channel) {
  window.localStorage.removeItem("gMyName" + channel);
  window.localStorage.removeItem("gMyChannel" + channel);
  window.localStorage.removeItem("gMyKey" + channel);
}

function getLocalBdKey(channel) {
  const bdKeyStr = window.localStorage.getItem("gPrevBdKey" + channel);

  if (bdKeyStr) {
    try {
      // Parse JSON array and convert back to Uint8Array
      const bdKeyArray = JSON.parse(bdKeyStr);
      gPrevBdKey[channel] = new Uint8Array(bdKeyArray);
    } catch (e) {
      console.error("Failed to parse BD key from localStorage:", e);
      gPrevBdKey[channel] = null;
    }
  } else {
    gPrevBdKey[channel] = null;
  }
}

function setLocalBdKey(channel, bdKey) {
  if (bdKey && bdKey instanceof Uint8Array) {
    // Convert Uint8Array to regular array for JSON serialization
    const bdKeyArray = Array.from(bdKey);
    window.localStorage.setItem("gPrevBdKey" + channel, JSON.stringify(bdKeyArray));
  }
}

function clearLocalBdKey(channel) {
  window.localStorage.removeItem("gPrevBdKey" + channel);
}

async function captureMicrophone(callback) {
  const audioPerm = await requestAudioPermission();
  if (!audioPerm) {
    throw new Error("Microphone permission denied");
  }
  // Try to get the audio stream
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // Success - call the callback with the stream
    callback(stream);
  } catch (streamError) {
    throw new Error("Failed to access microphone: " + streamError.message);
  }
}

function handleDataAvailable(event) {
  if (event.data.size > 0) {
    let reader = new FileReader();
    reader.readAsDataURL(event.data);
    reader.onload = function () {
      send(true, reader.result);
      if (gRecorder) {
        gRecorder.ondataavailable = null;
        gRecorder = null;
      }
    };
  }
}

function record() {
  if (false == gRecStatus) {
    // Ask for confirmation before starting recording
    if (!confirm(gRecordConfirmText)) {
      return;
    }

    captureMicrophone(function (microphone) {
      let options = { mimeType: "audio/webm" };
      gRecorder = new MediaRecorder(microphone, options);
      gRecorder.ondataavailable = handleDataAvailable;
      gRecStatus = true;
      gRecorder.onstop = (e) => {
        if (gRecorder) {
          microphone.getTracks().forEach((t) => t.stop());
          gRecorder.ondataavailable = null;
          gRecorder = null;
          microphone = null;
        }
      };
      let img_src = "img/mic_icon_rec.png";
      $("#input_rec").attr("src", img_src);
      gRecorder.start();
      gRecTimeoutId = setTimeout(function () {
        gRecorder.stop();
        gRecTimeoutId = 0;
        let img_src = "img/mic_icon.png";
        $("#input_rec").attr("src", img_src);
        gRecStatus = false;
      }, REC_TIMEOUT);
    });
  } else {
    gRecorder.stop();
    if (gRecTimeoutId) {
      clearTimeout(gRecTimeoutId);
      gRecTimeoutId = 0;
    }
    let img_src = "img/mic_icon.png";
    $("#input_rec").attr("src", img_src);
    gRecStatus = false;
  }
}

async function checkUpgrades() {
  await sleep(CHECKUPG_SLEEP);
  fetch(UPGINFO_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      // Parse the JSON data and extract the version item
      const version = data.version;
      const dlurl = data.url;
      const b2sum = data.b2sum;

      if (version != VERSION) {
        verAlert(true, version, dlurl, b2sum);
      }
    })
    .catch((error) => {
      console.error("Upgrade check error: ", error);
    });
}

function utf8Decode(string) {
  return decodeURIComponent(string);
}

function utf8Encode(utftext) {
  return encodeURIComponent(utftext);
}

function showQRCodeFor(channel) {
  try {
    // Create QR code content with channel details
    const channelDetails = {
      channel: gMyChannel[channel],
      key: gMyKey[channel],
      server: gAddrPortInput[channel],
    };

    const encodedContent = "mlestalk:" + btoa(JSON.stringify(channelDetails));

    if (!qrcode) {
      qrcode = new QRCode(document.getElementById("qrcode"), {
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M,
      });
    } else {
      qrcode.clear();
    }

    qrcode.makeCode(encodedContent);
    document.getElementById("qrcode_section").style.display = "block";
  } catch (e) {
    console.error("Error generating QR code:", e);
  }
}

function toggleQRCode(channel = null) {
  const qrSection = document.getElementById("qrcode_section");
  if (qrSection) {
    // If we're already showing the QR code, just hide it
    if (qrSection.style.display !== "none") {
      qrSection.style.display = "none";
      // Clear QR code when hiding
      if (qrcode) {
        qrcode.clear();
      }
    }
    // Only show QR code if we have a channel
    else if (channel) {
      showQRCodeFor(channel);
    }
  }
}

async function requestCameraPermission() {
  if (isCordova) {
    return new Promise((resolve, reject) => {
      var Permission = window.plugins.Permission;
      var permission = "android.permission.CAMERA";

      Permission.has(
        permission,
        function (results) {
          if (!results[permission]) {
            Permission.request(
              permission,
              function (results) {
                if (results[permission]) {
                  resolve(true); // Permission granted
                } else {
                  resolve(false); // Permission denied
                }
              },
              function (error) {
                resolve(false); // Error during request
              },
            );
          } else {
            resolve(true); // Already had permission
          }
        },
        function (error) {
          resolve(false); // Error checking permission
        },
      );
    });
  } else {
    // Browser environment
    return navigator.mediaDevices
      .getUserMedia(CAMERA_CONSTRAINTS)
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        return true;
      })
      .catch(() => false);
  }
}

async function startQRScanner(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  try {
    // Check camera permission first
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      throw new Error("Camera permission denied");
    }

    // Create scanner UI
    let scannerDiv = document.getElementById("qr-scanner");
    if (!scannerDiv) {
      scannerDiv = document.createElement("div");
      scannerDiv.id = "qr-scanner";
      scannerDiv.innerHTML = `
        <div style="position:relative;">
          <video id="qr-video" style="width:100%;max-width:400px;" playsinline></video>
          <div id="camera-controls" style="position:absolute;top:10px;left:10px;"></div>
          <button onclick="stopQRScanner()" class="btn close-btn"
            style="position:absolute;right:10px;top:10px;border-radius:50%;width:30px;height:30px;padding:0;">✕</button>
        </div>
      `;
      document.body.appendChild(scannerDiv);
    }

    // Style scanner overlay
    scannerDiv.style.cssText = `
      display: block;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;

    // Just start with default camera
    await startCamera();
  } catch (error) {
    alert("Could not start camera: " + error.message);
    stopQRScanner();
  }
}

async function startCamera(deviceId = null) {
  const video = document.getElementById("qr-video");
  if (!video) return;

  // Stop any existing stream
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
  }

  // Configure constraints
  const constraints = {
    ...CAMERA_CONSTRAINTS,
    video: {
      ...CAMERA_CONSTRAINTS.video,
      deviceId: deviceId ? { exact: deviceId } : undefined,
    },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();

    // Start QR scanning
    requestAnimationFrame(scan);
  } catch (error) {
    console.error("Camera start error:", error);
    throw error;
  }
}

// Modified stopQRScanner function
function stopQRScanner() {
  const scanner = document.getElementById("qr-scanner");
  if (scanner) {
    const video = document.getElementById("qr-video");
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
    }
    scanner.remove(); // Remove completely instead of just hiding
  }
}

// Modified scan function
function scan() {
  const video = document.getElementById("qr-video");
  if (!video) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code && code.data) {
        if (!code.data.startsWith("mlestalk:")) {
          requestAnimationFrame(scan);
          return;
        }

        handleQRCode(code.data);
        return;
      }
    } catch (error) {
      console.error("QR scan error:", error);
    }
  }
  requestAnimationFrame(scan);
}

// Handle scanned QR code
function handleQRCode(data) {
  try {
    const encodedData = data.substring(9); // Remove "mlestalk:"
    const decodedData = atob(encodedData);
    const channelDetails = JSON.parse(decodedData);

    if (!channelDetails || !channelDetails.channel) {
      throw new Error("Invalid QR code format");
    }

    // Fill in the form fields
    if (channelDetails.channel) {
      document.getElementById("input_channel").value = channelDetails.channel;
    }
    if (channelDetails.key) {
      document.getElementById("input_key").value = channelDetails.key;
    }
    if (channelDetails.server) {
      document.getElementById("input_addr_port").value = channelDetails.server;
    }

    // Stop scanning
    stopQRScanner();
  } catch (error) {
    console.error("QR code handling error:", error);
    // Continue scanning
    requestAnimationFrame(scan);
  }
}

function generateStrongKey(event) {
  // Prevent form submission
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const passwdLength = Math.max(24, MIN_PASSWORD_LENGTH);
  // Characters to use for password generation
  const upperCase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowerCase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  // Combine all characters
  const allChars = upperCase + lowerCase + numbers + special;

  // Create array to store password characters
  let password = new Uint8Array(passwdLength);

  // Fill with secure random values
  crypto.getRandomValues(password);

  // Convert to string ensuring at least one of each required character type
  let result = "";

  // Add one of each required type first
  result +=
    upperCase[crypto.getRandomValues(new Uint8Array(1))[0] % upperCase.length];
  result +=
    lowerCase[crypto.getRandomValues(new Uint8Array(1))[0] % lowerCase.length];
  result +=
    numbers[crypto.getRandomValues(new Uint8Array(1))[0] % numbers.length];
  result +=
    special[crypto.getRandomValues(new Uint8Array(1))[0] % special.length];

  // Fill the rest with random characters
  for (let i = result.length; i < passwdLength; i++) {
    const randomValue = crypto.getRandomValues(new Uint8Array(1))[0];
    result += allChars[randomValue % allChars.length];
  }

  // Secure shuffle using Fisher-Yates with crypto random
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const randomValues = crypto.getRandomValues(new Uint8Array(1));
      const j = randomValues[0] % (i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  // Shuffle the password
  const finalPassword = shuffleArray(result.split("")).join("");

  // Set the generated password to the key input
  document.getElementById("input_key").value = finalPassword;
}
