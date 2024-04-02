/* Language specific functions -- start -- */
function getLocalLanguageSelection() {
	let linput = window.localStorage.getItem('localization');
	if (linput != undefined && linput != '') {
		return linput;
	}
	else {
		return "gb";
	}
}

function setLanguage() {
	let language = $("#channel_localization").val();

	switch (language) {
		case "fi":
			$("#channel_user_name").text("Nimesi?");
			$("#channel_name").text("Kanava?");
			$("#channel_key").text("Jaettu avain?");
			$("#channel_server").text("WebSocket palvelimen osoite");
			$("#channel_exit").val("poistu");
			$("#channel_exit_all").val("poistu kaikista");
			$("#new_channel").val("uusi kanava");
			$("#check_upgrades").val("päivitä sovellus");
			$("#channel_list").val("kanavat");
			$("#channel_list_new").val("kanavat");
			$("#app_info").text("lisätietoja sovelluksesta");
			$("#legal").text("lakitiedot");
			gWeekday[0] = "su";
			gWeekday[1] = "ma";
			gWeekday[2] = "ti";
			gWeekday[3] = "ke";
			gWeekday[4] = "to";
			gWeekday[5] = "pe";
			gWeekday[6] = "la";
			gBgTitle = "MlesTalk taustalla";
			gBgText = "Ilmoitukset aktiivisena";
			break;
		case "se":
			$("#channel_user_name").text("Ditt namn?");
			$("#channel_name").text("Kanal?");
			$("#channel_key").text("Delad nyckel?");
			$("#channel_server").text("WebSocket server adress");
			$("#channel_exit").val("utgång");
			$("#channel_exit_all").val("utgång alla");
			$("#new_channel").val("ny kanal");
			$("#check_upgrades").val("uppgradera appen");
			$("#channel_list").val("kanaler");
			$("#channel_list_new").val("kanaler");
			$("#app_info").text("appinfo");
			$("#legal").text("rättslig");
			gWeekday[0] = "sö";
			gWeekday[1] = "må";
			gWeekday[2] = "ti";
			gWeekday[3] = "on";
			gWeekday[4] = "to";
			gWeekday[5] = "fr";
			gWeekday[6] = "lö";
			gBgTitle = "MlesTalk i bakgrunden";
			gBgText = "Meddelanden aktiva";
			break;
		case "es":
			$("#channel_user_name").text("¿Su nombre?");
			$("#channel_name").text("¿Canal?");
			$("#channel_key").text("¿Llave compartida?");
			$("#channel_server").text("Dirección del servidor Websocket");
			$("#channel_exit").val("salida");
			$("#channel_exit_all").val("salir de todo");
			$("#new_channel").val("nuevo canal");
			$("#check_upgrades").val("actualizar la aplicación");
			$("#channel_list").val("canales");
			$("#channel_list_new").val("canales");
			$("#app_info").text("info de la app");
			$("#legal").text("legal");
			gWeekday[0] = "D";
			gWeekday[1] = "L";
			gWeekday[2] = "M";
			gWeekday[3] = "X";
			gWeekday[4] = "J";
			gWeekday[5] = "V";
			gWeekday[6] = "S";
			gBgTitle = "MlesTalk en el fondo";
			gBgText = "Notificaciones activas";
			break;
		case "de":
			$("#channel_user_name").text("Dein name?");
			$("#channel_name").text("Kanal?");
			$("#channel_key").text("Gemeinsamer Schlüssel?");
			$("#channel_server").text("WebSocket Serveradresse");
			$("#channel_exit").val("verlassen");
			$("#channel_exit_all").val("alle verlassen");
			$("#new_channel").val("neuer Kanal");
			$("#check_upgrades").val("upgrade-App");
			$("#channel_list").val("Kanäle");
			$("#channel_list_new").val("Kanäle");
			$("#app_info").text("app info");
			$("#legal").text("legal");
			gWeekday[0] = "So";
			gWeekday[1] = "Mo";
			gWeekday[2] = "Di";
			gWeekday[3] = "Mi";
			gWeekday[4] = "Do";
			gWeekday[5] = "Fr";
			gWeekday[6] = "Sa";
			gBgTitle = "MlesTalk im Hintergrund";
			gBgText = "Benachrichtigungen aktiv";
			break;
		case "fr":
			$("#channel_user_name").text("Votre nom?");
			$("#channel_name").text("Canal?");
			$("#channel_key").text("Clé partagée?");
			$("#channel_server").text("WebSocket adresse du serveur");
			$("#channel_exit").val("sortie");
			$("#channel_exit_all").val("tout quitter");
			$("#new_channel").val("nouveau canal");
			$("#check_upgrades").val("mise à niveau de l'application");
			$("#channel_list").val("canaux");
			$("#channel_list_new").val("canaux");
			$("#app_info").text("info sur l'app");
			$("#legal").text("légal");
			gWeekday[0] = "dim";
			gWeekday[1] = "lun";
			gWeekday[2] = "mar";
			gWeekday[3] = "mer";
			gWeekday[4] = "jeu";
			gWeekday[5] = "ven";
			gWeekday[6] = "sam";
			gBgTitle = "MlesTalk en arrière-plan";
			gBgText = "Notifications actives";
			break;
		case "pt":
			$("#channel_user_name").text("Seu nome?");
			$("#channel_name").text("Canal?");
			$("#channel_key").text("Chave compartilhada?");
			$("#channel_server").text("Endereço do servidor Websocket");
			$("#channel_exit").val("saída");
			$("#channel_exit_all").val("saia de tudo");
			$("#new_channel").val("novo canal");
			$("#check_upgrades").val("atualizar aplicativo");
			$("#channel_list").val("canais");
			$("#channel_list_new").val("canais");
			$("#app_info").text("informação da aplicação");
			$("#legal").text("legal");
			gWeekday[0] = "Dom.";
			gWeekday[1] = "Seg.";
			gWeekday[2] = "Ter.";
			gWeekday[3] = "Qua.";
			gWeekday[4] = "Qui.";
			gWeekday[5] = "Sex.";
			gWeekday[6] = "Sáb.";
			gBgTitle = "MlesTalk correndo em segundo plano";
			gBgText = "Notificações ativas";
			break;
		case "ru":
			$("#channel_user_name").text("Твое имя?");
			$("#channel_name").text("Канал?");
			$("#channel_key").text("Общий ключ?");
			$("#channel_server").text("Адрес сервера Websocket");
			$("#channel_exit").val("выход");
			$("#channel_exit_all").val("выйти из всего");
			$("#new_channel").val("новый канал");
			$("#check_upgrades").val("Обновление приложения");
			$("#channel_list").val("каналами");
			$("#channel_list_new").val("каналами");
			$("#app_info").text("информация о приложении");
			$("#legal").text("правовой");
			gWeekday[0] = "ВСК";
			gWeekday[1] = "ПНД";
			gWeekday[2] = "ВТР";
			gWeekday[3] = "СРД";
			gWeekday[4] = "ЧТВ";
			gWeekday[5] = "ПТН";
			gWeekday[6] = "СБТ";
			gBgTitle = "MlesTalk в фоновом режиме";
			gBgText = "Уведомления активны";
			break;
		case "gb":
		default:
			$("#channel_user_name").text("Your name?");
			$("#channel_name").text("Channel?");
			$("#channel_key").text("Shared key?");
			$("#channel_server").text("WebSocket server address");
			$("#channel_exit").val("exit");
			$("#channel_exit_all").val("exit all");
			$("#new_channel").val("new channel");
			$("#check_upgrades").val("upgrade");
			$("#channel_list").val("channels");
			$("#channel_list_new").val("channels");
			$("#app_info").text("app info");
			$("#legal").text("legal");
			gWeekday[0] = "Sun";
			gWeekday[1] = "Mon";
			gWeekday[2] = "Tue";
			gWeekday[3] = "Wed";
			gWeekday[4] = "Thu";
			gWeekday[5] = "Fri";
			gWeekday[6] = "Sat";
			gBgTitle = "MlesTalk in the background";
			gBgText = "Notifications active";
			break;
	}

	if (isCordova) {
		cordova.plugins.backgroundMode.setDefaults({
			title: gBgTitle,
			text: gBgText
		});
	}
}

