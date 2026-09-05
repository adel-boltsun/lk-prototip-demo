/* Экран 3 «Направить пациента» — форма передачи пациента в клинику.

   Собран по утверждённому рисунку экрана: плоская стопка из шести равных
   полей разбита на три пронумерованные секции — 01 пациент, 02 куда и на что,
   03 согласие. Врач заполняет форму между приёмами, за минуту, часто с чужого
   компьютера, поэтому наверху стоит карточка на зоны: что вы делаете, кто
   направляет и якорь «сколько обязательных полей».

   🔴 Согласие — секция того же ранга, что поля, а не галочка внизу. Рядом
   с отметкой стоит перечень «что уйдёт в клинику»: врач подтверждает состав
   данных, а не абстрактное согласие. Перечень и отправляемая запись собираются
   из одного списка SENT — разойтись они физически не могут.

   Медицинского содержания здесь нет и быть не должно: ни диагноза, ни
   назначения — услуга берётся из прайса клиники, комментарий врач пишет
   своими словами, диагноз ставит клиника.

   Данные только через DATA: клиники и услуги с ценами приходят из шва,
   подписи лестницы статусов — оттуда же (DATA.statuses()), своих названий
   экран не выдумывает. Плашка статуса — общий блок Render.referralBadge.

   Отправленное направление заводит шов: DATA.createReferral() присваивает
   номер, первую ступень лестницы, даты и сценарий и кладёт запись в Store.
   Форма отдаёт только то, что набрал врач, — своего номера она не считает
   и в хранилище не пишет: иначе правил заведения стало бы два.

   Форма собирается один раз и дальше не перерисовывается: ошибка одного поля
   не должна стирать пять остальных, а сборка формы из состояния — ровно тот
   способ, которым набранное теряется. Перерисовка бывает ровно двух видов:
   экран успеха после отправки и чистая форма по «направить ещё одного».

   Состояния — по таблице спецификации, экран 3: tools/test-vrach-napravlenie.html. */
