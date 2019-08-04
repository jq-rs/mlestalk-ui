/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2019 MlesTalk developers
 */
var myname = '';
var mychannel = '';
var myaddr = '';
var myport = '';
var mytoken = null;
var addrportinput = '';
var ownid = 0;
var ownappend = false;
var idhash = {};
var idappend = {};

var initOk = false;
const RETIMEOUT = 1500; /* ms */
const MAXTIMEOUT = 12000; /* ms */
var reconn_timeout = RETIMEOUT;

var isTokenChannel = false;

var lastMessageSeenTs = 0;
var lastMessageNotifiedTs = 0;
var lastReconnectTs = 0;
var lastMessage = {};

var weekday = new Array(7);
weekday[0] = "Sun";
weekday[1] = "Mon";
weekday[2] = "Tue";
weekday[3] = "Wed";
weekday[4] = "Thu";
weekday[5] = "Fri";
weekday[6] = "Sat";

var autolinker = new Autolinker( {
	urls : {
		schemeMatches : true,
		wwwMatches    : true,
		tldMatches    : true
	},
	email       : true,
	phone       : false,
	mention     : false,
	hashtag     : false,

	stripPrefix : true,
	stripTrailingSlash : true,
	newWindow   : true,

	truncate : {
		length   : 0,
		location : 'end'
	},

	className : ''
} );

function stamptime(msgdate) {
	var dd=msgdate.getDate(),
		mm=msgdate.getMonth()+1,
		yyyy=msgdate.getFullYear(),
		h=msgdate.getHours(), 
		m=msgdate.getMinutes(), 
		day=weekday[msgdate.getDay()];
	if(dd<10) dd='0'+dd;
	if(mm<10) mm='0'+mm;
	if(m<10) m='0'+m;
	return dd + '.' + mm + '.' + yyyy + ' ' + day + ' ' + h + ':' + m;
}

function timenow(){
	var now=new Date(), 
		dd=now.getDate(),
		mm=now.getMonth()+1,
		yyyy=now.getFullYear(),
		h=now.getHours(), 
		m=now.getMinutes(), 
		day=weekday[now.getDay()];
	if(dd<10) dd='0'+dd;
	if(mm<10) mm='0'+mm;
	if(m<10) m='0'+m;
	return dd + '.' + mm + '.' + yyyy + ' ' + day + ' ' + h + ':' + m;
}

var can_notify = false;
var can_vibrate = false;
var will_notify = false;
var isCordova = false;
var isReconnect = false;

var webWorker = new Worker('mles-webworker/js/webworker.js');

function onPause() {
	will_notify = true;
	lastMessageNotifiedTs = lastMessageSeenTs;
	if(isCordova) {
		//cordova.plugins.backgroundMode.enable();
		cordova.plugins.notification.badge.clear();
    }
}

function onResume() {
	will_notify = false;
	if(isCordova) {
		cordova.plugins.notification.local.clearAll();
		cordova.plugins.notification.badge.clear();
		//cordova.plugins.backgroundMode.disable();
	}
}

var interval;
function onLoad() {
	document.addEventListener("deviceready", function () {
		// Background-fetch handler with JobScheduler.
        var BackgroundFetch = window.BackgroundFetch;

        // Your background-fetch handler.
        var fetchCallback = function() {
			if('' != myname && '' != mychannel) {
				sync_reconnect(myname, mychannel);
			}
            // Required: Signal completion of your task to native code
			// If you fail to do this, the OS can terminate your app
            // or assign battery-blame for consuming too much background-time
			BackgroundFetch.finish();
        };

        var failureCallback = function(error) {
            console.log('Background fetch failed', error);
        };

        BackgroundFetch.configure(fetchCallback, failureCallback, {
            minimumFetchInterval: 15
        });
		
		cordova.plugins.notification.local.requestPermission(function (granted) {
			can_notify = granted;
		}); 
		can_vibrate = true;
		
		//cordova.plugins.backgroundMode.setDefaults({
		//	title: 'MlesTalk in the background',
		//	text: 'Notifications active',
		//});
		
		// spawns a thread that keeps things rolling
		cordova.plugins.backgroundMode.disableWebViewOptimizations();
		
		cordova.plugins.notification.badge.clear();

		document.addEventListener("pause", onPause, false);
		document.addEventListener("resume", onResume, false);
		isCordova = true;
	}, false);
}

$(document).ready(function() {
	var url_string = window.location.href;
	var url = new URL(url_string);
	mytoken = url.searchParams.get("token");
	$("#channel_submit, #form_send_message").submit(function(e) {
		e.preventDefault();
		ask_channel();
	});
});


