/* Экран 6 «Профиль врача-партнёра».
   Свои данные, смена пароля и два письма, которые кабинет шлёт врачу:
   о смене статуса его пациента и о начислении.

   🔴 Композиция собрана приёмами общего слоя, а не заново. Прежняя сборка
   выкладывала карточку шестью одинаковыми строками «поле — значение»: ФИО
   и место работы весили одинаково, и у экрана не было точки, с которой его
   начинают читать. Что переезд поменял:

   1. Карточка партнёра — карточка на зонах с крупным якорем (приёмы 3 и 4),
      снятая с утверждённого рисунка карточки партнёра в панели клиники: имя
      якорем в левой зоне, связь в средней, «партнёр с» и действие в правой.
      Кабинета два, а карточка партнёра одна, и выглядеть она обязана
      одинаково с обеих сторон.
   2. Подписи полей в показе сняты: «ФИО» над собственным именем врача не
      сообщает ничего, а вес отбирает. Они остаются подписями полей ввода
      в правке — там они и нужны.
   3. Оговорка о требованиях к паролю и строка «письма приходят на» — общая
      полоса-пояснение (приём 2). Своих копий этой полосы у экрана было две.

   Что здесь важно понимать про данные. Шов отдаёт карточку партнёра целиком
   (DATA.partner()), и экран её НЕ правит: правки заказчика живут отдельным
   слоем в Store, в одном слоте vrach:profile, а DATA.partner() накладывает
   его поверх демо-карточки. Поэтому перезагрузка правки не теряет, а
   «Сбросить прототип» возвращает демо-данные. Тем же слоем ходят и тумблеры
   уведомлений: они такие же поля карточки, и второго слота им не нужно.

   Пароль в слой НЕ пишется — ни в каком виде. В прототипе нет ни входа по
   паролю, ни места, где его проверяют; хранить набранное значило бы класть
   пароль в localStorage без всякой на то нужды. Остаётся отметка времени:
   заказчику нужно увидеть, что смена прошла и пережила перезагрузку.

   Пустого состояния у экрана нет намеренно: карточка заполнена в обоих
   сценариях — у нового партнёра просто нет направлений, а не карточки.

   Состояния — по таблице спецификации, экран 6: обычное и смена пароля.
   Данные только через DATA, повторяющиеся блоки — через Render.
   Утверждения по таблице состояний — tools/test-vrach-profil.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* Слой правок поверх шва. Имя слота объявлено один раз: склеенное на месте
     имя пишет туда, откуда никто не читает. */
  var SLOT = 'vrach:profile';

  /* Поля карточки. required — то, без чего клиника не ведёт партнёрство:
     по ним же собирается сообщение под полем. Место работы необязательно —
     у частного кабинета его может не быть отдельной строкой. */
  var FIELDS = [
    { id: 'name',      label: 'ФИО',                 type: 'text',  required: true,  wide: true },
    { id: 'specialty', label: 'Специальность',       type: 'text',  required: true },
    { id: 'city',      label: 'Город',               type: 'text',  required: true },
    { id: 'workplace', label: 'Место работы',        type: 'text',  required: false, wide: true },
    { id: 'phone',     label: 'Телефон',             type: 'tel',   required: true },
    { id: 'email',     label: 'Электронная почта',   type: 'email', required: true }
  ];

  /* Два письма из спецификации, экран 6. Подписи собирает экран: шов отдаёт
     только признаки включённости. */
  var NOTIFY = [
    { id: 'notifyStatus', title: 'Письмо при смене статуса моего пациента',
      sub: 'Записан, дошёл, услуга оказана — по каждому направлению' },
    { id: 'notifyBonus',  title: 'Письмо при начислении',
      sub: 'Когда клиника закрывает направление начислением' }
  ];

  var NOT_SET = 'не указано';

  var mode = 'view';           /* view | edit */
  var passErr = {};            /* id поля → сообщение под ним */
  var passDone = false;        /* смена прошла в этом заходе: показать отметку */

  /* --- слой правок ------------------------------------------------------- */

  function partner() { return w.DATA.partner(); }

  /** Дописать поля в слой, не затирая соседние: тумблеры и отметка о пароле
      живут в том же слоте, и полная перезапись сносила бы их при сохранении
      контактов. */
  function patch(changes) {
    var cur = w.Store.value(SLOT) || {};
    var next = {}, k;
    for (k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) { next[k] = cur[k]; } }
    for (k in changes) { if (Object.prototype.hasOwnProperty.call(changes, k)) { next[k] = changes[k]; } }
    w.Store.setValue(SLOT, next);
  }

  function savedAt() { var p = partner(); return p.savedAt || null; }
  function passwordAt() { var p = partner(); return p.passwordAt || null; }

  function whenSaved(iso) { return 'Сохранено ' + fmt.relative(iso) + ' в ' + fmt.time(iso); }

  /* --- карточка партнёра в показе -----------------------------------------
     Зоны неравной ширины: имя, связь, партнёрство с действием. Ширины даёт
     класс композиции .vp-card, приём их не назначает. */

  /** Значение поля карточки. data-field держит связь со швом наблюдаемой:
      утверждение сверяет значение поштучно, а не ищет строку по всей
      странице, где её мог бы дать соседний блок. */
  function value(id, v, cls) {
    return '<span class="vp-field' + (cls ? ' ' + cls : '') + '" data-field="' + esc(id) + '">' +
      (v ? w.Render.soft(v) : '<span class="muted">' + esc(NOT_SET) + '</span>') + '</span>';
  }

  function meta(iconName, f, v) {
    return '<div class="vp-meta">' + ic(iconName) +
      '<span class="vp-meta__body">' +
        '<span class="label">' + esc(f.label) + '</span>' +
        value(f.id, v, 'vp-meta__value') +
      '</span></div>';
  }

  function field(id) {
    var found = null;
    FIELDS.forEach(function (f) { if (f.id === id) { found = f; } });
    return found;
  }

  function whoZone(p) {
    /* Имя — крупный якорь: самое большое на карточке, по нему её и читают.
       Специальность и город стоят тихой строкой под ним — тем же приёмом и
       в том же порядке, что «ЖДЁТ ОТВЕТА / 5 дней / Заявка от 29.08» на
       модерации. Кегль якоря опускает композиция экрана: 44 пункта — размер
       числа, а не русского ФИО в зону шириной в треть рабочей области.

       Плашка доступа стоит только тогда, когда шов подтвердил партнёрство:
       выдумывать состояние доступа за клинику нельзя. */
    var sub = [p.specialty, p.city].filter(function (x) { return !!x; }).join(' · ');
    return w.Render.anchor({
      label: 'Карточка партнёра',
      value: p.name || NOT_SET,
      note: sub
    }) + (p.status === 'confirmed'
      ? '<span class="badge badge--ok vp-card__badge">Доступ открыт</span>' : '');
  }

  function linkZone(p) {
    return meta('building', field('workplace'), p.workplace) +
      meta('phone', field('phone'), p.phone) +
      meta('mail', field('email'), p.email);
  }

  /** Правая зона: якорь «партнёр с» и действие под ним. Отметка о сохранении
      стоит здесь же — рядом с кнопкой, которая её и поставила. */
  function sideZone(p) {
    var stamp = savedAt();
    /* Дата партнёрства стоит той же строкой «значок — подпись — значение»,
       что и связь: крупным якорем она перекричала бы имя врача, а карточку
       читают с имени. Так же её ставит и рисунок. */
    return '<div class="vp-meta">' + ic('calendar-check') +
        '<span class="vp-meta__body">' +
          '<span class="label">Партнёр с</span>' +
          '<span class="vp-meta__value">' +
            esc(p.confirmedAt ? fmt.exact(p.confirmedAt) : NOT_SET) + '</span>' +
          (p.confirmedAt
            ? '<span class="vp-meta__note muted">Заявку подтвердил администратор клиники</span>'
            : '') +
        '</span></div>' +
      '<button class="btn btn--secondary btn--block vp-card__act" type="button" data-act="edit">' +
        ic('pencil') + 'Изменить</button>' +
      (stamp ? '<p class="vp-saved text-accent">' + ic('check') + esc(whenSaved(stamp)) + '</p>' : '');
  }

  function cardView(p) {
    return w.Render.zoneCard({ cls: 'vp-card', zones: [
      { cls: 'vp-card__who', body: whoZone(p) },
      { cls: 'vp-card__link', body: linkZone(p) },
      { cls: 'vp-card__side', body: sideZone(p) }
    ] });
  }

  /* --- карточка партнёра в правке ----------------------------------------
     Поля в две колонки внутри той же коробки. Долевые, а не фиксированные:
     в фиксированных длинное место работы съедало соседнюю колонку на
     ноутбучной ширине. */

  function editRow(f, v) {
    return '<label class="field' + (f.wide ? ' vp-grid--wide' : '') + '">' +
      '<span class="field__label label">' + esc(f.label) + '</span>' +
      '<input class="input input--sm" id="vp-f-' + esc(f.id) + '" type="' + esc(f.type) + '" ' +
        'value="' + esc(v) + '"' + (f.required ? ' aria-required="true"' : '') + '>' +
      (f.required ? '' : '<span class="field__hint">Можно не указывать</span>') +
      '<span class="field__error" id="vp-e-' + esc(f.id) + '" hidden>' +
        esc(f.label) + ' — без этого поля клиника не ведёт партнёрство</span>' +
    '</label>';
  }

  function cardEdit(p) {
    return '<div class="card vp-edit">' +
      '<div class="vp-edit__head"><p class="label">Карточка партнёра</p>' +
        '<p class="muted">Клиника увидит изменения сразу после сохранения</p></div>' +
      '<div class="vp-grid">' +
        FIELDS.map(function (f) { return editRow(f, p[f.id] || ''); }).join('') +
      '</div>' +
      '<div class="vp-edit__act">' +
        '<button class="btn btn--primary" id="vp-save" data-act="save">Сохранить</button>' +
        '<button class="btn btn--secondary" data-act="edit-cancel">Отмена</button>' +
      '</div>' +
    '</div>';
  }

  /* --- смена пароля ------------------------------------------------------
     Три поля из таблицы состояний: текущий, новый, повтор. Требований к
     самому паролю — длине, составу — клиника не давала, и выдумывать их
     здесь нельзя: это её правило, а не наше. Стоит заглушкой. */

  var PASS = [
    { id: 'cur',    label: 'Текущий пароль' },
    { id: 'new',    label: 'Новый пароль' },
    { id: 'repeat', label: 'Повтор нового пароля' }
  ];

  function passField(f) {
    var err = passErr[f.id] || '';
    return '<label class="field">' +
      '<span class="field__label label">' + esc(f.label) + '</span>' +
      '<input class="input input--sm' + (err ? ' input--error' : '') + '" ' +
        'id="vp-p-' + esc(f.id) + '" type="password" autocomplete="off">' +
      '<span class="field__error" id="vp-pe-' + esc(f.id) + '"' + (err ? '' : ' hidden') + '>' +
        esc(err) + '</span>' +
    '</label>';
  }

  function passBlock() {
    var stamp = passwordAt();
    var mark = passDone
      ? '<span class="vp-saved text-accent" id="vp-pass-mark">' + ic('check') + 'Пароль изменён</span>'
      : (stamp ? '<span class="muted" id="vp-pass-mark">Последняя смена ' + esc(fmt.exact(stamp)) + '</span>' : '');
    /* Сообщение о несовпадении стоит под своим полем, а не общей строкой
       сверху: заказчик должен видеть, какое из полей спорит с каким. */
    return section({
      title: 'Смена пароля',
      body: '<div class="card vp-pass">' +
        '<div class="vp-pass__grid">' + PASS.map(passField).join('') + '</div>' +
        '<div class="vp-pass__act">' +
          '<button class="btn btn--secondary" data-act="pass-save">' + ic('lock') + 'Сменить пароль</button>' +
          mark +
        '</div>' +
        w.Render.hintBar({
          icon: 'warn', cls: 'vp-rule',
          text: 'Требования к паролю устанавливает клиника — [уточняется]'
        }) +
      '</div>'
    });
  }

  /* --- уведомления -------------------------------------------------------
     Тумблер — тот же общий .switch, что в профиле пациента. Подпись рядом
     текстовая, поэтому самому переключателю нужно своё имя: без него он
     читается вспомогательными средствами как «переключатель». */

  function switchCell(on, id, label) {
    return '<div class="vp-sw-wrap">' +
      '<button class="switch" type="button" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" ' +
        'aria-label="' + esc(label) + '" data-act="notify" data-id="' + esc(id) + '">' +
        '<span class="switch__knob"></span>' +
      '</button>' +
      '<span class="switch__label">' + (on ? 'Включено' : 'Выключено') + '</span>' +
    '</div>';
  }

  function notifyBlock() {
    var p = partner();
    var rows = NOTIFY.map(function (n) {
      return '<div class="vp-notify">' +
        '<div class="vp-notify__body">' +
          '<p class="strong">' + esc(n.title) + '</p>' +
          '<p class="muted vp-notify__sub">' + esc(n.sub) + '</p>' +
        '</div>' +
        switchCell(!!p[n.id], n.id, n.title) +
      '</div>';
    }).join('');
    /* Адрес идёт разметкой ради места переноса после «@»: на 360 px строке
       оговорки остаётся 178 px, а адресу нужно 180, и он разрезался посреди
       имени. Остальной текст экранируется здесь же. */
    var where = p.email
      ? esc('Письма приходят на ') + w.Render.soft(p.email)
      : esc('Почта не указана — письмам некуда приходить');
    return section({
      title: 'Уведомления',
      body: '<div class="card vp-letters">' + rows +
        '<div class="vp-where">' +
          w.Render.hintBar({ icon: 'mail', html: where }) +
        '</div>' +
      '</div>'
    });
  }

  /* --- сборка ------------------------------------------------------------
     Карточка стоит сразу под заголовком экрана и своей ступени не просит:
     заголовок у неё — сам «Профиль». Дальше две секции с линейкой — то же
     построение, что у соседних экранов кабинета. */

  function render() {
    var p = partner();
    document.getElementById('page').innerHTML =
      '<h1 class="h1 page__title">Профиль</h1>' +
      (mode === 'edit' ? cardEdit(p) : cardView(p)) +
      passBlock() + notifyBlock();
    if (mode === 'edit') { wireEdit(); }
    /* Экран перерисовывается без перезагрузки, а замер прибора снимается один
       раз при монтировании: без пересчёта переполнение в новой разметке
       осталось бы незамеченным. */
    if (w.Shell.measure) { w.Shell.measure(); }
  }

  /* --- правка данных ------------------------------------------------------ */

  function input(id) { return document.getElementById('vp-f-' + id); }

  /** Пустое обязательное поле: сообщение под полем и «Сохранить» недоступна.
      Считается на каждом вводе, а не только по нажатию: заказчик должен
      видеть, почему кнопка погасла. */
  function validate() {
    var ok = true;
    FIELDS.forEach(function (f) {
      if (!f.required) { return; }
      var el = input(f.id), err = document.getElementById('vp-e-' + f.id);
      if (!el || !err) { return; }
      var empty = !String(el.value).trim();
      el.classList.toggle('input--error', empty);
      err.hidden = !empty;
      if (empty) { ok = false; }
    });
    var save = document.getElementById('vp-save');
    if (save) { save.disabled = !ok; }
    return ok;
  }

  function wireEdit() {
    FIELDS.forEach(function (f) {
      var el = input(f.id);
      if (el) { el.addEventListener('input', validate); }
    });
    validate();
  }

  function saveFields() {
    if (!validate()) {
      var first = null;
      FIELDS.forEach(function (f) {
        var el = input(f.id);
        if (!first && f.required && el && !String(el.value).trim()) { first = el; }
      });
      if (first) { first.focus(); }
      return;
    }
    var changes = {};
    FIELDS.forEach(function (f) {
      var el = input(f.id);
      if (el) { changes[f.id] = String(el.value).trim(); }
    });
    changes.savedAt = new Date().toISOString();
    patch(changes);
    mode = 'view';
    passDone = false;
    render();
  }

  /* --- смена пароля ------------------------------------------------------- */

  function passValue(id) {
    var el = document.getElementById('vp-p-' + id);
    return el ? String(el.value) : '';
  }

  /** Показать сообщения там, где они уже стоят, не пересобирая форму.
      Пересборка стирает набранное: три поля пароля вводят подряд, и потерять
      их из-за описки в одном — та же промашка, от которой бережёт форма
      направления («ошибка поля не стирает остальные поля»). */
  function showPassErrors() {
    var first = null;
    PASS.forEach(function (f) {
      var el = document.getElementById('vp-p-' + f.id);
      var box = document.getElementById('vp-pe-' + f.id);
      var msg = passErr[f.id] || '';
      if (el) { el.classList.toggle('input--error', !!msg); }
      if (box) { box.textContent = msg; box.hidden = !msg; }
      if (!first && msg && el) { first = el; }
    });
    if (first) { first.focus(); }
  }

  /** Проверка формы смены пароля. Несовпадение повтора — сообщение под самим
      повтором: оно про пару полей, и стоять обязано у второго из них. */
  function savePassword() {
    passErr = {};
    var cur = passValue('cur'), next = passValue('new'), again = passValue('repeat');
    if (!cur) { passErr.cur = 'Введите текущий пароль'; }
    if (!next) { passErr['new'] = 'Введите новый пароль'; }
    if (!again) {
      passErr.repeat = 'Повторите новый пароль';
    } else if (next && again !== next) {
      passErr.repeat = 'Новый пароль и повтор не совпадают';
    }
    var bad = false, k;
    for (k in passErr) { if (Object.prototype.hasOwnProperty.call(passErr, k)) { bad = true; } }
    if (bad) {
      /* Отметку о прошлой удачной смене гасим на месте, а не перерисовкой:
         перерисовка стёрла бы то, что уже набрано в двух других полях. */
      if (passDone) {
        passDone = false;
        var done = document.getElementById('vp-pass-mark');
        if (done) { done.hidden = true; }
      }
      showPassErrors();
      return;
    }
    /* Само значение никуда не пишется — см. шапку файла. В слой уходит
       только время: заказчик видит, что смена прошла и пережила перезагрузку. */
    patch({ passwordAt: new Date().toISOString() });
    passDone = true;
    render();
  }

  /* --- действия экрана ---------------------------------------------------- */

  function init() {
    /* Каркас увёл экран на главную чужой роли — рисовать уже нечего. */
    if (!w.Shell.mount({ active: 'vrach-profil', role: 'vrach' })) { return; }

    w.Shell.on('edit', function () { mode = 'edit'; passErr = {}; render(); });
    w.Shell.on('edit-cancel', function () { mode = 'view'; render(); });
    w.Shell.on('save', function () { saveFields(); });
    w.Shell.on('pass-save', function () { savePassword(); });
    w.Shell.on('notify', function (t) {
      var id = t.getAttribute('data-id'), p = partner(), changes = {};
      changes[id] = !p[id];
      patch(changes);
      render();
    });

    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
