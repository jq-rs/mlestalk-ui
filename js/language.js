/* Language specific functions -- start -- */
function getLocalLanguageSelection() {
  let linput = window.localStorage.getItem("localization");
  if (linput != undefined && linput != "") {
    return linput;
  } else {
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
      gExitConfirmText = "Haluatko varmasti poistua kanavalta?";
      gExitAllConfirmText = "Haluatko varmasti poistua kaikilta kanavilta?";
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
      gExitConfirmText = "Är du säker på att du vill lämna kanalen?";
      gExitAllConfirmText = "Är du säker på att du vill lämna alla kanaler?";
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
      gExitConfirmText = "¿Estás seguro de que quieres salir del canal?";
      gExitAllConfirmText =
        "¿Estás seguro de que quieres salir de todos los canales?";
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
      gExitConfirmText = "Möchten Sie den Kanal wirklich verlassen?";
      gExitAllConfirmText = "Möchten Sie wirklich alle Kanäle verlassen?";
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
      gExitConfirmText = "Êtes-vous sûr de vouloir quitter le canal ?";
      gExitAllConfirmText =
        "Êtes-vous sûr de vouloir quitter tous les canaux ?";
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
      gExitConfirmText = "Tem certeza que quer sair do canal?";
      gExitAllConfirmText = "Tem certeza que quer sair de todos os canais?";
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
      gExitConfirmText = "Вы уверены, что хотите выйти из канала?";
      gExitAllConfirmText = "Вы уверены, что хотите выйти из всех каналов?";
      break;
    case "zh":
      $("#channel_user_name").text("您的名字？");
      $("#channel_name").text("频道？");
      $("#channel_key").text("共享密钥？");
      $("#channel_server").text("WebSocket 服务器地址");
      $("#channel_exit").val("退出");
      $("#channel_exit_all").val("全部退出");
      $("#new_channel").val("新频道");
      $("#check_upgrades").val("升级应用");
      $("#channel_list").val("频道");
      $("#channel_list_new").val("频道");
      $("#app_info").text("应用信息");
      $("#legal").text("法律信息");
      gWeekday[0] = "周日";
      gWeekday[1] = "周一";
      gWeekday[2] = "周二";
      gWeekday[3] = "周三";
      gWeekday[4] = "周四";
      gWeekday[5] = "周五";
      gWeekday[6] = "周六";
      gBgTitle = "MlesTalk 在后台运行";
      gBgText = "通知已启用";
      gExitConfirmText = "您确定要退出此频道吗？";
      gExitAllConfirmText = "您确定要退出所有频道吗？";
      break;
    case "ja":
      $("#channel_user_name").text("お名前は？");
      $("#channel_name").text("チャンネル？");
      $("#channel_key").text("共有キー？");
      $("#channel_server").text("WebSocketサーバーアドレス");
      $("#channel_exit").val("退出");
      $("#channel_exit_all").val("すべて退出");
      $("#new_channel").val("新規チャンネル");
      $("#check_upgrades").val("アップグレード");
      $("#channel_list").val("チャンネル");
      $("#channel_list_new").val("チャンネル");
      $("#app_info").text("アプリ情報");
      $("#legal").text("法的情報");
      gWeekday[0] = "日";
      gWeekday[1] = "月";
      gWeekday[2] = "火";
      gWeekday[3] = "水";
      gWeekday[4] = "木";
      gWeekday[5] = "金";
      gWeekday[6] = "土";
      gBgTitle = "MlesTalk バックグラウンド実行中";
      gBgText = "通知有効";
      gExitConfirmText = "このチャンネルから退出しますか？";
      gExitAllConfirmText = "すべてのチャンネルから退出しますか？";
      break;
    case "ko":
      $("#channel_user_name").text("이름을 입력하세요?");
      $("#channel_name").text("채널?");
      $("#channel_key").text("공유 키?");
      $("#channel_server").text("WebSocket 서버 주소");
      $("#channel_exit").val("나가기");
      $("#channel_exit_all").val("모두 나가기");
      $("#new_channel").val("새 채널");
      $("#check_upgrades").val("업그레이드");
      $("#channel_list").val("채널");
      $("#channel_list_new").val("채널");
      $("#app_info").text("앱 정보");
      $("#legal").text("법적 고지");
      gWeekday[0] = "일";
      gWeekday[1] = "월";
      gWeekday[2] = "화";
      gWeekday[3] = "수";
      gWeekday[4] = "목";
      gWeekday[5] = "금";
      gWeekday[6] = "토";
      gBgTitle = "MlesTalk 백그라운드 실행 중";
      gBgText = "알림 활성화됨";
      gExitConfirmText = "채널을 나가시겠습니까?";
      gExitAllConfirmText = "모든 채널을 나가시겠습니까?";
      break;
    case "it":
      $("#channel_user_name").text("Il tuo nome?");
      $("#channel_name").text("Canale?");
      $("#channel_key").text("Chiave condivisa?");
      $("#channel_server").text("Indirizzo server WebSocket");
      $("#channel_exit").val("esci");
      $("#channel_exit_all").val("esci da tutti");
      $("#new_channel").val("nuovo canale");
      $("#check_upgrades").val("aggiorna");
      $("#channel_list").val("canali");
      $("#channel_list_new").val("canali");
      $("#app_info").text("info app");
      $("#legal").text("legale");
      gWeekday[0] = "Dom";
      gWeekday[1] = "Lun";
      gWeekday[2] = "Mar";
      gWeekday[3] = "Mer";
      gWeekday[4] = "Gio";
      gWeekday[5] = "Ven";
      gWeekday[6] = "Sab";
      gBgTitle = "MlesTalk in background";
      gBgText = "Notifiche attive";
      gExitConfirmText = "Sei sicuro di voler uscire dal canale?";
      gExitAllConfirmText = "Sei sicuro di voler uscire da tutti i canali?";
      break;
    case "ar":
      $("#channel_user_name").text("اسمك؟");
      $("#channel_name").text("القناة؟");
      $("#channel_key").text("المفتاح المشترك؟");
      $("#channel_server").text("عنوان خادم WebSocket");
      $("#channel_exit").val("خروج");
      $("#channel_exit_all").val("خروج من الكل");
      $("#new_channel").val("قناة جديدة");
      $("#check_upgrades").val("تحديث");
      $("#channel_list").val("القنوات");
      $("#channel_list_new").val("القنوات");
      $("#app_info").text("معلومات التطبيق");
      $("#legal").text("قانوني");
      gWeekday[0] = "أحد";
      gWeekday[1] = "إثنين";
      gWeekday[2] = "ثلاثاء";
      gWeekday[3] = "أربعاء";
      gWeekday[4] = "خميس";
      gWeekday[5] = "جمعة";
      gWeekday[6] = "سبت";
      gBgTitle = "MlesTalk في الخلفية";
      gBgText = "الإشعارات نشطة";
      gExitConfirmText = "هل أنت متأكد من رغبتك في الخروج من القناة؟";
      gExitAllConfirmText = "هل أنت متأكد من رغبتك في الخروج من جميع القنوات؟";
      break;
    case "uk":
      $("#channel_user_name").text("Ваше ім'я?");
      $("#channel_name").text("Канал?");
      $("#channel_key").text("Спільний ключ?");
      $("#channel_server").text("Адреса WebSocket сервера");
      $("#channel_exit").val("вийти");
      $("#channel_exit_all").val("вийти з усіх");
      $("#new_channel").val("новий канал");
      $("#check_upgrades").val("оновити");
      $("#channel_list").val("канали");
      $("#channel_list_new").val("канали");
      $("#app_info").text("інформація про застосунок");
      $("#legal").text("правова інформація");
      gWeekday[0] = "Нд";
      gWeekday[1] = "Пн";
      gWeekday[2] = "Вт";
      gWeekday[3] = "Ср";
      gWeekday[4] = "Чт";
      gWeekday[5] = "Пт";
      gWeekday[6] = "Сб";
      gBgTitle = "MlesTalk у фоновому режимі";
      gBgText = "Сповіщення активні";
      gExitConfirmText = "Ви впевнені, що хочете вийти з каналу?";
      gExitAllConfirmText = "Ви впевнені, що хочете вийти з усіх каналів?";
      break;
    case "pl":
      $("#channel_user_name").text("Twoje imię?");
      $("#channel_name").text("Kanał?");
      $("#channel_key").text("Wspólny klucz?");
      $("#channel_server").text("Adres serwera WebSocket");
      $("#channel_exit").val("wyjdź");
      $("#channel_exit_all").val("wyjdź ze wszystkich");
      $("#new_channel").val("nowy kanał");
      $("#check_upgrades").val("aktualizuj");
      $("#channel_list").val("kanały");
      $("#channel_list_new").val("kanały");
      $("#app_info").text("informacje o aplikacji");
      $("#legal").text("informacje prawne");
      gWeekday[0] = "Niedz";
      gWeekday[1] = "Pon";
      gWeekday[2] = "Wt";
      gWeekday[3] = "Śr";
      gWeekday[4] = "Czw";
      gWeekday[5] = "Pt";
      gWeekday[6] = "Sob";
      gBgTitle = "MlesTalk działa w tle";
      gBgText = "Powiadomienia aktywne";
      gExitConfirmText = "Czy na pewno chcesz wyjść z kanału?";
      gExitAllConfirmText = "Czy na pewno chcesz wyjść ze wszystkich kanałów?";
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
      gExitConfirmText = "Are you sure you want to exit the channel?";
      gExitAllConfirmText = "Are you sure you want to exit all channels?";
      break;
  }

  if (isCordova) {
    cordova.plugins.backgroundMode.setDefaults({
      title: gBgTitle,
      text: gBgText,
    });
  }
}

