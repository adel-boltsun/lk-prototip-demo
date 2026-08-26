/* Экран 5 «Счёт и смета».
   Что назначено, сколько стоит, сколько оплачено и сколько осталось — со сроком.
   Ядро экрана — плашка о фиксации цены и история изменений с причинами:
   по исследованию клиентского пути злит не сумма, а её молчаливое изменение.
   Состояния — по таблице спецификации: назначений нет · всё оплачено ·
   просрочка · история пуста · нажата оплата.
   Данные только через DATA, подписи собирает экран.
   Утверждения по таблице состояний — tools/test-smeta.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  var plural = w.Render.fmt.plural;   /* русское число — одним правилом на весь проект */

  /* --- услуги и итоги: общие компоненты -----------------------------------
     Таблицу и блок итогов рисует Render (invoiceTable и invoiceTotals) —
     своих копий экран не держит. Подписи под цифрами собирает он: множественные
     числа и «одним платежом» — дело экрана, а не шва. */

  function paidCount(inv) {
    var n = 0;
    inv.lines.forEach(function (l) { if (l.status === 'paid') { n++; } });
    return n;
  }

  function totalsBlock(inv) {
    var n = inv.lines.length, p = paidCount(inv);
    return section({
      title: 'Итоги',
      body: w.Render.invoiceTotals(inv, {
        total: esc(n + ' ' + plural(n, 'услуга', 'услуги', 'услуг') + ' в плане'),
        paid: inv.paid && inv.paid === inv.total
          ? 'Счёт закрыт полностью'
          : esc(p + ' ' + plural(p, 'услуга оплачена', 'услуги оплачены', 'услуг оплачено')),
        due: inv.due ? 'Одним платежом' : 'Доплачивать ничего не нужно'
      })
    });
  }

  /* --- фиксация цены ------------------------------------------------------ */

  function fixBlock(inv) {
    if (!inv.fixedAt) { return ''; }
    return '<div class="notice notice--accent sm-fix">' +
      '<span class="sm-fix__icon">' + ic('lock', 'ic--xl') + '</span>' +
      '<div>' +
        '<p class="sm-fix__title">Цена зафиксирована ' + esc(fmt.exact(inv.fixedAt)) + '</p>' +
        '<p>Любое изменение появится здесь с датой и причиной ' +
        'и не проводится без вашего подтверждения.</p>' +
      '</div>' +
    '</div>';
  }

  /* --- действия -----------------------------------------------------------
     Заглушки объявлены атрибутом data-soon: обработчик, зовущий Render.soon(),
     прибор считает незарегистрированным действием. */

  function actsBlock(inv) {
    return '<div class="sm-acts">' +
      (inv.due
        ? '<button class="btn btn--primary" data-soon="Онлайн-оплата появится в рабочей версии кабинета">' +
          ic('card') + 'Оплатить остаток ' + esc(fmt.money(inv.due)) + '</button>'
        : '') +
      '<button class="btn btn--secondary" data-soon="Скачивание счёта появится в рабочей версии кабинета">' +
        ic('download') + 'Скачать счёт</button>' +
      '<a class="btn btn--secondary" href="dokumenty.html">' + ic('file-sign') +
        'Справка для налогового вычета</a>' +
    '</div>';
  }

  /* --- история изменений -------------------------------------------------- */

  function historyBlock(inv) {
    if (!inv.history.length) {
      return section({
        title: 'История изменений',
        body: '<div class="card"><div class="card__body">' +
          '<p class="row__title">Цена не менялась с момента назначения</p>' +
          '<p class="muted">Смета зафиксирована ' + esc(fmt.exact(inv.fixedAt)) +
          '. Пересчётов, надбавок и замен услуг после этого не было.</p>' +
        '</div></div>'
      });
    }
    var rows = inv.history.map(function (h) {
      return '<tr>' +
        '<td class="nowrap">' + esc(fmt.exact(h.date)) + '</td>' +
        '<td class="strong">' + esc(h.what) + '</td>' +
        '<td class="muted">' + esc(h.why) + '</td>' +
        '<td class="muted">' + esc(h.approvedBy) + '</td>' +
      '</tr>';
    }).join('');
    return section({
      title: 'История изменений',
      aside: 'Записи сохраняются и не удаляются',
      body: '<div class="card card--table"><div class="table-wrap"><table class="table">' +
        '<thead><tr><th>Дата</th><th>Что изменилось</th><th>Почему</th><th>Кто подтвердил</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>'
    });
  }

  /* --- подвал: с кем говорить о счёте ------------------------------------
     Врача и филиал несёт сам счёт: раньше экран брал их у ближайшей записи,
     то есть догадывался, и на другом человеке мог показать чужого врача. */

  function footBlock(inv) {
    var doctor = null, branch = null;
    w.DATA.doctors({}).forEach(function (d) { if (d.id === inv.doctorId) { doctor = d; } });
    w.DATA.branches().forEach(function (b) { if (b.id === inv.branchId) { branch = b; } });
    if (!branch) { return ''; }
    return '<div class="card sm-foot">' +
      '<div class="sm-foot__cell">' + ic('building') + '<div>' +
        '<p class="label">Клиника</p>' +
        '<p class="row__title">' + esc(branch.title) + '</p>' +
        '<p class="muted">' + esc(branch.city + ', ' + branch.address) + '</p></div></div>' +
      (doctor ? '<div class="sm-foot__cell">' + ic('stethoscope') + '<div>' +
        '<p class="label">Врач</p>' +
        '<p class="row__title">' + esc(doctor.name) + '</p>' +
        '<p class="muted">' + esc(doctor.position) + '</p></div></div>' : '') +
      '<div class="sm-foot__cell">' + ic('message') + '<div>' +
        '<p class="label">Вопросы по счёту</p>' +
        '<p class="row__title">Администратор клиники</p>' +
        '<p class="muted">' + esc(branch.phone + ' · ' + branch.hours) + '</p></div></div>' +
    '</div>';
  }

  /* --- сборка экрана ------------------------------------------------------ */

  function render() {
    var inv = w.DATA.invoice();
    var head = '<h1 class="h1 page__title">Счёт и смета</h1>';
    if (!inv || !inv.lines.length) {
      document.getElementById('page').innerHTML = head + w.Render.emptyState({
        icon: 'invoice',
        title: 'Назначений пока нет',
        text: 'Смета появится после консультации.',
        action: { text: 'Записаться на консультацию', href: 'zapis-novaya.html' }
      });
      return;
    }
    document.getElementById('page').innerHTML = head +
      '<p class="sm-plan">' + esc(inv.planTitle) + '</p>' +
      '<p class="sm-sub">Назначено ' + esc(fmt.exact(inv.assignedAt)) +
        (inv.number ? ' · счёт № ' + esc(inv.number) : '') + '</p>' +
      section({ title: 'Услуги по плану', body: w.Render.invoiceTable(inv) }) +
      totalsBlock(inv) +
      fixBlock(inv) +
      actsBlock(inv) +
      historyBlock(inv) +
      footBlock(inv);
  }

  function init() {
    w.Shell.mount({ active: 'smeta' });
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