function popAlert() {
	let language = $("#channel_localization").val();
	switch (language) {
		case "fi":
			alert('Nimi, kanava ja jaettu avain?');
			break;
		case "se":
			alert('Namn, kanal och delad nyckel?');
			break;
		case "es":
			alert('Nombre, canal y clave compartida?');
			break;
		case "de":
			alert('Name, Kanal und gemeinsamer Schlüssel?');
			break;
		case "fr":
			alert('Nom, canal et clé partagée?');
            		break;
        	case "pt":
            		alert('Seu nome, canal e chave compartilhada?');
            		break;
        	case "ru":
            		alert('Твое имя, канал и общий ключ?');
            		break;
        	case "gb":
		default:
			alert('Name, channel and shared key?');
			break;
	}
}

function popChannelAlert() {
	let language = $("#channel_localization").val();
	switch (language) {
		case "fi":
			alert('Kanava on jo olemassa');
			break;
		case "se":
			alert('Kanal finns redan');
			break;
		case "es":
			alert('El canal ya existe');
			break;
		case "de":
			alert('Kanal existiert bereits');
			break;
		case "fr":
			alert('Le canal existe déjà');
            		break;
        	case "pt":
            		alert('Canal já existe');
            		break;
        	case "ru":
            		alert('Канал уже существует');
            		break;
        	case "gb":
		default:
			alert('Channel already exists');
			break;
	}
}

function verAlert(newVersionExists, version = "", dlurl = "", filename="", b2sum="") {
	let language = $("#channel_localization").val();
	switch (language) {
		case "fi":
			if (newVersionExists) {
				const confirmed = confirm("Uusi versio " + version + " saatavilla, haluatko ladata?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("Uutta versiota ei saatavilla.");			
			break;
		case "se":
			if (newVersionExists) {
				const confirmed = confirm("Ny version " + version + " tillgänglig, vill du ladda ner?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("Ingen ny version tillgänglig.");			
			break;
		case "es":
			if (newVersionExists) {
				const confirmed = confirm("Nueva versión " + version + " disponible, ¿quieres descargar?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("No hay nueva versión disponible.");			
			break;	
		case "de":
			if (newVersionExists) {
				const confirmed = confirm("Neue Version " + version + " verfügbar, möchten Sie herunterladen?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("Keine neue Version verfügbar.");			
			break;
		case "fr":
			if (newVersionExists) {
				const confirmed = confirm("Nouvelle version " + version + " disponible, tu veux télécharger?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("Aucune nouvelle version disponible.");			
			break;		
        case "pt":
			if (newVersionExists) {
				const confirmed = confirm("Nova versão " + version + " disponível, você quer baixar?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("Nenhuma nova versão disponível.");			
			break;
        case "ru":
			if (newVersionExists) {
				const confirmed = confirm("Доступна новая " + version + " версия, хочешь скачать?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("Новая версия недоступна.");			
			break;
        case "gb":
		default:
			if (newVersionExists) {
				const confirmed = confirm("New version " + version + " available, do you want to download?");
				if (confirmed) {
					downloadFile(dlurl, filename);
				}
			}
			else
				alert("No new version available.");			
			break;
	}
}

/* Language specific functions -- end -- */
