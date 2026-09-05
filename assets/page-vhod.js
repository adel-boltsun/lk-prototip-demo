/* Экран входа: развилка ролей, дальше — путь пациента, врача-партнёра или
   администратора клиники.
   Пациент: телефон → код → главная. Состояния из спецификации, экран 1:
   пусто, неверный формат номера, код не подошёл, ожидание повтора, успех.
   Врач-партнёр: email → пароль → кабинет. Состояния из спецификации,
   экран 0: выбор роли, вход врача, ошибка.

   Развилка приходит адресом (?role=vrach), а не кнопкой: выбор роли —
   это переход, и он обязан пережить перезагрузку и пересылку ссылки.
   Без роли в адресе открывается сама развилка — она и есть первое, что
   видит открывший ссылку. */
(function (w) {
  'use strict';

  var RESEND_SECONDS = 45;
  var MIN_PASSWORD = 4;
  /* Сценарий, в который входит каждая роль: кабинет живёт в своих данных,
     и роль переключается здесь, на входе, а не первым экраном кабинета. */
  var PATIENT_SCENARIO = 'before';

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* Четыре вида одного экрана: развилка и три входа. Вид приходит адресом,
     заголовок окна — отсюда: без него пересланная ссылка на вход врача
     называлась бы кабинетом пациента. */
  var VIEWS = [
    { id: 'patient', block: 'side-patient', title: 'Вход — Личный кабинет пациента, клиника ФАКТ' },
    { id: 'vrach',   block: 'side-vrach',   title: 'Вход — Кабинет врача-партнёра, клиника ФАКТ' },
    { id: 'admin',   block: 'side-admin',   title: 'Вход — Панель клиники, клиника ФАКТ' }
  ];

  /* Два входа по email и паролю устроены одинаково, поэтому и собираются
     одной функцией. Пациентский путь свой — по телефону и коду. */
  var ROLES = [
    { id: 'vrach', form: 'vrach-form',
      email: 'vrach-email', pass: 'vrach-pass', scenario: 'vrach-active' },
    { id: 'admin', form: 'admin-form',
      email: 'admin-email', pass: 'admin-pass', scenario: 'admin' }
  ];

  /* --- развилка ----------------------------------------------------------
     Две двери карточками на зоны и служебная строка администратора. Всё
     собрано общими приёмами render.js: заголовок секции, полоса-пояснение,
     карточка на зоны, якорь — своих версий этих блоков экран не заводит.

     🔴 Неравенство трёх ролей показано трижды: словами в заголовках секций,
     формой (карточка против строки) и лестницей действия — заливка у
     пациента, обводка у врача, текстовая ссылка у администратора. Один клик
     до любой из трёх при этом сохраняется: панель клиники иначе не выбрать
     ни с одного экрана прототипа. */
  var DOORS = [
    { id: 'patient', role: 'Пациент', title: 'Личный кабинет пациента',
      inside: 'Визиты, запись, счёт и смета, лечение, документы.',
      howIcon: 'phone', how: 'Вход по номеру телефона и коду из СМС.',
      primary: true },
    { id: 'vrach', role: 'Врач-партнёр', title: 'Кабинет врача-партнёра',
      inside: 'Направить пациента, статусы направлений, бонусы.',
      howIcon: 'mail', how: 'Вход по email и паролю, заданным при регистрации.',
      primary: false }
  ];

  var SERVICE = { id: 'admin', role: 'Администратор клиники', title: 'Панель клиники',
    icon: 'building',
    inside: 'Табло направлений от всех партнёров и реестр самих партнёров.' };

  function $(id) { return document.getElementById(id); }

  /** Сколько разделов в кабинете роли. Считается по меню каркаса, а не
      числом в разметке: «Выйти» — не раздел, а обещание «8 разделов» стоит
      на двери и обязано меняться вместе с самим кабинетом. */
  function sections(role) {
    var items = w.Shell.nav(role), n = 0, i;
    for (i = 0; i < items.length; i++) { if (items[i].id !== 'vhod') { n++; } }
    return n;
  }

  function doorMarkup(d) {
    var n = sections(d.id);
    return w.Render.zoneCard({
      cls: 'vh-door', id: d.id, tag: 'article',
      zones: [
        { cls: 'vh-door__what', body:
            '<p class="label label--muted">' + esc(d.role) + '</p>' +
            '<h3 class="vh-door__title">' + esc(d.title) + '</h3>' +
            '<p class="vh-door__inside">' + esc(d.inside) + '</p>' +
            w.Render.hintBar({ icon: d.howIcon, text: d.how }) },
        { cls: 'vh-door__go', body:
            w.Render.anchor({ cls: 'vh-door__anchor', value: String(n),
              label: w.Render.fmt.plural(n, 'раздел', 'раздела', 'разделов') }) +
            '<a class="btn ' + (d.primary ? 'btn--primary' : 'btn--secondary') +
            ' vh-door__btn" href="index.html?role=' + esc(d.id) + '">Открыть' +
            ic('arrow-right') + '</a>' }
      ]
    });
  }

  function serviceMarkup(s) {
    return '<div class="vh-service" data-id="' + esc(s.id) + '">' +
      '<span class="vh-service__ic">' + ic(s.icon) + '</span>' +
      '<div class="vh-service__text">' +
        '<p class="label label--muted">' + esc(s.role) + '</p>' +
        '<h3 class="vh-service__title">' + esc(s.title) + '</h3>' +
        '<p class="vh-service__inside">' + esc(s.inside) + '</p>' +
      '</div>' +
      '<a class="vh-service__go" href="index.html?role=' + esc(s.id) + '">Открыть' +
      ic('arrow-right', 'ic--sm') + '</a>' +
      '</div>';
  }

  function forkMarkup() {
    return '<p class="label login__eyebrow">Вход</p>' +
      '<h1 class="h1 login__title">Личные кабинеты</h1>' +
      '<p class="login__text">У каждой роли свой кабинет и свой вход. ' +
      'Вернуться к выбору можно с любого.</p>' +
      '<section class="vh-sec">' +
        w.Render.sectionHead({ title: 'Выберите свой кабинет',
                               aside: 'пациент и врач-партнёр' }) +
        '<div class="vh-doors">' + DOORS.map(doorMarkup).join('') + '</div>' +
      '</section>' +
      '<section class="vh-sec">' +
        w.Render.sectionHead({ title: 'Служебный вход',
                               aside: 'для сотрудников клиники' }) +
        serviceMarkup(SERVICE) +
      '</section>' +
      '<div class="notice vh-proto">' +
        '<p class="label notice__title">Прототип</p>' +
        '<p class="muted">Это прототип: данные выдуманы, вход ничего не проверяет. ' +
        'Пациенту подойдёт любой код из четырёх цифр, врачу и администратору — ' +
        'любой email и пароль.</p>' +
      '</div>';
  }

  function digits(v) { return String(v).replace(/\D/g, ''); }

  /* Национальная часть номера: цифры без кода страны, не длиннее десяти.
     Правило одно и на маску, и на проверку. Пока их было два, проверка
     считала цифры прямо в поле — а там после маски стоит «+7», то есть
     одиннадцатая цифра, — и «+7 (918) 445-12-0» с девятью цифрами
     национальной части проходил как заполненный. */
  function national(raw) {
    var d = digits(raw);
    if (d.charAt(0) === '8' || d.charAt(0) === '7') { d = d.slice(1); }
    return d.slice(0, 10);
  }

  /** Приводит ввод к виду +7 (918) 445-12-08 и возвращает разметку. */
  function maskPhone(raw) {
    var d = national(raw);
    if (!d) { return ''; }
    var out = '+7 (' + d.slice(0, 3);
    if (d.length >= 3) { out += ')'; }
    if (d.length > 3) { out += ' ' + d.slice(3, 6); }
    if (d.length > 6) { out += '-' + d.slice(6, 8); }
    if (d.length > 8) { out += '-' + d.slice(8, 10); }
    return out;
  }

  /** Главная роли. Таблица одна и лежит в Store — там же, где ею пользуется
      каркас, уводя со сценария чужой роли. Второй список адресов на входе
      разъехался бы с ней молча. */
  function home(role) { return w.Store ? w.Store.home(role) : 'kabinet.html'; }

  function show(node, text) { node.textContent = text; node.hidden = false; }
  function hide(node) { node.textContent = ''; node.hidden = true; }

  function init() {
    /* Развилка собирается до всего остального: каркас через mount заказывает
       замер ширины, и мерить он должен готовую страницу. */
    $('side-fork').innerHTML = forkMarkup();

    var form = $('login-form');
    var phone = $('phone');
    var phoneMsg = $('phone-msg');
    var send = $('send-code');
    var sendHint = $('send-hint');
    var codeStep = $('code-step');
    var code = $('code');
    var codeMsg = $('code-msg');
    var enter = $('enter');
    var resendHint = $('resend-hint');
    var resend = $('resend');
    var timer = null;

    function phoneComplete() { return national(phone.value).length === 10; }

    function syncSend() {
      var ok = phoneComplete();
      send.disabled = !ok;
      sendHint.hidden = ok;
      if (ok) { hide(phoneMsg); phone.classList.remove('input--error'); }
    }

    phone.addEventListener('input', function () {
      var pos = phone.selectionStart === phone.value.length;
      phone.value = maskPhone(phone.value);
      if (pos) { phone.selectionStart = phone.selectionEnd = phone.value.length; }
      syncSend();
    });

    /* Неполный номер: подсказка под полем, введённое остаётся на месте. */
    phone.addEventListener('blur', function () {
      if (phone.value && !phoneComplete()) {
        phone.classList.add('input--error');
        show(phoneMsg, 'Номер введён не полностью. Нужно десять цифр после +7.');
      }
    });

    function startTimer() {
      var left = RESEND_SECONDS;
      resend.hidden = true;
      function tick() {
        resendHint.textContent = 'Запросить новый код через 0:' + ('0' + left).slice(-2);
        if (left <= 0) {
          clearInterval(timer);
          resendHint.textContent = 'Код не пришёл?';
          resend.hidden = false;
          return;
        }
        left--;
      }
      tick();
      timer = setInterval(tick, 1000);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!phoneComplete()) {
        phone.classList.add('input--error');
        show(phoneMsg, 'Номер введён не полностью. Нужно десять цифр после +7.');
        phone.focus();
        return;
      }
      codeStep.hidden = false;
      send.disabled = true;
      send.textContent = 'Код отправлен на ' + phone.value;
      sendHint.hidden = true;
      startTimer();
      code.focus();
    });

    w.Shell.on('login-resend', function () { startTimer(); code.focus(); });

    code.addEventListener('input', function () {
      code.value = digits(code.value).slice(0, 4);
      hide(codeMsg);
      code.classList.remove('input--error');
    });

    w.Shell.on('login-enter', function () {
      /* В прототипе пускают любые четыре цифры. */
      if (!/^\d{4}$/.test(code.value)) {
        code.classList.add('input--error');
        show(codeMsg, 'Код не подошёл. Проверьте или запросите новый.');
        code.focus();
        return;
      }
      if (timer) { clearInterval(timer); }
      /* Роль ставит тот вход, через который прошли, — все три одинаково.
         Иначе после одного входа врачом прототип остаётся в врачебном
         сценарии, и кабинет пациента уводит на главную врача: щелчками
         назад не вернуться. */
      if (w.Store && w.Store.role() !== 'patient') { w.Store.setScenario(PATIENT_SCENARIO); }
      w.location.href = home('patient');
    });

    code.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enter.click(); } });

    /* --- вход по email и паролю: врач-партнёр и администратор ----------
       Пара с сервером не сверяется — прототип открывается без сети. Неверной
       считается пара, которая не могла бы существовать: адрес без собаки или
       слишком короткий пароль. Введённый email при этом остаётся на месте:
       заново набирать его после ошибки заказчик не должен. */
    function wireLogin(role) {
      var form = $(role.form), mail = $(role.email), pass = $(role.pass);
      var mailMsg = $(role.email + '-msg'), passMsg = $(role.pass + '-msg');

      function clearError() {
        hide(mailMsg); hide(passMsg);
        mail.classList.remove('input--error');
        pass.classList.remove('input--error');
      }

      mail.addEventListener('input', clearError);
      pass.addEventListener('input', clearError);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearError();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.value.trim())) {
          mail.classList.add('input--error');
          show(mailMsg, 'Неверная пара. Проверьте адрес: он должен быть вида vrach@example.ru.');
          mail.focus();
          return;
        }
        if (pass.value.length < MIN_PASSWORD) {
          pass.classList.add('input--error');
          show(passMsg, 'Неверная пара. Пароль короче четырёх знаков — проверьте раскладку.');
          pass.focus();
          return;
        }
        /* Сценарий трогаем, только если прототип сейчас в чужой роли: врач,
           выбравший в панели «нового партнёра», после перезахода не должен
           получить обратно «активного». */
        if (w.Store && w.Store.role() !== role.id) { w.Store.setScenario(role.scenario); }
        w.location.href = home(role.id);
      });
    }

    ROLES.forEach(wireLogin);

    /* Вид с адреса: развилка либо один из трёх входов. Развилка остаётся
       видом по умолчанию — на неё же уводит «Все три кабинета» с любого
       входа, поэтому обратный переход не заводит своего адреса. */
    VIEWS.forEach(function (v) {
      if (!(new RegExp('[?&]role=' + v.id + '(&|$)')).test(w.location.search)) { return; }
      $('side-fork').hidden = true;
      $(v.block).hidden = false;
      $('page').classList.remove('vh-wide');
      document.title = v.title;
    });

    /* Стрелка возврата — тот же общий контур, что и на дверях, развёрнутый
       правилом экрана: своей стрелки влево в наборе нет. */
    var backs = document.querySelectorAll('.vh-back__a');
    for (var b = 0; b < backs.length; b++) {
      backs[b].insertAdjacentHTML('afterbegin', ic('arrow-right', 'vh-back__ic'));
    }

    /* Глаз в логотипе — из общего набора иконок. */
    var mark = $('login-mark');
    if (mark && w.icon) { mark.innerHTML = w.icon('eye'); }

    w.Shell.mount({ active: 'vhod', bare: true });

    syncSend();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
