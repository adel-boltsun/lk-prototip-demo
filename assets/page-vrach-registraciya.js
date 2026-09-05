/* Регистрация врача-партнёра по ссылке-приглашению.
   Четыре состояния из спецификации, экран 1: форма, отказ без приглашения,
   «заявка на проверке», «заявка отклонена».

   Какое из них показать, решают две вещи и обе снаружи экрана: параметр
   приглашения в адресе и решение по заявке в Store. Своего состояния экран
   не держит — иначе после перезагрузки заказчик увидел бы форму вместо
   отправленной заявки.

   🔴 Экран приведён к общему виду кабинета: разметку всех четырёх состояний
   собирает код общими приёмами render.js — заголовок секции с линейкой,
   карточка на зоны, крупный якорь и полоса-пояснение. Что поменялось против
   сборки от 03.09:

   1. Анкета из семи полей подряд разложена на секции с номерами — тот же
      приём, что на форме направления после переделки. Стопка одинаковых полей
      не говорила, что клиника спрашивает и зачем.
   2. Состав передачи стал секцией ранга поля: зелёная карточка на две зоны
      вместо строки петитом в конце анкеты. Врач видит, что именно уходит
      клинике, до кнопки отправки, а не после неё.
   3. Состояния «на проверке» и «отклонено» получили якорь со сроком и
      причиной, как заявка в очереди модерации: врач видит своё ожидание
      тем же прибором, каким администратор видит его заявку.
   4. Плашки .notice заменены полосами-пояснениями: оговорка тише текста
      и со значком, одинаково на всех экранах кабинета.

   Утверждения по таблице состояний — tools/test-vrach-registraciya.html. */