function ask_channel() {
	if ($('#input_name').val().trim().length <= 0 ||
		($('#input_channel').val().trim().length <= 0 && mytoken == null) ||
		$('#input_key').val().trim().length <= 0 ) {
		alert('Name, channel and shared key?');
	} else {
		if(mytoken != null) {
			var token = mytoken.trim();
			token = token.split(' ').join('+');
			token = atob(token);
			var atoken = token.substring(0,16);
			var bfchannel = token.substr(16);
			var sipkey=SipHash.string16_to_key(bfchannel);
			var newtoken = SipHash.hash_hex(sipkey, bfchannel);
			if(atoken != newtoken) {
				alert('Invalid token');
				return;
			}
			mychannel = btoa(bfchannel);
			isTokenChannel = true;
		}
		else {
			mychannel = $('#input_channel').val().trim();
		}

		myname = $('#input_name').val().trim();
		var fullkey = $('#input_key').val().trim();
		addrportinput = $('#input_addr_port').val().trim();
		var addrarray = addrportinput.split(":");
		if (addrarray.length > 0) {
			myaddr = addrarray[0];
		}
		if (addrarray.length > 1) {
			myport = addrarray[1];
		}
		if(myaddr == '') {
			myaddr = 'mles.io';
		}
		if(myport == '') {
			myport = '80';
		}

		$('#name_channel_cont').fadeOut(400, function() {
			webWorker.postMessage(["init", null, myaddr, myport, myname, mychannel, fullkey, isTokenChannel]);
			$('#message_cont').fadeIn();
		});
	}
	return false;
}

function sendEmptyJoin() {
	send_message(myname, mychannel, "", true);
}

function send(isFull) {
	var message = $('#input_message').val();
	var file = document.getElementById("input_file").files[0];

	if(file) {
		send_image(myname, mychannel, file);
	}
	else {
		send_message(myname, mychannel, message, isFull);
	}
}

function close_socket() {
	initOk = false;
	lastMessageSeenTs = 0;
	lastMessageNotifiedTs = 0;
	isReconnect = false;
	alert('The connection is lost. Please try again.');
	if(!isTokenChannel)
		$('#qrcode').fadeOut();
	$('#message_cont').fadeOut(400, function() {
		$('#name_channel_cont').fadeIn();
		$('#messages').html('');
	});
}

function initReconnect() {
	reconn_timeout=RETIMEOUT;
}

