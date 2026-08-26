/* Экран 6 «Лечение после операции».
   Ведущий процесс, а не справочник: день N из M, график капель на сегодня
   с отметкой, красная черта с телефоном дежурного, что нормально и когда
   пройдёт, контрольные осмотры, ограничения со сроками.
   Состояния — по таблице спецификации: активного лечения нет · всё на
   сегодня отмечено · пропущено закапывание · план завершён.

   🔴 Медицинские формулировки экраном не сочиняются: признаки, сроки и
   назначения приходят полями из DATA.treatment() и печатаются как есть,
   под сноской «формулировки утверждает клиника».
   Утверждения по таблице состояний — tools/test-lechenie.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* Сноска обязательна на экране в любом состоянии и стоит последней строкой:
     она накрывает все медицинские блоки сразу — график, красную черту, памятки
     и ограничения, — а не один из них. Тексты памяток в рабочую версию
     попадают только после врача клиники. */
  var NOTE = 'Названия, дозировки и сроки подставляются из назначения лечащего врача. ' +
             'Формулировки утверждает клиника.';

  /* Иконки по порядку пунктов: у признаков и памяток нет своего поля-иконки,
     и выдумывать его в данных незачем — это оформление, а не факт. */
  var SIGN_ICONS = ['warn', 'eye', 'sparkle', 'drop'];
  var NORMAL_ICONS = ['drop', 'glasses', 'sparkle', 'eye'];
  var STOP_ICONS = ['warn', 'drop', 'flask', 'clip', 'shield'];

  /* Когда на сегодня всё отмечено, график уступает место строке «На сегодня
     всё». Отметки при этом не должны становиться необратимыми, поэтому
     список открывается обратно кнопкой. Это состояние экрана, а не данных. */
  var marksOpen = false;

  /** Последний день курса: от даты операции плюс весь курс. */
  function endDate(t) {
    var d = new Date(t.startedAt);
    d.setDate(d.getDate() + t.dayTotal - 1);
    return d.toISOString();
  }

  function allDone(t) {
    return t.doses.length > 0 && t.doses.every(function (d) { return d.done; });
  }

  /* --- шапка плана ------------------------------------------------------- */

  function head(t) {
    var percent = Math.max(0, Math.min(100, Math.round(t.dayCurrent / t.dayTotal * 100)));
    return '<div class="lech-head">' +
        '<div><p class="label">Лечение</p><h1 class="h1">' + esc(t.title) + '</h1></div>' +
        '<div class="lech-head__day"><p class="label">День восстановления</p>' +
          '<p class="display">' + esc(t.dayCurrent) + ' из ' + esc(t.dayTotal) + '</p></div>' +
      '</div>' +
      '<p class="lech-bar"><span style="width: ' + percent + '%"></span></p>' +
      '<p class="lech-foot">' +
        '<span class="muted">Операция — ' + esc(fmt.date(t.startedAt)) + '</span>' +
        '<span class="muted">Завершение курса — ' + esc(fmt.date(endDate(t))) + '</span>' +
      '</p>';
  }

  /* --- сегодня: график закапываний --------------------------------------- */

  function dosesBlock(t) {
    if (!t.doses.length) { return ''; }
    var next = w.Render.nextDose(t);          /* следующую дозу считает Render */
    var done = t.doses.filter(function (d) { return d.done; }).length;

    if (allDone(t) && !marksOpen) {
      /* Следующее закапывание называет шов полем nextDoseAt: выводить его
         из сегодняшнего расписания экран не имеет права — это догадка. */
      var next2 = t.nextDoseAt
        ? '<p class="muted">Следующее закапывание — ' + esc(fmt.relative(t.nextDoseAt)) +
          ' в ' + esc(fmt.time(t.nextDoseAt)) + '.</p>'
        : '';
      return section({
        title: 'Сегодня · график закапываний',
        cls: 'lech-today',
        aside: 'Отмечено ' + done + ' из ' + t.doses.length,
        body: '<div class="notice notice--accent lech-done">' +
            '<p class="row__title">На сегодня всё</p>' +
            '<p class="muted">Все ' + esc(t.doses.length) + ' закапываний на сегодня отмечены.</p>' +
            next2 +
            '<p class="lech-done__act"><button class="btn btn--secondary btn--sm" data-act="day-marks">' +
              'Показать отметки за день</button></p>' +
          '</div>'
      });
    }
    return section({
      title: 'Сегодня · график закапываний',
      cls: 'lech-today',
      aside: next ? 'Ближайшее — в ' + next.time : 'Отмечено ' + done + ' из ' + t.doses.length,
      body: w.Render.doseList(t) +
        (allDone(t) ? '<p class="lech-done__act"><button class="btn btn--secondary btn--sm" data-act="day-marks">' +
          'Свернуть отметки</button></p>' : '')
    });
  }

  /* --- красная черта ------------------------------------------------------
     Отдельный отбитый блок: признаки, при которых звонят немедленно, и
     крупный телефон дежурной линии с часами. Звонок — обычная ссылка tel:,
     она работает и с телефона, и с ноутбука. */

  function redLine(t) {
    var r = t.redLine;
    if (!r) { return ''; }
    var digits = String(r.phone).replace(/[^\d+]/g, '');
    var signs = r.signs.map(function (s, i) {
      return '<li class="lech-sign">' + ic(SIGN_ICONS[i % SIGN_ICONS.length]) +
        '<span>' + esc(s) + '</span></li>';
    }).join('');
    return '<section class="lech-red" aria-label="Когда звонить немедленно">' +
        '<div>' +
          '<p class="lech-red__badge">' + ic('warn') + 'Красная черта</p>' +
          '<p class="lech-red__title">Позвоните немедленно, если</p>' +
          '<ul class="lech-red__signs">' + signs + '</ul>' +
        '</div>' +
        '<div class="lech-red__call">' +
          '<p class="label">Неотложная линия клиники</p>' +
          '<p class="lech-red__phone">' + esc(r.phone) + '</p>' +
          '<p class="lech-red__hours">' + ic('clock') + esc(r.hours) + '</p>' +
          '<a class="btn btn--primary btn--block" href="tel:' + esc(digits) + '">' +
            ic('message') + 'Позвонить сейчас</a>' +
        '</div>' +
      '</section>';
  }

  /* --- памятки: что нормально и что пока нельзя --------------------------- */

  function tiles(items, icons, cls) {
    return '<div class="lech-grid">' + items.map(function (o, i) {
      return '<div class="lech-tile' + (cls ? ' ' + cls : '') + '">' +
        '<span class="lech-tile__icon">' + ic(icons[i % icons.length]) + '</span>' +
        '<p class="strong">' + esc(o.text) + '</p>' +
        '<p class="lech-tile__until">' + esc(o.until) + '</p>' +
      '</div>';
    }).join('') + '</div>';
  }

  function normalBlock(t) {
    if (!t.normal || !t.normal.length) { return ''; }
    return section({
      title: 'Что нормально в первые дни',
      body: tiles(t.normal, NORMAL_ICONS, '')
    });
  }

  function restrictionsBlock(t) {
    if (!t.restrictions || !t.restrictions.length) { return ''; }
    return section({
      title: 'Пока нельзя',
      body: tiles(t.restrictions, STOP_ICONS, 'lech-tile--stop')
    });
  }

  /* --- контрольные осмотры ------------------------------------------------
     Дата с назначенной записью переносится, ненайденная — записывается
     заново. Мастер получает id записи, а не отдельный ключ.

     Экран, который показывает запись и даёт по ней действие, обязан показывать
     её в том же состоянии, что визиты и главная: осмотр рисовался прямо из
     treatment().checkups[].date, и после переноса «Лечение» продолжало звать
     на прежнее время, а отменённый осмотр снова предлагал себя перенести.
     Состояние накладывает общий слой Render, своей копии правил здесь нет. */

  /** Врач, у которого этот план ведут: берём его у любой записи плана.
      Кнопка «Записаться» обязана открыть мастер с тем же врачом, а не чистый
      шаг 1: пациент выбирал бы заново то, что клиника уже назначила. */
  function planDoctor(t) {
    var id = null;
    (t.checkups || []).forEach(function (c) {
      var a = w.Render.checkupAppointment(c);
      if (!id && a && a.doctorId) { id = a.doctorId; }
    });
    return id;
  }

  function checkupRow(c, t) {
    var a = w.Render.checkupAppointment(c);
    var off = !!(a && a.status === 'cancelled');
    var at = a ? a.datetime : c.date;
    var when;
    if (off) {
      when = '<span class="row__title">' + esc(fmt.dateFull(at)) + ' · осмотр отменён</span>' +
        '<span class="row__sub">' + esc(c.purpose) +
        (a.cancelReason ? ' · причина: ' + esc(a.cancelReason) : '') + '</span>';
    } else if (at) {
      when = '<span class="row__title">' + esc(fmt.dateFull(at)) + '</span>' +
        '<span class="row__sub">' + esc(fmt.time(at) + ' · ' + fmt.relative(at)) +
        /* После переноса назначение плана — уже не описание этой даты:
           «Контроль на 7-й день» после переноса на 5 сентября приходится
           на 17-й. Текст клиники не разбираем и не переписываем — помечаем
           его как план, а фактом остаётся дата в строке выше. */
        ' · ' + esc(c.purpose) + (a && a.movedFrom ? ' по плану' : '') +
        (a && a.movedFrom ? ' · перенесён с ' + esc(fmt.date(a.movedFrom)) : '') + '</span>';
    } else {
      when = '<span class="row__title">Дата пока не назначена</span>' +
        '<span class="row__sub">' + esc(c.purpose) + '</span>';
    }
    /* Что можно сделать с записью, решает Render.canMove — одно правило
       на карточку визита и на эту строку. Здесь стояла своя копия, и она
       предлагала перенести вчерашний осмотр: он уезжал в будущее и оставался
       во вкладке «Прошедшие» с кнопкой «Оставить отзыв». */
    var action;
    if (off) {
      action = '<a class="btn btn--primary btn--sm" href="zapis-novaya.html?doctor=' + esc(a.doctorId) + '">' +
        ic('calendar-plus') + 'Записаться заново</a>';
    } else if (a && w.Render.canMove(a)) {
      action = '<a class="btn btn--secondary btn--sm" href="zapis-novaya.html?move=' + esc(a.id) + '">' +
        ic('clock') + 'Перенести</a>';
    } else if (a) {
      action = '';
    } else {
      /* Мастер получает id осмотра: назначенная запись возвращается в план,
         а не оседает в одних визитах — иначе кнопка обещает назначить осмотр
         и не назначает. */
      var doc = planDoctor(t);
      action = '<a class="btn btn--primary btn--sm" href="zapis-novaya.html?checkup=' + esc(c.id) +
        (doc ? '&doctor=' + esc(doc) : '') + '">' + ic('calendar-plus') + 'Записаться</a>';
    }
    return '<li class="row' + (off ? ' is-missed' : '') + '">' +
      '<span class="row__icon">' + ic('calendar-check') + '</span>' +
      '<span class="row__body">' + when + '</span>' +
      '<span class="row__action">' + action + '</span>' +
    '</li>';
  }

  function checkupsBlock(t) {
    if (!t.checkups || !t.checkups.length) { return ''; }
    /* Порядок — по той дате, которая на экране, а не по порядку в плане:
       после переноса осмотр «на следующий день» вставал ниже «контроля
       на 7-й день», и список читался как сбой. Неназначенные — в конце. */
    var rows = t.checkups.slice().map(function (c, i) {
      var a = w.Render.checkupAppointment(c);
      var at = a ? a.datetime : c.date;
      return { c: c, i: i, at: at ? new Date(at).getTime() : Infinity };
    });
    rows.sort(function (x, y) { return x.at === y.at ? x.i - y.i : x.at - y.at; });
    return section({ title: 'Контрольные осмотры', cls: 'lech-checkups',
      body: '<ul class="rows">' + rows.map(function (r) { return checkupRow(r.c, t); }).join('') + '</ul>' });
  }

  /* --- состояния экрана ---------------------------------------------------- */

  /** Курс пройден: график и ограничения больше не ведут, остаётся итоговый осмотр. */
  function finishedScreen(t) {
    return '<h1 class="h1 page__title">Лечение</h1>' +
      section({
        title: 'План восстановления',
        aside: t.title,
        body: '<div class="notice notice--accent lech-done">' +
          '<p class="row__title">Восстановление завершено</p>' +
          '<p class="muted">Курс на ' + esc(t.dayTotal) + ' дней пройден, закапывания по плану окончены.</p>' +
        '</div>'
      }) +
      checkupsBlock(t) +
      '<p class="muted lech-note">' + esc(NOTE) + '</p>';
  }

  /** Пройденные курсы: их отдаёт DATA.treatmentsDone(), активный treatment()
      о завершённых не знает. */
  function doneBlock() {
    var list = w.DATA.treatmentsDone ? w.DATA.treatmentsDone() : [];
    if (!list.length) { return ''; }
    var rows = list.map(function (d) {
      return '<li class="row">' +
        '<span class="row__icon">' + ic('check') + '</span>' +
        '<span class="row__body"><span class="row__title">' + esc(d.title) + '</span>' +
        '<span class="row__sub">' + esc(fmt.exact(d.startedAt)) + ' — ' + esc(fmt.exact(d.finishedAt)) +
        ' · курс на ' + esc(d.dayTotal) + ' дней</span></span>' +
      '</li>';
    }).join('');
    return section({
      title: 'Завершённые планы',
      aside: 'Всего: ' + list.length,
      body: '<ul class="rows">' + rows + '</ul>'
    });
  }

  /** Активных назначений нет — но пройденные курсы, если они были, остаются. */
  function emptyScreen() {
    return '<h1 class="h1 page__title">Лечение</h1>' +
      '<div class="card lech-empty">' +
        w.Render.emptyState({
          icon: 'clipboard',
          title: 'Активных назначений нет',
          text: 'План восстановления появится здесь после операции.'
        }) +
      '</div>' +
      doneBlock() +
      '<p class="muted lech-note">' + esc(NOTE) + '</p>';
  }

  function render() {
    var t = w.DATA.treatment();
    var page = document.getElementById('page');
    if (!t) { page.innerHTML = emptyScreen(); return; }
    if (t.finished) { page.innerHTML = finishedScreen(t); return; }
    page.innerHTML =
      head(t) +
      dosesBlock(t) +
      redLine(t) +
      normalBlock(t) +
      checkupsBlock(t) +
      restrictionsBlock(t) +
      '<p class="muted lech-note">' + esc(NOTE) + '</p>';
  }

  function init() {
    w.Shell.mount({ active: 'lechenie' });
    /* Своё действие регистрируется сразу после каркаса и до отрисовки. */
    w.Shell.on('day-marks', function () { marksOpen = !marksOpen; render(); });
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
