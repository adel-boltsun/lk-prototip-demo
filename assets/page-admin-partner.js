/* Экран 9 «Карточка партнёра» — панель клиники.
   Реестр отвечает «кто у нас есть», табло — «что происходит со всеми
   заявками». Вопрос «что у нас с ЭТИМ врачом» до сих пор не отвечал никто.

   Пять решений, ради которых экран собран, и блок под каждое:
   1. Позвонить или нет — полоса молчания и столбики по месяцам.
   2. Что ответить партнёру, который звонит про своего пациента, — таблица
      его направлений с раскрытием пути.
   3. Где теряются его пациенты — воронка потока с потерями и причинами.
   4. Сколько мы ему должны — деньги и история начислений.
   5. Оставлять ли доступ — плашка доступа и кнопка в шапке.
   Блока, не привязанного ни к одному решению, здесь нет: истории касаний,
   задач, напоминаний и тегов — то есть CRM — клиника не просила.

   🔴 Вес держат два блока, и остальное их обслуживает. Воронка — единственное
   место во всём прототипе, где видно, на каком шаге теряются пациенты
   конкретного врача, и чья это сторона. Линейка сравнения — то, что делает
   экран управленческим, а не справочным: без неё цифры есть, а делать с ними
   нечего. Шапка, таблица, деньги и месяцы стоят тише и перетягивать не должны.

   ⚠️ Воронка обещает промежуточные статусы, которых 1С может не отдавать —
   у клиники это не подтверждено. Оговорка стоит прямо под воронкой, а не
   в наших заметках: обещать на показе то, чего не будет в продакшне, дороже,
   чем не обещать.

   🔴 Ставку начисления экран не печатает и не считает: и число, и слова про
   его демонстрационность приходят из шва (DATA.partnerMoney().rule). Своя
   копия «10 %» разошлась бы со ставкой при первой же её правке, а голая
   сумма читается как согласованное клиникой правило.

   Данные только через DATA: карточка — partnerCard, воронка — partnerFlow,
   линейка — partnerRank, столбики — partnerMonths, деньги — partnerMoney,
   направления — referrals({doctor}). Общие блоки — заголовок секции,
   полоса-пояснение, карточка на зонах, якорь, таблица на зонах, лестница
   статусов, плашка и короткая форма начисления — живут в Render.

   Утверждения по составу — tools/test-admin-partner.html. */
