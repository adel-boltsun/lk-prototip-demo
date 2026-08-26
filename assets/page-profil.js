/* Экран 9 «Профиль и мои люди».
   Свои данные, те, кого пациент записывает, согласия, уведомления и выход.
   Состояния — по таблице спецификации: обязательное поле пустое · данные
   сохранены · людей нет · смена человека.

   Что здесь важно понимать про данные. Шов отдаёт карточку пациента целиком
   (DATA.patient()), и экран её НЕ правит: правки заказчика живут отдельным
   слоем в Store под ключами profile:<человек>:<поле>, consent:<человек>:<id>,
   notify:<канал> и people:<человек>:added. Экран рисует копию, собранную из шва плюс
   этого слоя, — тем же способом, каким «Мои визиты» показывают отменённую
   запись. «Сбросить прототип» снимает слой и возвращает демо-данные.

   Подписи собирает экран: шов отдаёт поля (given, date, kind, when, isSelf),
   а «Дано 12 марта 2024», «Это вы» и «СМС» складываются здесь.
   Утверждения по таблице состояний — tools/test-profil.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* Поля карточки пациента. required — то, без чего клиника не оформит
     документы: по ним же собирается подсказка под полем. Почты может не быть
     вовсе (у мамы в демо-данных её нет), поэтому обязательной она не бывает. */
  var FIELDS = [
    { id: 'name',      label: 'ФИО',           type: 'text',  required: true },
    { id: 'birthDate', label: 'Дата рождения', type: 'date',  required: true },
    { id: 'phone',     label: 'Телефон',       type: 'tel',   required: true },
    { id: 'email',     label: 'Почта',         type: 'email', required: false },
    { id: 'address',   label: 'Адрес',         type: 'text',  required: false }
  ];

  /* Подписи каналов и правил собирает экран: шов отдаёт id, kind и when. */
  var CHANNEL = {
    sms:   { title: 'СМС', field: 'phone', empty: 'Телефон не указан' },
    email: { title: 'Электронная почта', field: 'email', empty: 'Почта не указана' }
  };
  var RULE_ICON = { visit: 'calendar-check', status: 'clock', document: 'file' };

  /* Согласие на обработку персональных данных снять нельзя: без него кабинет
     не работает. Признака обязательности шов не отдаёт — опознаём по id. */
  var LOCKED_CONSENT = 'c-pd';
  /* Одно обещание — две разные вещи, и это сказано на экране обеими сторонами.
     Согласие на напоминания решает, писать ли вообще; каналы ниже — куда писать.
     Пока согласие снято, каналы гаснут и подписаны «Пока не придёт»: настроить
     их можно заранее, но молчат они по согласию, а не сами по себе. */
  var REMIND_CONSENT = 'c-remind';

  var mode = 'view';           /* view | edit */
  var addedSeq = 0;

  /* --- слой правок поверх шва -------------------------------------------- */

  function who() { return w.Store.person(); }
  function fieldKey(id) { return 'profile:' + who() + ':' + id; }
  /* Слой правок скоупится по человеку одним правилом — добавленные люди тоже:
     тех, кого записывает Мария, не должно быть видно из кабинета Артёма. */
  function addedKey() { return 'people:' + who() + ':added'; }

  /** Значения полей: что отдал шов, поверх — что поправил заказчик. */
  function values() {
    var p = w.DATA.patient(), out = {};
    FIELDS.forEach(function (f) {
      var saved = w.Store.value(fieldKey(f.id));
      var base = p[f.id];
      out[f.id] = saved !== null ? saved : (base === null || base === undefined ? '' : base);
    });
    return out;
  }

  function savedAt() { return w.Store.value('profile:' + who() + ':savedAt'); }

  /** Согласия: given и date из шва, поверх — переключённое заказчиком. */
  function consents() {
    return w.DATA.patient().consents.map(function (c) {
      var own = w.Store.value('consent:' + who() + ':' + c.id);
      return own
        ? { id: c.id, title: c.title, given: !!own.given, date: own.at, own: true }
        : { id: c.id, title: c.title, given: c.given, date: c.date, own: false };
    });
  }

  /** Согласие на напоминания или null, если его нет в карте вовсе. */
  function reminderConsent() {
    var found = null;
    consents().forEach(function (c) { if (c.id === REMIND_CONSENT) { found = c; } });
    return found;
  }

  function channels() {
    return w.DATA.notifications().channels.map(function (c) {
      var own = w.Store.value('notify:' + c.id);
      return { id: c.id, enabled: own === null ? c.enabled : !!own };
    });
  }

  /** Мои люди — все, кроме того, чей кабинет открыт сейчас, плюс добавленные
      в прототипе. Себя в списке нет: свой кабинет уже открыт. */
  function people() {
    var current = who();
    var list = w.DATA.people().filter(function (p) { return p.id !== current; })
      .map(function (p) {
        return { id: p.id, name: p.name, birthDate: p.birthDate,
          relation: p.relation, isSelf: p.isSelf, pending: false };
      });
    (w.Store.value(addedKey()) || []).forEach(function (p) {
      list.push({ id: p.id, name: p.name, birthDate: p.birthDate,
        relation: p.relation, isSelf: false, pending: true });
    });
    return list;
  }

  /* --- подписи ------------------------------------------------------------ */

  function dateYear(iso) { return fmt.date(iso) + ' ' + new Date(iso).getFullYear(); }

  function whenSaved(iso) { return 'Сохранено ' + fmt.relative(iso) + ' в ' + fmt.time(iso); }

  var initials = w.Render.initials;   /* плитка инициалов считается одним правилом */

  /** «7 лет · сын», «40 лет · Это вы». Родство шов отдаёт словом с прописной,
      на карточке оно идёт после точки — поэтому строчными. */
  function personSub(p) {
    var age = fmt.years(fmt.age(p.birthDate));
    var tail = p.isSelf ? 'Это вы' : (p.relation ? String(p.relation).toLowerCase() : '');
    return tail ? age + ' · ' + tail : age;
  }

  /** Паспорт и полис показываем скрытыми: цифры заменены звёздочками,
      форма номера остаётся узнаваемой. */
  function mask(s) { return String(s).replace(/\d/g, '*'); }

  /* --- шапка экрана ------------------------------------------------------- */

  function head() {
    var stamp = savedAt();
    var acts = mode === 'edit'
      ? '<div class="pr-head__row">' +
          '<button class="btn btn--primary" id="pr-save" data-act="save">Сохранить</button>' +
          '<button class="btn btn--secondary" data-act="edit-cancel">Отмена</button>' +
        '</div>' +
        '<p class="muted pr-head__note">Клиника увидит изменения сразу после сохранения</p>'
      : '<div class="pr-head__row">' +
          '<button class="btn btn--secondary" data-act="edit">' + ic('pencil') + 'Изменить</button>' +
        '</div>' +
        '<p class="muted pr-head__note">Поля станут редактируемыми</p>' +
        (stamp ? '<p class="pr-saved text-accent">' + ic('check') + esc(whenSaved(stamp)) + '</p>' : '');
    return '<div class="pr-head">' +
      '<h1 class="h1">Профиль</h1>' +
      '<div class="pr-head__acts">' + acts + '</div>' +
    '</div>';
  }

  /* --- мои данные --------------------------------------------------------- */

  function fieldRow(f, v) {
    if (mode === 'edit') {
      return '<div class="pr-field">' +
        '<label class="pr-field__label" for="pr-f-' + esc(f.id) + '">' + esc(f.label) + '</label>' +
        '<div class="pr-field__value">' +
          '<input class="input input--sm" id="pr-f-' + esc(f.id) + '" type="' + esc(f.type) + '" ' +
            'value="' + esc(v) + '"' + (f.required ? ' aria-required="true"' : '') + '>' +
          (f.required ? '' : '<span class="field__hint">Можно не указывать</span>') +
          '<span class="field__error" id="pr-e-' + esc(f.id) + '" hidden>' +
            esc(f.label) + ' — без этого поля клиника не оформит документы</span>' +
        '</div>' +
      '</div>';
    }
    return '<div class="pr-field">' +
      '<span class="pr-field__label">' + esc(f.label) + '</span>' +
      '<span class="pr-field__value pr-field__value--text">' +
        (v ? esc(f.id === 'birthDate' ? dateYear(v) + ' · ' + fmt.years(fmt.age(v)) : v)
           : '<span class="muted">не указано</span>') +
      '</span>' +
    '</div>';
  }

  function docsBlock() {
    var p = w.DATA.patient();
    return '<div class="pr-docs">' +
      '<p class="label">Паспорт и полис</p>' +
      '<div class="pr-docs__item">' +
        '<p class="muted">Паспорт</p>' +
        (p.passport
          ? '<p class="pr-docs__num">' + esc(mask(p.passport.series + ' ' + p.passport.number)) + '</p>'
          : '<p class="muted">В карте не заведён</p>') +
      '</div>' +
      '<div class="pr-docs__item">' +
        '<p class="muted">Полис</p>' +
        (p.policy
          ? '<p class="pr-docs__num">' + esc(mask(p.policy.number)) + '</p>' +
            '<p class="muted">' + esc(p.policy.company) + '</p>'
          : '<p class="muted">В карте не заведён</p>') +
      '</div>' +
      '<div class="notice notice--soft pr-docs__note">' + ic('lock') +
        '<span>Нужны для оформления документов: договора, справок и налогового вычета. ' +
        'Показываем скрытыми.</span></div>' +
    '</div>';
  }

  function meBlock() {
    var v = values();
    return section({
      title: 'Мои данные',
      aside: 'Так вас видит клиника',
      body: '<div class="card pr-me">' +
        '<div class="pr-fields">' + FIELDS.map(function (f) { return fieldRow(f, v[f.id]); }).join('') + '</div>' +
        docsBlock() +
      '</div>'
    });
  }

  /* --- мои люди ----------------------------------------------------------- */

  function personCard(p) {
    var acts = p.pending
      ? '<span class="muted pr-person__wait">Кабинет откроется после подтверждения клиникой</span>' +
        '<button class="btn btn--quiet" data-act="person-drop" data-id="' + esc(p.id) + '">Убрать</button>'
      : '<button class="btn btn--quiet" data-act="person" data-id="' + esc(p.id) + '">' +
          'Открыть кабинет' + ic('arrow-right') + '</button>' +
        '<button class="btn btn--quiet" data-soon="Изменение данных человека">' +
          ic('pencil') + 'Изменить</button>';
    return '<article class="card pr-person" data-person="' + esc(p.id) + '">' +
      '<div class="pr-person__top">' +
        '<span class="pr-face" aria-hidden="true">' + esc(initials(p.name)) + '</span>' +
        '<div class="pr-person__id">' +
          '<p class="row__title">' + esc(p.name) + '</p>' +
          '<p class="muted">' + esc(personSub(p)) + '</p>' +
        '</div>' +
      '</div>' +
      (p.pending ? '<p class="pr-person__badge"><span class="badge badge--draft">Ждёт подтверждения</span></p>' : '') +
      '<div class="pr-person__acts">' + acts + '</div>' +
    '</article>';
  }

  function addCard() {
    return '<article class="card pr-person pr-add">' +
      '<div class="pr-person__top">' +
        '<span class="pr-add__mark" aria-hidden="true">' + ic('plus', 'ic--lg') + '</span>' +
        '<div class="pr-person__id">' +
          '<p class="row__title">Добавить человека</p>' +
          '<p class="muted">Ребёнка, родителя или того, кого вы сопровождаете</p>' +
        '</div>' +
      '</div>' +
      '<div class="pr-person__acts">' +
        '<button class="btn btn--quiet" data-act="add-person">Заполнить данные' + ic('arrow-right') + '</button>' +
      '</div>' +
      '<p class="muted pr-add__note">' + ic('user') +
        '<span>Понадобятся телефон и дата рождения</span></p>' +
    '</article>';
  }

  function peopleBlock() {
    var list = people();
    if (!list.length) {
      return section({
        title: 'Мои люди',
        aside: 'Те, за кого вы записываетесь',
        body: '<div class="card">' + w.Render.emptyState({
          icon: 'user',
          title: 'Добавьте того, кого записываете к врачу',
          text: 'Ребёнка, родителя или того, кого вы сопровождаете: его записи, документы и счета будут открываться из этого же кабинета.',
          action: { act: 'add-person', text: 'Добавить человека' }
        }) + '</div>'
      });
    }
    return section({
      title: 'Мои люди',
      aside: 'Те, за кого вы записываетесь',
      body: '<div class="pr-people">' + list.map(personCard).join('') + addCard() + '</div>' +
        '<div class="notice notice--soft pr-switch-note">' + ic('user') +
        '<span>Отсюда переключается, чей кабинет открыт. Выбранный человек показан в шапке — ' +
        'записи, документы и счета будут его.</span></div>'
    });
  }

  /* --- согласия и уведомления --------------------------------------------- */

  /** Тумблер. Заблокированный рисуется не кнопкой, а строкой: нажимать нечего,
      и прожимка не ищет у него следствия. Подпись рядом — текстовая, поэтому
      самому переключателю нужно своё имя, иначе он читается как «переключатель». */
  function switchCell(on, act, id, locked, label, muted) {
    var knob = '<span class="switch__knob"></span>';
    var name = ' aria-label="' + esc(label) + '"';
    var cls = 'switch' + (muted ? ' switch--muted' : '');
    var control = locked
      ? '<span class="' + cls + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-disabled="true"' +
        name + '>' + knob + '</span>'
      : '<button class="' + cls + '" type="button" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"' +
        name + ' data-act="' + esc(act) + '" data-id="' + esc(id) + '">' + knob + '</button>';
    /* Канал, запертый снятым согласием, гасится и подписью: зелёный тумблер
       рядом с «ничего не приходит» спорит сам с собой. */
    return '<div class="pr-sw-wrap">' + control +
      '<span class="switch__label">' + (muted ? 'Пока не придёт' : (on ? 'Включено' : 'Выключено')) +
      '</span></div>';
  }

  function consentsBlock() {
    var rows = consents().map(function (c) {
      var locked = c.id === LOCKED_CONSENT;
      var when = c.given
        ? (c.own ? 'Включено ' + fmt.relative(c.date) + ' в ' + fmt.time(c.date)
                 : (locked ? 'Дано ' : 'Включено ') + dateYear(c.date))
        : (c.own ? 'Выключено ' + fmt.relative(c.date) + ' в ' + fmt.time(c.date) : 'Выключено');
      return '<div class="pr-consent" data-consent="' + esc(c.id) + '">' +
        '<div class="pr-consent__body">' +
          '<p class="row__title">' + esc(c.title) + '</p>' +
          '<p class="muted pr-consent__when">' + esc(when) + '</p>' +
          (locked ? '<p class="pr-consent__note strong">' + ic('lock', 'ic--sm') +
            '<span>Без этого согласия кабинет не работает: без него нельзя записаться ' +
            'и хранить документы.</span></p>' : '') +
          (c.id === REMIND_CONSENT ? '<p class="pr-consent__note muted">' + ic('arrow-right', 'ic--sm') +
            '<span>' + (c.given
              ? 'Куда приходят напоминания — в разделе «Уведомления» ниже.'
              : 'Пока согласие снято, каналы в разделе «Уведомления» не работают.') +
            '</span></p>' : '') +
        '</div>' +
        switchCell(c.given, 'consent', c.id, locked, c.title) +
      '</div>';
    }).join('');
    return section({
      title: 'Согласия',
      aside: 'Меняются сразу, без обращения в клинику',
      body: '<div class="card">' + rows + '</div>'
    });
  }

  function notificationsBlock() {
    var v = values();
    var list = channels();
    var consent = reminderConsent();
    /* Согласие снято — каналы гаснут: пока его не вернут, ничего не придёт. */
    var off = !!consent && !consent.given;
    var chans = list.map(function (c) {
      var meta = CHANNEL[c.id] || { title: c.id, field: null, empty: '' };
      var addr = meta.field && v[meta.field] ? v[meta.field] : meta.empty;
      return '<div class="pr-consent" data-channel="' + esc(c.id) + '">' +
        '<div class="pr-consent__body">' +
          '<p class="row__title">' + esc(meta.title) + '</p>' +
          '<p class="muted">' + esc(addr) + '</p>' +
        '</div>' +
        switchCell(c.enabled, 'notify', c.id, false, meta.title, off) +
      '</div>';
    }).join('');
    var on = list.filter(function (c) { return c.enabled; })
      .map(function (c) { return (CHANNEL[c.id] || {}).title || c.id; });
    var rules = w.DATA.notifications().rules.map(function (r) {
      return '<li class="row row--compact">' + ic(RULE_ICON[r.kind] || 'message') +
        '<span class="row__body"><span class="strong">' + esc(r.title) + '</span>' +
        ' <span class="muted">— ' + esc(r.when) + '</span></span></li>';
    }).join('');
    /* Плашка — текст, а не кнопка: кнопка здесь исчезала от щелчка по тумблеру
       согласия выше, и прожимка справедливо ловила ненажатую кнопку. */
    var lock = off
      ? '<div class="notice notice--accent pr-off">' + ic('lock') +
        '<div><p class="strong">Напоминания выключены в согласиях</p>' +
        '<p class="muted">Пока согласие «Напоминания о визитах» снято, ни СМС, ни письма ' +
        'не приходят. Каналы ниже можно настроить заранее — они заработают вместе с согласием.</p>' +
        '</div></div>'
      : '';
    return section({
      title: 'Уведомления',
      aside: off ? 'Выключены в согласиях'
        : (on.length ? 'Приходят: ' + on.join(', ') : 'Все каналы выключены'),
      body: lock + '<div class="card">' + chans + '</div>' +
        '<p class="label pr-rules">О чём пишем</p>' +
        '<ul class="rows">' + rules + '</ul>'
    });
  }

  /* --- выход --------------------------------------------------------------- */

  function exitBlock() {
    return '<div class="pr-exit">' +
      '<a class="btn btn--secondary" href="vhod.html">' + ic('logout') + 'Выйти</a>' +
      '<p class="muted">Кабинет закроется на этом устройстве, данные останутся.</p>' +
    '</div>';
  }

  /* --- сборка -------------------------------------------------------------- */

  function render() {
    document.getElementById('page').innerHTML =
      head() + meBlock() + peopleBlock() + consentsBlock() + notificationsBlock() + exitBlock();
    if (mode === 'edit') { wireEdit(); }
    /* Экран перерисовывается без перезагрузки, а замер прибора снимается один
       раз при монтировании: без пересчёта переполнение в новой разметке
       осталось бы незамеченным. */
    if (w.Shell.measure) { w.Shell.measure(); }
  }

  /* --- правка данных -------------------------------------------------------- */

  function input(id) { return document.getElementById('pr-f-' + id); }

  /** Пустое обязательное поле: подсказка под полем и «Сохранить» недоступна.
      Считается на каждом вводе, а не только по нажатию: заказчик должен
      видеть, почему кнопка погасла. */
  function validate() {
    var ok = true;
    FIELDS.forEach(function (f) {
      if (!f.required) { return; }
      var el = input(f.id), err = document.getElementById('pr-e-' + f.id);
      if (!el || !err) { return; }
      var empty = !String(el.value).trim();
      el.classList.toggle('input--error', empty);
      err.hidden = !empty;
      if (empty) { ok = false; }
    });
    var save = document.getElementById('pr-save');
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
    FIELDS.forEach(function (f) {
      var el = input(f.id);
      if (el) { w.Store.setValue(fieldKey(f.id), String(el.value).trim()); }
    });
    w.Store.setValue('profile:' + who() + ':savedAt', new Date().toISOString());
    mode = 'view';
    render();
  }

  /* --- добавление человека --------------------------------------------------
     В рабочей версии человека подтверждает администратор клиники — до этого
     кабинет за него не открывается (тот же порядок, что при первом входе).
     В прототипе добавленный так и показан: карточка с меткой «ждёт
     подтверждения», убрать её можно тут же. */

  var addModal = null;

  function addField(id, label, type, hint) {
    return '<label class="field"><span class="field__label label">' + esc(label) + '</span>' +
      '<input class="input input--sm" id="np-' + esc(id) + '" type="' + esc(type) + '">' +
      (hint ? '<span class="field__hint">' + esc(hint) + '</span>' : '') + '</label>';
  }

  function addDialog() {
    addModal = w.Render.modal({
      title: 'Добавить человека',
      text: 'Того, кого вы записываете к врачу: ребёнка, родителя или того, кого сопровождаете.',
      html: addField('name', 'Имя и фамилия', 'text', '') +
        addField('birth', 'Дата рождения', 'date', '') +
        addField('phone', 'Телефон', 'tel', 'Нужен клинике для напоминаний о визите') +
        addField('rel', 'Кем приходится', 'text', 'Сын, дочь, мама, отец, супруг') +
        '<p class="field__error" id="np-err" hidden></p>',
      foot: '<button class="btn btn--primary" data-act="person-save">Добавить</button>' +
        '<button class="btn btn--secondary" data-act="modal-close">Отмена</button>',
      onClose: function () { addModal = null; }
    });
  }

  function addSave() {
    var m = addModal;
    if (!m) { return; }
    function val(id) { var el = m.querySelector('#np-' + id); return el ? String(el.value).trim() : ''; }
    var need = [['name', 'имя и фамилию'], ['birth', 'дату рождения'],
      ['phone', 'телефон'], ['rel', 'кем приходится']];
    var missing = [];
    need.forEach(function (pair) {
      var el = m.querySelector('#np-' + pair[0]);
      var empty = !val(pair[0]);
      if (el) { el.classList.toggle('input--error', empty); }
      if (empty) { missing.push(pair[1]); }
    });
    var err = m.querySelector('#np-err');
    if (missing.length) {
      if (err) {
        err.textContent = 'Заполните ' + missing.join(', ') + ' — без этого клиника не заведёт карту.';
        err.hidden = false;
      }
      return;
    }
    addedSeq++;
    var list = w.Store.value(addedKey()) || [];
    list.push({ id: 'added-' + Date.now() + '-' + addedSeq, name: val('name'),
      birthDate: val('birth'), relation: val('rel'), phone: val('phone') });
    w.Store.setValue(addedKey(), list);
    m.close();
    addModal = null;
    render();
  }

  function dropPerson(id) {
    var list = (w.Store.value(addedKey()) || []).filter(function (p) { return p.id !== id; });
    w.Store.setValue(addedKey(), list.length ? list : null);
    render();
  }

  /* --- действия экрана ------------------------------------------------------ */

  function init() {
    w.Shell.mount({ active: 'profil' });

    w.Shell.on('edit', function () { mode = 'edit'; render(); });
    w.Shell.on('edit-cancel', function () { mode = 'view'; render(); });
    w.Shell.on('save', function () { saveFields(); });
    w.Shell.on('consent', function (t) {
      var id = t.getAttribute('data-id'), now = null;
      if (id === LOCKED_CONSENT) { return; }
      consents().forEach(function (c) { if (c.id === id) { now = c; } });
      if (!now) { return; }
      w.Store.setValue('consent:' + who() + ':' + id, { given: !now.given, at: new Date().toISOString() });
      render();
    });
    w.Shell.on('notify', function (t) {
      var id = t.getAttribute('data-id'), now = null;
      channels().forEach(function (c) { if (c.id === id) { now = c; } });
      if (!now) { return; }
      w.Store.setValue('notify:' + id, !now.enabled);
      render();
    });
    w.Shell.on('add-person', function () { addDialog(); });
    w.Shell.on('person-save', function () { addSave(); });
    w.Shell.on('person-drop', function (t) { dropPerson(t.getAttribute('data-id')); });

    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