var multipart_dict = {};
var multipart_send_dict = {};
var multipartContinue = false;
webWorker.onmessage = function(e) {
	var cmd = e.data[0];
	switch(cmd) {
		case "init":
			var uid = e.data[1];
			var channel = e.data[2];
			var myuid = e.data[3];
			var mychannel = e.data[4];

			if(uid.length > 0 && channel.length > 0) {
				initOk = true;
				sendEmptyJoin();
				
				//after reconnect, start locally from a new line
				ownid = ownid + 1;
				ownappend = false;
				
				var li;
				if(isReconnect && lastMessageSeenTs > 0) {
					li = '<li class="new"> - <span class="name">reconnected</span> - </li>';
					lastReconnectTs = lastMessageSeenTs;
				}
				else {
					if(!isTokenChannel) {
						li = '<li class="new"> - <span class="name">' + uid + "@" + channel + '</span> - </li>';
					}
					else {
						li = '<li class="new"> - <span class="name">' + uid + '</span> - </li>';
					}
				}
				$('#messages').append(li);
			}

			if(!isTokenChannel) {
				//use channel to create 128 bit secret key
				var bfchannel = atob(mychannel);
				var key=SipHash.string16_to_key(bfchannel);
				var atoken = SipHash.hash_hex(key, bfchannel);
				atoken = atoken + bfchannel;
				token = btoa(atoken);		
				document.getElementById("qrcode_link").setAttribute("href", get_token());

				qrcode.clear(); // clear the code.
				qrcode.makeCode(get_token()); // make another code.
				$('#qrcode').fadeIn();
			}
			else {
				$('#qrcode').fadeOut();
			}
			break;
		case "data":
			var uid = e.data[1];
			var channel = e.data[2];
			var msgTimestamp = e.data[3];
			var message = e.data[4];
			var isImage = e.data[5];
			var isMultipart = e.data[6];
			var isFirst = e.data[7];
			var isLast = e.data[8];

			var isFull = false;

			initReconnect();

			if(isMultipart) {
				if(!multipart_dict[uid + channel]) {
					if(!isFirst) {
						//invalid frame
						return;
					}
					multipart_dict[uid + channel] = "";
				}
				multipart_dict[uid + channel] += message;
				if(!isLast) {
					return;
				}
				message = multipart_dict[uid + channel];
				multipart_dict[uid + channel] = null;
			}

			//update hash
			var duid = uid.split(' ').join('_');
			if(idhash[duid] == null) {	
				idhash[duid] = 0;
				idappend[duid] = false;
			}

			if(message.length > 2 && lastMessageSeenTs <= msgTimestamp) {
				lastMessageSeenTs = msgTimestamp;

				var li;
				var now = timenow();
				var dateString = "[" + stamptime(new Date(msgTimestamp)) + "] ";
				if (dateString.charAt(0) == '[' && dateString.charAt(1) == now.charAt(0) && dateString.charAt(2) == now.charAt(1) &&
					dateString.charAt(4) == now.charAt(3) && dateString.charAt(5) == now.charAt(4)) {
					dateString = dateString.slice(16, dateString.length);
					dateString = "[" + dateString;
				}

				/* Check first is it a text or image */
				if(isImage) {
					isFull = true;
					if (uid != myname) {
						li = '<div id="' + duid + '' + idhash[duid] + '"><li class="new"><span class="name">' + uid + '</span> ' + dateString 
							+ '<img class="image" src="' + message + '" height="100px" data-action="zoom" alt=""></li></div>'
					}
					else {
						li = '<div id="' + duid + '' + idhash[duid] + '"><li class="own"> ' + dateString
							+ '<img class="image" src="' + message + '" height="100px" data-action="zoom" alt=""></li></div>'
					}
				}
				else {
					if (message.charCodeAt(message.length-1) == "\n".charCodeAt(0)) {
						isFull = true;
					}

					if (uid != myname) {
						li = '<div id="' + duid + '' + idhash[duid] + '"><li class="new"><span class="name"> ' + uid + '</span> '
							+ dateString + "" + autolinker.link( message ) + '</li></div>';
					}
					else {
						li = '<div id="' + duid + '' + idhash[duid] + '"><li class="own"> ' + dateString + "" + autolinker.link( message ) + '</li></div>';
					}
				}

				if(false == idappend[duid]) {
					$('#messages').append(li);
					idappend[duid] = true;
				}

				if(isFull) {
					idhash[duid] = idhash[duid] + 1;
					idappend[duid] = false;
					if(isCordova && lastReconnectTs < msgTimestamp) {
						cordova.plugins.notification.badge.increase();
					}
				}
				else if(true == idappend[duid]){		
					$('#' + duid + '' + idhash[duid]).replaceWith(li);
				}

				if(isFull || $('#input_message').val().length == 0) {
					scrollToBottom();
				}

				if(uid != myname && isFull && will_notify &&
					can_notify && lastMessageNotifiedTs < msgTimestamp) {

					if(true == isImage) {
						message = "<an image>";
					}
					do_notify(uid, channel, msgTimestamp, message);
				}

			}
			break;
		case "send":
			var uid = e.data[1];
			var channel = e.data[2];
			var isMultipart = e.data[3];
			if(isMultipart) {
				if(multipart_send_dict[uid + channel]) {
					multipartContinue = true;
				}
			}
			break;
		case "close":
			var uid = e.data[1];
			var channel = e.data[2];
			var myuid = e.data[3];
			var mychannel = e.data[4];
			reconnect(uid, channel);
			break;
	}
}