function popAlert() {
  let language = $("#channel_localization").val();
  switch (language) {
    case "fi":
      alert("Nimi, kanava ja jaettu avain?");
      break;
    case "se":
      alert("Namn, kanal och delad nyckel?");
      break;
    case "es":
      alert("Nombre, canal y clave compartida?");
      break;
    case "de":
      alert("Name, Kanal und gemeinsamer Schlüssel?");
      break;
    case "fr":
      alert("Nom, canal et clé partagée?");
      break;
    case "pt":
      alert("Seu nome, canal e chave compartilhada?");
      break;
    case "ru":
      alert("Твое имя, канал и общий ключ?");
      break;
    case "gb":
    default:
      alert("Name, channel and shared key?");
      break;
  }
}

function popChannelAlert() {
  let language = $("#channel_localization").val();
  switch (language) {
    case "fi":
      alert("Kanava on jo olemassa");
      break;
    case "se":
      alert("Kanal finns redan");
      break;
    case "es":
      alert("El canal ya existe");
      break;
    case "de":
      alert("Kanal existiert bereits");
      break;
    case "fr":
      alert("Le canal existe déjà");
      break;
    case "pt":
      alert("Canal já existe");
      break;
    case "ru":
      alert("Канал уже существует");
      break;
    case "zh":
      alert("频道已存在");
      break;
    case "ja":
      alert("チャンネルは既に存在します");
      break;
    case "ko":
      alert("채널이 이미 존재합니다");
      break;
    case "it":
      alert("Il canale esiste già");
      break;
    case "ar":
      alert("القناة موجودة بالفعل");
      break;
    case "uk":
      alert("Канал вже існує");
      break;
    case "pl":
      alert("Kanał już istnieje");
      break;
    case "gb":
    default:
      alert("Channel already exists");
      break;
  }
}

