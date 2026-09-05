/* Экран 2 «Главная кабинета врача-партнёра».
   Две половины, ради которых кабинет существует, стоят рядом и равны по весу:
   что стало с пациентами и сколько начислено. Под ними — кто застрял и что
   с этим делать, и три последних направления. Главное действие экрана —
   «Направить пациента».

   🔴 Экран приведён к общему виду кабинета: композицию дают приёмы render.js,
   а не своя разметка. Что поменялось против сборки от 02.09:

   1. Крупные числа плиток — общий приём Render.anchor. Своей тройки
      «подпись · число · тихая строка» у экрана больше нет: она уже стояла
      здесь, на карточке партнёра и на заявке модерации тремя разными
      наборами классов.
   2. Оговорки под числами — общий приём Render.hintBar. Прежде это был
      обычный абзац петитом, и подпись про демонстрационную ставку читалась
      как продолжение суммы, а не как оговорка к ней.
   3. «Требует внимания» — карточки на зонах (Render.zoneCard) с якорем
      срока слева, как заявка на модерации: строка списка не давала месту,
      где нужно действие врача, никакого веса.
   4. «Последние направления» — та же таблица на зонах (Render.zoneTable),
      что и «Мои направления», только без раскрытия и без денег. Главная и
      список теперь читаются одним экраном, а не двумя разными.
   5. Первый шаг нового партнёра — общий приём Render.emptyState в круглом
      варианте, тот же, что у пустого списка направлений.

   Состояния — по таблице спецификации, экран 2: активный партнёр и новый.
   Данные только через DATA, повторяющиеся блоки — через Render.
   Утверждения по таблице состояний — tools/test-vrach.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* Плашка статуса — общая, Render.referralBadge. Своей карты тонов у экрана
     нет: она уже разъезжалась с таблицей направлений, и один и тот же статус
     оказывался на соседних экранах разного цвета. */
  function badge(r) { return w.Render.referralBadge(r); }

  /* Таблица направлений раскрывает карточку по слоту — тому же, который
     пишет сама. Ссылка «требует внимания» ведёт не в общий список,
     а в раскрытое направление. */
  var ZAYAVKI = 'vrach-zayavki.html';
  var NAPRAVIT = 'vrach-napravlenie.html';
  var OPEN_SLOT = 'zayavki:open';

  /* Положение статуса на лестнице. Порядок ступеней берётся из DATA: своей
     копии лестницы у экрана нет, иначе он начнёт считать «дошло» по одному
     перечню, а таблица направлений — по другому. */
  function ladder() {
    var out = [];
    (w.DATA.statuses() || []).forEach(function (s) { if (s.step) { out.push(s.id); } });
    return out;
  }

  function counts(list) {
    var steps = ladder();
    var served = steps.indexOf('served'), accrued = steps.indexOf('accrued');
    var c = { all: list.length, arrived: 0, care: 0, closed: 0, way: 0, off: 0 };
    list.forEach(function (r) {
      var n = steps.indexOf(r.status);
      /* Не дошёл и отменено лестницу обрывают, а не стоят на ней: в «ещё
         в пути» им места нет — они закрыты, и экран показывает их отдельно. */
      if (n < 0) { c.off++; return; }
      if (n < served) { c.way++; return; }
      c.arrived++;
      if (n === served) { c.care++; }
      if (n === accrued) { c.closed++; }
    });
    return c;
  }

  /** Сколько дней прошло с даты. Тот же счёт, что у срока заявки в очереди
      модерации: якорь с числом дней имеет смысл только там, где число
      считается одинаково на всех экранах кабинета. */
  function since(iso) {
    if (!iso) { return '[уточняется]'; }
    var a = new Date(iso); a.setHours(0, 0, 0, 0);
    var b = new Date(); b.setHours(0, 0, 0, 0);
    var n = Math.round((b - a) / 86400000);
    if (n <= 0) { return 'сегодня'; }
    return n + ' ' + fmt.plural(n, 'день', 'дня', 'дней');
  }

  /** Обращение к партнёру: имя и отчество из карточки. Врач-партнёр здесь
      один, DATA.people() в этом шве нет — и Shell.greetName зовёт именно её,
      поэтому имя собирается здесь, а не общей функцией каркаса. */
  function greetName(p) {
    var parts = String(p && p.name ? p.name : '').trim().split(/\s+/);
    if (parts.length >= 3) { return parts[1] + ' ' + parts[2]; }
    if (parts.length === 2) { return parts[1]; }
    return parts[0] || '';
  }

  /* --- плитка: ведущий якорь, ряд якорей помельче, оговорки полосами ------
     Приём Render.anchor даёт «подпись · крупное число · тихая строка» и
     называет их одинаково на всех экранах. Экран отдаёт только композицию:
     ведущее число полосой во всю ширину, остальные — рядом ячеек с
     волосяными линиями, оговорки — полосами в подвале карточки. */

  function cell(label, value, note) {
    return w.Render.anchor({ cls: 'vr-tile__cell', label: label, value: value, note: note });
  }

  function tile(o) {
    return '<article class="card vr-tile">' +
      w.Render.anchor({ cls: 'vr-tile__lead', label: o.leadLabel, value: o.lead, note: o.leadNote }) +
      '<div class="vr-tile__grid' + (o.cells.length === 2 ? ' vr-tile__grid--pair' : '') + '">' +
        o.cells.join('') +
      '</div>' +
      '<div class="vr-tile__foot">' +
        o.notes.map(function (n) {
          return w.Render.hintBar({ icon: n.icon || 'message', text: n.text });
        }).join('') +
        '<p class="vr-tile__more"><a class="act" href="' + esc(o.href) + '">' +
          esc(o.link) + ic('arrow-right', 'ic--sm') + '</a></p>' +
      '</div>' +
    '</article>';
  }

  /** Что стало с остальными. Одной фразой это сказать нельзя: «ещё в пути»
      про не дошедшего и отменённое — неправда, и тот же экран строкой ниже
      показывает их в «требует внимания». Поэтому две полосы, а не одна. */
  function tailNotes(c, empty) {
    if (empty) {
      return [{ icon: 'calendar-plus',
        text: 'Цифры появятся, как только клиника примет первого направленного пациента.' }];
    }
    var notes = [];
    if (c.way) {
      notes.push({ icon: 'clock',
        text: 'Ещё в пути: ' + c.way + '. Клиника записывает их и ведёт до приёма.' });
    }
    if (c.off) {
      notes.push({ icon: 'warn',
        text: 'Не дошли или отменены: ' + c.off + '. Они в блоке «требует внимания».' });
    }
    if (!notes.length) { notes.push({ icon: 'check', text: 'Все направления дошли до клиники.' }); }
    return notes;
  }

  /** Подпись справа от линейки: сколько направлений и когда было первое.
      Тот же приём, что на карточке партнёра в панели клиники. */
  function flowAside(list) {
    if (!list.length) { return 'направлений пока нет'; }
    var first = list[list.length - 1];
    return list.length + ' ' +
      fmt.plural(list.length, 'направление', 'направления', 'направлений') +
      (first ? ', первое ' + fmt.exact(first.createdAt) : '');
  }

  /* Плитка пациентов. Четыре числа лестницы: сколько направлено, сколько
     дошло, сколько ведёт клиника и сколько закрыто начислением. У каждого
     подпись, что именно посчитано, — иначе «закрыто» читается как «отменено». */
  function patientsTile(list) {
    var c = counts(list);
    var empty = c.all === 0;
    return section({
      title: 'Мои пациенты',
      aside: flowAside(list),
      body: tile({
        leadLabel: 'Направлено',
        lead: String(c.all),
        leadNote: empty ? 'Ни одного направления пока нет' : 'всего за всё время',
        cells: [
          cell('Дошло', String(c.arrived), 'услуга оказана'),
          cell('На лечении', String(c.care), 'на контроле клиники'),
          cell('Закрыто', String(c.closed), 'бонус начислен')
        ],
        notes: tailNotes(c, empty),
        link: 'Все направления',
        href: ZAYAVKI
      })
    });
  }

  /* Плитка начислений. 🔴 Число начисления без подписи наружу не идёт: ставку
     назначил владелец на время показа, своего правила клиника пока не давала,
     и без подписи показ примет её за согласованную. Подпись стоит полосой
     в подвале плитки — под всеми тремя числами сразу, ближе к ним поставить
     нечего. Проценты приходят из шва вместе с подписью: экран их не печатает. */
  function bonusTile(b) {
    var empty = !b.accrued;
    return section({
      title: 'Начислено',
      aside: 'демонстрационные суммы',
      body: tile({
        leadLabel: 'Итог',
        lead: fmt.money(b.accrued),
        leadNote: empty ? 'Начислений пока нет' : 'нарастающим итогом',
        cells: [
          cell('Выплачено', fmt.money(b.paid), 'клиника перевела'),
          cell('Ждёт выплаты', fmt.money(b.pending), 'начислено, ещё не переведено')
        ],
        /* Подпись к сумме и правило клиники — две разные полосы, а не одна
           фраза: слитно они читаются как повтор одного и того же и на экране
           дважды говорят «правило начисления». */
        notes: empty
          ? [{ text: b.rule }]
          : [{ text: b.note }, { text: b.rule }],
        link: 'Все начисления',
        href: 'vrach-bonusy.html'
      })
    });
  }

  /* --- требует внимания --------------------------------------------------
     Кто застрял, решает сам шов: у направления есть строка «что сделать».
     Экран своей проверки не заводит — иначе главная и таблица разойдутся
     в том, кого считать застрявшим.

     Карточка на зоны — общий приём Render.zoneCard, тот же, что у заявки
     в очереди модерации: слева якорь со сроком, посередине кто и что,
     справа решение. Ширины зон приём не назначает — их даёт .vr-need. */

  function needCard(r) {
    return w.Render.zoneCard({ cls: 'vr-need', id: r.id, zones: [
      { cls: 'vr-need__wait', body: w.Render.anchor({
          label: 'Ждёт действия',
          value: since(r.updatedAt),
          note: 'Последнее движение ' + fmt.exact(r.updatedAt)
        }) },
      { cls: 'vr-need__who', body:
          '<p class="vr-need__name">' + esc(r.patientName) + '</p>' +
          '<p class="vr-need__sub">' + esc(r.serviceTitle) + ' · ' + esc(r.clinicCity) + '</p>' +
          '<p class="vr-need__sub">' + esc(r.number) + ' · ' + esc(r.patientPhone) + '</p>' +
          /* 🔴 Фразу целиком отдаёт шов (поле stuck). Подстроку «что делать»
             экран из неё не выкраивает: найденная в чужом тексте, она тихо
             умирает от смены формулировки в данных. */
          '<p class="vr-need__do">' + ic('warn', 'ic--sm') +
            '<span>' + esc(r.stuck) + '</span></p>' },
      { cls: 'vr-need__act', body:
          '<p class="vr-need__badge">' + badge(r) + '</p>' +
          '<a class="btn btn--secondary btn--block" href="' + ZAYAVKI + '"' +
            ' data-act="open-referral" data-id="' + esc(r.id) + '">Открыть направление' +
            ic('arrow-right', 'ic--sm') + '</a>' }
    ] });
  }

  function needBlock(list) {
    var stuck = list.filter(function (r) { return !!r.stuck; });
    /* Пустого состояния у блока нет намеренно: у нового партнёра он скрыт
       целиком, а у активного пустой блок «требует внимания» — хорошая
       новость, которую незачем рисовать в полстраницы. */
    if (!stuck.length) { return ''; }
    return section({
      title: 'Требует внимания',
      aside: stuck.length + ' из ' + list.length + ' ' +
        fmt.plural(list.length, 'направления', 'направлений', 'направлений'),
      cls: 'vr-needs',
      body: stuck.map(needCard).join('')
    });
  }

  /* --- последние направления ---------------------------------------------
     Та же таблица на зонах, что и «Мои направления»: те же зоны, те же
     внутренности ячеек, только без раскрытия и без колонки денег. Своей
     формы списка у главной больше нет — она и разводила два экрана. */

  function patient(r) {
    return '<span class="vr-name">' + esc(r.patientName) + '</span>' +
      '<span class="vr-sub"><span class="vr-nw">' + esc(r.patientPhone) + '</span> · ' +
      '<span class="vr-nw">' + esc(r.number) + '</span></span>';
  }

  function service(r) {
    return '<span class="vr-svc">' + esc(r.serviceTitle) + '</span>' +
      '<span class="vr-sub">' + esc(r.clinicCity) + '</span>';
  }

  function statusCell(r) {
    return badge(r) +
      '<span class="vr-sub">направлен ' + esc(fmt.exact(r.createdAt)) + '</span>';
  }

  var LAST_COLS = [
    { title: 'Пациент', cls: 'vr-l1' },
    { title: 'Услуга и клиника', cls: 'vr-l2' },
    { title: 'Статус', cls: 'vr-l3' }
  ];

  function lastBlock(list) {
    if (!list.length) { return ''; }
    /* Список приходит из шва уже от свежих к старым — своей сортировки
       у экрана нет. */
    var three = list.slice(0, 3);
    return section({
      title: 'Последние направления',
      aside: 'свежие сверху',
      cls: 'vr-last',
      body: w.Render.zoneTable({
        cls: 'vr-table',
        cols: LAST_COLS,
        rows: three.map(function (r) {
          return { id: r.id, label: r.patientName,
            cells: [patient(r), service(r), statusCell(r)] };
        }),
        foot: {
          left: esc('Показаны ' + three.length + ' из ' + list.length + ' ' +
            fmt.plural(list.length, 'направления', 'направлений', 'направлений')),
          right: '<a class="act" href="' + ZAYAVKI + '">Все направления' +
            ic('arrow-right', 'ic--sm') + '</a>'
        }
      })
    });
  }

  /* --- первый шаг нового партнёра ----------------------------------------
     Общий приём Render.emptyState в круглом варианте — тот же блок и тот же
     значок, что у пустого списка направлений. Своей карточки «начните
     отсюда» у главной больше нет: два разных пустых состояния на соседних
     экранах читались как два разных продукта. */

  function startBlock() {
    return '<div class="card vr-start">' + w.Render.emptyState({
      round: true,
      icon: 'calendar-plus',
      title: 'Направлений пока нет',
      text: 'Заполните форму на пациента — клиника запишет его и покажет здесь ' +
        'каждый шаг: записан, дошёл, услуга оказана, бонус начислен.',
      action: { text: 'Направить первого пациента', href: NAPRAVIT,
        cls: 'btn--primary btn--lg' }
    }) + '</div>';
  }

  /* --- сборка экрана ----------------------------------------------------- */

  function render() {
    var list = w.DATA.referrals({});
    var b = w.DATA.bonuses();
    var name = greetName(w.DATA.partner());
    var head = '<div class="vr-head">' +
      '<h1 class="h1 page__title">' +
        (name ? 'Здравствуйте, ' + esc(name) : 'Здравствуйте!') +
      '</h1>' +
      (list.length
        ? '<a class="btn btn--primary btn--lg" href="' + NAPRAVIT + '">' +
          ic('plus') + 'Направить пациента</a>'
        : '') +
    '</div>';

    document.getElementById('page').innerHTML =
      head +
      (list.length ? '' : startBlock()) +
      '<div class="vr-tiles">' + patientsTile(list) + bonusTile(b) + '</div>' +
      needBlock(list) +
      lastBlock(list);
  }

  function init() {
    /* Каркас увёл экран на главную чужой роли — рисовать уже нечего:
       страница уходит, а отрисовка успела бы мигнуть чужими данными. */
    if (!w.Shell.mount({ active: 'vrach', role: 'vrach' })) { return; }
    /* Действие регистрируется до отрисовки: позже прибор уже снял список
       обслуженных действий, и живая ссылка числилась бы мёртвой. */
    w.Shell.on('open-referral', function (node) {
      w.Store.setValue(OPEN_SLOT, node.getAttribute('data-id'));
      w.location.href = ZAYAVKI;
    });
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