(function (w) {
  'use strict';

  var MIN_PASSWORD = 4;
  var STATE_KEY = 'vrach-reg';
  var UNKNOWN = '[уточняется]';
  var VHOD = 'index.html?role=vrach';

  var R = w.Render;
  var fmt = R.fmt;
  function esc(v) { return R.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }
  function $(id) { return document.getElementById(id); }
  function digits(v) { return String(v).replace(/\D/g, ''); }

  /* Национальная часть номера: цифры без кода страны, не длиннее десяти.
     Правило одно и на маску, и на проверку — иначе проверка считает цифры
     прямо в поле, где после маски стоит «+7», и неполный номер проходит. */
  function national(raw) {
    var d = digits(raw);
    if (d.charAt(0) === '8' || d.charAt(0) === '7') { d = d.slice(1); }
    return d.slice(0, 10);
  }

  /* Маска телефона — та же, что на входе пациента: одна клиника, один вид
     номера во всех формах прототипа. */
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

  function show(node, text) { node.textContent = text; node.hidden = false; }
  function hide(node) { node.textContent = ''; node.hidden = true; }

  function hasInvite() { return /[?&]invite=[^&]+/.test(w.location.search); }
  function askedRejection() { return /[?&]reshenie=otkaz\b/.test(w.location.search); }

  /** Решение по заявке: его принимает администратор в панели клиники и
      кладёт сюда же. Экран регистрации его только читает. */
  function decision() {
    return w.Store ? w.Store.value(STATE_KEY) : null;
  }

  /** Головная клиника: контакты берутся из DATA, как и всё остальное —
      телефон в трёх местах экрана обязан быть одним и тем же. */
  function clinic() {
    var list = w.DATA ? w.DATA.clinics() : [];
    return list.length ? list[0] : { phone: UNKNOWN, city: '', address: UNKNOWN, hours: UNKNOWN };
  }

  /** Сколько дней прошло с даты. Тот же счёт, что у срока заявки в очереди
      модерации: врач видит своё ожидание тем же числом, каким администратор
      видит его заявку. */
  function since(iso) {
    if (!iso) { return UNKNOWN; }
    var a = new Date(iso); a.setHours(0, 0, 0, 0);
    var b = new Date(); b.setHours(0, 0, 0, 0);
    var n = Math.round((b - a) / 86400000);
    if (n <= 0) { return 'сегодня'; }
    return n + ' ' + fmt.plural(n, 'день', 'дня', 'дней');
  }

  /* --- общие куски разметки ---------------------------------------------- */

  function title(eyebrow, h1, text) {
    return '<p class="label login__eyebrow">' + esc(eyebrow) + '</p>' +
      '<h1 class="h1 login__title">' + esc(h1) + '</h1>' +
      '<p class="login__text">' + esc(text) + '</p>';
  }

  /** Путь назад первой строкой, как на входе: заказчик смотрит кабинеты
      подряд, и возврат нужен ему чаще самой анкеты. */
  function back(text, href) {
    return '<p class="vr-back"><a class="vr-back__a" href="' + esc(href || 'index.html') + '">' +
      ic('arrow-right', 'vr-back__ic') + esc(text) + '</a></p>';
  }

  /** Шапка поля: подпись слева, пояснение справа от неё. Тот же приём, что
      у заголовка секции, только без линейки — внутри карточки она лишняя. */
  function head(id, label, aside) {
    return '<div class="vr-head">' +
      '<label class="label" for="' + id + '">' + esc(label) + '</label>' +
      (aside ? '<span class="vr-head__aside">' + esc(aside) + '</span>' : '') +
    '</div>';
  }

  function textField(o) {
    return '<div class="field vr-field">' +
      head(o.id, o.label, o.aside) +
      '<input class="input" id="' + o.id + '" name="' + o.name + '"' +
        ' type="' + (o.type || 'text') + '"' +
        (o.mode ? ' inputmode="' + o.mode + '"' : '') +
        (o.autocomplete ? ' autocomplete="' + o.autocomplete + '"' : '') +
        (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
        ' aria-describedby="' + o.msg + '">' +
      '<span class="field__error vr-error" id="' + o.msg + '" hidden></span>' +
      (o.hint ? '<span class="field__hint">' + esc(o.hint) + '</span>' : '') +
    '</div>';
  }

  /** Полоса «что будет дальше»: пронумерованные шаги в ряд, как на форме
      направления. Последствие читается перед решением, а не после него. */
  function steps(list) {
    return '<div class="card vr-next"><div class="vr-steps">' +
      list.map(function (s, i) {
        return '<div class="vr-step">' +
          '<p class="vr-step__head"><span class="vr-step__num">' +
            ('0' + (i + 1)).slice(-2) + '</span>' +
            '<span class="label">' + esc(s.title) + '</span></p>' +
          '<p class="vr-step__text">' + esc(s.text) + '</p>' +
        '</div>';
      }).join('') + '</div></div>';
  }

  /* --- состояние: без приглашения ---------------------------------------- */

  function nopeMarkup() {
    var c = clinic();
    /* Заголовок короткий: экран открывают с чужой ссылки, и первое, что
       на нём надо прочесть, — почему формы нет. Пять строк заголовка это
       откладывали. */
    return title('Регистрация',
      'Кабинет врача-партнёра — по приглашению клиники',
      'Ссылка-приглашение приходит от администратора клиники. Если её нет, ' +
      'позвоните — вас добавят в программу.') +
      R.zoneCard({ cls: 'vr-state login__block', zones: [
        { cls: 'vr-state__mark', body: R.anchor({
            label: 'Как войти', value: 'По приглашению',
            note: 'Ссылку выдаёт администратор клиники' }) },
        { cls: 'vr-state__body', body:
            '<p class="label">Телефон клиники</p>' +
            '<p class="vr-state__value">' + esc(c.phone) + '</p>' +
            R.hintBar({ icon: 'clock', text: c.hours }) }
      ] }) +
      back('Вернуться ко входу', VHOD);
  }

  /* --- состояние: заявка на проверке ------------------------------------- */

  function sentMarkup() {
    var d = decision() || {};
    return title('Регистрация', 'Заявка ушла на проверку',
      'Администратор клиники сверит место работы и специальность. После ' +
      'подтверждения на указанный email придёт письмо, и вход в кабинет ' +
      'откроется по нему и вашему паролю.') +
      R.zoneCard({ cls: 'vr-state login__block', zones: [
        { cls: 'vr-state__mark', body: R.anchor({
            label: 'Ждёт ответа', value: since(d.at),
            note: d.at ? 'Заявка от ' + fmt.exact(d.at) : UNKNOWN }) },
        { cls: 'vr-state__body', body:
            '<p class="label">Срок проверки</p>' +
            /* Заглушка видна: клиника срока рассмотрения не называла, и
               правдоподобное «до трёх дней» показ принял бы за обещание. */
            '<p class="vr-state__value">' + esc(UNKNOWN) + '</p>' +
            R.hintBar({ icon: 'message',
              text: 'Клиника ещё не назвала срок рассмотрения заявок.' }) }
      ] }) +
      R.section({ cls: 'vr-sec', title: 'Что будет дальше', aside: 'два шага',
        body: steps([
          { title: 'Проверка заявки',
            text: 'Администратор клиники сверяет место работы и специальность.' },
          { title: 'Письмо и вход',
            text: 'После подтверждения на почту придёт письмо, и вход откроется ' +
              'по email и паролю из анкеты.' }
        ]) }) +
      back('Вернуться ко входу', VHOD);
  }

  /* --- состояние: заявка отклонена --------------------------------------- */

  function rejectedMarkup() {
    var d = decision() || {};
    var c = clinic();
    return title('Регистрация', 'Заявка отклонена',
      'Администратор клиники не подтвердил заявку.') +
      R.zoneCard({ cls: 'vr-state login__block', zones: [
        { cls: 'vr-state__mark', body: R.anchor({
            label: 'Решение', value: 'Отказ',
            note: d.at ? fmt.exact(d.at) : UNKNOWN }) },
        { cls: 'vr-state__body', body:
            '<p class="label">Причина отказа</p>' +
            /* Причина — слова администратора: их пишет админ-панель и кладёт
               в решение. Заглушка остаётся на случай решения без причины. */
            '<p class="vr-state__reason" id="reject-reason">' + esc(UNKNOWN) + '</p>' +
            R.hintBar({ icon: 'phone',
              text: 'Если это ошибка — позвоните в клинику: ' + c.phone }) }
      ] }) +
      back('Вернуться ко входу', VHOD);
  }

  /* --- состояние: анкета -------------------------------------------------- */

  var FIELDS = [
    { id: 'reg-fio',   msg: 'reg-fio-msg',   error: 'Укажите фамилию, имя и отчество.' },
    { id: 'reg-spec',  msg: 'reg-spec-msg',  error: 'Укажите специальность — её проверит администратор.' },
    { id: 'reg-city',  msg: 'reg-city-msg',  error: 'Укажите город.' },
    { id: 'reg-work',  msg: 'reg-work-msg',  error: 'Укажите клинику или место работы.' },
    { id: 'reg-phone', msg: 'reg-phone-msg', error: 'Номер введён не полностью. Нужно десять цифр после +7.' },
    { id: 'reg-email', msg: 'reg-email-msg', error: 'Адрес должен быть вида vrach@example.ru.' },
    { id: 'reg-pass',  msg: 'reg-pass-msg',  error: 'Пароль короче четырёх знаков.' }
  ];

  /** Верхняя карточка: что это за экран и сколько заполнять. Число полей
      считается по самому списку — обещание «7 обязательных» не может
      разойтись с формой, стоящей под ним. */
  function aboutCard() {
    var n = FIELDS.length;
    return R.zoneCard({ cls: 'vr-about login__block', zones: [
      { cls: 'vr-about__what', body:
          '<p class="label">Приглашение клиники</p>' +
          '<p class="vr-about__lead">Вы открыли ссылку-приглашение клиники ФАКТ. ' +
            'Заполните анкету — администратор проверит её и откроет вам кабинет.</p>' },
      { cls: 'vr-about__need', body:
          R.anchor({ label: 'Нужно заполнить', value: String(n) }) +
          '<p class="label">' + esc(fmt.plural(n, 'обязательное поле', 'обязательных поля',
            'обязательных полей')) + '</p>' +
          '<p class="vr-about__more muted">состав передачи — в конце анкеты</p>' }
    ] });
  }

  function formMarkup() {
    return back('Вход врача-партнёра', VHOD) +
      title('Регистрация', 'Кабинет врача-партнёра',
        'Анкета открывается по ссылке-приглашению клиники и уходит ' +
        'администратору на проверку.') +
      aboutCard() +
      '<form id="reg" novalidate>' +
        R.section({ cls: 'vr-sec', title: '01 · Врач', aside: 'кто вы',
          body: '<div class="card vr-card">' +
            textField({ id: 'reg-fio', name: 'fio', msg: 'reg-fio-msg',
              label: 'Фамилия, имя и отчество', autocomplete: 'name',
              hint: 'Так, как они записаны в дипломе и в сертификате.' }) +
            textField({ id: 'reg-spec', name: 'spec', msg: 'reg-spec-msg',
              label: 'Специальность', placeholder: 'например, врач-терапевт',
              hint: 'Её администратор сверяет при подтверждении заявки.' }) +
          '</div>' }) +
        R.section({ cls: 'vr-sec', title: '02 · Где вы работаете',
          aside: 'это проверит администратор',
          body: '<div class="card vr-card">' +
            textField({ id: 'reg-city', name: 'city', msg: 'reg-city-msg',
              label: 'Город', autocomplete: 'address-level2',
              hint: 'Город, в котором вы принимаете пациентов.' }) +
            textField({ id: 'reg-work', name: 'work', msg: 'reg-work-msg',
              label: 'Клиника или место работы', autocomplete: 'organization',
              hint: 'Название так, как оно звучит официально.' }) +
            R.hintBar({ icon: 'building',
              text: 'Администратор клиники сверит место работы и специальность. ' +
                'Заявку без них подтвердить нечем.' }) +
          '</div>' }) +
        R.section({ cls: 'vr-sec', title: '03 · Связь и вход',
          aside: 'по ним придёт ответ',
          body: '<div class="card vr-card">' +
            textField({ id: 'reg-phone', name: 'phone', msg: 'reg-phone-msg',
              label: 'Телефон', type: 'tel', mode: 'tel', autocomplete: 'tel',
              placeholder: '+7 (___) ___-__-__',
              hint: 'По нему клиника свяжется с вами, если что-то не сойдётся.' }) +
            textField({ id: 'reg-email', name: 'email', msg: 'reg-email-msg',
              label: 'Email', type: 'email', mode: 'email', autocomplete: 'email',
              placeholder: 'vrach@example.ru',
              hint: 'На этот адрес придёт письмо о решении по заявке.' }) +
            textField({ id: 'reg-pass', name: 'password', msg: 'reg-pass-msg',
              label: 'Пароль', type: 'password', autocomplete: 'new-password',
              hint: 'От четырёх знаков. По нему вы войдёте в кабинет после подтверждения.' }) +
          '</div>' }) +
        /* 🔴 Состав передачи — секция того же ранга, что поля, и карточка
           на две зоны. Зелёная рамка с тинтом — единственное место экрана,
           где карточка не белая: врач должен упереться в неё глазом до
           кнопки отправки.

           Отметки согласия здесь нет намеренно. На форме направления она
           стоит, потому что согласие даёт третье лицо — пациент, и врач
           подтверждает, что спросил его. Здесь врач отправляет свои
           собственные данные, а текста согласия клиника не давала: галочка
           под выдуманной формулировкой была бы обещанием от её имени. */
        R.section({ cls: 'vr-sec', title: '04 · Что уйдёт в клинику',
          aside: 'состав заявки',
          body: R.zoneCard({ cls: 'vr-consent', zones: [
            { cls: 'vr-consent__mark', body:
                '<p class="vr-consent__text">Отправляя анкету, вы передаёте эти ' +
                  'данные клинике ФАКТ для проверки заявки.</p>' +
                R.hintBar({ icon: 'shield',
                  text: 'Текст согласия на обработку данных и порядок его ' +
                    'хранения клиника пока не давала — ' + UNKNOWN + '.' }) },
            { cls: 'vr-consent__sent', body:
                '<p class="label">Состав</p>' +
                '<div class="vr-sent">' +
                  ['Фамилия, имя, отчество и специальность',
                   'Город и место работы',
                   'Телефон и email'].map(function (t) {
                    return '<p class="vr-sent__item">' + ic('check', 'ic--sm') +
                      '<span>' + esc(t) + '</span></p>';
                  }).join('') +
                '</div>' +
                '<p class="vr-consent__limit muted">Больше анкета ничего не передаёт.</p>' }
          ] }) }) +
        R.section({ cls: 'vr-sec', title: 'Что будет дальше', aside: 'три шага после отправки',
          body: steps([
            { title: 'Заявка в очереди', text: 'Анкета уходит администратору клиники и встаёт в очередь на проверку.' },
            { title: 'Проверка', text: 'Администратор сверяет место работы и специальность. При отказе он называет причину, и вы увидите её здесь.' },
            { title: 'Вход в кабинет', text: 'После подтверждения на почту придёт письмо, и вход откроется по email и паролю.' }
          ]) }) +
        '<div class="card vr-send">' +
          '<p class="vr-send__why is-ready" id="reg-why"></p>' +
          '<button class="btn btn--primary vr-send__btn" id="reg-send" type="submit">' +
            'Отправить заявку</button>' +
        '</div>' +
      '</form>' +
      R.hintBar({ cls: 'vr-proto', icon: 'sparkle',
        text: 'Это прототип. Заявка никуда не уходит — она сохраняется в браузере, ' +
          'чтобы показать, что видит врач после отправки.' });
  }

  /* --- какое состояние показать ------------------------------------------ */

  var SCREENS = ['reg-form', 'reg-nope', 'reg-sent', 'reg-rejected'];

  function screenFor() {
    var d = decision();
    if (d && d.status === 'rejected') { return 'reg-rejected'; }
    if (d && d.status === 'sent') { return 'reg-sent'; }
    if (!hasInvite()) { return 'reg-nope'; }
    return 'reg-form';
  }

  function paint() {
    var want = screenFor();
    $('reg-form').innerHTML = want === 'reg-form' ? formMarkup() : '';
    $('reg-nope').innerHTML = want === 'reg-nope' ? nopeMarkup() : '';
    $('reg-sent').innerHTML = want === 'reg-sent' ? sentMarkup() : '';
    $('reg-rejected').innerHTML = want === 'reg-rejected' ? rejectedMarkup() : '';
    SCREENS.forEach(function (id) { $(id).hidden = id !== want; });
    /* Анкета шире короткого состояния: секции с полосами-пояснениями на
       колонке входа в 520 читаются в две-три строки каждая. Тот же приём, что
       на развилке ролей, — ширину даёт класс, а не переписанный .login__form. */
    $('page').className = 'login__form' + (want === 'reg-form' ? ' vr-wide' : '');
    var d = decision();
    if (want === 'reg-rejected') {
      $('reject-reason').textContent = (d && d.reason) ? d.reason : UNKNOWN;
    }
    if (want === 'reg-form') { bindForm(); }
    return want;
  }

  /** Контакты тёмной панели. Телефон в анкете и в состояниях подставляется
      при сборке — из того же DATA.clinics(), что и здесь. */
  function fillSide() {
    var c = clinic();
    $('side-phone').textContent = c.phone;
    $('side-address').textContent = (c.city ? c.city + ', ' : '') + c.address;
    $('side-hours').textContent = c.hours;
  }

  function valid(id, value) {
    if (id === 'reg-phone') { return national(value).length === 10; }
    if (id === 'reg-email') { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value); }
    if (id === 'reg-pass') { return value.length >= MIN_PASSWORD; }
    return value.trim().length > 1;
  }

  function submit(e) {
    e.preventDefault();
    var first = null;
    FIELDS.forEach(function (f) {
      var node = $(f.id);
      if (valid(f.id, node.value)) {
        hide($(f.msg));
        node.classList.remove('input--error');
        return;
      }
      node.classList.add('input--error');
      show($(f.msg), f.error);
      if (!first) { first = node; }
    });
    if (first) { first.focus(); return; }
    /* Заявка уходит в очередь модерации клиники — через шов, как направление
       уходит в таблицу. Слот ниже держит только состояние этого экрана;
       пока анкета писала один его, она обещала врачу проверку, а у
       администратора в очереди висели те же две демо-карточки. */
    if (w.DATA && w.DATA.createRegistration) {
      w.DATA.createRegistration({
        name: $('reg-fio').value, specialty: $('reg-spec').value,
        city: $('reg-city').value, workplace: $('reg-work').value,
        phone: $('reg-phone').value, email: $('reg-email').value
      });
    }
    w.Store.setValue(STATE_KEY, { status: 'sent', reason: null, at: new Date().toISOString() });
    paint();
    w.scrollTo(0, 0);
  }

  /* Слушатели вешаются на только что собранную анкету: разметку рисует код,
     и запомненных ссылок на поля между отрисовками не остаётся. */
  function bindForm() {
    var phone = $('reg-phone');
    phone.addEventListener('input', function () {
      var atEnd = phone.selectionStart === phone.value.length;
      phone.value = maskPhone(phone.value);
      if (atEnd) { phone.selectionStart = phone.selectionEnd = phone.value.length; }
    });

    /* Ошибки показываются под всеми незаполненными полями сразу, а введённое
       остаётся на месте: заново набирать анкету из семи полей ради одной
       опечатки — то, за что прототипы и ругают. */
    FIELDS.forEach(function (f) {
      $(f.id).addEventListener('input', function () {
        hide($(f.msg));
        $(f.id).classList.remove('input--error');
      });
    });

    $('reg').addEventListener('submit', submit);
    /* Что случится по нажатию — словами рядом с кнопкой, а не молчанием.
       Тот же приём, что на форме направления. */
    $('reg-why').innerHTML = ic('mail') +
      '<span>Заявка уйдёт администратору клиники на проверку.</span>';
  }

  function init() {
    fillSide();
    /* Отказ по заявке — состояние прототипа, а не выдумка экрана: его пишет
       администратор. Адресом оно тоже воспроизводится, чтобы состояние можно
       было показать до того, как собрана панель клиники. */
    if (askedRejection() && w.Store && !decision()) {
      w.Store.setValue(STATE_KEY, {
        status: 'rejected',
        reason: w.DATA ? w.DATA.rejectionReason() : null,
        at: new Date().toISOString()
      });
    }
    paint();
    w.Shell.mount({ active: 'vhod', bare: true });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