function verAlert(newVersionExists, version = "", dlurl = "", b2sum = "") {
  let language = $("#channel_localization").val();
  switch (language) {
    case "fi":
      if (newVersionExists) {
        const confirmed = confirm(
          "Uusi versio " + version + " saatavilla, haluatko ladata?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Uutta versiota ei saatavilla.");
      break;
    case "se":
      if (newVersionExists) {
        const confirmed = confirm(
          "Ny version " + version + " tillgänglig, vill du ladda ner?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Ingen ny version tillgänglig.");
      break;
    case "es":
      if (newVersionExists) {
        const confirmed = confirm(
          "Nueva versión " + version + " disponible, ¿quieres descargar?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("No hay nueva versión disponible.");
      break;
    case "de":
      if (newVersionExists) {
        const confirmed = confirm(
          "Neue Version " + version + " verfügbar, möchten Sie herunterladen?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Keine neue Version verfügbar.");
      break;
    case "fr":
      if (newVersionExists) {
        const confirmed = confirm(
          "Nouvelle version " + version + " disponible, tu veux télécharger?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Aucune nouvelle version disponible.");
      break;
    case "pt":
      if (newVersionExists) {
        const confirmed = confirm(
          "Nova versão " + version + " disponível, você quer baixar?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Nenhuma nova versão disponível.");
      break;
    case "ru":
      if (newVersionExists) {
        const confirmed = confirm(
          "Доступна новая " + version + " версия, хочешь скачать?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Новая версия недоступна.");
      break;
    case "zh":
      if (newVersionExists) {
        const confirmed = confirm("新版本 " + version + " 可用，您要下载吗？");
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("没有新版本可用。");
      break;
    case "ja":
      if (newVersionExists) {
        const confirmed = confirm(
          "新しいバージョン " +
            version +
            " が利用可能です。ダウンロードしますか？",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("新しいバージョンはありません。");
      break;
    case "ko":
      if (newVersionExists) {
        const confirmed = confirm(
          "새 버전 " +
            version +
            " 이(가) 사용 가능합니다. 다운로드하시겠습니까?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("새 버전이 없습니다.");
      break;
    case "it":
      if (newVersionExists) {
        const confirmed = confirm(
          "Nuova versione " + version + " disponibile, vuoi scaricarla?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Nessuna nuova versione disponibile.");
      break;
    case "ar":
      if (newVersionExists) {
        const confirmed = confirm(
          "الإصدار الجديد " + version + " متاح، هل تريد التحميل؟",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("لا يوجد إصدار جديد متاح.");
      break;
    case "uk":
      if (newVersionExists) {
        const confirmed = confirm(
          "Доступна нова версія " + version + ", бажаєте завантажити?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Нова версія недоступна.");
      break;
    case "pl":
      if (newVersionExists) {
        const confirmed = confirm(
          "Dostępna jest nowa wersja " + version + ", czy chcesz ją pobrać?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("Brak nowej wersji.");
      break;
    case "gb":
    default:
      if (newVersionExists) {
        const confirmed = confirm(
          "New version " + version + " available, do you want to download?",
        );
        if (confirmed) {
          downloadFile(dlurl);
        }
      } else alert("No new version available.");
      break;
  }
}

/* Language specific functions -- end -- */