(function (w) {
  'use strict';

  var MAX_COMMENT = 500;
  var MAX_AGE = 120;
  var FIRST_STEP = 'created';

  var fmt = w.Render.fmt;
  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }
  function $(id) { return document.getElementById(id); }
  function digits(v) { return String(v).replace(/\D/g, ''); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* 🔴 Состав передачи объявлен один раз. Отсюда собирается и перечень «что
     уйдёт в клинику» в секции согласия, и сама запись, уходящая в шов: врач
     подтверждает ровно то, что уходит, и никакая правка не может рассинхронить
     обещание с делом. Клиника и услуга сюда не входят — это выбор врача,
     а не данные пациента. */
  var SENT = [
    { key: 'patientName',  from: 'vn-fio',     icon: 'user',           title: 'Имя пациента' },
    { key: 'patientPhone', from: 'vn-phone',   icon: 'phone',          title: 'Телефон', mask: true },
    { key: 'patientAge',   from: 'vn-age',     icon: 'calendar-check', title: 'Возраст' },
    { key: 'comment',      from: 'vn-comment', icon: 'pencil',         title: 'Ваш комментарий' }
  ];

  /* Поля формы и их сообщения об ошибке. Признак «need» — то, без чего направление
     не уходит; по этому же признаку считается число на якоре карточки сверху,
     поэтому седьмое обязательное поле не сможет появиться молча. */
  var FIELDS = [
    { id: 'vn-fio', msg: 'vn-fio-msg', need: true,
      error: 'Укажите фамилию, имя и отчество пациента — по ним клиника его найдёт.' },
    { id: 'vn-phone', msg: 'vn-phone-msg', need: true,
      error: 'Номер введён не полностью. Нужно десять цифр после +7.' },
    { id: 'vn-age', msg: 'vn-age-msg', need: true,
      error: 'Укажите возраст числом: от него зависит, детский приём или взрослый.' },
    { id: 'vn-clinics', msg: 'vn-clinic-msg', need: true, group: true,
      error: 'Выберите, в какую клинику направляете пациента.' },
    { id: 'vn-service', msg: 'vn-service-msg', need: true,
      error: 'Выберите услугу из прайса клиники.' },
    { id: 'vn-comment', msg: 'vn-comment-msg',
      error: 'Комментарий длиннее пятисот знаков — сократите.' }
  ];

  function needed() {
    var n = 0;
    FIELDS.forEach(function (f) { if (f.need) { n += 1; } });
    return n;
  }

  /* Национальная часть номера: цифры без кода страны, не длиннее десяти.
     Правило одно и на маску, и на проверку. Пока их было два, проверка
     считала цифры прямо в поле — а там после маски стоит «+7», то есть
     одиннадцатая цифра, — и рядом жила ветка «или одиннадцать», которая
     выглядела недостижимой и была единственной работающей. */
  function national(raw) {
    var d = digits(raw);
    if (d.charAt(0) === '8' || d.charAt(0) === '7') { d = d.slice(1); }
    return d.slice(0, 10);
  }

  /* Маска телефона — та же, что на входе и в регистрации: одна клиника,
     один вид номера во всех формах прототипа. */
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

  /* Сообщение об ошибке со значком — как на рисунке. Текст экранируется,
     значок приходит из общего набора. */
  function show(node, text) {
    node.innerHTML = ic('warn', 'ic--sm') + '<span>' + esc(text) + '</span>';
    node.hidden = false;
  }
  function hide(node) { node.innerHTML = ''; node.hidden = true; }

  /* --- справочники экрана: только из DATA -------------------------------- */

  function clinics() { return w.DATA ? w.DATA.clinics() : []; }
  function services() { return w.DATA ? w.DATA.services() : []; }
  function clinicById(id) {
    var found = null;
    clinics().forEach(function (c) { if (c.id === id) { found = c; } });
    return found;
  }
  function serviceById(id) {
    var found = null;
    services().forEach(function (s) { if (s.id === id) { found = s; } });
    return found;
  }
  /** Подпись ступени лестницы. Перечень принадлежит клинике: берём её слова,
      а не свои. Пустая строка вместо выдуманного названия, если ступени нет. */
  function statusTitle(id) {
    var title = '';
    (w.DATA ? w.DATA.statuses() : []).forEach(function (s) { if (s.id === id) { title = s.title; } });
    return title;
  }

  /* --- общие куски разметки ---------------------------------------------- */

  /** Шапка поля: подпись слева, пояснение или счётчик справа от линии.
      Тот же приём, что у заголовка секции, только внутри карточки. */
  function head(o) {
    return '<div class="vn-head">' +
      (o.group
        ? '<span class="label" id="' + o.id + '-label">' + esc(o.label) + '</span>'
        : '<label class="label" for="' + o.id + '">' + esc(o.label) + '</label>') +
      (o.aside === undefined ? ''
        : '<span class="vn-head__aside"' + (o.asideId ? ' id="' + o.asideId + '"' : '') + '>' +
          esc(o.aside) + '</span>') +
    '</div>';
  }

  function errorSlot(id) {
    return '<span class="field__error vn-error" id="' + id + '" hidden></span>';
  }
  function hint(text) { return '<span class="field__hint">' + esc(text) + '</span>'; }

  function textField(o) {
    return '<div class="field vn-field' + (o.cls ? ' ' + o.cls : '') + '">' +
      head({ id: o.id, label: o.label }) +
      '<input class="input input--sm" id="' + o.id + '" name="' + o.name + '"' +
        ' type="' + (o.type || 'text') + '"' +
        (o.mode ? ' inputmode="' + o.mode + '"' : '') +
        (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
        ' autocomplete="off" aria-describedby="' + o.msg + '">' +
      errorSlot(o.msg) + hint(o.hint) +
    '</div>';
  }

  /* --- карточка «что это за экран» --------------------------------------- */

  /** Верхняя карточка на три зоны с рисунка: что вы делаете · кто направляет ·
      якорь «сколько заполнять». Зоны, линии и поля — общий приём
      Render.zoneCard, ширины назначает класс композиции .vn-about. Якорь —
      общий приём Render.anchor: число самое крупное на карточке. */
  function aboutCard() {
    var p = w.DATA.partner();
    var n = needed();
    return w.Render.zoneCard({ cls: 'vn-about', zones: [
      { cls: 'vn-about__what', body:
        '<p class="label">Передача пациента в клинику</p>' +
        '<p class="vn-about__lead">Заполните данные пациента и выберите услугу из прайса. ' +
          'Клиника свяжется с пациентом сама, а вы увидите его путь в разделе ' +
          '«Мои направления».</p>' },
      { cls: 'vn-about__who', body:
        '<p class="label">Направляет</p>' +
        '<p class="vn-about__name">' + esc(p.name) + '</p>' +
        '<p class="vn-about__role muted">' + esc(p.specialty) + ' · ' + esc(p.workplace) + '</p>' },
      { cls: 'vn-about__need', body:
        w.Render.anchor({ label: 'Нужно заполнить', value: String(n) }) +
        '<p class="label">' + esc(fmt.plural(n, 'обязательное поле', 'обязательных поля',
          'обязательных полей')) + '</p>' +
        '<p class="vn-about__more muted">и отметка о согласии пациента</p>' }
    ] });
  }

  /* --- 01 · пациент ------------------------------------------------------ */

  function patientSection() {
    return w.Render.section({ cls: 'vn-sec', title: '01 · Пациент', aside: 'кого передаёте',
      body: '<div class="card vn-card">' +
        textField({ id: 'vn-fio', name: 'fio', msg: 'vn-fio-msg',
          label: 'Фамилия, имя и отчество',
          hint: 'По ним клиника найдёт пациента, когда позвонит.' }) +
        '<div class="vn-pair">' +
          textField({ id: 'vn-phone', name: 'phone', msg: 'vn-phone-msg', type: 'tel', mode: 'tel',
            label: 'Телефон', placeholder: '+7 (___) ___-__-__',
            hint: 'По нему клиника позвонит и запишет пациента.' }) +
          textField({ id: 'vn-age', name: 'age', msg: 'vn-age-msg', mode: 'numeric',
            cls: 'vn-field--age', label: 'Возраст', placeholder: 'полных лет',
            hint: 'От возраста зависит, детский приём или взрослый.' }) +
        '</div>' +
      '</div>' });
  }

  /* --- 02 · куда и на что ------------------------------------------------ */

  /** Клиники плитками в строку, а не списком переключателей столбиком: их
      две, и выбор филиала — это выбор из двух карточек с адресом.
      Адрес второй клиники сайт не даёт — там стоит видимая пометка, и врач,
      выбирая филиал, видит её же, а не правдоподобную улицу. */
  function clinicTiles() {
    var list = clinics();
    return head({ id: 'vn-clinics', group: true, label: 'Куда направляете',
        aside: list.length + ' ' + fmt.plural(list.length, 'клиника', 'клиники', 'клиник') +
          ' сети' }) +
      '<div class="vn-clinics" id="vn-clinics" role="radiogroup" aria-labelledby="vn-clinics-label"' +
        ' aria-describedby="vn-clinic-msg">' +
      list.map(function (c) {
        return '<label class="vn-clinic">' +
          '<input type="radio" name="clinic" value="' + esc(c.id) + '" aria-describedby="vn-clinic-msg">' +
          '<span class="vn-clinic__body">' +
            '<span class="vn-clinic__title">' + esc(c.city) + '</span>' +
            '<span class="vn-clinic__note">' + esc(c.title) + ' · ' + esc(c.address) + '</span>' +
          '</span></label>';
      }).join('') + '</div>' + errorSlot('vn-clinic-msg');
  }

  /** Услуга: список прайса, а справа в самом поле — цена выбранной услуги.
      Пока услуга не выбрана, на том же месте стоит шеврон списка. Цена
      приходит из прайса и печатается Render.fmt.money — своих цен экран
      не считает, и в подписи списка их тоже нет. */
  function serviceField() {
    var n = services().length;
    return '<div class="field vn-field">' +
      head({ id: 'vn-service', label: 'Услуга из прайса клиники' }) +
      '<div class="vn-select" id="vn-select">' +
        '<select class="input input--sm" id="vn-service" name="service"' +
          ' aria-describedby="vn-service-msg"></select>' +
        '<span class="vn-select__aside" id="vn-price"></span>' +
      '</div>' +
      errorSlot('vn-service-msg') +
      hint(n + ' ' + fmt.plural(n, 'услуга', 'услуги', 'услуг') + ' в прайсе клиники. ' +
        'Цена подставится сама — своих цен форма не считает.') +
    '</div>';
  }

  function commentField() {
    return '<div class="field vn-field">' +
      head({ id: 'vn-comment', label: 'Комментарий врачу клиники', aside: '', asideId: 'vn-count' }) +
      '<textarea class="input input--sm vn-area" id="vn-comment" name="comment" rows="4"' +
        ' maxlength="' + MAX_COMMENT + '" placeholder="Например: пациенту удобно утром"' +
        ' aria-describedby="vn-comment-msg"></textarea>' +
      errorSlot('vn-comment-msg') +
      hint('Необязательно. Своими словами: о чём предупредить, когда пациенту удобно. ' +
        'Диагноз и назначения ставит клиника — здесь их не нужно.') +
    '</div>';
  }

  function whereSection() {
    return w.Render.section({ cls: 'vn-sec', title: '02 · Куда и на что',
      aside: 'клиника сети и услуга из прайса',
      body: '<div class="card vn-card">' +
        '<div class="field vn-field">' + clinicTiles() + '</div>' +
        serviceField() + commentField() +
      '</div>' });
  }

  /* --- 03 · согласие ----------------------------------------------------- */

  /** 🔴 Согласие — секция того же ранга, что поля. Слева отметка и две полосы:
      что именно врач подтверждает и что порядок хранения согласия клиника пока
      не описала. Справа — состав передачи: для формы, где один человек
      распоряжается данными другого, важно не «согласен», а «согласен на что».
      Перечень собран из SENT, того же списка, из которого собирается запись. */
  function consentSection() {
    return w.Render.section({ cls: 'vn-sec', title: '03 · Согласие пациента',
      aside: 'без него направление не уходит',
      body: w.Render.zoneCard({ cls: 'vn-consent', zones: [
        { cls: 'vn-consent__mark', body:
          '<label class="choice vn-consent__check">' +
            '<input type="checkbox" id="vn-consent">' +
            '<span class="vn-consent__text">Пациент согласен передать свои данные ' +
              'в клинику ФАКТ и получить звонок для записи</span>' +
          '</label>' +
          w.Render.hintBar({ icon: 'shield', text: 'Отмечая, вы подтверждаете, что спросили ' +
            'пациента и он согласен на передачу данных и звонок из клиники.' }) +
          w.Render.hintBar({ icon: 'clock', text: 'Порядок хранения согласия и его срок ' +
            'клиника пока не описала — [уточняется].' }) },
        { cls: 'vn-consent__sent', body:
          '<p class="label">Что уйдёт в клинику</p>' +
          '<ul class="vn-sent" id="vn-sent">' + SENT.map(function (f) {
            return '<li class="vn-sent__item">' + ic(f.icon, 'ic--sm') +
              '<span>' + esc(f.title) + '</span></li>';
          }).join('') + '</ul>' +
          '<p class="vn-consent__limit muted">Больше форма ничего не передаёт.</p>' }
      ] }) });
  }

  /* --- что будет дальше --------------------------------------------------- */

  /** Полоса на три зоны прямо над кнопкой отправки: последствие читается
      перед решением, а не сбоку от формы. Четвёртый пункт — про то, что
      диагноз ставит клиника, — выведен из ряда в сноску: это граница,
      а не шаг. Один и тот же блок стоит и на форме, и на экране успеха.
      Сроки клиника не называла — вместо правдоподобного числа стоит пометка. */
  function nextBar() {
    var steps = [
      { title: 'Клиника позвонит',
        text: 'Клиника позвонит пациенту и запишет его на приём. Срок, за который ' +
          'перезванивают, клиника пока не назвала — [уточняется].' },
      { title: 'Статус в «Моих направлениях»', badge: true,
        text: 'Направление появится у вас со статусом «' + statusTitle(FIRST_STEP) + '». ' +
          'Дальше статус меняет клиника, а вы видите каждый шаг.' },
      { title: 'Сумма и начисление',
        text: 'Когда услуга будет оказана, в направлении появится её сумма, а следом — ' +
          'начисление. Правило начисления и сроки выплат устанавливает клиника — [уточняется].' }
    ];
    return '<div class="card vn-next">' +
      '<div class="vn-steps">' + steps.map(function (s, i) {
        return '<div class="vn-step">' +
          '<p class="vn-step__head"><span class="vn-step__num">' + pad2(i + 1) + '</span>' +
            '<span class="label">' + esc(s.title) + '</span></p>' +
          '<p class="vn-step__text">' + esc(s.text) + '</p>' +
          (s.badge ? '<p class="vn-step__badge">' + w.Render.referralBadge(FIRST_STEP) + '</p>' : '') +
        '</div>';
      }).join('') + '</div>' +
      w.Render.hintBar({ icon: 'stethoscope', text: 'Диагноз и назначения ставит клиника. ' +
        'В направлении их нет: только услуга из прайса и ваш комментарий.' }) +
    '</div>';
  }

  function nextSection() {
    return w.Render.section({ cls: 'vn-sec', title: 'Что будет дальше',
      aside: 'три шага после отправки', body: nextBar() });
  }

  /* --- вид «форма» -------------------------------------------------------- */

  function formView() {
    return '<h1 class="h1 page__title" id="vn-title">Направить пациента</h1>' +
      '<div id="vn-form-wrap">' + aboutCard() +
        '<form id="vn-form" novalidate>' +
          patientSection() + whereSection() + consentSection() + nextSection() +
          '<div class="card vn-send">' +
            '<p class="vn-send__why" id="vn-why"></p>' +
            '<button class="btn btn--primary vn-send__btn" id="vn-send" type="submit" disabled>' +
              ic('navigation', 'ic--sm') + 'Отправить направление</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }

  /* --- поля и их проверка ------------------------------------------------ */

  function pickedClinic() {
    var node = $('vn-clinics').querySelector('input[name="clinic"]:checked');
    return node ? node.value : '';
  }

  function valueOf(id) {
    if (id === 'vn-clinics') { return pickedClinic(); }
    return $(id).value;
  }

  function valid(id, value) {
    if (id === 'vn-phone') { return national(value).length === 10; }
    if (id === 'vn-age') {
      var n = Number(String(value).trim());
      return String(value).trim() !== '' && /^\d{1,3}$/.test(String(value).trim()) && n >= 0 && n <= MAX_AGE;
    }
    if (id === 'vn-comment') { return String(value).length <= MAX_COMMENT; }
    if (id === 'vn-clinics' || id === 'vn-service') { return String(value) !== ''; }
    return String(value).trim().length > 1;
  }

  /** Куда встать курсору после ошибки. У группы переключателей фокусируемого
      узла нет — берём первый переключатель, иначе врач остаётся без подсказки,
      куда смотреть. */
  function focusField(f) {
    var node = f.group ? $(f.id).querySelector('input') : $(f.id);
    if (node) { node.focus(); }
  }

  function clearError(f) {
    hide($(f.msg));
    if (!f.group) { $(f.id).classList.remove('input--error'); }
  }

  /* --- живые части формы -------------------------------------------------- */

  function fillServices() {
    var sel = $('vn-service');
    var opts = ['<option value="">Выберите услугу</option>'];
    /* В закрытом списке стоит только название: цена выбранной услуги живёт
       справа в самом поле, отдельной строкой, как на рисунке. */
    services().forEach(function (s) {
      opts.push('<option value="' + esc(s.id) + '">' + esc(s.title) + '</option>');
    });
    sel.innerHTML = opts.join('');
  }

  function paintCount() {
    $('vn-count').textContent = $('vn-comment').value.length + ' из ' + MAX_COMMENT;
  }

  /** Кнопка отправки без отметки согласия неактивна, и рядом сказано почему.
      Причина живёт рядом с кнопкой, а не в подсказке под галочкой: врач,
      который тянется к кнопке, смотрит на кнопку. */
  function paintConsent() {
    var on = $('vn-consent').checked;
    $('vn-send').disabled = !on;
    $('vn-why').innerHTML = ic(on ? 'check' : 'lock', 'ic--sm') + '<span>' + esc(on
      ? 'Направление уйдёт в клинику, пациенту позвонят.'
      : 'Отметьте согласие пациента — без него направление не отправляется.') + '</span>';
    $('vn-why').className = 'vn-send__why' + (on ? ' is-ready' : '');
  }

  /** Цена выбранной услуги встаёт в поле справа и вытесняет шеврон списка:
      выбор сделан, раскрывать больше нечего, а цена — то, что врач называет
      пациенту вслух. */
  function paintPrice() {
    var svc = serviceById($('vn-service').value);
    $('vn-select').className = 'vn-select' + (svc ? ' is-priced' : '');
    $('vn-price').innerHTML = svc
      ? '<span class="muted">по прайсу</span><span class="vn-price__sum" id="vn-price-sum">' +
        esc(fmt.money(svc.price)) + '</span>'
      : ic('chevron');
  }

  /* --- экран успеха ------------------------------------------------------- */

  function sumRow(label, value, note) {
    return '<div class="vn-sum__row"><span class="label">' + esc(label) + '</span>' +
      '<span class="vn-sum__val"><span class="vn-sum__main">' + esc(value) + '</span>' +
      (note ? '<span class="vn-sum__note muted">' + esc(note) + '</span>' : '') + '</span></div>';
  }

  /** Карточка направления: якорь с номером, рядом пациент и плашка статуса.
      Плашку рисует общий блок Render.referralBadge — своей версии у экрана
      нет, иначе статус на этом экране разъехался бы с таблицей направлений. */
  function doneCard(r) {
    return w.Render.zoneCard({ cls: 'vn-num', zones: [
      { cls: 'vn-num__code', body:
        w.Render.anchor({ cls: 'vn-num__anchor', label: 'Номер направления', value: r.number }) +
        '<p class="vn-num__when"><span class="muted">от ' + esc(fmt.exact(r.createdAt)) + '</span>' +
          '<button type="button" class="btn btn--secondary btn--sm" data-act="copy-number">' +
            ic('clip', 'ic--sm') + 'Скопировать номер</button></p>' },
      { cls: 'vn-num__who', body:
        '<p class="label">Пациент</p>' +
        '<p class="vn-num__name">' + esc(r.patientName) + '</p>' +
        '<p class="vn-num__meta muted">' + esc(r.patientPhone) + ' · ' +
          esc(fmt.years(r.patientAge)) + '</p>' },
      { cls: 'vn-num__state', body:
        '<p class="label">Статус</p>' +
        '<p class="vn-num__badge">' + w.Render.referralBadge(r) + '</p>' +
        '<p class="vn-num__note muted">Дальше статус меняет клиника, а вы видите каждый шаг.</p>' }
    ] });
  }

  function doneView(r) {
    var clinic = clinicById(r.clinicId);
    return '<div id="vn-done" class="vn-done">' +
      '<p class="vn-done__mark">' + ic('check', 'ic--xl') + '</p>' +
      '<h1 class="h1">' + esc(statusTitle(FIRST_STEP)) + '</h1>' +
      '<p class="vn-done__lead">Клиника получила пациента и свяжется с ним. Дальше вы видите ' +
        'его путь в разделе «Мои направления».</p>' +
      doneCard(r) +
      w.Render.section({ cls: 'vn-sec', title: 'Что ушло в клинику', aside: 'то, что вы заполнили',
        body: '<div class="card vn-sum">' +
          sumRow('Клиника', r.clinicCity, clinic ? clinic.title + ' · ' + clinic.address : '') +
          sumRow('Услуга', r.serviceTitle, fmt.money(r.servicePrice) + ' по прайсу клиники') +
          (r.comment ? sumRow('Ваш комментарий', r.comment,
            'Комментарий видит врач клиники. Диагноза и назначений в направлении нет.') : '') +
        '</div>' }) +
      nextSection() +
      '<div class="vn-done__acts">' +
        '<button type="button" class="btn btn--primary" data-act="another">' +
          ic('plus', 'ic--sm') + 'Направить ещё одного</button>' +
        '<a class="btn btn--secondary" href="vrach.html">Вернуться в кабинет</a>' +
        '<a class="act vn-done__link" href="vrach-zayavki.html">Посмотреть в моих направлениях' +
          ic('arrow-right', 'ic--sm') + '</a>' +
      '</div>' +
    '</div>';
  }

  /* Прототип открывают двойным кликом, то есть с file://, где асинхронный
     navigator.clipboard может не ответить вовсе. Копируем синхронно и в любом
     случае показываем результат — тем же способом, что и список замечаний. */
  function copyNumber() {
    var node = document.querySelector('.vn-num__anchor .anchor__value');
    if (!node) { return; }
    var text = node.textContent;
    var copied = false;
    try {
      var box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', 'readonly');
      box.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(box);
      box.select();
      copied = document.execCommand('copy');
      document.body.removeChild(box);
    } catch (e) { copied = false; }
    w.Render.modal(copied
      ? { title: 'Номер скопирован', text: 'Номер направления ' + text + ' ушёл в буфер обмена.' }
      : { title: 'Номер направления', text: 'Браузер не дал скопировать сам — выделите номер и скопируйте вручную:',
          html: '<p class="h1">' + esc(text) + '</p>' });
  }

  /* --- отправка ----------------------------------------------------------- */

  /** Запись для шва. Личные поля собираются из SENT — того же списка, из
      которого нарисован перечень «что уйдёт в клинику»: обещание и дело
      считаются одним местом. Клиника и услуга добавляются отдельно: это
      выбор врача, а не данные пациента. */
  function payload() {
    var out = {};
    SENT.forEach(function (f) {
      var v = $(f.from).value;
      out[f.key] = f.mask ? maskPhone(v) : v;
    });
    out.clinicId = pickedClinic();
    out.serviceId = $('vn-service').value;
    return out;
  }

  function submit(e) {
    e.preventDefault();
    /* Ошибки показываются под всеми незаполненными полями сразу, а введённое
       остаётся на месте: набирать форму заново из-за одной опечатки в телефоне —
       то, за что прототипы и ругают. */
    var first = null;
    FIELDS.forEach(function (f) {
      if (valid(f.id, valueOf(f.id))) { clearError(f); return; }
      if (!f.group) { $(f.id).classList.add('input--error'); }
      show($(f.msg), f.error);
      if (!first) { first = f; }
    });
    if (first) { focusField(first); return; }
    if (!$('vn-consent').checked) { paintConsent(); return; }

    /* Номер, ступень, даты и сценарий присваивает шов: форма отдаёт ему то,
       что набрал врач, и показывает то, что он вернул. */
    showDone(w.DATA.createReferral(payload()));
  }

  /* --- сборка видов ------------------------------------------------------- */

  function showDone(r) {
    $('page').innerHTML = doneView(r);
    w.scrollTo(0, 0);
  }

  /** Чистая форма: набранное стирается только здесь и только по прямой
      просьбе — «направить ещё одного» про другого пациента. */
  function showForm() {
    $('page').innerHTML = formView();
    fillServices();
    bindForm();
    paintCount();
    paintConsent();
    paintPrice();
  }

  function bindForm() {
    var phone = $('vn-phone');
    phone.addEventListener('input', function () {
      var atEnd = phone.selectionStart === phone.value.length;
      phone.value = maskPhone(phone.value);
      if (atEnd) { phone.selectionStart = phone.selectionEnd = phone.value.length; }
    });

    /* Ошибка гаснет, как только человек тронул поле: сообщение под полем,
       которое он уже исправил, читается как «исправил неправильно». */
    FIELDS.forEach(function (f) {
      var node = $(f.id);
      node.addEventListener('input', function () { clearError(f); });
      node.addEventListener('change', function () { clearError(f); });
    });

    $('vn-comment').addEventListener('input', paintCount);
    $('vn-service').addEventListener('change', paintPrice);
    $('vn-consent').addEventListener('change', paintConsent);
    $('vn-form').addEventListener('submit', submit);
  }

  function init() {
    /* Каркас первым: экран без шапки, меню и обвязки прототипа заказчику
       показывать нечего, а сценарий чужой роли уводит отсюда на её главную —
       рисовать себя поверх уходящей страницы нельзя. */
    if (!w.Shell.mount({ active: 'vrach-napravlenie', role: 'vrach' })) { return; }
    /* Действия регистрируются до отрисовки: позже прибор уже снял список
       обслуженных действий, и живая кнопка числилась бы мёртвой. */
    w.Shell.on('another', function () { showForm(); w.scrollTo(0, 0); });
    w.Shell.on('copy-number', function () { copyNumber(); });

    showForm();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