(function (w) {
  'use strict';

  var UNKNOWN = '[уточняется]';
  /* Сколько направлений показывает карточка. Она про врача, а не про поток:
     полный список с отбором и сменой статуса живёт на табло заявок, и ссылка
     туда стоит под таблицей. */
  var SHOWN = 6;
  /* Верх линейки сравнения. Шкала обязана быть одной и той же на всех
     карточках: подвинутая под лучшего, она делает 25 % то серединой, то
     краем, и сравнивать карточки между собой становится нельзя. */
  var SCALE_STEP = 20;
  var SCALE_MIN = 60;

  /* Подписи ступеней воронки. Это НАШИ слова про поток, а не названия статусов
     клиники: те принадлежат ей и живут в DATA.statuses(). «Записались» — про
     людей, «Записан» — про направление, и путать их нельзя. */
  var FUNNEL = [
    { id: 'created', title: 'Направлено' },
    { id: 'booked', title: 'Записались' },
    { id: 'served', title: 'Дошли · услуга оказана' },
    { id: 'accrued', title: 'Бонус начислен' }
  ];
  var GAP_WORDS = {
    created: 'направлением и записью',
    booked: 'записью и приёмом',
    served: 'услугой и начислением'
  };
  /* Причины, которые стоят на НАШЕЙ стороне. Ровно они превращают воронку из
     упрёка врачу в задачу клинике: пациент, который ждёт записи, не дошёл
     не потому, что врач плохо направил. */
  var OURS = { waiting: true, pending: true, unpaid: true };

  var fmt = w.Render.fmt;
  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }
  function pl(n, a, b, c) { return fmt.plural(n, a, b, c); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  /* Дата без года: в причине потери год не несёт смысла и удлиняет строку,
     которая и так стоит рядом с полосой. */
  function short(iso) { return fmt.exact(iso).slice(0, 5); }
  function days(n) { return n + ' ' + pl(n, 'день', 'дня', 'дней'); }
  function refs(n) { return n + ' ' + pl(n, 'направление', 'направления', 'направлений'); }

  /* Кого показываем и куда возвращаем. Обе точки входа приходят адресом:
     строка реестра и фамилия в колонке «направил» на табло. Возврат разный,
     и это не украшение — администратор работал со своим отбором и обязан
     вернуться к нему, а не в чужой список. */
  var BACK = {
    reestr: { href: 'admin-partnery.html', title: 'Реестр партнёров' },
    tablo: { href: 'admin-tablo.html', title: 'Табло заявок' }
  };
  function asked(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(w.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function backTo() { return BACK[asked('iz')] || BACK.reestr; }

  /* Кто открыт. Без адреса — первый партнёр реестра: экран, открытый по
     ссылке из меню или прибором, обязан показывать себя, а не пустоту. */
  function whoId() {
    var id = asked('vrach');
    var list = w.DATA.partners();
    var found = '';
    list.forEach(function (p) { if (p.id === id) { found = p.id; } });
    if (found) { return found; }
    return id ? id : (list.length ? list[0].id : '');
  }

  /* Итог последней выгрузки живёт в памяти страницы: это не состояние
     прототипа, а сообщение о том, что щелчок сработал. */
  var said = '';
  var open = '';
  var id = '';

  /* --- шапка ------------------------------------------------------------- */

  function contact(icname, label, value) {
    return '<p class="pk-contact"><span class="pk-contact__ic">' + ic(icname, 'ic--sm') + '</span>' +
      '<span class="label">' + esc(label) + '</span>' +
      '<span class="pk-contact__val">' + w.Render.soft(value || UNKNOWN) + '</span></p>';
  }

  /** Правая зона шапки: с какого числа партнёр и что с ним можно сделать.

      🔴 Заглушка вместо даты — честная и объяснённая. У демонстрационных
      партнёров даты подтверждения в данных не проставлено, и подставить
      правдоподобное число нельзя: это выдуманный факт о клинике. Строка
      снизу говорит, чего именно нет, и кто подтверждал заявку. */
  function sinceZone(p) {
    var has = !!p.confirmedAt;
    return '<p class="label">Партнёр с</p>' +
      '<span class="pk-since' + (has ? '' : ' pk-since--none') + '">' +
        esc(has ? fmt.exact(p.confirmedAt) : UNKNOWN) + '</span>' +
      '<span class="pk-since__note">' +
        esc((has ? '' : 'Даты подтверждения в данных нет. ') +
            'Заявку подтвердил ' + String(p.confirmedBy || '').toLowerCase()) + '</span>' +
      '<span class="pk-acts">' +
        '<button class="btn btn--primary" type="button" data-act="vygruzit">' +
          ic('download', 'ic--sm') + 'Выгрузить направления</button>' +
        '<button class="btn btn--secondary" type="button" data-act="dostup">' +
          ic('lock', 'ic--sm') +
          (p.access === 'paused' ? 'Вернуть доступ' : 'Приостановить доступ') + '</button>' +
      '</span>';
  }

  function head(p) {
    var badge = p.access === 'paused'
      ? '<span class="badge badge--off">Доступ приостановлен</span>'
      : '<span class="badge badge--ok">Доступ открыт</span>';
    return w.Render.zoneCard({
      cls: 'pk-head',
      zones: [
        { body: '<p class="label">Карточка партнёра</p>' +
                '<h1 class="pk-name">' + esc(p.name) + '</h1>' +
                '<p class="pk-where">' + esc(p.specialty || UNKNOWN) + ' · ' +
                  esc(p.workplace || UNKNOWN) + '</p>' +
                '<p class="pk-badge">' + badge + '</p>' },
        { body: contact('phone', 'Телефон', p.phone) + contact('mail', 'Почта', p.email) },
        { body: sinceZone(p) }
      ]
    });
  }

  /** Партнёр замолчал. Не «последнее направление 06.08», а «ни одного
      направления 29 дней»: срок молчания — это и есть повод звонить, а дата
      сама по себе ещё ни о чём не говорит. */
  function quiet(flow) {
    if (!flow.silent) { return ''; }
    return '<p class="pk-quiet"><span class="pk-quiet__ic">' + ic('warn') + '</span>' +
      '<span>' + esc('Ни одного направления ' + days(flow.silentDays) +
        '. Последнее — ' + fmt.exact(flow.lastAt) + '.') + '</span></p>';
  }

  /* --- воронка потока ---------------------------------------------------- */

  /** Причина потери словами. Единственный случай называет свою дату и срок:
      «1 записан 28.07, запись не двигается 38 дней» — это уже повод пойти
      в регистратуру, а «1 записан» — ещё нет. */
  function why(x) {
    var n = x.count;
    if (x.id === 'waiting') { return n + ' ' + pl(n, 'ждёт', 'ждут', 'ждут') + ' записи в клинике'; }
    if (x.id === 'cancelled') { return n + ' отменено'; }
    if (x.id === 'noshow') { return n + ' не ' + pl(n, 'дошёл', 'дошли', 'дошли'); }
    if (x.id === 'pending') {
      return n === 1 && x.at
        ? '1 записан ' + short(x.at) + ', запись не двигается ' + days(x.days)
        : n + ' ' + pl(n, 'записан', 'записаны', 'записаны') + ', приём ещё впереди';
    }
    return n === 1 && x.at
      ? '1 услуга оказана ' + short(x.at) + ', начисление не проведено'
      : n + ' ' + pl(n, 'услуга оказана', 'услуги оказаны', 'услуг оказано') +
        ', начисление не проведено';
  }

  function gapWords(gap) {
    return gap.reasons.map(why).join(' · ');
  }

  function funnelRow(step, i, gap) {
    var loss = (gap && gap.lost)
      ? '<span class="pk-fn__loss"><span class="pk-fn__minus">−' + gap.lost + '</span>' +
        '<span class="pk-fn__why">' + esc(gapWords(gap)) + '</span></span>'
      : '<span></span>';
    return '<div class="pk-fn" data-step="' + esc(step.id) + '">' +
      '<span class="pk-fn__label">' + esc(FUNNEL[i].title) + '</span>' +
      '<span class="pk-fn__num">' + step.count + '</span>' +
      '<span class="pk-fn__pct">' + pct(step.share) + '</span>' +
      '<span class="pk-fn__bar"><span class="pk-fn__fill" style="width: ' +
        (Math.round(step.share * 1000) / 10) + '%"></span></span>' + loss + '</div>';
  }

  /** Полоса под воронкой: где теряется больше всего, чья это сторона и
      оговорка про 1С. Сторона названа вслух намеренно — иначе воронка
      читается как счёт к врачу, а половина потерь стоит у нас. */
  function funnelNote(flow) {
    var worst = null;
    flow.gaps.forEach(function (g) { if (!worst || g.lost > worst.lost) { worst = g; } });
    var text;
    if (!worst || !worst.lost) {
      text = 'Потерь между ступенями нет.';
    } else {
      text = 'Больше всего теряется между ' + GAP_WORDS[worst.after] + ': ' +
        worst.lost + ' из ' + flow.total + '.';
      var ours = worst.reasons.filter(function (x) { return OURS[x.id]; });
      if (ours.length) {
        text += ' ' + ours.map(why).join(' · ') + ' — это наша сторона, не врача.';
      }
    }
    return w.Render.hintBar({
      icon: 'navigation', cls: 'pk-fn-note',
      text: text + ' Промежуточные статусы 1С пока не подтверждены.'
    });
  }

  /* 🔴 Собственная сетка кладётся в `.card__body`, а не прямо в `.card`.
     `.card` в каноне не несёт отступов вовсе — только фон, рамку и скругление;
     отступы даёт `.card__body` или модификатор (`--table`, `--zones`). Четыре
     блока этого экрана клали сетку прямо в карточку, и всё содержимое сидело
     на рамке в 1 px — на всех тринадцати ширинах матрицы. Прибор молчал: за
     край страницы ничего не уходило, в ячейки всё влезало. Теперь это меряет
     Shell.flush(). */
  function funnel(flow) {
    return '<div class="card"><div class="card__body"><div class="pk-funnel">' +
      flow.steps.map(function (s, i) {
        return funnelRow(s, i, i ? flow.gaps[i - 1] : null);
      }).join('') + '</div>' + funnelNote(flow) + '</div></div>';
  }

  /* --- среди партнёров --------------------------------------------------- */

  /** Место в ряду словами. «2-е место из 6» и «делит 3–6-е место из 6» —
      разные ответы: во втором случае звонить этому врачу не срочнее, чем
      ещё троим, и администратор обязан это видеть. */
  function place(rank) {
    var last = rank.place + rank.shared;
    return (rank.shared > 0
      ? 'делит ' + rank.place + '–' + last + '-е место'
      : rank.place + '-е место') +
      ' из ' + rank.total + ' ' + pl(rank.total, 'партнёра', 'партнёров', 'партнёров');
  }

  /** Группы точек: партнёры с одной и той же долей стоят в одной точке, и
      подпись у них общая. Шесть подписей на шесть партнёров налезли бы друг
      на друга — а четверо из них стоят на одном значении. */
  function marks(rank) {
    var best = Math.round(rank.best * 100), out = [];
    rank.points.forEach(function (p) {
      var key = Math.round(p.share * 100), g = null;
      out.forEach(function (x) { if (x.key === key) { g = x; } });
      if (!g) { g = { key: key, n: 0, mine: false }; out.push(g); }
      g.n++;
      if (p.mine) { g.mine = true; }
    });
    out.forEach(function (g) {
      if (g.mine) {
        g.title = g.n > 1
          ? 'этот врач и ещё ' + (g.n - 1) + ' ' + pl(g.n - 1, 'партнёр', 'партнёра', 'партнёров')
          : 'этот врач';
      } else if (g.key === best) {
        g.title = 'лучший';
      } else {
        g.title = g.n + ' ' + pl(g.n, 'партнёр', 'партнёра', 'партнёров');
      }
      g.title += ' · ' + g.key + '%';
    });
    return out;
  }

  function scale(rank) {
    var top = Math.max(SCALE_MIN, Math.ceil(rank.best * 100 / SCALE_STEP) * SCALE_STEP);
    function at(share) { return (Math.round(share * 100 * 1000 / top) / 10) + '%'; }
    /* Крайние подписи прижимаются к концу линейки, а не центрируются по
       своей доле: центрированная подпись у «0 %» уезжает половиной за её
       начало, а у последнего деления — за конец, и линейка становится шире
       собственной коробки. Класс, а не инлайновый стиль: оформление живёт
       в <style> страницы, из скрипта едет только доля. */
    function side(v) {
      return v <= 6 ? ' is-start' : (v >= 94 ? ' is-end' : '');
    }
    var ticks = '';
    for (var v = 0; v <= top; v += SCALE_STEP) {
      var x = v * 100 / top;
      ticks += '<span class="pk-scale__tick" style="left: ' + x + '%"></span>' +
        '<span class="pk-scale__tick-txt' + side(x) + '" style="left: ' + x + '%">' + v + '%</span>';
    }
    var dots = rank.points.map(function (p) {
      return '<span class="pk-scale__dot' + (p.mine ? ' is-mine' : '') +
        '" style="left: ' + at(p.share) + '"></span>';
    }).join('');
    var tags = marks(rank).map(function (g) {
      var x = g.key / top;
      return '<span class="pk-scale__mark' + (g.mine ? ' is-mine' : '') + side(x * 100) +
        '" style="left: ' + at(g.key / 100) + '">' + esc(g.title) + '</span>';
    }).join('');
    return '<div class="pk-scale"><div class="pk-scale__line">' + ticks + tags + dots +
      '<span class="pk-scale__avg" style="left: ' + at(rank.average) + '"></span>' +
      '<span class="pk-scale__avg-txt" style="left: ' + at(rank.average) + '">' +
        esc('средняя ' + pct(rank.average)) + '</span></div></div>';
  }

  /** ⚠️ Подпись про шумное среднее остаётся на экране всегда. Партнёров в
      демо шесть, и доля, посчитанная на таком числе, гуляет от одного
      направления: показывать её без этой строки — обещать точность,
      которой нет. */
  function compare(rank) {
    return '<div class="card"><div class="card__body"><div class="pk-cmp">' +
      '<div>' + w.Render.anchor({ value: pct(rank.share), note: 'дошли до оказанной услуги' }) +
        '<span class="pk-place">' + esc(place(rank)) + '</span>' +
        '<span class="pk-cmp-small">' + esc('средняя ' + pct(rank.average) +
          ' · лучший ' + pct(rank.best)) + '</span></div>' +
      scale(rank) + '</div>' +
      w.Render.hintBar({
        cls: 'pk-cmp-note',
        text: 'Доля считается по направлениям, дошедшим до оказанной услуги. ' +
          'Партнёров в программе ' + rank.total + ' — среднее на таком числе шумное, ' +
          'числа демонстрационные.'
      }) + '</div></div>';
  }

  /* --- направлений по месяцам -------------------------------------------- */

  function months(list, flow, p) {
    var top = 1;
    list.forEach(function (m) { if (m.count > top) { top = m.count; } });
    var bars = list.map(function (m) {
      var h = m.count ? Math.max(8, Math.round(m.count * 100 / top)) : 0;
      return '<div class="pk-mo"><span class="pk-mo__col">' +
        '<span class="pk-mo__num">' + m.count + '</span>' +
        '<span class="pk-mo__bar' + (m.count ? '' : ' is-zero') + '"' +
          (m.count ? ' style="height: ' + h + '%"' : '') + '></span></span>' +
        '<span class="pk-mo__title">' + esc(m.title) + '</span></div>';
    }).join('');
    var now = list[list.length - 1];
    var text = flow.firstAt ? 'Первое направление ' + fmt.exact(flow.firstAt) + '.' : '';
    text += now.count
      ? ' Текущий месяц идёт: ' + refs(now.count) + ', последнее ' + fmt.exact(flow.lastAt) + '.'
      : ' В текущем месяце направлений нет.';
    if (!p.confirmedAt) {
      text += ' Дата подтверждения партнёра в данных не проставлена — ' + UNKNOWN + '.';
    }
    return '<div class="card"><div class="card__body"><div class="pk-months">' + bars + '</div>' +
      w.Render.hintBar({ icon: 'clock', cls: 'pk-mo-note', text: text }) + '</div></div>';
  }

  /* --- деньги ------------------------------------------------------------ */

  function op(x) {
    return '<div class="pk-op"><span class="muted">' + esc(fmt.exact(x.at)) + '</span>' +
      '<span>' + esc(x.number) + '</span>' +
      '<span class="pk-op__sum">' + esc(fmt.money(x.bonus)) + '</span>' +
      '<span class="pk-op__state ' + (x.paid ? 'is-paid' : 'is-wait') + '">' +
        ic(x.paid ? 'check' : 'clock', 'ic--sm') +
        esc(x.paid ? 'выплачено' : 'ждёт выплаты') + '</span></div>';
  }

  /** 🔴 Числа начисления выходят только вместе с правилом, и правило приходит
      из шва целиком — вместе со словом о том, что ставка демонстрационная.
      Экран его не составляет и процента не печатает. */
  function money(m) {
    return '<div class="card"><div class="card__body">' +
      '<div class="pk-money">' +
        '<div class="pk-money__cell">' +
          w.Render.anchor({ value: fmt.money(m.servicesSum), note: 'Сумма услуг по его пациентам' }) + '</div>' +
        '<div class="pk-money__cell">' +
          w.Render.anchor({ value: fmt.money(m.accrued), note: 'Начислено всего' }) + '</div>' +
        '<div class="pk-money__cell">' +
          w.Render.anchor({ value: fmt.money(m.pending), note: 'Ждёт выплаты' }) + '</div>' +
      '</div>' +
      w.Render.hintBar({ cls: 'pk-money-note', text: 'Правило начисления: ' + m.rule + '.' }) +
      '<p class="label">История начислений</p>' +
      (m.items.length
        ? '<div class="pk-ops">' + m.items.map(op).join('') + '</div>'
        : '<p class="muted">Начислений по этому партнёру ещё не было.</p>') +
    '</div></div>';
  }

  /* --- его пациенты ------------------------------------------------------ */

  var COLS = [
    { title: 'Пациент', cls: 'pk-z1' },
    { title: 'Клиника', cls: 'pk-z2' },
    { title: 'Услуга', cls: 'pk-z3' },
    { title: 'Направлен', cls: 'pk-z4' },
    { title: 'Статус', cls: 'pk-z5' },
    { title: 'Сумма', cls: 'pk-z6', num: true },
    { title: 'Начислено', cls: 'pk-z7', num: true }
  ];

  /** Полоса раскрытия: одна строка про направление, лестница в ряд и — если
      есть — что с ним делать. Комментариев и журнала здесь нет: карточка про
      врача, а глубина по одному направлению живёт на табло заявок, куда
      уводит ссылка под таблицей. Полная карточка направления роняла бы
      таблицу партнёра на два экрана вниз и перетягивала бы с воронки. */
  function band(r) {
    return '<div class="pk-band">' +
      '<p class="pk-band__line">' + esc(r.number + ' · ' + r.patientName +
        (r.patientAge ? ', ' + fmt.years(r.patientAge) : '') + ' · ' + r.serviceTitle +
        (r.servicePrice ? ', ' + fmt.money(r.servicePrice) : '') + ' · ' + r.clinicCity) + '</p>' +
      w.Render.referralLadder(r, { row: true }) +
      (r.stuck
        ? '<p class="pk-band__stuck">' + ic('warn', 'ic--sm') + '<span>' + esc(r.stuck) + '</span></p>'
        : '') + '</div>';
  }

  function table(list, whole) {
    var bonus = w.Render.referralBonusColumn(list, { bar: true, barCls: 'pk-note' });
    return w.Render.zoneTable({
      cls: 'pk-table',
      cols: COLS,
      toggle: 'stroka',
      rows: list.map(function (r) {
        return {
          id: r.id, label: r.patientName, open: open === r.id, band: band(r),
          cells: [
            '<span class="pk-cell pk-cell--name">' + esc(r.patientName) + '</span>',
            '<span class="pk-cell pk-cell--quiet">' + esc(r.clinicCity) + '</span>',
            '<span class="pk-cell">' + esc(r.serviceTitle) + '</span>',
            '<span class="pk-cell">' + esc(fmt.exact(r.createdAt)) + '</span>',
            w.Render.referralBadge(r),
            r.amount ? esc(fmt.money(r.amount)) : '<span class="pk-dash">—</span>',
            bonus.cell(r) || '<span class="pk-dash">—</span>'
          ]
        };
      }),
      foot: {
        left: esc(list.length === whole
          ? 'Показаны все ' + refs(whole)
          : 'Показаны ' + list.length + ' из ' + refs(whole)),
        right: '<a href="admin-tablo.html">Открыть все на табло заявок ' +
          ic('arrow-right', 'ic--sm') + '</a>'
      }
    }) + bonus.footnote;
  }

  /* --- сборка ------------------------------------------------------------ */

  function lost() {
    return '<div class="card pk-nothing">' + w.Render.emptyState({
      round: true, icon: 'user',
      title: 'Такого партнёра в реестре нет',
      text: 'Ссылка ведёт на врача, которого клиника не подтверждала или которого ' +
        'уже нет в программе.',
      action: { href: 'admin-partnery.html', text: 'Открыть реестр партнёров', cls: 'btn--secondary' }
    }) + '</div>';
  }

  function empty() {
    return '<div class="card pk-nothing">' + w.Render.emptyState({
      round: true, icon: 'clipboard',
      title: 'Направлений от этого врача ещё не было',
      text: 'Партнёр подтверждён, но пока не направил ни одного пациента. Поток, ' +
        'сравнение и деньги появятся с первым направлением.'
    }) + '</div>';
  }

  function body(p) {
    var flow = w.DATA.partnerFlow(p.id);
    if (!flow.total) { return head(p) + empty(); }
    var rank = w.DATA.partnerRank(p.id);
    var all = w.DATA.referrals({ doctor: p.id });
    var shown = all.slice(0, SHOWN);
    return head(p) + quiet(flow) +
      w.Render.section({
        title: 'Поток пациентов',
        aside: refs(flow.total) + ', первое ' + fmt.exact(flow.firstAt),
        body: funnel(flow)
      }) +
      (rank ? w.Render.section({
        title: 'Среди партнёров', aside: 'доля дошедших до услуги', body: compare(rank)
      }) : '') +
      '<div class="pk-row">' +
        w.Render.section({
          title: 'Направлений по месяцам', aside: 'полгода',
          body: months(w.DATA.partnerMonths(p.id), flow, p)
        }) +
        w.Render.section({
          title: 'Деньги', aside: 'демонстрационные суммы',
          body: money(w.DATA.partnerMoney(p.id))
        }) +
      '</div>' +
      w.Render.section({
        title: 'Его пациенты', aside: refs(all.length) + ' · свежие сверху',
        body: table(shown, all.length)
      });
  }

  /* --- раскладка подписей линейки ----------------------------------------
     Подписи стоят от своих долей, и на близких долях их коробки сходятся:
     «этот врач и ещё 3 партнёра · 25 %» и «1 партнёр · 36 %» стояли друг
     на друге на всей полосе 1150–1440. Медиазапросом это не лечится — доли
     задаёт фактура, а не ширина окна: два партнёра с близкими долями сведут
     подписи и на 2560.

     Считать ширину подписи заранее нельзя: её задают шрифт и кегль. Поэтому
     раскладываем после вёрстки — слева направо, каждая подпись садится в самый
     нижний ряд, где до соседа остаётся зазор. Проход зовут два раза: сам
     экран после отрисовки и каркас на каждом изменении ширины окна — до того,
     как снимет замер. */
  var MARK_GAP = 12;

  function spread() {
    var box = document.querySelector('.pk-scale');
    if (!box) { return; }
    var marks = box.querySelectorAll('.pk-scale__mark'), i, list = [];
    if (!marks.length) { return; }
    /* Сброс до замера: ряды прошлого прохода подняли бы коробки, и следующий
       считал бы зазоры по уже разложенному. */
    box.style.removeProperty('--rows');
    for (i = 0; i < marks.length; i++) {
      marks[i].style.removeProperty('--row');
      list.push(marks[i]);
    }
    var boxes = [];
    list.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width) { boxes.push({ el: el, r: r }); }
    });
    if (!boxes.length) { return; }
    boxes.sort(function (a, b) { return a.r.left - b.r.left; });
    var rows = [];   /* правый край последней подписи в каждом ряду */
    boxes.forEach(function (b) {
      var n = 0;
      while (n < rows.length && b.r.left < rows[n] + MARK_GAP) { n++; }
      rows[n] = b.r.right;
      if (n) { b.el.style.setProperty('--row', n); }
    });
    box.style.setProperty('--rows', rows.length);
  }

  function render() {
    var back = backTo();
    var p = w.DATA.partnerCard(id);
    document.getElementById('page').innerHTML =
      '<p><a class="pk-back" href="' + back.href + '">' +
        '<span class="pk-back__arrow" aria-hidden="true">←</span>' + esc(back.title) + '</a></p>' +
      (p ? body(p) : lost()) +
      (said ? '<p class="muted">' + esc(said) + '</p>' : '');
    spread();
  }

  /* --- действия ---------------------------------------------------------- */

  function quote(v) {
    return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
  }

  /** Выборка врача файлом. Начисление уходит вместе со своей подписью
      отдельной колонкой: голое число и в файле читается как согласованная
      клиникой ставка. Подпись берётся у того же блока Render, что и на экране. */
  function csv(p, list) {
    var head = ['Номер', 'Пациент', 'Телефон', 'Клиника', 'Услуга', 'Направлен',
      'Статус', 'Сумма услуги', 'Начислено', 'Подпись к начислению'];
    var rows = list.map(function (r) {
      var has = r.bonus !== null && r.bonus !== undefined;
      return [r.number, r.patientName, r.patientPhone, r.clinicCity, r.serviceTitle,
        fmt.exact(r.createdAt), w.Render.referralStatusTitle(r.status),
        r.amount ? r.amount : '', has ? r.bonus : '',
        has ? w.Render.referralBonusNote(r) : ''].map(quote).join(';');
    });
    return [head.map(quote).join(';')].concat(rows).join('\r\n');
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function vygruzit() {
    var p = w.DATA.partnerCard(id);
    var list = p ? w.DATA.referrals({ doctor: id }) : [];
    if (!list.length) {
      said = 'Выгружать нечего: направлений от этого врача ещё не было.';
      render();
      return;
    }
    var name = 'partner-' + id + '-' + stamp() + '.csv';
    var url = w.URL.createObjectURL(new w.Blob(['﻿' + csv(p, list)], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    w.URL.revokeObjectURL(url);
    /* Файл уходит на диск молча: без строки на экране щелчок выглядит так,
       будто ничего не произошло. */
    said = 'Выгружено строк: ' + list.length + ' — файл ' + name;
    render();
  }

  /** Приостановить доступ и вернуть. Решение пишет шов и кладёт его в Store,
      поэтому оно переживает перезагрузку — как и остальные решения клиники. */
  function dostup() {
    var p = w.DATA.partnerCard(id);
    if (!p) { return; }
    var now = w.DATA.setPartnerAccess(id, p.access === 'paused');
    said = now && now.access === 'paused'
      ? 'Доступ приостановлен. Врач не сможет направлять, пока клиника не вернёт доступ.'
      : 'Доступ открыт: врач снова может направлять пациентов.';
    render();
  }

  function stroka(btn) {
    var next = btn.getAttribute('data-id');
    open = open === next ? '' : next;
    render();
  }

  function init() {
    /* Сценарий чужой роли уводит на её главную: рисовать себя поверх
       уходящей страницы нельзя. Тот же выход у табло и реестра. */
    if (!w.Shell.mount({ active: 'admin-partnery', role: 'admin' })) { return; }
    w.Shell.on('vygruzit', vygruzit);
    w.Shell.on('dostup', dostup);
    w.Shell.on('stroka', stroka);
    /* Раскладку подписей пересчитывает каркас на каждом изменении ширины —
       до того, как снимет замер: иначе прибор мерил бы вчерашние ряды. */
    w.Shell.onLayout(spread);
    id = whoId();
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
