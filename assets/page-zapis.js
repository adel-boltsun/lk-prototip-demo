/* Экран 4 «Запись на приём» — мастер из пяти шагов.
   Зачем пришли → врач → дата и время → для кого → подтверждение.
   Шага «Город и клиника» нет: кабинет привязан к одному филиалу (ADR 0003),
   клиника показана на подтверждении фактом, а не выбором. В рисунках шагов
   шесть — они старше решения; нумерация здесь по пяти.

   Черновик живёт в Store.draft() и переживает уход со страницы: прерванный
   мастер предлагает продолжить. Ничего не выбрано заранее — «Далее» неактивна,
   пока на шаге не сделан выбор, и состояние «шаг без выбора» достижимо на
   каждом шаге, а не только на первом.

   Данные только через DATA: направления, цены и окна не сочиняются. Подписи
   собирает экран — русских фраз шов не отдаёт.
   Состояния — по таблице спецификации, экран 4: tools/test-zapis.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;
  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* --- справочники экрана: подписи, а не данные ------------------------- */

  var STEPS = ['Зачем пришли', 'Врач', 'Дата и время', 'Для кого', 'Подтверждение'];
  var HEADS = ['Зачем вы записываетесь', 'К кому пойдёте', 'Когда вам удобно',
    'Кому нужен приём', 'Проверьте и подтвердите'];

  /* Направления — те же id, что в DATA.doctors({direction}). Заголовок и
     пояснение принадлежат экрану: шов отдаёт id, а не русскую фразу. */
  var DIRECTIONS = [
    { id: 'diagnostics', icon: 'eye',         title: 'Диагностика зрения', acc: 'диагностику зрения',
      text: 'Полное обследование за один визит, с заключением врача.' },
    { id: 'lasik',       icon: 'sparkle',     title: 'Лазерная коррекция', acc: 'лазерную коррекцию',
      text: 'Консультация и расчёт: подходит ли метод именно вам.' },
    { id: 'cataract',    afterExam: true, icon: 'glasses',     title: 'Катаракта', acc: 'консультацию по катаракте',
      text: 'Осмотр, замеры хрусталика и план операции.' },
    { id: 'kids',        icon: 'user',        title: 'Детский офтальмолог', acc: 'приём детского офтальмолога',
      text: 'Мягкая диагностика для детей до 17 лет.' },
    { id: 'dryeye',      afterExam: true, icon: 'drop',        title: 'Болезнь сухого глаза', acc: 'приём по болезни сухого глаза',
      text: 'Тесты слёзной плёнки и подбор терапии.' },
    { id: 'glaucoma',    afterExam: true, icon: 'stethoscope', title: 'Глаукома', acc: 'приём по глаукоме',
      text: 'Внутриглазное давление, поля зрения, наблюдение.' }
  ];
  var OTHER = { id: 'other', icon: 'message', title: 'Другое', acc: 'приём',
    text: 'Не знаете, к кому идти — опишите жалобу, и мы подберём направление и врача.' };


  /* Заглушка в формате спеки: пометка в скобках говорит, что это не факт
     клиники. Списка «что взять» у человека без визитов шов не отдаёт. */
  var BRING_SOON = 'Список подберём к визиту [уточняется]';

  var SHORT_M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var SHORT_WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var DAYS_SHOWN = 14;                 /* две недели вперёд (спека, экран 4) */
  var LOOK_AHEAD = 60;                 /* докуда искать ближайшее окно, когда окон нет */

  var view = { done: false, resumeAsked: false, offset: 0 };

  /* --- черновик ---------------------------------------------------------- */

  /** Перенос отменённой записи невозможен: пациент её уже отменил, переносить
      нечего. Между «Перенести» и концом мастера пациент успевает уйти на «Мои
      визиты» и отменить ту самую запись — черновик переживает уход и возвращает
      его в мастер с прежним moveId. Дальше мастер писал «Запись перенесена»,
      а остальные экраны показывали отменённую: старшинство отмены объявлено
      в Render.asSeen, и мастер обязан считать его так же. Правило стоит на
      входе в черновик — ниже его видят и подпись кнопки, и book(), и сводка. */
  /** Почему переносить нечего: 'cancelled' — запись отменили, 'missing' —
      её здесь больше нет. Причина возвращается вместе с ответом: экран пишет
      её пациенту, а одна из двух, выбранная наугад, — неправда в половине
      случаев. */
  function moveGoneWhy() {
    var raw = w.Store.draft() || {};
    if (!raw.moveId) { return null; }
    if (w.Render.cancelReason(raw.moveId)) { return 'cancelled'; }
    return w.Render.findAppointment(raw.moveId) ? null : 'missing';
  }
  function moveGone() {
    /* Записи, которую переносим, может не оказаться вовсе: сценарий или
       человек переключились, пока мастер был открыт. Перенос в никуда
       рапортовал «Запись перенесена №…», а визиты и главная показывали
       «Записей пока нет» — запись пропадала бесследно. Мёртвый перенос
       становится обычной записью, и она ложится в списки. Условие живёт
       одно, в moveGoneWhy: две копии разъедутся. */
    return moveGoneWhy() ? (w.Store.draft() || {}).moveId : null;
  }

  /** Есть ли такой человек в кабинете сейчас. Черновик переживает смену
      сценария, а список людей — нет: запись, оформленная на исчезнувшего
      человека, легла бы в чужой кабинет и в списках не появилась. */
  function knownPerson(id) {
    var found = false;
    w.DATA.people().forEach(function (p) { if (p.id === id) { found = true; } });
    return found;
  }

  function draft() {
    var d = w.Store.draft() || {};
    var moveId = moveGone() ? null : (d.moveId || null);
    var personId = (d.personId && knownPerson(d.personId)) ? d.personId : null;
    var step = (d.step >= 1 && d.step <= 5) ? d.step : 1;
    /* Человек отвалился — возвращаем на шаг «для кого»: иначе подтверждение
       показывает пустого пациента и оформляет запись неизвестно на кого. */
    if (!personId && step > 4) { step = 4; }
    return {
      step: step,
      direction: d.direction || null,
      doctorId: d.doctorId || null,
      date: d.date || null,
      time: d.time || null,
      personId: personId,
      consent: !!d.consent,
      moveId: moveId,
      checkupId: d.checkupId || null,
      entry: d.entry || null
    };
  }
  function patch(o) {
    var d = draft();
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { d[k] = o[k]; } }
    w.Store.setDraft(d);
    return d;
  }
  function empty(d) {
    return !d.direction && !d.doctorId && !d.date && !d.time && !d.personId;
  }

  /* --- данные ------------------------------------------------------------ */

  /** Единственный филиал кабинета: выбирать не из чего (ADR 0003). */
  function branch() { return w.DATA.branches()[0] || null; }


  /** Врачи филиала по направлению. «Другое» — весь список: направление подберут. */
  function doctors(direction) {
    var b = branch();
    var opts = { branch: b ? b.id : undefined };
    if (direction && direction !== 'other') { opts.direction = direction; }
    return w.DATA.doctors(opts);
  }
  function doctor(id) {
    var found = null;
    w.DATA.doctors({}).forEach(function (d) { if (d.id === id) { found = d; } });
    return found;
  }
  function person(id) {
    var found = null;
    w.DATA.people().forEach(function (p) { if (p.id === id) { found = p; } });
    return found;
  }

  /** Что взять с собой — из шва: берём список у записи того же человека.
      Ребёнка приводит взрослый, и список у него свой — но решает это шов,
      не мастер: у ребёнка в DATA свидетельство о рождении и паспорт родителя,
      у взрослого паспорт и полис. Когда записей у человека ещё нет вовсе
      (новый пациент), шву сказать нечего — но раздел обещан спекой и на шаге 5,
      и на «Вы записаны», и на главной, а пропавший без объяснения читается
      потерей. Своего минимума экран не придумывает — он назвал бы семилетнему
      ребёнку его паспорт, — и ставит видимую заглушку в формате спеки:
      факт плюс пометка в скобках. */
  function bringFor(personId) {
    var seen = w.Render.seenAppointments({ when: 'upcoming' })
      .concat(w.Render.seenAppointments({ when: 'past' }));
    var list = null;
    seen.forEach(function (a) {
      if (!list && a.personId === personId && a.bring && a.bring.length) { list = a.bring.slice(); }
    });
    return list || [BRING_SOON];
  }

  /** Раздел стоит всегда: со списком из шва или с заглушкой. Одна дорога на
      все три места — шаг 5, «Вы записаны» и карточка на главной: заглушка
      уезжает в саму запись, и главная показывает то же, что подтверждение. */
  function bringSection(personId) {
    return section({ title: 'Что взять с собой', body: w.Render.bringList(bringFor(personId)) });
  }

  /** «Михневич К.В.» — короткая подпись в пилюле и в футере. */
  function shortName(name) {
    var p = String(name).split(' ');
    return p[0] + (p[1] ? ' ' + p[1].charAt(0) + '.' : '') + (p[2] ? p[2].charAt(0) + '.' : '');
  }
  function directionById(id) {
    var all = DIRECTIONS.concat([OTHER]), found = null;
    all.forEach(function (x) { if (x.id === id) { found = x; } });
    return found;
  }
  /** Цена приёма выбранного врача; у «любого свободного» — самая низкая. */
  function price(d) {
    var list = doctors(d.direction);
    if (!list.length) { return null; }
    if (d.doctorId && d.doctorId !== 'any') {
      var one = doctor(d.doctorId);
      return one ? one.price : null;
    }
    var min = null;
    list.forEach(function (x) { if (min === null || x.price < min) { min = x.price; } });
    return min;
  }

  /* --- окна -------------------------------------------------------------- */

  function ymdOf(offset) {
    var t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() + offset);
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }
  function doctorIds(d) {
    if (d.doctorId && d.doctorId !== 'any') { return [d.doctorId]; }
    return doctors(d.direction).map(function (x) { return x.id; });
  }
  /** Сетка окон на нужный отрезок. У «любого свободного» окна врачей сливаются:
      время свободно, если оно свободно хотя бы у одного из них. */
  function grid(d, fromOffset, days) {
    var ids = doctorIds(d), merged = null;
    if (!ids.length) { return []; }
    ids.forEach(function (id) {
      /* Свободное окно — то, что отдал шов, минус занятое в самом прототипе.
         Правило живёт в Render.seenSlots: пока экран читал DATA.slots напрямую,
         две записи к одному врачу на одну минуту проходили шестью кликами,
         а день оставался подписан «12 окон». */
      var s = w.Render.seenSlots({ doctorId: id, from: ymdOf(fromOffset), to: ymdOf(fromOffset + days - 1) });
      if (!merged) {
        merged = s.map(function (day) {
          return { date: day.date, times: day.times.map(function (t) { return { time: t.time, free: t.free }; }) };
        });
        return;
      }
      s.forEach(function (day, i) {
        if (!merged[i]) { return; }
        day.times.forEach(function (t, j) { if (t.free && merged[i].times[j]) { merged[i].times[j].free = true; } });
      });
    });
    return merged || [];
  }
  function freeCount(day) {
    var n = 0;
    day.times.forEach(function (t) { if (t.free) { n++; } });
    return n;
  }
  function dayOf(cal, date) {
    var found = null;
    cal.forEach(function (day) { if (day.date === date) { found = day; } });
    return found;
  }
  /** Ближайший день со свободным окном; ищем дальше двух недель, если надо. */
  function nearestFree(d, fromOffset) {
    var cal = grid(d, fromOffset, LOOK_AHEAD), found = null;
    cal.forEach(function (day) { if (!found && freeCount(day)) { found = day.date; } });
    return found;
  }
  function offsetOf(date) {
    var a = new Date(date + 'T12:00:00'), b = new Date(); b.setHours(12, 0, 0, 0);
    return Math.round((a - b) / 86400000);
  }

  /* --- подписи ----------------------------------------------------------- */

  var plural = w.Render.fmt.plural;   /* русское число — одним правилом на весь проект */
  function shortDate(date) {
    var t = new Date(date + 'T12:00:00');
    return t.getDate() + ' ' + SHORT_M[t.getMonth()];
  }
  function weekday(date) { return SHORT_WD[new Date(date + 'T12:00:00').getDay()]; }
  function when(d) {
    if (!d.date || !d.time) { return ''; }
    return fmt.dateFull(d.date + 'T12:00:00') + ' · ' + d.time;
  }

  /* --- полоса шагов ------------------------------------------------------ */

  function done(d, step) {
    if (step === 1) { return !!d.direction; }
    if (step === 2) { return !!d.doctorId; }
    if (step === 3) { return !!(d.date && d.time); }
    if (step === 4) { return !!d.personId; }
    return false;
  }
  function steps(d) {
    var cur = d.step;
    var items = STEPS.map(function (title, i) {
      var n = i + 1, isDone = done(d, n) && n !== cur;
      var cls = 'zp-step' + (n === cur ? ' is-now' : '') + (isDone ? ' is-done' : '');
      var mark = isDone ? ic('check', 'ic--sm') : '<span class="zp-step__num">0' + n + '</span>';
      var body = mark + '<span class="zp-step__title">' + esc(title) + '</span>';
      return '<li class="' + cls + '"><span class="zp-step__bar"></span>' +
        (isDone
          ? '<button type="button" class="zp-step__go" data-act="goto" data-step="' + n + '">' + body + '</button>'
          : '<span class="zp-step__go">' + body + '</span>') +
        '</li>';
    }).join('');
    return '<p class="label zp-steps__count">Шаг ' + cur + ' из ' + STEPS.length + '</p>' +
      '<ol class="zp-steps">' + items + '</ol>';
  }

  /** Пилюля с ранее выбранным: что уже решено и ссылка вернуться к этому шагу. */
  function chosen(d) {
    var parts = [], back = 1;
    if (d.direction) { parts.push(directionById(d.direction).title); back = 1; }
    if (d.doctorId) {
      var one = d.doctorId === 'any' ? null : doctor(d.doctorId);
      parts.push(one ? shortName(one.name) : 'любой свободный врач');
      back = 2;
    }
    if (d.date && d.time) { parts.push(shortDate(d.date) + ', ' + d.time); back = 3; }
    if (d.personId) { parts.push(person(d.personId) ? person(d.personId).name : ''); back = 4; }
    if (!parts.length || d.step === 1) { return ''; }
    return '<p class="zp-chosen">' + ic('check', 'ic--sm') +
      '<span class="zp-chosen__text">' + esc(parts.join(' · ')) + '</span>' +
      '<button type="button" class="act" data-act="goto" data-step="' + back + '">изменить</button></p>';
  }

  /* --- шаг 1: зачем пришли ----------------------------------------------- */

  function tile(x, d) {
    var list = doctors(x.id), min = null;
    list.forEach(function (one) { if (min === null || one.price < min) { min = one.price; } });
    var on = d.direction === x.id;
    return '<button type="button" class="card zp-tile' + (on ? ' is-on' : '') + '" ' +
      'data-act="pick-direction" data-id="' + esc(x.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="zp-tile__ic">' + ic(x.icon, 'ic--lg') + '</span>' +
      '<span class="zp-tile__title">' + esc(x.title) + '</span>' +
      '<span class="zp-tile__text">' + esc(x.text) + '</span>' +
      '<span class="zp-tile__price">' +
        /* afterExam — направления, по которым клиника цену заранее не называет
           (design/zapis-novaya.png: «Цена — после осмотра»). Обещать сумму там,
           где её нет, плитка не должна. Где «от» показывается, оно посчитано
           по врачам направления и потому не расходится с карточкой врача.
           🔴 Расхождение с рисунком, сделанное сознательно: у лазерной коррекции
           здесь «от 4 500 ₽» вместо «от 55 000 ₽», у детского — «от 5 000 ₽»
           вместо «от 2 200 ₽» (design/zapis-novaya.png). Плитка называет цену
           приёма, а не операции и не акции, и берёт её из цен врачей этого
           направления: своя, четвёртая цена той же услуги здесь запрещена. */
        (x.afterExam ? 'Цена — после осмотра'
          : min === null ? 'Врача подберём по вашей жалобе'
          : 'Приём от ' + esc(fmt.money(min))) +
      '</span></button>';
  }
  function stepDirection(d) {
    return '<p class="zp-lead">Выберите одно направление — от него зависят врач и цена приёма.</p>' +
      '<div class="zp-tiles">' + DIRECTIONS.map(function (x) { return tile(x, d); }).join('') + '</div>' +
      '<div class="zp-tiles zp-tiles--one">' + tile(OTHER, d) + '</div>';
  }

  /* --- шаг 2: врач -------------------------------------------------------- */

  function anyRow(d, list) {
    var min = null, soon = null;
    list.forEach(function (one) {
      if (min === null || one.price < min) { min = one.price; }
      if (one.nearestSlot && (!soon || new Date(one.nearestSlot) < new Date(soon))) { soon = one.nearestSlot; }
    });
    var on = d.doctorId === 'any';
    return '<div class="zp-pick' + (on ? ' is-on' : '') + '">' +
      '<article class="card zp-any">' +
        '<span class="zp-any__ic">' + ic('user', 'ic--lg') + '</span>' +
        '<span class="zp-any__body"><span class="row__title">Любой свободный врач</span>' +
        '<span class="muted">' +
          (soon ? 'Ближайшее окно ' + esc(fmt.date(soon)) + ', ' + esc(fmt.time(soon)) : 'Свободных окон нет') +
          (min === null ? '' : ' · приём от ' + esc(fmt.money(min))) +
        '</span></span>' +
      '</article>' +
      '<div class="zp-pick__act"><button type="button" class="btn ' + (on ? 'btn--primary' : 'btn--secondary') + '" ' +
        'data-act="pick-doctor" data-id="any" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        (on ? 'Выбран' : 'Выбрать') + '</button></div>' +
    '</div>';
  }
  function stepDoctor(d) {
    var list = doctors(d.direction);
    if (!list.length) {
      return w.Render.emptyState({
        icon: 'stethoscope', title: 'По этому направлению врача пока нет',
        text: 'Выберите другое направление или запишитесь на диагностику — врача подберут на приёме.',
        action: { text: 'Выбрать другое направление', act: 'goto-1' }
      });
    }
    var rows = list.map(function (one) {
      var on = d.doctorId === one.id;
      return '<div class="zp-pick' + (on ? ' is-on' : '') + '">' + w.Render.doctorCard(one) +
        '<div class="zp-pick__act"><button type="button" class="btn ' + (on ? 'btn--primary' : 'btn--secondary') + '" ' +
        'data-act="pick-doctor" data-id="' + esc(one.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        (on ? 'Выбран' : 'Выбрать') + '</button></div></div>';
    }).join('');
    return anyRow(d, list) + rows +
      '<p class="zp-note">' + ic('warn') +
      ' Стаж, категория и число операций подставляются из карточки врача на сайте клиники</p>';
  }

  /* --- шаг 3: дата и время ------------------------------------------------ */

  function dayCell(day, d) {
    var free = freeCount(day), off = day.times.length === 0;
    var on = d.date === day.date;
    var note = off ? 'выходной' : (free ? free + ' ' + plural(free, 'окно', 'окна', 'окон') : 'нет окон');
    return '<button type="button" class="zp-day' + (on ? ' is-on' : '') + (free ? '' : ' is-off') + '" ' +
      'data-act="pick-day" data-date="' + esc(day.date) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="zp-day__wd">' + esc(weekday(day.date)) + '</span>' +
      '<span class="zp-day__date">' + esc(shortDate(day.date)) + '</span>' +
      '<span class="zp-day__free">' + esc(note) + '</span></button>';
  }
  function jumpButton(d, label) {
    var date = nearestFree(d, view.offset);
    if (!date) { return '<p class="muted">Ближайших свободных окон нет — позвоните в клинику.</p>'; }
    return '<button type="button" class="btn btn--primary" data-act="jump-free" data-date="' + esc(date) + '">' +
      esc(label) + ' ' + esc(fmt.dateFull(date + 'T12:00:00')) + '</button>';
  }
  function times(day, d) {
    if (!day) {
      return '<p class="zp-hint">' + ic('clock') + ' Выберите день — покажем свободное время</p>';
    }
    if (!freeCount(day)) {
      return '<div class="notice zp-none"><p class="strong">' +
        (day.times.length === 0 ? 'В этот день клиника не принимает' : 'На этот день мест нет') +
        '</p><p class="muted">' + esc(fmt.dateFull(day.date + 'T12:00:00')) + '</p>' +
        '<p class="zp-none__act">' + jumpButton(d, 'Ближайшее свободное —') + '</p></div>';
    }
    return '<div class="zp-slots">' + day.times.map(function (t) {
      var on = d.time === t.time;
      return '<button type="button" class="zp-slot' + (on ? ' is-on' : '') + '" ' +
        (t.free ? 'data-act="pick-time" data-time="' + esc(t.time) + '"' : 'disabled') +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(t.time) + '</button>';
    }).join('') + '</div>';
  }
  function stepWhen(d) {
    var cal = grid(d, view.offset, DAYS_SHOWN);
    if (!cal.length) {
      return w.Render.emptyState({ icon: 'calendar-check', title: 'Расписание пока не открыто',
        text: 'Выберите другого врача или позвоните в клинику.' });
    }
    var anyFree = false;
    cal.forEach(function (day) { if (freeCount(day)) { anyFree = true; } });
    var strip = '<div class="zp-days">' + cal.map(function (day) { return dayCell(day, d); }).join('') + '</div>';
    if (!anyFree) {
      return section({ title: 'Ближайшие две недели', body: strip }) +
        '<div class="notice zp-none"><p class="strong">На эту неделю мест нет</p>' +
        '<p class="muted">Свободные окна начинаются позже.</p>' +
        '<p class="zp-none__act">' + jumpButton(d, 'Ближайшее свободное —') + '</p></div>';
    }
    var day = d.date ? dayOf(cal, d.date) : null;
    var head = day ? 'Свободное время · ' + fmt.dateFull(day.date + 'T12:00:00') : 'Свободное время';
    return section({ title: 'Ближайшие две недели', body: strip }) +
      section({ title: head, body:
        '<p class="zp-legend"><span class="zp-legend__free"></span>свободно' +
        '<span class="zp-legend__busy"></span>занято' +
        '<span class="zp-legend__on"></span>выбрано</p>' + times(day, d) });
  }

  /* --- шаг 4: для кого ---------------------------------------------------- */

  function personCard(p, d) {
    var on = d.personId === p.id;
    var age = fmt.years(fmt.age(p.birthDate));
    var kid = fmt.age(p.birthDate) < 18 && d.direction !== 'kids';
    return '<button type="button" class="card zp-person' + (on ? ' is-on' : '') + '" ' +
      'data-act="pick-person" data-id="' + esc(p.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="face zp-person__ava">' + esc(w.Render.initials(p.name)) + '</span>' +
      '<span class="zp-person__body">' +
        '<span class="label">' + esc(p.isSelf ? 'Это вы' : p.relation) + '</span>' +
        '<span class="row__title">' + esc(p.name) + '</span>' +
        '<span class="muted">' + esc(age) + '</span>' +
        (kid ? '<span class="zp-person__warn">' + ic('warn') + ' детский приём — нужно направление к детскому офтальмологу</span>' : '') +
      '</span>' +
      '<span class="zp-person__mark" aria-hidden="true">' + (on ? ic('check', 'ic--sm') : '') + '</span></button>';
  }
  function stepWho(d) {
    var people = w.DATA.people();
    return section({ title: 'Пациент для этого приёма', body:
      '<div class="zp-people">' + people.map(function (p) { return personCard(p, d); }).join('') +
      '<button type="button" class="card zp-person zp-person--add" data-soon="Добавление человека в кабинет">' +
        '<span class="face zp-person__ava zp-person__ava--add">' + ic('plus') + '</span>' +
        '<span class="zp-person__body"><span class="row__title">Добавить человека</span>' +
        '<span class="muted">супруг, ребёнок или родитель</span></span></button>' +
      '</div>' }) +
      '<p class="zp-note">' + ic('user') + ' Данные человека — паспорт, полис и контакты — меняются в разделе «Профиль»</p>';
  }

  /* --- шаг 5: подтверждение ----------------------------------------------- */

  function summaryRow(label, value, sub, step) {
    return '<div class="zp-sum__row"><span class="label">' + esc(label) + '</span>' +
      '<span class="zp-sum__val"><span class="strong">' + esc(value) + '</span>' +
      (sub ? '<span class="muted">' + esc(sub) + '</span>' : '') + '</span>' +
      (step ? '<button type="button" class="act" data-act="goto" data-step="' + step + '">изменить</button>' : '<span></span>') +
      '</div>';
  }
  function clinicBlock() {
    var b = branch();
    if (!b) { return ''; }
    return section({ title: 'Клиника', body:
      '<div class="card card__body zp-clinic">' +
        '<p class="strong">' + esc(b.title) + '</p>' +
        '<p>' + esc(b.city) + ', ' + esc(b.address) + '</p>' +
        '<p class="muted">' + esc(b.howToGet) + '</p>' +
        '<p class="muted">' + esc(b.hours) + ' · ' + esc(b.phone) + '</p>' +
      '</div>' });
  }
  /** Цена того приёма, который подтверждают: у названного врача, а не
      «от» по направлению — иначе сводка называет одного, а считает другого. */
  /** Цена приёма. Перенос двигает время, а не услугу: у переносимой записи
      цена и метка «включено в пакет» остаются её собственными. Пока экран
      считал её заново, подтверждение показывало 4 500 ₽ там, где визиты
      и лечение писали «включено в пакет». */
  function confirmedPrice(d, one) {
    var src = d.moveId ? w.Render.findAppointment(d.moveId) : null;
    if (src) { return src.price; }
    return one ? one.price : price(d);
  }
  /** Входит ли переносимый приём в пакет — метка едет вместе с ценой. */
  function movedIncluded(d) {
    var src = d.moveId ? w.Render.findAppointment(d.moveId) : null;
    return !!(src && src.included);
  }

  function stepConfirm(d) {
    /* «Любой свободный врач» — способ выбора, а не врач. На подтверждении
       он обещал регистратуру, а главная сразу после записи называла живого
       человека: окно закрепляется за тем, у кого оно свободно, и назвать его
       надо там же, где пациент подтверждает. */
    var one = doctor(assignedDoctor(d));
    var p = person(d.personId);
    var cost = confirmedPrice(d, one);
    return section({ title: 'Ваша запись', body:
      '<div class="card zp-sum">' +
        summaryRow('Направление', directionById(d.direction).title, '', 1) +
        summaryRow('Врач', one ? one.name : 'Любой свободный врач',
          one ? (d.doctorId === 'any' ? one.position + ' · свободен в это время' : one.position)
              : 'Врача назначит регистратура', 2) +
        summaryRow('Дата и время', when(d), '', 3) +
        summaryRow('Пациент', p ? p.name : '', p && !p.isSelf ? p.relation : '', 4) +
        summaryRow('Стоимость приёма', cost === null ? 'Уточним на приёме' : fmt.money(cost),
          movedIncluded(d) ? 'включено в пакет' : '', 0) +
      '</div>' }) +
      clinicBlock() +
      bringSection(d.personId) +
      '<p class="zp-consent"><label class="choice"><input type="checkbox" id="zp-consent"' +
        (d.consent ? ' checked' : '') + '> Согласен на обработку персональных данных</label>' +
      '<button type="button" class="act" data-soon="Политика обработки персональных данных">политика обработки данных</button></p>';
  }

  /* --- футер мастера ------------------------------------------------------ */

  var HINTS = [
    'Выберите направление, чтобы продолжить',
    'Выберите врача или запишитесь к любому свободному',
    'Выберите день и время',
    'Выберите, кому нужен приём',
    'Отметьте согласие, чтобы записаться'
  ];
  function ready(d) {
    if (d.step === 5) { return d.consent; }
    return done(d, d.step);
  }
  /** Заголовок мастера. Перенос и новая запись — разные вещи, и пациент
      должен видеть, что делает, до кнопки на последнем шаге, а не после. */
  function title(d) { return d.moveId ? 'Перенос записи' : 'Запись на приём'; }
  function footer(d) {
    var ok = ready(d);
    var last = d.step === 5;
    var label = last ? (d.moveId ? 'Перенести' : 'Записаться') : 'Далее';
    var summary = '';
    if (ok && d.step === 3) { summary = when(d); }
    if (ok && d.step === 4) { summary = 'Приём для ' + fmt.genitive((person(d.personId) || {}).name) + ' · ' + when(d); }
    return '<div class="zp-foot">' +
      '<button type="button" class="btn btn--secondary" data-act="back">' + ic('arrow-right', 'zp-back-ic') + ' Назад</button>' +
      '<p class="zp-foot__hint">' + esc(ok ? summary
        : (last && d.moveId ? 'Отметьте согласие, чтобы перенести приём' : HINTS[d.step - 1])) + '</p>' +
      '<button type="button" class="btn btn--primary" data-act="' + (last ? 'book' : 'next') + '"' +
        (ok ? '' : ' disabled') + '>' + esc(label) + ' ' + ic(last ? 'check' : 'arrow-right') + '</button>' +
    '</div>';
  }

  /* --- «Вы записаны» ------------------------------------------------------ */

  function doneScreen() {
    var r = w.Store.value('zapis:booked');
    if (!r) { return ''; }
    var b = branch();
    return '<div class="zp-done">' +
      '<p class="zp-done__mark">' + ic('check', 'ic--xl') + '</p>' +
      '<h1 class="h1">' + (r.moved ? 'Запись перенесена' : 'Вы записаны') + '</h1>' +
      '<p class="muted">Номер записи № ' + esc(r.number) + '</p>' +
      '<div class="card zp-sum zp-done__card">' +
        summaryRow('Дата и время', r.whenText, '', 0) +
        summaryRow('Врач', r.doctorName, r.doctorPosition, 0) +
        summaryRow('Клиника', b ? b.title : '', b ? b.city + ', ' + b.address : '', 0) +
        summaryRow('Направление', r.directionTitle, '', 0) +
        summaryRow('Пациент', r.personName, '', 0) +
        summaryRow('Стоимость приёма', r.priceText, '', 0) +
      '</div>' +
      '<p class="zp-hint">' + ic('message') + ' Напоминание придёт за сутки и за два часа до приёма</p>' +
      bringSection(r.personId) +
      '<div class="zp-done__acts">' +
        '<button type="button" class="btn btn--primary" data-soon="Добавление записи в календарь">' +
          ic('calendar-plus') + ' Добавить в календарь</button>' +
        '<a class="btn btn--secondary" href="kabinet.html">На главную</a>' +
        '<a class="act" href="zapisi.html' + (r.personId ? '?person=' + esc(r.personId) : '') +
          '">Отменить или перенести</a>' +
      '</div>' +
    '</div>';
  }

  /** Номер записи: четыре цифры, посчитанные от самой записи, а не случайные —
      перезагрузка не должна показывать пациенту другой номер. */
  function number(d) {
    var s = d.date + d.time + (d.doctorId || '') + (d.personId || ''), n = 0;
    for (var i = 0; i < s.length; i++) { n = (n * 31 + s.charCodeAt(i)) % 9000; }
    return 1000 + n;
  }

  /* --- прерванный мастер --------------------------------------------------- */

  /* Незавершённый перенос предлагался как «Продолжить запись на диагностику
     зрения?»: пациент жал «Записаться» в меню, соглашался — и на последнем
     шаге кнопка называлась «Перенести», а подтверждение двигало старый визит
     вместо новой записи. Выбор остаётся, но назван своим именем, и вторая
     кнопка заводит именно новую запись. */
  function resumeScreen(d) {
    var what = d.direction ? directionById(d.direction).acc : null;
    var why = moveGoneWhy(), gone = !!why;
    var moving = !!d.moveId;
    var old = moving ? w.Render.asSeen(w.Render.findAppointment(d.moveId)) : null;
    var head = gone
      ? (what ? 'Записаться на ' + esc(what) + ' заново?' : 'Записаться заново?')
      : moving
      ? 'Продолжить перенос приёма' + (old ? ' ' + esc(fmt.date(old.datetime)) +
          ' в ' + esc(fmt.time(old.datetime)) : '') + '?'
      : (what ? 'Продолжить запись на ' + esc(what) + '?' : 'Продолжить прерванную запись?');
    return '<div class="card card__body zp-resume">' +
      '<h2 class="h2">' + head + '</h2>' +
      (gone ? '<p class="muted zp-resume__text">' + (why === 'cancelled'
        ? 'Запись, которую вы переносили, уже отменена — переносить нечего.'
        : 'Записи, которую вы переносили, в этом кабинете больше нет — переносить нечего.') +
        ' Оформим новую на то же направление.</p>' : '') +
      (moving ? '<p class="muted zp-resume__text">Вы выбирали новое время для этого приёма. ' +
        'Можно закончить перенос или оформить отдельную новую запись.</p>' : '') +
      '<p class="muted zp-resume__text">' + esc(chosenText(d)) + '</p>' +
      '<div class="zp-resume__acts">' +
        '<button type="button" class="btn btn--primary" data-act="resume">' +
          (moving ? 'Продолжить перенос' : 'Продолжить') + '</button>' +
        '<button type="button" class="btn btn--secondary" data-act="restart">' +
          (moving ? 'Записаться заново' : 'Начать заново') + '</button>' +
      '</div></div>';
  }
  function chosenText(d) {
    var parts = [];
    if (d.doctorId) {
      var one = d.doctorId === 'any' ? null : doctor(d.doctorId);
      parts.push(one ? one.name : 'любой свободный врач');
    }
    if (d.date && d.time) { parts.push(when(d)); }
    if (d.personId && person(d.personId)) { parts.push(person(d.personId).name); }
    return parts.length ? 'Вы остановились на шаге ' + d.step + ': ' + parts.join(' · ') : 'Вы остановились на шаге ' + d.step;
  }

  /* --- сборка -------------------------------------------------------------- */

  function render() {
    var page = document.getElementById('page');
    var d = draft();
    if (view.done) { page.innerHTML = doneScreen(); return; }
    if (!view.resumeAsked && d.step > 1 && !empty(d)) {
      page.innerHTML = '<h1 class="h1 page__title">' + esc(title(d)) + '</h1>' + resumeScreen(d);
      return;
    }
    var body = [stepDirection, stepDoctor, stepWhen, stepWho, stepConfirm][d.step - 1](d);
    page.innerHTML = '<h1 class="h1 page__title">' + esc(title(d)) + '</h1>' +
      steps(d) + chosen(d) +
      '<h2 class="h2 zp-head">' + esc(HEADS[d.step - 1]) + '</h2>' +
      body + footer(d);
    bindConsent();
  }

  /* Галочка согласия — поле, а не кнопка: слушатель вешается на само поле. */
  function bindConsent() {
    var box = document.getElementById('zp-consent');
    if (!box) { return; }
    box.addEventListener('change', function () { patch({ consent: box.checked }); render(); });
  }

  function go(step) { patch({ step: step }); view.resumeAsked = true; render(); }

  /** Кто на самом деле примет в выбранное окно. «Любой свободный» — способ
      выбора, а не врач: в карточке визита пустое поле «Врач» читается как сбой,
      поэтому окно закрепляется за первым, у кого оно свободно. Так же поступила
      бы регистратура. */
  function assignedDoctor(d) {
    if (d.doctorId && d.doctorId !== 'any') { return d.doctorId; }
    var ids = doctorIds(d), picked = null;
    ids.forEach(function (id) {
      if (picked) { return; }
      w.Render.seenSlots({ doctorId: id, from: d.date, to: d.date }).forEach(function (day) {
        if (picked || day.date !== d.date) { return; }
        day.times.forEach(function (t) { if (!picked && t.time === d.time && t.free) { picked = id; } });
      });
    });
    return picked || ids[0] || null;
  }

  /** Запись, которую завёл сам прототип. Поля те же, что у записи из шва:
      её рисуют те же «Мои визиты» и та же главная тем же Render. Данные шва
      не подменяются — это отдельная карточка в Store, рядом с ними. */
  function newAppointment(d) {
    var b = branch();
    var cost = confirmedPrice(d, doctor(assignedDoctor(d)));
    var dir = directionById(d.direction);
    return {
      /* id не заводим: его выдаёт Store счётчиком. Считать его из полей записи
         нельзя — два разных приёма способны дать один и тот же хеш. */
      number: String(number(d)),
      status: 'confirmed',
      datetime: d.date + 'T' + d.time + ':00',
      direction: d.direction,
      /* Подпись услуги собирает экран: шов русских фраз не отдаёт, а карточка
         показывает то самое направление, что пациент выбрал на шаге 1. */
      service: dir ? dir.title : '',
      doctorId: assignedDoctor(d),
      branchId: b ? b.id : null,
      personId: d.personId,
      price: cost === null ? 0 : cost,
      included: false,
      movedFrom: null,
      cancelReason: null,
      bring: bringFor(d.personId),
      conclusionDocId: null
    };
  }

  function book() {
    var d = draft();
    if (!ready(d)) { return; }
    var one = doctor(assignedDoctor(d));
    var p = person(d.personId);
    var cost = confirmedPrice(d, one);
    /* Экран успеха рисуется снимком, но снимком дело не кончается: без записи
       в общем состоянии «Мои визиты» и главная показывали прежнее расписание,
       и заказчик упирался в это в первые же минуты. Перенос меняет время
       существующей записи, новая запись ложится отдельной карточкой. */
    if (d.moveId) {
      /* Перенос оформляет Render.moveTo — там же, где объявлено, чья это запись.
         Мастер даёт сменить человека на шаге 4, шаги 4, 5 и экран успеха его
         подтверждают: без нового пациента в переносе запись оставалась
         у того, кто переносил, и четвёртый экран опровергал три предыдущих. */
      w.Render.moveTo(d.moveId, {
        datetime: d.date + 'T' + d.time + ':00',
        doctorId: assignedDoctor(d),
        personId: d.personId
      });
    } else {
      var saved = w.Store.addBooking(newAppointment(d));
      /* Осмотр из плана лечения возвращается в план: иначе «Записаться»
         обещает назначить контроль и не назначает — визит появляется,
         а «Лечение» продолжает писать «Дата пока не назначена». */
      if (d.checkupId && saved) {
        w.Store.setValue(w.Render.checkupKey({ id: d.checkupId }), saved.id);
      }
    }
    w.Store.setValue('zapis:booked', {
      number: number(d), moved: !!d.moveId, personId: d.personId,
      whenText: when(d),
      doctorName: one ? one.name : 'Любой свободный врач',
      doctorPosition: one ? (d.doctorId === 'any' ? one.position + ' · свободен в это время' : one.position)
                          : 'Врача назначит регистратура',
      directionTitle: directionById(d.direction).title,
      personName: p ? p.name : '',
      priceText: (cost === null ? 'Уточним на приёме' : fmt.money(cost)) +
        (movedIncluded(d) ? ' · включено в пакет' : '')
    });
    w.Store.setDraft(null);
    view.done = true;
    render();
  }

  /* --- вход по ссылке ------------------------------------------------------ */

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(w.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  /** Ссылка «записаться к этому врачу» и «перенести» открывают шаг даты
      с уже выбранным врачом. Отметка entry держит применение разовым:
      перечитывание экрана не должно откатывать пациента назад. */
  function applyEntry() {
    var moveId = param('move'), docId = param('doctor'), checkupId = param('checkup');
    var mark = moveId ? 'move:' + moveId : (checkupId ? 'checkup:' + checkupId : (docId ? 'doctor:' + docId : null));
    if (!mark || draft().entry === mark) { return; }
    if (moveId) {
      var a = w.Render.asSeen(w.Render.findAppointment(moveId));
      /* Переносим только то, что переносится: отменённое, состоявшееся и то,
         до чего меньше суток, не переносит и карточка визита. Правило одно —
         Render.canMove; ссылка «Перенести» могла устареть или прийти руками. */
      if (!a || !w.Render.canMove(a)) { return; }
      w.Store.setDraft({ step: 3, direction: a.direction, doctorId: a.doctorId,
        date: null, time: null, personId: a.personId, consent: false, moveId: moveId,
        checkupId: null, entry: mark });
      view.resumeAsked = true;
      return;
    }
    var one = doctor(docId);
    if (checkupId) {
      /* Осмотр из плана лечения: мастер открывается с врачом плана и помнит,
         какой именно осмотр назначает, — назначенная дата вернётся в план. */
      w.Store.setDraft({ step: one ? 3 : 1, direction: one ? (one.directions[0] || null) : null,
        doctorId: one ? one.id : null, date: null, time: null, personId: w.Store.person(),
        consent: false, moveId: null, checkupId: checkupId, entry: mark });
      view.resumeAsked = true;
      return;
    }
    if (!one) { return; }
    w.Store.setDraft({ step: 3, direction: one.directions[0] || null, doctorId: one.id,
      date: null, time: null, personId: null, consent: false, moveId: null,
      checkupId: null, entry: mark });
    view.resumeAsked = true;
  }

  function init() {
    w.Shell.mount({ active: 'zapis-novaya' });
    /* Действия регистрируются сразу после каркаса и до отрисовки. */
    w.Shell.on('pick-direction', function (t) {
      patch({ direction: t.getAttribute('data-id'), doctorId: null, date: null, time: null });
      render();
    });
    w.Shell.on('pick-doctor', function (t) {
      patch({ doctorId: t.getAttribute('data-id'), date: null, time: null });
      render();
    });
    w.Shell.on('pick-day', function (t) { patch({ date: t.getAttribute('data-date'), time: null }); render(); });
    w.Shell.on('pick-time', function (t) { patch({ time: t.getAttribute('data-time') }); render(); });
    w.Shell.on('pick-person', function (t) { patch({ personId: t.getAttribute('data-id') }); render(); });
    w.Shell.on('jump-free', function (t) {
      var date = t.getAttribute('data-date');
      view.offset = Math.max(0, offsetOf(date));
      patch({ date: date, time: null });
      render();
    });
    w.Shell.on('goto', function (t) { go(+t.getAttribute('data-step')); });
    w.Shell.on('goto-1', function () { go(1); });
    w.Shell.on('next', function () {
      var d = draft();
      if (!ready(d)) { return; }
      go(Math.min(5, d.step + 1));
    });
    w.Shell.on('back', function () {
      var d = draft();
      if (d.step === 1) { w.location.href = 'kabinet.html'; return; }
      go(d.step - 1);
    });
    w.Shell.on('book', book);
    w.Shell.on('resume', function () { view.resumeAsked = true; render(); });
    w.Shell.on('restart', function () {
      w.Store.setDraft(null);
      view.resumeAsked = true;
      view.offset = 0;
      render();
    });
    applyEntry();
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