var notifyInProgress = false;
async function do_notify(uid, channel, msgTimestamp, message) {
	lastMessage[channel] = [msgTimestamp, uid, message];
	if(notifyInProgress) {
		return;
	}
	notifyInProgress = true;
	await sleep(1000);
	var msg = lastMessage[channel];
	lastMessageNotifiedTs = msg[0];
	notifyInProgress = false;
	if(isCordova) {
		cordova.plugins.notification.local.schedule({
			title: msg[1],
			text: msg[2],
			icon: 'file://img/icon.png',
			foreground: false,
		});
		if(can_vibrate) {
			navigator.vibrate(1000);
		}
	}		
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function reconnect(uid, channel) {
	if(reconn_timeout > MAXTIMEOUT) {
		reconn_timeout=RETIMEOUT;
		close_socket();
		return;
	}
	await sleep(reconn_timeout);
	reconn_timeout *= 2;
	isReconnect = true;
	webWorker.postMessage(["reconnect", null, uid, channel, isTokenChannel]);
}

function sync_reconnect(uid, channel) {
	webWorker.postMessage(["reconnect", null, uid, channel, isTokenChannel]);
}

function scrollToBottom() {
	messages_list.scrollTop = messages_list.scrollHeight;
}

function send_data(cmd, uid, channel, data, isImage, isMultipart, isFirst, isLast) {

	if(initOk) {
		var rarray = new Uint32Array(6);
		window.crypto.getRandomValues(rarray);
		webWorker.postMessage([cmd, data, uid, channel, isTokenChannel, rarray, isImage, isMultipart, isFirst, isLast]);
	}
}

function send_message(uid, channel, message, isFull) {
	var msglen = message.length;

	if(msglen == 0)
		message = message + "\n";
	if(true == isFull)
		message = message + "\n";

	send_data("send", uid, channel, message, false, false, false, false);

	var dateString = "[" + timenow() + "] ";
	var now = timenow();
	//update own view
	if (dateString.charAt(0) == '[' && dateString.charAt(1) == now.charAt(0) && dateString.charAt(2) == now.charAt(1) &&
		dateString.charAt(4) == now.charAt(3) && dateString.charAt(5) == now.charAt(4)) {
		dateString = dateString.slice(16, dateString.length);
		dateString = "[" + dateString;
	}

	var li = '<div id="owner' + ownid + '"><li class="own"> ' + dateString + "" + autolinker.link( message ) + '</li></div>';
	if(isFull) {
		ownid = ownid + 1;
		ownappend = false;
	}
	else {
		if(false == ownappend) {
			$('#messages').append(li);
			ownappend = true;
		}
		else
			$('#owner' + ownid).replaceWith(li);
	}

	scrollToBottom();

	if(isFull && msglen > 0)
		$('#input_message').val('');
}

const MULTIPART_SLICE = 1024*16;
async function send_dataurl(dataUrl, uid, channel) {
	var isImage = true;

	if(dataUrl.length > MULTIPART_SLICE) {
		var isMultipart = true;
		var isFirst;
		var isLast;
		multipart_send_dict[uid + channel] = true;
		for (var i = 0; i < dataUrl.length; i += MULTIPART_SLICE) {
			isFirst = false;
			isLast = false;
			if(0 == i) {
				isFirst = true;
			}
			else if(i + MULTIPART_SLICE >= dataUrl.length) {
				isLast = true;
				var data = dataUrl.slice(i, dataUrl.length);
				send_data("send", myname, mychannel, data, isImage, isMultipart, isFirst, isLast);
				multipart_send_dict[uid + channel] = false;
				multipartContinue = false;
				break;
			}
			var data = dataUrl.slice(i, i + MULTIPART_SLICE);
			send_data("send", myname, mychannel, data, isImage, isMultipart, isFirst, isLast);
			while(false == multipartContinue) {
				await sleep(10);
			}
			multipartContinue = false;
		}
	}
	else {
		send_data("send", myname, mychannel, data, isImage, false, false, false); /* is not multipart */
	}

	var dateString = "[" + timenow() + "] ";
	var now = timenow();
	//update own view
	if (dateString.charAt(0) == '[' && dateString.charAt(1) == now.charAt(0) && dateString.charAt(2) == now.charAt(1) &&
		dateString.charAt(4) == now.charAt(3) && dateString.charAt(5) == now.charAt(4)) {
		dateString = dateString.slice(16, dateString.length);
		dateString = "[" + dateString;
	}

	var li = '<div id="owner' + ownid + '"><li class="own"> ' + dateString
		+ '<img class="image" src="' + dataUrl + '" height="100px" data-action="zoom" alt=""></li></div>'
	$('#messages').append(li);
	ownid = ownid + 1;
	scrollToBottom();
	$('#input_file').val('');	
}


function send_image(myname, mychannel, file) {
	var fr = new FileReader();
	fr.onload = function (readerEvent) {
		if(file.size >= 512 * 1000) {
			var imgtype = 'image/jpeg';
			if(file.type.match('image/png')) {
				imgtype = 'image/png';
			}
			//resize the image
			var image = new Image();
			image.onload = function (imageEvent) {
				var canvas = document.createElement('canvas'),
					max_size = 1024,
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
				var dataUrl = canvas.toDataURL(imgtype);
				send_dataurl(dataUrl, myname, mychannel);
			}
			image.src = readerEvent.target.result;
		}
		else {
			//send directly without resize
			send_dataurl(fr.result, myname, mychannel);
		}
	}
	fr.readAsDataURL(file);
}

function get_token() {
	return "http://" + addrportinput + "/web?token=" + token;
}
