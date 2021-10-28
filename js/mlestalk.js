/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2019-2021 MlesTalk developers
 */
let gMyName = {};
let gMyChannel = {};
let gMyKey = {};
let gMyAddr = {};
let gMyPort = {};
let gAddrPortInput = {};
let gOwnId = {};
let gOwnAppend = {};
let gIdHash = {};
let gIdAppend = {};
let gIdTimestamp = {};
let gPresenceTs = {};
let gIdNotifyTs = {};
let gMsgTs = {};
let gIdLastMsgLen = {};
let gPrevBdKey = {};
let gForwardSecrecy = {};
let gReadMsgDelayedQueueLen = {};
let gActiveChannel = null;
let gActiveChannels = {};

/* Msg type flags */
const MSGISFULL = 0x1;
const MSGISPRESENCE = (0x1 << 1);
const MSGISIMAGE = (0x1 << 2);
const MSGISMULTIPART = (0x1 << 3);
const MSGISFIRST = (0x1 << 4);
const MSGISLAST = (0x1 << 5);
const MSGISPRESENCEACK = (0x1 << 6);
const MSGPRESACKREQ = (0x1 << 7);
const MSGISBDONE = (0x1 << 8);
const MSGISBDACK = (0x1 << 9);

let gUidQueue = {};

const IMGMAXSIZE = 920; /* px */
const IMGFRAGSIZE = 512 * 1024;

let gInitOk = {};
const PRESENCETIME = (3 * 60 + 1) * 1000; /* ms */
const IDLETIME = (11 * 60 + 1) * 1000; /* ms */
const LISTING_SHOW_TIMER = 2000; /* ms */
const RETIMEOUT = 1500; /* ms */
const MAXTIMEOUT = 1000 * 60 * 4; /* ms */
const MAXQLEN = 1000;
const RESYNC_TIMEOUT = 2000; /* ms */
const LED_ON_TIME = 500; /* ms */
const LED_OFF_TIME = 2500; /* ms */
const SCROLL_TIME = 500; /* ms */
const ASYNC_SLEEP = 1 /* ms */
const ASYNC_IMG_SLEEP = 10 /* ms */
let gReconnTimeout = {};
let gReconnAttempts = {};

let gMultipartDict = {};
let gMultipartSendDict = {};
let gMultipartContinue = {};
const MULTIPART_SLICE = 4096; //B

const DATELEN = 13;

let gSipKey = {};
let gSipKeyChan = {};
let gIsResync = {};
let gLastWrittenMsg = {};

let gLastMessageSeenTs = {};
let gLastMessage = {};
let gLastMessageSendOrRcvdDate = {};

let gIsPresenceView = false;
let gIsChannelListView = false;
let gWasChannelListView = false;

let gCanNotify = false;
let gWillNotify = true;
let gIsPause = false;
let isCordova = false;
let gIsReconnect = {};

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
let gBgTitle = "MlesTalk in the background";
let gBgText = "Notifications active";
let gImageStr = "<an image>";

const FSFONTCOLOR = "#899CD4";

