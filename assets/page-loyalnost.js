/* Экран 8 «Программа лояльности».
   Баланс и дата сгорания, виртуальная карта с QR, история операций с
   остатком после каждой, доступные акции с ценой в баллах и черновик
   блока «пригласить знакомого».
   Состояния — по таблице спецификации: новый пациент · баллов нет, история
   есть · баллы скоро сгорают · блок приглашения включён.

   Правила начисления клиника настраивает у себя: экран печатает поля
   rules и ничего к ним не досочиняет — ни курса в рублях, ни исключений.
   Утверждения по таблице состояний — tools/test-loyalnost.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* Подпись строки истории, когда визит не отдаётся швом: собирается из kind,
     а не разбирается из русского текста. */
  var KIND = { earn: 'Оплаченный визит', spend: 'Списание баллов' };
  var OFFER_ICONS = ['sparkle', 'stethoscope', 'drop'];

  var plural = w.Render.fmt.plural;   /* русское число — одним правилом на весь проект */
  function points(n) { return num(n) + ' ' + plural(n, 'балл', 'балла', 'баллов'); }
  function days(n) { return num(n) + ' ' + plural(n, 'день', 'дня', 'дней'); }
  /** Разряды по три: баллы — не деньги, значка валюты у них нет. */
  function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  /* --- виртуальная карта ---------------------------------------------------
     Код рисуется из qrPayload и потому одинаков при каждом открытии. Это
     демонстрационный рисунок, а не рабочий код: настоящий выдаёт касса. */

  function qrSvg(payload) {
    var N = 25, x, y;
    var h = 2166136261;
    for (x = 0; x < payload.length; x++) { h = ((h ^ payload.charCodeAt(x)) * 16777619) >>> 0; }
    var grid = [];
    for (y = 0; y < N; y++) {
      grid[y] = [];
      for (x = 0; x < N; x++) {
        h ^= (h << 13); h >>>= 0; h ^= (h >>> 17); h ^= (h << 5); h >>>= 0;
        grid[y][x] = (h & 1) === 1;
      }
    }
    function finder(ox, oy) {
      for (var j = -1; j <= 7; j++) {
        for (var i = -1; i <= 7; i++) {
          var gx = ox + i, gy = oy + j;
          if (gx < 0 || gy < 0 || gx >= N || gy >= N) { continue; }
          grid[gy][gx] = (i >= 0 && i <= 6 && j >= 0 && j <= 6) &&
            (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
        }
      }
    }
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    var d = '';
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) { if (grid[y][x]) { d += 'M' + x + ' ' + y + 'h1v1h-1z'; } }
    }
    return '<svg class="loy-qr" viewBox="0 0 ' + N + ' ' + N + '" shape-rendering="crispEdges" ' +
      'role="img" aria-label="QR-код карты"><path d="' + d + '" fill="currentColor"/></svg>';
  }

  function cardBlock(l) {
    if (!l.card) { return ''; }
    var branch = w.DATA.branches()[0];
    var patient = w.DATA.patient();
    return section({
      title: 'Виртуальная карта',
      body: '<div class="loy-card">' +
          '<div class="loy-card__grid">' +
            '<div>' +
              '<p class="loy-card__clinic">' + esc(branch ? branch.title : '') + '</p>' +
              '<p class="loy-card__label">Номер карты</p>' +
              '<p class="loy-card__num">' + esc(l.card.number) + '</p>' +
              '<p class="loy-card__who">' + esc(patient ? patient.name : '') + '</p>' +
            '</div>' +
            '<div class="loy-card__qr">' + qrSvg(String(l.card.qrPayload)) + '</div>' +
          '</div>' +
          '<p class="loy-card__hint">' + ic('card') +
            '<span>Предъявите карту на кассе: баллы списывает администратор. ' +
            'Код в прототипе демонстрационный.</span></p>' +
        '</div>'
    });
  }

  /* --- баланс --------------------------------------------------------------- */

  function rulesLine(l) {
    return '<p class="loy-rules">' + ic('invoice') + '<span class="muted">Клиника начисляет ' +
      esc(l.rules.earnPercent) + '% от суммы оплаченного визита, баллы действуют ' +
      esc(days(l.rules.lifetimeDays)) + '. Проценты, сроки и услуги-исключения клиника ' +
      'настраивает у себя.</span></p>';
  }

  function balanceBlock(l) {
    /* Карты нет — пациент ещё ни разу не платил: баланса и карты не показываем. */
    if (!l.card) {
      return section({
        title: 'Баланс',
        body: '<div class="card">' +
            w.Render.emptyState({
              icon: 'sparkle',
              title: 'Баллы появятся после первого оплаченного визита',
              text: 'Клиника начисляет баллы за каждый оплаченный приём.',
              action: { text: 'Записаться', href: 'zapis-novaya.html' }
            }) +
          '</div>' + rulesLine(l)
      });
    }
    var burn = l.expiring
      ? '<p class="loy-burn">' + ic('warn') + '<span><span class="strong">' + esc(points(l.expiring.points)) +
        '</span> сгорают ' + esc(fmt.date(l.expiring.date)) + ', ' + esc(fmt.relative(l.expiring.date)) + '</span></p>'
      : '';
    return section({
      title: 'Баланс',
      body: '<div class="card"><div class="card__body">' +
          '<p class="label">Доступно на счёте</p>' +
          '<p class="loy-balance"><span class="display">' + esc(num(l.balance)) + '</span>' +
          '<span class="muted">' + esc(plural(l.balance, 'балл', 'балла', 'баллов')) + '</span></p>' +
          '<p class="muted">Баллами оплачиваются услуги клиники из списка ниже.</p>' +
          burn +
        '</div></div>' + rulesLine(l)
    });
  }

  /* --- история операций -----------------------------------------------------
     Название визита берётся у записи, если шов её отдаёт; иначе подпись
     собирается по kind. Точные даты — как в смете: здесь важна точность. */

  function historyBlock(l) {
    if (!l.history.length) { return ''; }
    /* Свежее сверху: остаток после каждой операции читается только по времени,
       а шов отдаёт список в своём порядке. Сортируется копия, не данные шва. */
    var list = l.history.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var rows = list.map(function (h) {
      var visit = w.DATA.appointment(h.visitId);
      var sum = h.kind === 'earn'
        ? '<span class="loy-plus">+' + esc(points(h.points)) + '</span>'
        : '<span class="loy-minus">−' + esc(points(h.points)) + '</span>';
      return '<tr><td class="nowrap">' + esc(fmt.exact(h.date)) + '</td>' +
        '<td>' + esc(visit ? visit.service : (KIND[h.kind] || '')) + '</td>' +
        '<td class="num">' + sum + '</td>' +
        '<td class="num">' + esc(num(h.balanceAfter)) + '</td></tr>';
    }).join('');
    return section({
      title: 'История операций',
      aside: 'остаток после каждой',
      body: '<div class="table-wrap"><table class="table">' +
        '<thead><tr><th>Дата</th><th>Визит</th><th class="num">Начислено или списано</th>' +
        '<th class="num">Остаток</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    });
  }

  /* --- акции ----------------------------------------------------------------
     🔴 Две причины недоступности, и одна не заменяет другую. Хватает ли баллов
     — это баланс и цена, и подпись про них стоит всегда. Выключена ли акция —
     это решение клиники (поле available), и оно называется отдельной строкой.
     Раньше выключенная акция стирала подпись про баланс: при 3 285 баллах и
     цене 3 000 экран писал «Сейчас недоступна», не объясняя почему, — и
     противоречил соседним карточкам, где тех же баллов «хватает». */

  function offersBlock(l) {
    if (!l.offers || !l.offers.length) { return ''; }
    var cards = l.offers.map(function (o, i) {
      var short = o.cost - l.balance;
      var enough = short <= 0;
      var open = enough && o.available;
      var state = enough
        ? '<span class="text-accent">' + ic('check', 'ic--sm') + '</span><span class="text-accent">Баллов хватает</span>'
        : '<span class="muted">' + ic('close', 'ic--sm') + '</span><span class="muted">Не хватает ' +
          esc(points(short)) + '</span>';
      var why = o.available ? ''
        : '<p class="loy-offer__state loy-offer__why"><span class="muted">' + ic('clock', 'ic--sm') +
          '</span><span class="muted">Обмен приостановлен клиникой</span></p>';
      var action = open
        ? '<button class="btn btn--primary btn--block loy-offer__act" data-soon="Обмен баллов на услугу">Обменять баллы</button>'
        : '<span class="btn btn--secondary btn--block btn--disabled loy-offer__act" aria-disabled="true">Пока недоступно</span>';
      return '<article class="loy-offer' + (open ? '' : ' loy-offer--off') + '">' +
          '<span class="loy-offer__icon">' + ic(OFFER_ICONS[i % OFFER_ICONS.length]) + '</span>' +
          '<p class="loy-offer__name">' + esc(o.title) + '</p>' +
          '<p class="loy-offer__cost"><span class="time">' + esc(num(o.cost)) + '</span>' +
          '<span class="muted">' + esc(plural(o.cost, 'балл', 'балла', 'баллов')) + '</span></p>' +
          '<p class="loy-offer__state">' + state + '</p>' + why + action +
        '</article>';
    }).join('');
    return section({ title: 'Доступные акции', body: '<div class="loy-offers">' + cards + '</div>' });
  }

  /* --- пригласить знакомого -------------------------------------------------
     Механика с клиникой не обсуждалась, поэтому блок скрыт по умолчанию и
     включается тумблером в панели прототипа. Помечен черновиком. */

  function inviteBlock() {
    if (!w.Store.flags().invite) { return ''; }
    return section({
      title: 'Пригласить знакомого',
      body: '<p class="loy-draft"><span class="badge badge--draft">' + ic('warn', 'ic--sm') +
        'Черновик, с клиникой не согласовано</span></p>' +
        '<div class="card loy-invite">' +
          '<div class="loy-invite__body">' +
            '<p class="row__title">Скидка на диагностику обоим</p>' +
            '<p class="muted">Знакомый приходит по вашей ссылке и получает скидку на первичную ' +
            'диагностику. Такая же скидка приходит вам и действует на следующий визит.</p>' +
            '<p class="loy-invite__no">' + ic('close', 'ic--sm') +
            '<span>Ни денежных выплат, ни кэшбэка — только скидка на услугу</span></p>' +
          '</div>' +
          '<button class="btn btn--primary" data-soon="Ссылка для знакомого">' + ic('clip') + 'Получить ссылку</button>' +
        '</div>'
    });
  }

  /* --- сборка экрана --------------------------------------------------------- */

  function render() {
    var l = w.DATA.loyalty();
    var branch = w.DATA.branches()[0];
    document.getElementById('page').innerHTML =
      '<h1 class="h1 page__title">Программа лояльности</h1>' +
      '<p class="loy-sub">' + esc(branch ? branch.title + ', ' + branch.city : '') +
        '. Суммы и баллы демонстрационные.</p>' +
      '<div class="loy-top">' + balanceBlock(l) + cardBlock(l) + '</div>' +
      historyBlock(l) +
      offersBlock(l) +
      inviteBlock();
  }

  function init() {
    w.Shell.mount({ active: 'loyalnost' });
    /* Тумблер приглашения живёт в панели прототипа и страницу не перечитывает:
       блок появляется и исчезает здесь, по событию его собственного поля. */
    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'proto-invite') { render(); }
    });
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
