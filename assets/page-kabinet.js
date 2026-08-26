/* Экран 2 «Главная — что дальше».
   Ближайшая запись, что от пациента ждут, что взять с собой, ход лечения.
   Состояния — по таблице спецификации: новый пациент · всё сделано ·
   запись сегодня · запись отменена · карта ещё не подтверждена админом.
   Данные только через DATA, повторяющиеся блоки — через Render.
   Утверждения по таблице состояний — tools/test-kabinet.html. */
(function (w) {
  'use strict';

  var TASK_ICON = { analyses: 'flask', consent: 'file-sign', payment: 'card' };
  var TASK_DUE  = { analyses: 'срок',  consent: 'подписать', payment: 'оплатить' };

  var fmt = w.Render.fmt;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }
  function overdue(iso) { return iso ? new Date(iso) < new Date() : false; }

  var section = w.Render.section;

  /* --- ближайшая запись --------------------------------------------------
     Какую запись считать ближайшей — решение про состояние, и живёт оно
     в Render вместе с отменой и переносом: своей копии экран не держит.
     Отменённая запись остаётся в «Моих визитах», но «Ближайшее» показывает
     ту, куда пациент идёт. */

  /** Фразу собирает экран: в данных лежит лид-тайм числом, а не текстом. */

  /* Обещание про напоминания собирает Render: согласие и каналы решают одно
     и то же, и решать это обязано одно место. Пока экран читал шов сам,
     заказчик снимал согласие в профиле, профиль писал «выключены», а карточка
     визита продолжала обещать СМС. */
  function remindLine() {
    var text = w.Render.remindText({ short: true });
    if (!text) { return ''; }
    return '<p class="kab-remind">' + ic('clock') + '<span>' + esc(text) + '</span></p>';
  }

  function nextBlock(a) {
    if (!a) {
      var seen = w.DATA.appointments({ when: 'past' }).length > 0;
      return w.Render.emptyState(seen ? {
        title: 'Предстоящих записей нет',
        text: 'Прошедшие визиты остались в разделе «Мои визиты».',
        action: { text: 'Записаться', href: 'zapis-novaya.html' }
      } : {
        title: 'Записей пока нет',
        text: 'Выберите врача и удобное время — запись появится здесь.',
        action: { text: 'Записаться', href: 'zapis-novaya.html' }
      });
    }
    /* Карточка пришла сюда уже такой, какой её видит пациент: отмену и перенос
       наложил nextAppointment(). */
    if (a.status === 'cancelled') {
      return section({ title: 'Ближайшее', body: w.Render.appointmentCard(a) });
    }
    var today = fmt.relative(a.datetime) === 'сегодня';
    return section({
      title: 'Ближайшее',
      aside: today ? 'Сегодня в ' + fmt.time(a.datetime) : '',
      body: w.Render.appointmentCard(a) + remindLine()
    });
  }

  /* --- от вас ждут ------------------------------------------------------- */

  /** Пояснение к задаче: суммы берутся из счёта, в задаче их нет. */
  function taskNote(t) {
    var inv = w.DATA.invoice();
    var head = '';
    if (t.kind === 'analyses') { head = 'Направление выдано ' + fmt.date(t.issuedAt); }
    else if (t.kind === 'consent') { head = 'Документ ждёт подписи с ' + fmt.date(t.issuedAt); }
    else if (t.kind === 'payment') {
      head = inv && inv.total ? fmt.money(inv.due) + ' из ' + fmt.money(inv.total) : 'Счёт выставлен ' + fmt.date(t.issuedAt);
    }
    var when = overdue(t.dueAt)
      ? '<span class="text-danger strong">срок вышел ' + esc(fmt.date(t.dueAt)) + '</span>'
      : esc((TASK_DUE[t.kind] || 'срок') + ' до ' + fmt.date(t.dueAt));
    return (head ? esc(head) + ' · ' : '') + when;
  }

  function tasksBlock(a) {
    var tasks = w.Render.seenTasks();
    var live = a && a.status !== 'cancelled';
    if (!tasks.length) {
      if (!live) { return ''; }
      return section({
        title: 'От вас ждут',
        body: '<ul class="rows"><li class="row row--compact">' + ic('check') +
          '<span class="row__body"><span class="strong">Всё готово к визиту</span> ' +
          '<span class="muted">сдавать, подписывать и оплачивать ничего не нужно</span></span></li></ul>'
      });
    }
    var rows = tasks.map(function (t) {
      return '<li class="row">' +
        '<span class="row__icon">' + ic(TASK_ICON[t.kind] || 'clip') + '</span>' +
        '<span class="row__body">' +
          '<span class="row__title">' + esc(t.title) + '</span>' +
          '<span class="row__sub">' + taskNote(t) + '</span>' +
        '</span>' +
        '<span class="row__action"><a class="act" href="' + esc(w.Render.taskHref(t)) + '">' +
          esc(t.action.label) + ic('arrow-right') + '</a></span>' +
      '</li>';
    }).join('');
    return section({
      title: 'От вас ждут',
      cls: 'kab-tasks',
      body: '<ul class="rows">' + rows + '</ul>'
    });
  }

  function bringBlock(a) {
    if (!a || a.status === 'cancelled' || !a.bring || !a.bring.length) { return ''; }
    return section({
      title: 'Что взять с собой',
      aside: 'К визиту ' + fmt.date(a.datetime),
      body: w.Render.bringList(a.bring)
    });
  }

  /* --- лечение идёт ------------------------------------------------------ */

  function cureBlock() {
    var t = w.DATA.treatment();
    if (!t || t.finished) { return ''; }
    var next = w.Render.nextDose(t), missed = 0;
    t.doses.forEach(function (d) { if (!d.done && d.missed) { missed++; } });
    var percent = Math.min(100, Math.round(t.dayCurrent / t.dayTotal * 100));
    var when = next
      ? '<span class="label">Ближайшее закапывание</span>' +
        '<span class="row__title">' + esc(next.time + ' · ' + next.drug) + '</span>' +
        '<span class="muted">' + esc(next.dose) + '</span>'
      : '<span class="label">Закапывания</span>' +
        '<span class="row__title">На сегодня всё отмечено</span>' +
        '<span class="muted">Следующий график откроется завтра</span>';
    return section({
      title: 'Лечение идёт',
      body: '<article class="card kab-cure">' +
        '<div class="kab-cure__day">' +
          '<p class="label">День восстановления</p>' +
          '<p class="display">' + esc(t.dayCurrent) + ' из ' + esc(t.dayTotal) + '</p>' +
          '<p class="muted">' + esc(t.title) + '</p>' +
          '<p class="kab-cure__bar"><span style="width: ' + percent + '%"></span></p>' +
        '</div>' +
        '<div class="kab-cure__next">' + when +
          (missed ? '<span class="text-danger strong">Пропущено закапываний: ' + missed + '</span>' : '') +
        '</div>' +
        '<div class="kab-cure__act"><a class="btn btn--primary btn--block" href="lechenie.html">' +
          ic('arrow-right') + 'Открыть план</a></div>' +
      '</article>'
    });
  }

  /* --- карта ещё не подтверждена ----------------------------------------- */

  function pendingBlock() {
    if (w.DATA.linkStatus() !== 'pending') { return ''; }
    return '<div class="notice notice--accent kab-note">' +
      '<p class="label notice__title">Карта пациента</p>' +
      '<p>Администратор клиники подтверждает вашу карту. Обычно это занимает до рабочего дня.</p>' +
      '<p class="muted">Записи, счета и документы появятся здесь сразу после подтверждения.</p>' +
    '</div>';
  }

  /* --- сборка экрана ----------------------------------------------------- */

  function render() {
    /* Имя берём оттуда же, откуда его берёт пилюля в шапке: иначе шапка и
       приветствие расходятся. Так и было — в новом сценарии пилюля называла
       человека по имени, а приветствие здоровалось ни с кем, потому что
       подтверждения карты в клинике ещё нет. Карту подтверждает клиника,
       а имя пациент назвал сам при регистрации, и правку ФИО в профиле
       обе надписи обязаны увидеть одинаково. */
    var name = w.Shell.greetName(w.Store.person());
    var a = w.Render.nextAppointment();
    var pair = tasksBlock(a) + bringBlock(a);
    document.getElementById('page').innerHTML =
      '<h1 class="h1 page__title">' +
        (name ? 'Здравствуйте, ' + esc(name) : 'Здравствуйте!') +
      '</h1>' +
      pendingBlock() +
      nextBlock(a) +
      (pair ? '<div class="kab-cols">' + pair + '</div>' : '') +
      cureBlock();
  }

  /* --- отмена записи -----------------------------------------------------
     Окно отмены — общее: дата в нём берётся у того же asSeen, что рисует
     карточку, и копии этого окна на экранах нет. Копии как раз и разошлись:
     карточка показывала перенесённую дату, окно — исходную. */

  function init() {
    w.Shell.mount({ active: 'kabinet' });
    /* Действия регистрируются сразу после каркаса и до отрисовки:
       позже прибор уже снял список обслуженных действий. */
    w.Shell.on('cancel', function (btn) { w.Render.cancelDialog(btn.getAttribute('data-id')); });
    w.Shell.on('cancel-confirm', function () { w.Render.cancelConfirm(); render(); });
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