class Queue {
	constructor(...elements) {
		this.elements = [...elements];
		this.qmax = MAXQLEN;
	}
	push(...args) {
		if (this.getLength() >= this.maxLength())
			this.shift();
		return this.elements.push(...args);
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

function uidQueueGet(uid, channel) {
	if(!gUidQueue[channel])
		gUidQueue[channel] = {};
	if (!gUidQueue[channel][uid])
		gUidQueue[channel][uid] = new Queue();
	return gUidQueue[channel][uid];
}

function queueFindAndMatch(msgTimestamp, uid, channel, message, isFull) {
	let q = uidQueueGet(uid, channel);
	if (q) {
		let lastSeen = -1;
		const qlen = q.getLength();
		for (let i = 0; i < qlen ; i++) {
			let obj = q.get(i);
			if (obj[0] < msgTimestamp) {
				lastSeen = i + 1;
				continue;
			}
			if (message.length > 0) {
				let hash = hashMessage(uid, channel, isFull ? msgTimestamp + message + '\n' : msgTimestamp + message);
				if (obj[2] == hash) {
					lastSeen = i + 1;
					break;
				}
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

function queueSweepAndSend(uid, channel) {
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
			}
		}
	}
	gIsResync[channel] = 0;
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
		wwwMatches: true,
		tldMatches: true
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
		location: 'end'
	},

	className: ''
});

function stampTime(msgdate) {
	let dd = msgdate.getDate(),
		mm = msgdate.getMonth() + 1,
		yyyy = msgdate.getFullYear(),
		h = msgdate.getHours(),
		m = msgdate.getMinutes(),
		day = gWeekday[msgdate.getDay()];
	if (dd < 10) dd = '0' + dd;
	if (mm < 10) mm = '0' + mm;
	if (m < 10) m = '0' + m;
	return day + ' ' + dd + '.' + mm + '.' + yyyy + ' ' + h + ':' + m;
}

function timeNow() {
	return stampTime(new Date());
}

function get_uniq(uid, channel) {
	return SipHash.hash_hex(gSipKey[channel], uid + channel);
}

let gWebWorker = new Worker('webworker/js/webworker.js');

function onPause() {
	gWillNotify = true;
	gIsPause = true;
	if (isCordova) {
		if (!cordova.plugins.backgroundMode.isActive()) {
			cordova.plugins.backgroundMode.enable();
		}
		cordova.plugins.backgroundMode.configure({
			title: gBgTitle,
			text: gBgText
		});
		cordova.plugins.backgroundMode.toBackground();
		cordova.plugins.notification.badge.clear();
		cordova.plugins.notification.local.clearAll();
	}
}

function onResume() {
	gWillNotify = true;
	gIsPause = false;
	if (isCordova) {
		cordova.plugins.notification.local.clearAll();
		cordova.plugins.notification.badge.clear();
		cordova.plugins.backgroundMode.fromBackground();
	}
}

function onBackKeyDown() {
	/* Open presence info */
	if (!gIsPresenceView) {
		gIsPresenceView = true;
		if(gIsChannelListView) {
			gWasChannelListView = true;
			gIsChannelListView = false;
		}
		presenceChannelListShow();
	}
	else {
		gIsPresenceView = false;
		if(gWasChannelListView) {
			gWasChannelListView = false;
			gIsChannelListView = true;
			presenceChannelListShow();
		}
		else {
			$('#presence_cont').fadeOut(400, function () {
					$('#message_cont').fadeIn();
			});
		}
	}
}

function newChannelShow() {
	getFront();
	gActiveChannel = null;

	gIsPresenceView = false;
	gIsChannelListView = false;
	$('#presence_cont').fadeOut(400, function () {
		$('#name_channel_cont').fadeIn();
		$("#channel_submit, #form_send_message").submit(function (e) {
				e.preventDefault();
				askChannelNew();
				});
	});
}

let interval;
function onLoad() {
	document.addEventListener("deviceready", function () {
		cordova.plugins.notification.local.requestPermission(function (granted) {
			gCanNotify = granted;
		});

		cordova.plugins.backgroundMode.setDefaults({
			title: gBgTitle,
			text: gBgText
		});

		cordova.plugins.notification.local.setDefaults({
			led: { color: '#77407B', on: LED_ON_TIME, off: LED_OFF_TIME },
			vibrate: true
		});

		// sets a recurring alarm that keeps things rolling
		cordova.plugins.backgroundMode.disableWebViewOptimizations();
		cordova.plugins.backgroundMode.enable();

		document.addEventListener("pause", onPause, false);
		document.addEventListener("resume", onResume, false);
		document.addEventListener("backbutton", onBackKeyDown, false);

		isCordova = true;
	}, false);

	getFront();
}

$(document).ready(function () {
	getFront();
	getActiveChannels();
	if(gActiveChannels)
		joinExistingChannels(gActiveChannels)
	$("#channel_submit, #form_send_message").submit(function (e) {
		e.preventDefault();
		askChannelNew();
	});
});

function addrsplit(channel, addrport) {
	let addrarray = addrport.split(":");
	if (addrarray.length > 0) {
		gMyAddr[channel] = addrarray[0];
	}
	if (addrarray.length > 1) {
		gMyPort[channel] = addrarray[1];
	}
	if (gMyAddr[channel] == '') {
		gMyAddr[channel] = 'mles.io';
	}
	if (gMyPort[channel] == '') {
		gMyPort[channel] = '443';
	}
}

function joinExistingChannels(channels) {
	if(!channels)
		return;
	getNotifyTimestamps();
	getMsgTimestamps();
	for (let channel in channels) {
		getLocalSession(channel);
		gAddrPortInput[channel] = getLocalAddrPortInput(channel);
		if (!gInitOk[channel] && gMyName[channel] && gMyChannel[channel] && gMyKey[channel] && gAddrPortInput[channel]) {
			addrsplit(channel, gAddrPortInput[channel]);
			if(!gOwnId[channel])
				gOwnId[channel] = 0;
			if(!gOwnAppend[channel])
				gOwnAppend[channel] = false;
			gForwardSecrecy[channel] = false;
			gReadMsgDelayedQueueLen[channel] = 0;
			gLastMessageSeenTs[channel] = 0;
			gIsResync[channel] = 0;
			gInitOk[channel] = true;

			initReconnect(channel);

			getLocalBdKey(channel);
			gWebWorker.postMessage(["init", null, gMyAddr[channel], gMyPort[channel], gMyName[channel], gMyChannel[channel], gMyKey[channel], gPrevBdKey[channel]]);
		}
	}
	channelListShow();
	$('#name_channel_cont').fadeOut(400, function () {
		$('#presence_cont').fadeIn();
	});
}

function askChannelNew() {
	if(gActiveChannel)
		return;

	$('#messages').html('');
	if (($('#input_name').val().trim().length <= 0 ||
				$('#input_channel').val().trim().length <= 0 ||
				$('#input_key').val().trim().length <= 0)) {

		//not enough input, alert
		popAlert();
	}
	else {
		channel = $('#input_channel').val().trim();

		gMyChannel[channel] = channel;
		gOwnId[channel] = 0;
		gOwnAppend[channel] = false;
		gForwardSecrecy[channel] = false;
		gReadMsgDelayedQueueLen[channel] = 0;
		gLastMessageSeenTs[channel] = 0;
		gIsResync[channel] = 0;

		gMyName[channel] = $('#input_name').val().trim();
		gMyKey[channel] = $('#input_key').val().trim();
		gAddrPortInput[channel] = $('#input_addr_port').val().trim();
		let localization = $('#channel_localization').val().trim();

		//add to local storage
		if (gMyName[channel]) {
			window.localStorage.setItem('gMyName' + channel, gMyName[channel]);
		}
		if (gMyChannel[channel]) {
			window.localStorage.setItem('gMyChannel' + channel, gMyChannel[channel]);
		}
		if (gMyKey[channel]) {
			window.localStorage.setItem('gMyKey' + channel, gMyKey[channel]);
		}

		//add to local storage
		if (gAddrPortInput[channel].length > 0) {
			window.localStorage.setItem('gAddrPortInput' + channel, gAddrPortInput[channel]);
		}
		else {
			window.localStorage.setItem('gAddrPortInput' + channel, "mles.io:443");
		}

		//add to local storage
		if (localization.length > 0) {
			window.localStorage.setItem('localization', localization);
		}
		else {
			window.localStorage.setItem('localization', "gb");
		}

		addrsplit(channel, gAddrPortInput[channel]);

		initReconnect(channel);

		/* Load keys from local storage */
		getLocalBdKey(channel);
		gWebWorker.postMessage(["init", null, gMyAddr[channel], gMyPort[channel], gMyName[channel], gMyChannel[channel], gMyKey[channel], gPrevBdKey[channel]]);
		if(!gActiveChannels)
			gActiveChannels = {};
		gActiveChannels[channel] = channel;
		setActiveChannels();
		gActiveChannel = channel;
		selectSipToken(channel);

		$('#name_channel_cont').fadeOut(400, function () {
				$('#message_cont').fadeIn();
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
	sendMessage(channel, "", true, false);
}

async function send(isFull) {
	const channel = gActiveChannel;

	let message = $('#input_message').val();
	let file = document.getElementById("input_file").files[0];

	if (file) {
		sendImage(channel, file);
		document.getElementById("input_file").value = "";
	}
	else {
		sendMessage(channel, message, isFull, false);
		updateAfterSend(channel, message, isFull, false);
	}
}

function chanExitAll() {
	for (let val in gMyChannel) {
		if(val) {
			let channel = gMyChannel[val];
			if(channel) {
				closeSocket(channel);
			}
		}
	}
	$("#input_channel").val('');
	$("#input_key").val('');
	$('#qrcode').fadeOut();
	channelListShow();
}

function chanExit() {
	const channel = gActiveChannel;
	closeSocket(channel);
	$("#input_channel").val('');
	$("#input_key").val('');
	$('#qrcode').fadeOut();
	$('#presence_cont').fadeOut();
	$('#message_cont').fadeOut(400, function () {
		channelListShow();
		$('#presence_cont').fadeIn();
	});
}

function outputPresenceChannelList() {
	let date = Date.now();

	for (let val in gMyChannel) {
		if(val) {
			let channel = gMyChannel[val];
			if(channel) {
				let li;
				if(gMsgs[channel])
					li = '<li class="new" id="' + channel + '"><span class="name">#' + channel + ' (<b>' + gNewMsgsCnt[channel] + '</b>/' + gMsgs[channel].getLength() + ')</span></li>';
				else
					li = '<li class="new" id="' + channel + '"><span class="name">#' + channel + ' (<b>-</b>/-)</span></li>';

				$('#presence_avail').append(li);
				if(gIsPresenceView) {
					for (let uid in gPresenceTs[channel]) {
						let arr = gPresenceTs[channel][uid];
						if(!arr)
							continue;
						const ps_channel = arr[1];
						if(ps_channel != channel)
							continue;
						const user = arr[0];
						const timestamp = arr[2];
						if (user == gMyName[channel])
							continue;
						if (timestamp.valueOf() + PRESENCETIME >= date.valueOf())
							li = '<li><span class="name">   ' + user + '</span> <img src="img/available.png" alt="green" style="vertical-align:middle;height:22px;" /></li>';
						else if (timestamp.valueOf() + IDLETIME >= date.valueOf())
							li = '<li><span class="name">   ' + user + '</span> <img src="img/idle.png" alt="light green" style="vertical-align:middle;height:22px;" /></li>';
						else
							li = '<li><span class="name">   ' + user + '</span> <img src="img/unavailable.png" alt="grey" style="vertical-align:middle;height:22px;" /></li>';
						$('#presence_avail').append(li);
					}
				}
				document.getElementById(channel).onclick = function() {
					if(gMsgs[channel]) {
						$('#messages').html('');
						const qlen = gMsgs[channel].getLength();
						for(let i = 0; i < qlen; i++) {
							let li = gMsgs[channel].get(i);
							$('#messages').append(li);
						}
					}
					selectSipToken(channel);
					gActiveChannel = channel;
					gIsChannelListView = false;
					gWasChannelListView = false;
					gIsPresenceView = false;
					if(gMsgs[channel])
						gNewMsgsCnt[channel] = 0;
					const msgDate = parseInt(Date.now() / 1000) * 1000; //in seconds
					gMsgTs[channel] = msgDate.valueOf();
					setMsgTimestamps();
					$('#presence_cont').fadeOut(400, function () {
						$('#message_cont').fadeIn();
						scrollToBottom();
					});
				};
			}
		}
	}
	$('#message_cont').fadeOut(400, function () {
		$('#presence_cont').fadeIn();
	});
}

async function presenceChannelListShow() {
	while (gIsPresenceView || gIsChannelListView) {
		//console.log("Building presence list..");
		$('#presence_avail').html('');
		outputPresenceChannelList();
		await sleep(LISTING_SHOW_TIMER);
	}
}

async function channelListShow() {
	gIsChannelListView = true;
	gActiveChannel = null;

	presenceChannelListShow();
}

function closeSocket(channel) {
	initReconnect(channel);
	gInitOk[channel] = false;

	//init all databases
	gIdTimestamp[channel] = null;
	gPresenceTs[channel] = null;
	gIdNotifyTs[channel] = null;
	gMsgTs[channel] = null;
	gIdHash[channel] = null;
	gIdAppend[channel] = null;

	gLastMessageSeenTs[channel] = 0;

	queueFlush(gMyName[channel], gMyChannel[channel]);
	clearLocalBdKey(channel);
	clearLocalSession(channel);
	gForwardSecrecy[channel] = false;
	gPrevBdKey[channel] = null;
	gActiveChannel = null;
	gActiveChannels[channel] = null;
	gOwnId[channel] = null;
	gOwnAppend[channel] = false;
	gIsResync[channel] = 0;

	//guarantee that websocket gets closed without reconnect
	let tmpname = gMyName[channel];
	let tmpchannel = gMyChannel[channel];
	gMyName[channel] = null;
	gMyChannel[channel] = null;
	gWebWorker.postMessage(["close", null, tmpname, tmpchannel]);
	setActiveChannels();
	setNotifyTimestamps();
	setMsgTimestamps();
}

function initReconnect(channel) {
	gReconnTimeout[channel] = RETIMEOUT;
	gReconnAttempts[channel] = 0;
	gIsReconnect[channel] = false;
}

function processInit(uid, channel, mychan) {
	if (uid.length > 0 && channel.length > 0) {
		gInitOk[channel] = true;
		createSipToken(channel, mychan);
		if(gActiveChannel == channel)
			selectSipToken(channel);

		sendInitJoin(channel);

		if(!gMsgs[channel]) {
			gMsgs[channel] = new Queue();
			gNewMsgsCnt[channel] = 0;
		}

		let li;
		if (gIsReconnect[channel] && gLastMessageSeenTs[channel] > 0) {
			//do nothing
		}
		else {
			li = '<li class="new"> - <span class="name">' + uid + "@" + channel + '</span> - </li>';
			if(gActiveChannel == channel)
				$('#messages').append(li);
			gMsgs[channel].push(li);
		}

		return 0;
	}
	return -1;
}

function createSipToken(channel, mychan) {
	//use channel to create 128 bit secret key
	let bfchannel = atob(mychan);
	gSipKey[channel] = SipHash.string16_to_key(bfchannel);
	gSipKeyChan[channel] = bfchannel;
}

function selectSipToken(channel) {
	if(gSipKey[channel] && gSipKeyChan[channel]) {
		let atoken = SipHash.hash_hex(gSipKey[channel], gSipKeyChan[channel]);
		atoken = atoken + gSipKeyChan[channel];
		let token = btoa(atoken);
		document.getElementById("qrcode_link").setAttribute("href", getToken(channel, token));
		qrcode.clear(); // clear the code.
		qrcode.makeCode(getToken(channel, token)); // make another code.
		$('#qrcode').fadeIn();
	}
	else
		$('#qrcode').fadeOut();
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
	if(!gIdTimestamp[channel])
		gIdTimestamp[channel] = {};
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

let prevUid = "";
let prevChannel = "";
let prevTime = "";
function checkTime(uid, channel, time, isFull) {
	/* Skip time output for the same minute */
	if (prevUid == uid &&
		prevChannel == channel &&
		prevTime == time) {
		return "";
	}
	if (isFull) {
		prevUid = uid;
		prevChannel = channel;
		prevTime = time;
	}
	return time;
}

async function processData(uid, channel, msgTimestamp,
	message, isFull, isPresence, isPresenceAck, presAckRequired, isImage,
	isMultipart, isFirst, isLast, fsEnabled) {

	//update hash
	let duid = get_duid(uid, channel);
	if(!gIdHash[channel])
		gIdHash[channel] = {};
	if (!gIdHash[channel][uid]) {
		gIdHash[channel][uid] = 0;
		if(!gIdAppend[channel])
			gIdAppend[channel] = {};
		gIdAppend[channel][uid] = false;
		if(!gPresenceTs[channel])
			gPresenceTs[channel] = {};
		gPresenceTs[channel][uid] = [uid, channel, msgTimestamp];
		if(!gIdNotifyTs[channel])
			gIdNotifyTs[channel] = {};
		if(!gIdNotifyTs[channel][uid])
			gIdNotifyTs[channel][uid] = 0;
	}

	let dateString = "[" + stampTime(new Date(msgTimestamp)) + "] ";

	if (uid == gMyName[channel]) {
		if (0 == gIsResync[channel]) {
			console.log("Resyncing " + channel);
			resync(uid, channel);
		}
		gIsResync[channel] += 1;
		if ((isFull && message.length > 0) || (!isFull && message.length == 0)) /* Match full or presence messages */
			queueFindAndMatch(msgTimestamp, uid, channel, message, isFull);
	}
	else if (gOwnId[channel] > 0 && message.length >= 0 && gLastWrittenMsg[channel].length > 0) {
		let end = "</li></div>";
		//console.log("Got presence update from " + uid);
		gLastWrittenMsg[channel] = gLastWrittenMsg[channel].substring(0, gLastWrittenMsg[channel].length - end.length);
		gLastWrittenMsg[channel] += " &#x2713;" + end;
		$('#owner' + (gOwnId[channel] - 1)).replaceWith(gLastWrittenMsg[channel]);
		gLastWrittenMsg[channel] = "";
		//update presence if current time per user is larger than begin presence
	}

	const mHash = hashMessage(uid, channel, isFull ? msgTimestamp + message + '\n' : msgTimestamp + message);
	if (isMultipart) {
		//strip index
		const index = message.substr(0, 4);
		const numIndex = parseInt(index);
		message = message.substr(4);
		//console.log("Received image index " + numIndex);

		if (!gMultipartDict[get_uniq(uid, channel)]) {
			if (!isFirst) {
				//invalid frame
				return 0;
			}
			gMultipartDict[get_uniq(uid, channel)] = {};
		}

		// handle multipart hashing here
		if (msgHashHandle(uid, channel, msgTimestamp, mHash)) {
			gMultipartDict[get_uniq(uid, channel)][numIndex] = message;
			if (!isLast) {
				return 0;
			}

			await sleep(++gReadMsgDelayedQueueLen[channel] * ASYNC_SLEEP);
			gReadMsgDelayedQueueLen[channel]--;

			message = "";
			for (let i = 0; i <= numIndex; i++) {
				message += gMultipartDict[get_uniq(uid, channel)][i];
			}
			gMultipartDict[get_uniq(uid, channel)] = null;
		}
		else
			return 0;
	}

	if (isFull && 0 == message.length) /* Ignore init messages in timestamp processing */
		return 0;

	if (isMultipart || msgHashHandle(uid, channel, msgTimestamp, mHash)) {
		let date;
		let time;
		let li;

		gPresenceTs[channel][uid] = [uid, channel, msgTimestamp];

		if (gLastMessageSeenTs[channel] < msgTimestamp)
			gLastMessageSeenTs[channel] = msgTimestamp;

		if (!gIsResync[channel] && presAckRequired) {
			sendPresAck(channel);
			//console.log("Sending presence ack to " + uid + " timestamp " + stampTime(new Date(msgTimestamp)) + "!");
		}

		if (isPresence) {
			//console.log("Got presence from " + uid + " timestamp " + stampTime(new Date(msgTimestamp)) + "!");
			return 1;
		}

		date = updateDateval(channel, dateString);

		if(!gMsgs[channel]) {
			gMsgs[channel] = new Queue();
			gNewMsgsCnt[channel] = 0;
		}

		if (date) {
			/* Update new date header */
			li = '<li class="new"> - <span class="name">' + date + '</span> - </li>';
			gMsgs[channel].push(li);
			if(gActiveChannel == channel)
				$('#messages').append(li);
		}
		time = updateTime(dateString);

		if (!date)
			time = checkTime(uid, channel, time, isFull);

		//console.log("Channel " + channel + " uid " + uid + " Duid " + duid + "  hash " + gIdHash[channel][uid]);

		/* Check first is it a text or image */
		if (isImage) {
			if (!fsEnabled) {
				if (uid != gMyName[channel]) {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="new"><span class="name">' + uid + '</span> ' + time +
						'<img class="image" src="' + message + '" height="100px" data-action="zoom" alt="">';

				}
				else {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="own"> ' + time
						+ '<img class="image" src="' + message + '" height="100px" data-action="zoom" alt="">';

				}
			} else {
				if (uid != gMyName[channel]) {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="new"><span class="name">' + uid + '</span><font color="' + FSFONTCOLOR + '"> ' + time +
						'</font><img class="image" src="' + message + '" height="100px" data-action="zoom" alt="">';

				}
				else {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="own"><font color="' + FSFONTCOLOR + '"> ' + time
						+ '</font><img class="image" src="' + message + '" height="100px" data-action="zoom" alt="">';

				}
			}
			li += '</li></div>';
		}
		else {
			if (!fsEnabled) {
				if (uid != gMyName[channel]) {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="new"><span class="name"> ' + uid + '</span> '
						+ time + '' + autolinker.link(message) + '</li></div>';
				}
				else {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="own"> ' + time + '' + autolinker.link(message) + '</li></div>';
				}
			}
			else {
				if (uid != gMyName[channel]) {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="new"><span class="name"> ' + uid + '</span><font color="' + FSFONTCOLOR + '"> '
						+ time + '' + autolinker.link(message) + '</font></li></div>';
				}
				else {
					li = '<div id="' + duid + '' + gIdHash[channel][uid] + '"><li class="own"><font color="' + FSFONTCOLOR + '"> ' + time + '' + autolinker.link(message) + '</font></li></div>';
				}
			}
		}

		if(gActiveChannel == channel) {
			if (false == gIdAppend[channel][uid]) {
				$('#messages').append(li);
				gIdAppend[channel][uid] = true;
			}
			else {
				$('#' + duid + '' + gIdHash[channel][uid]).replaceWith(li);
			}
		}
		else {
			gIdAppend[channel][uid] = false;
		}

		if (isFull) {
			gMsgs[channel].push(li);
			gIdHash[channel][uid] += 1;
			gIdAppend[channel][uid] = false;

			if(gActiveChannel == channel) {
				scrollToBottom();
			}
		}

		if(gActiveChannel == channel) {
			gMsgTs[channel] = msgTimestamp;
			setMsgTimestamps();
		}

		if(isFull && (gActiveChannel != channel || gIsPause) && uid != gMyName[channel] && gMsgTs[channel] < msgTimestamp) {
			gNewMsgsCnt[channel] += 1;
			if (isCordova && gIsPause) {
				cordova.plugins.notification.badge.increase();
			}
		}

		const notifyTimestamp = parseInt(msgTimestamp / 1000 / 60); //one notify per minute
		if ((gActiveChannel != channel || gIsPause) && uid != gMyName[channel] && isFull &&
			gIdNotifyTs[channel][uid] < notifyTimestamp)
		{
			if (gWillNotify && gCanNotify) {
				if (true == isImage) {
					message = gImageStr;
				}
				doNotify(uid, channel, notifyTimestamp, message);
			}
			gIdNotifyTs[channel][uid] = notifyTimestamp;
			setNotifyTimestamps();
		}
	}
	return 0;
}

function processSend(uid, channel, isMultipart) {
	if (isMultipart) {
		if (gMultipartSendDict[get_uniq(uid, channel)]) {
			gMultipartContinue[channel] = true;
		}
	}
	return 0;
}

function processClose(uid, channel) {
	gIsReconnect[channel] = false;
	if (uid == gMyName[channel] && channel == gMyChannel[channel]) {
		reconnect(uid, channel);
	}
}

gWebWorker.onmessage = function (e) {
	let cmd = e.data[0];
	switch (cmd) {
		case "init":
			{
				let uid = e.data[1];
				let channel = e.data[2];
				let mychan = e.data[3]; //encrypted channel for token

				let ret = processInit(uid, channel, mychan);
				if (ret < 0) {
					console.log("Process init failed: " + ret);
				}
			}
			break;
		case "data":
			{
				let uid = e.data[1];
				let channel = e.data[2];
				let msgTimestamp = e.data[3];
				let message = e.data[4];
				let msgtype = e.data[5];
				let fsEnabled = e.data[6];

				initReconnect(channel);

				let ret = processData(uid, channel, msgTimestamp,
					message, msgtype & MSGISFULL ? true : false,
					msgtype & MSGISPRESENCE ? true : false,
					msgtype & MSGISPRESENCEACK ? true : false,
					msgtype & MSGPRESACKREQ ? true : false,
					msgtype & MSGISIMAGE ? true : false,
					msgtype & MSGISMULTIPART ? true : false,
					msgtype & MSGISFIRST ? true : false,
					msgtype & MSGISLAST ? true : false,
					fsEnabled);
				if (ret < 0) {
					console.log("Process data failed: " + ret);
				}
			}
			break;
		case "send":
			{
				let uid = e.data[1];
				let channel = e.data[2];
				let isMultipart = e.data[3];

				let ret = processSend(uid, channel, isMultipart);
				if (ret < 0) {
					console.log("Process send failed: " + ret);
				}
			}
			break;
		case "close":
			{
				let uid = e.data[1];
				let channel = e.data[2];

				let ret = processClose(uid, channel);
				if (ret < 0) {
					console.log("Process close failed: " + ret);
				}
			}
			break;
		case "forwardsecrecy":
			{
				let uid = e.data[1];
				let channel = e.data[2];
				const prevBdKey = e.data[3];

				//console.log("Got forward secrecy on!")
				let ret = processForwardSecrecy(uid, channel, prevBdKey);
				if (ret < 0) {
					console.log("Process close failed: " + ret);
				}
			}
			break;
		case "forwardsecrecyoff":
			{
				let uid = e.data[1];
				let channel = e.data[2];

				let ret = processForwardSecrecyOff(uid, channel);
				//console.log("Got forward secrecy off!")
				if (ret < 0) {
					console.log("Process close failed: " + ret);
				}
			}
			break;
		case "resync":
			{
				let channel = e.data[2];
				sendEmptyJoin(channel);
			}
			break;
	}
}

function updateDateval(channel, dateString) {
	let lastDate = gLastMessageSendOrRcvdDate[channel];
	const begin = gWeekday[0].length + 2;
	const end = DATELEN + 1;
	if (lastDate &&
		dateString.slice(begin, end) == lastDate.slice(begin, end)) {
		return null;
	}
	else {
		let dateval = dateString.slice(1, DATELEN + gWeekday[0].length - 1);
		gLastMessageSendOrRcvdDate[channel] = dateString;
		return dateval;
	}
}

function updateTime(dateString) {
	let time = "[" + dateString.slice(DATELEN + gWeekday[0].length, dateString.length);
	return time;
}

function doNotify(uid, channel, msgTimestamp, message) {
	gLastMessage[channel] = [msgTimestamp, uid, message];
	let msg = gLastMessage[channel];
	if (isCordova) {
		cordova.plugins.notification.local.schedule({
			title: msg[1] + "@" + channel,
			text: msg[2],
			icon: 'res://large_micon.png',
			smallIcon: 'res://icon.png',
			foreground: false,
			trigger: { in: 1, unit: 'second' }
		});
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrollToBottomWithTimer() {
	await sleep(SCROLL_TIME);
	scrollToBottom();
	/* Scroll twice if we miss the first one in UI */
	await sleep(SCROLL_TIME);
	scrollToBottom();
}

async function resync(uid, channel) {
	let cnt;
	do {
		cnt = gIsResync[channel];
		await sleep(RESYNC_TIMEOUT);
	}
	while(cnt < gIsResync[channel]);
	queueSweepAndSend(uid, channel);
}

async function reconnect(uid, channel) {
	if (true == gIsReconnect[channel]) {
		return;
	}
	if (gReconnTimeout[channel] > MAXTIMEOUT) {
		gReconnTimeout[channel] = MAXTIMEOUT;
		gReconnAttempts[channel] += 1;
	}

	gIsReconnect[channel] = true;
	await sleep(gReconnTimeout[channel]);
	gReconnTimeout[channel] *= 2;
	gWebWorker.postMessage(["reconnect", null, uid, channel, gPrevBdKey[channel]]);
}

const RESESS_LIMIT = 5;
let resession_counter = 0;
/* Called from the background thread */
function syncReconnect() {
	resession_counter += 1;
	for (let channel in gMyChannel) {
		if (gInitOk[channel]) {
			if (true == gIsReconnect[channel])
				continue;
			if (gMyName[channel] && gMyChannel[channel]) {
				//disable for now
				//console.log("resyncing channel " + gMyChannel[channel], " uid " + gMyName[channel]);
				//if(resession_counter >= RESESS_LIMIT) {
				//	gWebWorker.postMessage(["resync", null, gMyName[channel], gMyChannel[channel], gPrevBdKey[channel]]);
				//}
				//else {
					sendEmptyJoin(gMyChannel[channel]);
					gWebWorker.postMessage(["reconnect", null, gMyName[channel], gMyChannel[channel], gPrevBdKey[channel]]);
				//}
			}
		}
	}
	if(resession_counter >= RESESS_LIMIT)
		resession_counter = 0;
}

function scrollToBottom() {
	messages_list.scrollTop = messages_list.scrollHeight;
}

function sendData(cmd, uid, channel, data, msgtype) {
	if (gInitOk[channel]) {
		const msgDate = parseInt(Date.now() / 1000) * 1000; //in seconds
		let mHash;

		let arr = [cmd, data, uid, channel, msgtype, msgDate.valueOf()];

		if (!(msgtype & MSGISPRESENCE) && gSipKey[channel]) {
			mHash = hashMessage(uid, channel, msgtype & MSGISFULL ? msgDate.valueOf() + data + '\n' : msgDate.valueOf() + data);
			msgHashHandle(uid, channel, msgDate.valueOf(), mHash);
		}

		if (false == gIsResync[channel]) {
			gWebWorker.postMessage(arr);
		}
		if (msgtype & MSGISFULL && data.length > 0) {
			queuePostMsg(uid, channel, [msgDate.valueOf(), arr, mHash, msgtype & MSGISIMAGE ? true : false, gForwardSecrecy[channel]]);
		}
	}
}

function updateAfterSend(channel, message, isFull, isImage) {
	let dateString = "[" + timeNow() + "] ";
	let date = updateDateval(channel, dateString);
	let time = updateTime(dateString);
	let li;

	if(!gMsgs[channel]) {
		gMsgs[channel] = new Queue();
		gNewMsgsCnt[channel] = 0;
	}

	if (date) {
		/* Update new date header */
		li = '<li class="own"> - <span class="name">' + date + '</span> - </li>';
		$('#messages').append(li);
		gMsgs[channel].push(li);
	}

	if (!date)
		time = checkTime(gMyName[channel], gMyChannel[channel], time, isFull);

	if (!isImage) {
		if (!gForwardSecrecy[channel]) {
			li = '<div id="owner' + gOwnId[channel] + '"><li class="own"> ' + time + "" + autolinker.link(message) + '</li></div>';
		}
		else {
			li = '<div id="owner' + gOwnId[channel] + '"><li class="own"><font color="' + FSFONTCOLOR + '"> ' + time + '' + autolinker.link(message) + '</font></li></div>';
		}
	}
	else {
		if (!gForwardSecrecy[channel]) {
			li = '<div id="owner' + gOwnId[channel] + '"><li class="own"> ' + time
				+ '<img class="image" src="' + message + '" height="100px" data-action="zoom" alt=""></li></div>';
		}
		else {
			li = '<div id="owner' + gOwnId[channel] + '"><li class="own"><font color="' + FSFONTCOLOR + '"> ' + time
				+ '</font><img class="image" src="' + message + '" height="100px" data-action="zoom" alt=""></li></div>';
		}

	}

	if (isFull) {
		if (isImage) {
			$('#messages').append(li);
		}
		gMsgs[channel].push(li);
		gLastWrittenMsg[channel] = li;
		gOwnId[channel] += 1;
		gOwnAppend[channel] = false;
	}
	else {
		gLastWrittenMsg[channel] = "";
		if (false == gOwnAppend[channel]) {
			$('#messages').append(li);
			gOwnAppend[channel] = true;
		}
		else
			$('#owner' + gOwnId[channel]).replaceWith(li);
	}
	scrollToBottom();
	if (isFull)
		$('#input_message').val('');
}

function sendMessage(channel, message, isFull, isPresence, isPresenceAck = false) {
	let msgtype = (isFull ? MSGISFULL : 0);
	msgtype |= (isPresence ? MSGISPRESENCE : 0);
	msgtype |= (isPresenceAck ? MSGISPRESENCEACK : 0);
	sendData("send", gMyName[channel], gMyChannel[channel], message, msgtype);
}

async function sendDataurl(dataUrl, uid, channel) {
	let msgtype = MSGISFULL | MSGISIMAGE;

	if (dataUrl.length > MULTIPART_SLICE) {
		msgtype |= MSGISMULTIPART;
		gMultipartSendDict[get_uniq(uid, channel)] = true;
		for (let i = 0; i < dataUrl.length; i += MULTIPART_SLICE) {
			let data = "";
			if (i / MULTIPART_SLICE < 10)
				data += "000";
			else if (i / MULTIPART_SLICE < 100)
				data += "00";
			else if (i / MULTIPART_SLICE < 1000)
				data += "0";
			data += (i / MULTIPART_SLICE).toString();
			//console.log("Adding image index " + data);

			if (0 == i) {
				msgtype |= MSGISFIRST;
			}
			else if (i + MULTIPART_SLICE >= dataUrl.length) {
				msgtype |= MSGISLAST;
				data += dataUrl.slice(i, dataUrl.length);
				sendData("send", gMyName[channel], gMyChannel[channel], data, msgtype);
				gMultipartSendDict[get_uniq(uid, channel)] = false;
				gMultipartContinue[channel] = false;
				break;
			}
			data += dataUrl.slice(i, i + MULTIPART_SLICE);
			sendData("send", gMyName[channel], gMyChannel[channel], data, msgtype);
			while (false == gMultipartContinue[channel]) {
				await sleep(ASYNC_IMG_SLEEP);
			}
			gMultipartContinue[channel] = false;
		}
	}
	else {
		sendData("send", gMyName[channel], gMyChannel[channel], dataUrl, msgtype); /* is not multipart */
	}

	updateAfterSend(channel, dataUrl, true, true);
}


function sendImage(channel, file) {
	let fr = new FileReader();
	fr.onload = function (readerEvent) {
		if (file.size >= IMGFRAGSIZE) {
			let imgtype = 'image/jpeg';
			if (file.type.match('image/png')) {
				imgtype = 'image/png';
			}
			//resize the image
			let image = new Image();
			image.onload = function (imageEvent) {
				let canvas = document.createElement('canvas'),
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
				canvas.getContext('2d').drawImage(image, 0, 0, width, height);
				let dataUrl = canvas.toDataURL(imgtype);
				sendDataurl(dataUrl, gMyName[channel], gMyChannel[channel]);
			}
			image.src = readerEvent.target.result;
		}
		else {
			//send directly without resize
			sendDataurl(fr.result, gMyName[channel], gMyChannel[channel]);
		}
	}
	fr.readAsDataURL(file);
}

function getToken(channel, token) {
	return "https://" + getLocalAddrPortInput(channel) + "/mlestalk-web.html?token=" + token;
}

function getFront(channel) {
	$("#channel_localization").val(getLocalLanguageSelection());
	setLanguage();
	$("#input_addr_port").val(getLocalAddrPortInput(channel));
}

function getLocalAddrPortInput(channel) {
	let apinput = window.localStorage.getItem('gAddrPortInput' + channel);
	if (apinput != undefined && apinput != '' && apinput != 'mles.io:80') {
		return apinput;
	}
	else {
		return "mles.io:443";
	}
}

function getMsgTimestamps() {
	gMsgTs = JSON.parse(window.localStorage.getItem('gMsgTsJSON'));
	if(!gMsgTs)
		gMsgTs = {};
}

function setMsgTimestamps() {
	window.localStorage.setItem('gMsgTsJSON', JSON.stringify(gMsgTs));
}

function clearMsgTimestamps() {
	window.localStorage.removeItem('gMsgTsJSON');
}

function getNotifyTimestamps() {
	gIdNotifyTs = JSON.parse(window.localStorage.getItem('gIdNotifyTsJSON'));
	if(!gIdNotifyTs)
		gIdNotifyTs = {};
}

function setNotifyTimestamps() {
	window.localStorage.setItem('gIdNotifyTsJSON', JSON.stringify(gIdNotifyTs));
}

function clearNotifyTimestamps() {
	window.localStorage.removeItem('gIdNotifyTsJSON');
}

function getActiveChannels() {
	gActiveChannels = JSON.parse(window.localStorage.getItem('gActiveChannelsJSON'));
}

function setActiveChannels() {
	window.localStorage.setItem('gActiveChannelsJSON', JSON.stringify(gActiveChannels));
}

function clearActiveChannels() {
	window.localStorage.removeItem('gActiveChannelsJSON');
}

function getLocalSession(channel) {
	gMyName[channel] = window.localStorage.getItem('gMyName' + channel);
	gMyChannel[channel] = window.localStorage.getItem('gMyChannel' + channel);
	gMyKey[channel] = window.localStorage.getItem('gMyKey' + channel);
}

function clearLocalSession(channel) {
	window.localStorage.removeItem('gMyName' + channel);
	window.localStorage.removeItem('gMyChannel' + channel);
	window.localStorage.removeItem('gMyKey' + channel);
}


function getLocalBdKey(channel) {
	const bdKey = window.localStorage.getItem('gPrevBdKey' + channel);

	if (bdKey) {
		gPrevBdKey[channel] = bdKey;
		//console.log("Loading key from local storage!");
	}
}

function setLocalBdKey(channel, bdKey) {
	if (bdKey) {
		window.localStorage.setItem('gPrevBdKey' + channel, bdKey);
		//console.log("Saving keys to local storage!");
	}
}

function clearLocalBdKey(channel) {
	window.localStorage.removeItem('gPrevBdKey' + channel);
}

