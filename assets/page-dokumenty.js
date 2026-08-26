/* Экран 7 «Документы и результаты».
   Заключения, выписки, справки и снимки по вкладкам; динамика остроты зрения
   по обоим глазам с сопоставлением с прогнозом врача; блок «Ваш результат»
   с карточкой для отправки и справка для налогового вычета с выбором года.
   Состояния — по таблице спецификации: пусто · вкладка пуста ·
   открытие документа · одно измерение.
   Данные только через DATA, подписи собирает экран.
   Утверждения по таблице состояний — tools/test-dokumenty.html. */
(function (w) {
  'use strict';

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  /* Типы документов: порядок вкладок, подписи и пустые состояния собирает
     экран — шов отдаёт только код типа. Что покрывает каждый код, объявлено
     там, где код живёт: словарь типов в шапке DOCUMENTS у assets/mock.js.
     Подпись «Справки и бланки» — из этого определения, а не своё толкование. */
  var TABS = [
    { id: 'conclusion',  title: 'Заключения',      icon: 'file',      gen: 'Заключений' },
    { id: 'extract',     title: 'Выписки',         icon: 'clipboard', gen: 'Выписок' },
    { id: 'certificate', title: 'Справки и бланки', icon: 'file-sign', gen: 'Справок и бланков' },
    { id: 'image',       title: 'Снимки',          icon: 'eye',       gen: 'Снимков' }
  ];

  /* Сноска накрывает весь список сразу: что именно написано внутри документа,
     решает клиника, а не прототип. */
  var NOTE = 'Бланки и заключения приходят из системы клиники. ' +
             'Названия и формулировки утверждает клиника.';

  /* Годы для справки отдаёт шов: клиника знает, за какие годы у неё есть
     оплаченные визиты. Экран их не считает — иначе список лет разъедется
     с тем, что клиника действительно готова подтвердить. */
  var YEARS = w.DATA.taxYears();
  var taxYear = YEARS[YEARS.length - 1];
  var tab = TABS[0].id;

  /* Экран умеет открыться на обещанном документе: блок «От вас ждут» приводит
     сюда адресом dokumenty.html?doc=<id>. Пока адреса не было, обе задачи вели
     на голый экран, тот открывался на «Заключениях», а бланк лежал в «Справках
     и бланках» — у ребёнка приземление выходило на «Заключений пока нет».
     Какую вкладку открыть, решает тип самого документа, а не догадка. */
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(w.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  var asked = param('doc');
  function askedDoc() {
    var found = null;
    if (asked) { w.DATA.documents({}).forEach(function (d) { if (d.id === asked) { found = d; } }); }
    return found;
  }
  (function openAsked() {
    var d = askedDoc();
    if (d) { tab = d.type; }
  })();

  /* 🔴 Фильтр списка и год справки — разные вещи, и живут они в разных местах:
     фильтр стоит над списком, который меняет, год справки — в окне справки.
     Пока год стоял в шапке страницы, он выглядел фильтром всего экрана и не
     фильтровал ничего. Значение 'all' — фильтр снят. */
  var ALL = 'all';
  var docYear = ALL;

  /** Годы, по которым у этого человека есть документы. Пусто — фильтровать нечего. */
  function docYears() {
    var seen = {}, out = [];
    w.DATA.documents({}).forEach(function (d) { seen[new Date(d.date).getFullYear()] = true; });
    Object.keys(seen).forEach(function (y) { out.push(+y); });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function inYear(d) {
    return docYear === ALL || new Date(d.date).getFullYear() === +docYear;
  }

  /* Бланки, которых ждёт от пациента блок «От вас ждут» на главной: задача
     называет свой документ полем documentId. Подпись собирает экран — шов
     отдаёт связь, а не фразу. Без пометки пациент приходил со словами
     «открыть согласие» в список из десяти строк и искал нужную глазами. */
  function awaited() {
    var ids = {};
    w.Render.seenTasks().forEach(function (t) { if (t.documentId) { ids[t.documentId] = t; } });
    return ids;
  }

  /** Острота зрения: 1 → «1,0». Разделитель дробной части — запятая. */
  function acuity(n) { return Number(n).toFixed(1).replace('.', ','); }
  function both(od, os) { return od === os ? acuity(od) : acuity(od) + ' / ' + acuity(os); }

  function doctorName(id) {
    var name = '';
    w.DATA.doctors({}).forEach(function (d) { if (d.id === id) { name = d.name; } });
    return name;
  }

  /* --- кто и где вёл приём -----------------------------------------------
     Измерение остроты не несёт ни врача, ни филиала: берём их у ближайшего
     по времени состоявшегося визита. */
  function visitAround(iso) {
    var when = new Date(iso), best = null;
    w.DATA.appointments({ when: 'past' }).forEach(function (a) {
      if (a.status !== 'done') { return; }
      var diff = Math.abs(new Date(a.datetime) - when);
      if (!best || diff < best.diff) { best = { appt: a, diff: diff }; }
    });
    return best ? best.appt : null;
  }

  function branchOf(a) {
    var found = null;
    if (a) { w.DATA.branches().forEach(function (b) { if (b.id === a.branchId) { found = b; } }); }
    return found;
  }

  /* --- ваш результат ------------------------------------------------------ */

  function resultBlock(v) {
    if (v.measurements.length < 2) { return ''; }
    var first = v.measurements[0], last = v.measurements[v.measurements.length - 1];
    var visit = visitAround(last.date), branch = branchOf(visit);
    var doctor = doctorName(v.doctorId);
    return section({
      title: 'Ваш результат',
      body: '<div class="card dok-result">' +
        '<div class="dok-result__main">' +
          '<div>' +
            '<div class="dok-result__pair">' +
              '<div><p class="label">Было</p>' +
                '<p class="dok-result__big dok-result__was">' + esc(both(first.od, first.os)) + '</p></div>' +
              ic('arrow-right', 'ic--lg') +
              '<div><p class="label">Стало</p>' +
                '<p class="dok-result__big"><span class="dok-result__now">' + esc(both(last.od, last.os)) + '</span></p></div>' +
            '</div>' +
            '<p class="dok-result__cap">' +
              (last.od === last.os ? 'Острота зрения обоих глаз' : 'Острота зрения правого и левого глаза') + '</p>' +
          '</div>' +
          '<div class="dok-result__eyes">' +
            '<p class="dok-result__eye"><span class="label">Правый глаз</span><b>' + esc(acuity(last.od)) + '</b></p>' +
            '<p class="dok-result__eye"><span class="label">Левый глаз</span><b>' + esc(acuity(last.os)) + '</b></p>' +
          '</div>' +
        '</div>' +
        '<div class="dok-result__aside">' +
          '<p class="label">Дата</p><p class="strong">' + esc(fmt.exact(last.date)) + '</p>' +
          (doctor ? '<p class="label">Врач</p><p class="strong">' + esc(doctor) + '</p>' : '') +
          (branch ? '<p class="label">Клиника</p><p class="strong">' + esc(branch.title + ', ' + branch.city) + '</p>' : '') +
          '<button class="btn btn--primary btn--block" data-act="share">' + ic('share') + 'Поделиться</button>' +
        '</div>' +
      '</div>'
    });
  }

  function shareCard() {
    var v = w.DATA.vision();
    var first = v.measurements[0], last = v.measurements[v.measurements.length - 1];
    var visit = visitAround(last.date), branch = branchOf(visit);
    var doctor = doctorName(v.doctorId);
    w.Render.modal({
      title: 'Карточка для отправки',
      text: 'Перешлите знакомому: здесь только цифры, врач и клиника — без медицинских подробностей.',
      html: '<div class="card"><div class="card__body">' +
        '<p class="label">Острота зрения</p>' +
        '<p class="display">' + esc(both(first.od, first.os)) + ' → ' + esc(both(last.od, last.os)) + '</p>' +
        '<p class="muted">' + esc(w.DATA.patient().name) + ' · ' + esc(fmt.exact(last.date)) + '</p>' +
        (doctor ? '<p class="strong">' + esc(doctor) + '</p>' : '') +
        (branch ? '<p class="muted">' + esc(branch.title + ', ' + branch.city) + '</p>' : '') +
        (v.doctorId ? '<p><a class="act" href="zapis-novaya.html?doctor=' + esc(v.doctorId) + '">' +
          'Записаться к этому врачу' + ic('arrow-right') + '</a></p>' : '') +
      '</div></div>',
      foot: '<button class="btn btn--primary" data-soon="Отправка карточки появится в рабочей версии кабинета">' +
        'Отправить</button>' +
        '<button class="btn btn--secondary" data-act="modal-close">Закрыть</button>'
    });
  }

  /* --- динамика зрения ---------------------------------------------------- */

  function verdict(last, f) {
    if (last.od === f.od && last.os === f.os) { return { text: 'Как в прогнозе', cls: 'text-accent' }; }
    if (last.od >= f.od && last.os >= f.os) { return { text: 'Лучше прогноза', cls: 'text-accent' }; }
    return { text: 'Ниже прогноза', cls: 'muted' };
  }

  function forecastLine(v) {
    var many = v.measurements.length > 1;
    var last = v.measurements[v.measurements.length - 1];
    if (many && v.forecast) {
      var f = v.forecast, verd = verdict(last, f);
      return '<p class="dok-forecast">' + ic('check') +
        '<span>Врач прогнозировал ' + esc(both(f.od, f.os)) +
        ' · получилось <b>' + esc(both(last.od, last.os)) + '</b></span>' +
        '<span class="dok-forecast__verdict strong ' + verd.cls + '">' + esc(verd.text) + '</span></p>';
    }
    if (many) { return ''; }
    return '<p class="dok-forecast muted">' + ic('clock') +
      '<span>Динамика появится после следующего осмотра.' +
      (v.forecast ? ' Врач прогнозирует остроту ' + esc(both(v.forecast.od, v.forecast.os)) + '.' : '') +
      '</span></p>';
  }

  function visionBlock(v) {
    if (!v.measurements.length) { return ''; }
    var many = v.measurements.length > 1;
    var rows = v.measurements.map(function (m, i) {
      var note = '';
      if (many && i === 0) { note = 'Первое измерение'; }
      if (many && i === v.measurements.length - 1) { note = 'Последний осмотр'; }
      return '<tr>' +
        '<td class="strong nowrap">' + esc(fmt.exact(m.date)) +
          (note ? ' <span class="muted">' + esc(note) + '</span>' : '') + '</td>' +
        '<td class="num">' + esc(acuity(m.od)) + '</td>' +
        '<td class="num">' + esc(acuity(m.os)) + '</td>' +
      '</tr>';
    }).join('');
    return section({
      title: 'Динамика зрения',
      body: '<div class="card"><div class="dok-table"><div class="table-wrap"><table class="table">' +
        '<thead><tr><th>Дата</th><th class="num">Острота правого глаза</th>' +
        '<th class="num">Острота левого глаза</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>' + forecastLine(v) + '</div>'
    });
  }

  /* --- документы по вкладкам ---------------------------------------------- */

  function docRows(t) {
    var list = w.DATA.documents({ type: t.id }).filter(inYear);
    var wait = awaited();
    if (!list.length) {
      return w.Render.emptyState({
        icon: t.icon,
        title: docYear === ALL ? t.gen + ' пока нет' : t.gen + ' за ' + docYear + ' год нет'
      });
    }
    return '<ul class="rows">' + list.map(function (d) {
      var doctor = doctorName(d.doctorId);
      var signed = w.Render.signedAt(d.id);
      /* Документ, которого ждёт главная, получает то самое действие, которое
         с него спрашивают. Пока его не было, задача «подписать согласие»
         не закрывалась нигде: «Открыть» отвечало, что документы в прототипе
         не открываются, и пациент оставался с невыполнимым требованием. */
      var mark = wait[d.id] ? ' <span class="badge badge--warn">Ждёт вас</span>'
        : (signed ? ' <span class="badge badge--ok">Подписано</span>' : '');
      var sign = wait[d.id]
        ? '<button class="btn btn--sm btn--primary" data-act="sign" data-id="' + esc(d.id) + '">' +
            ic('file-sign') + 'Подписать</button>'
        : '';
      return '<li class="row row--compact" data-doc="' + esc(d.id) + '">' +
        '<span class="row__icon">' + ic(t.icon) + '</span>' +
        '<span class="row__body">' +
          '<span class="row__title">' + esc(d.title) + mark + '</span>' +
          '<span class="row__sub">' + esc(fmt.exact(d.date)) + (doctor ? ' · ' + esc(doctor) : '') +
            (signed ? ' · подписано ' + esc(fmt.relative(signed)) + ' в ' + esc(fmt.time(signed)) : '') + '</span>' +
        '</span>' +
        '<span class="row__action dok-acts">' + sign +
          '<button class="btn btn--sm btn--secondary" data-soon="В прототипе документы не открываются">' +
            ic('eye') + 'Открыть</button>' +
          '<button class="btn btn--sm btn--secondary" data-soon="В прототипе документы не скачиваются">' +
            ic('download') + 'Скачать</button>' +
        '</span>' +
      '</li>';
    }).join('') + '</ul>';
  }

  /** Фильтр по годам: только те годы, по которым есть что показать, плюс «Все». */
  function yearFilter() {
    var years = docYears();
    if (years.length < 2) { return ''; }
    var pills = '<button class="pill" type="button" data-act="doc-year" data-id="' + ALL + '" ' +
      'aria-pressed="' + (docYear === ALL ? 'true' : 'false') + '"' + (docYear === ALL ? ' disabled' : '') +
      '>Все</button>';
    pills += years.map(function (y) {
      var on = +docYear === y;
      return '<button class="pill" type="button" data-act="doc-year" data-id="' + y + '" ' +
        'aria-pressed="' + (on ? 'true' : 'false') + '"' + (on ? ' disabled' : '') + '>' + y + '</button>';
    }).join('');
    return '<div class="pills dok-years" role="group" aria-label="Год документа">' + pills + '</div>';
  }

  function docsBlock() {
    var pills = TABS.map(function (t) {
      return '<button class="pill" type="button" data-act="doc-tab" data-id="' + esc(t.id) + '" ' +
        'aria-pressed="' + (t.id === tab ? 'true' : 'false') + '"' + (t.id === tab ? ' disabled' : '') +
        '>' + esc(t.title) + '</button>';
    }).join('');
    var panels = TABS.map(function (t) {
      return '<div class="dok-panel" data-tab="' + esc(t.id) + '"' + (t.id === tab ? '' : ' hidden') + '>' +
        docRows(t) + '</div>';
    }).join('');
    return section({
      title: 'Мои документы',
      body: '<div class="card"><div class="dok-bar">' +
        '<div class="pills dok-tabs" role="group" aria-label="Тип документа">' + pills + '</div>' +
        yearFilter() + '</div>' + panels +
        '<p class="dok-note muted">' + esc(NOTE) + '</p></div>'
    });
  }

  /* --- справка для налогового вычета --------------------------------------
     Год справки выбирается здесь же, в окне: он относится к справке, а не
     к списку документов, и в шапке страницы читался чужим фильтром. */

  function taxPills() {
    return '<div class="pills" role="group" aria-label="Год для справки">' + YEARS.map(function (y) {
      return '<button class="pill" type="button" data-act="tax-year" data-id="' + y + '" ' +
        'aria-pressed="' + (y === taxYear ? 'true' : 'false') + '"' + (y === taxYear ? ' disabled' : '') +
        '>' + y + '</button>';
    }).join('') + '</div>';
  }

  function taxModal() {
    w.Render.modal({
      title: 'Справка для налогового вычета',
      text: 'Справку формирует клиника по оплаченным визитам выбранного года и подписывает её.',
      html: '<p class="label">Год</p>' + taxPills() +
        '<p class="muted dok-tax-year">Справка за ' + taxYear + ' год</p>',
      foot: '<button class="btn btn--primary" data-soon="Выдача справки появится в рабочей версии кабинета">' +
        'Запросить справку</button>' +
        '<button class="btn btn--secondary" data-act="modal-close">Закрыть</button>'
    });
  }

  /* --- переключатели: меняют разметку на месте, а не пересобирают экран ----
     Панели всех вкладок уже в разметке, поэтому кнопки документов никуда
     не деваются при переключении. Кнопка текущей вкладки и текущего года
     гаснет: перейти туда, где уже стоишь, нечем — а живая кнопка,
     которая ничего не делает, читается как поломка. */

  function pickTab(btn) {
    tab = btn.getAttribute('data-id');
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="doc-tab"]'), function (b) {
      var on = b.getAttribute('data-id') === tab;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = on;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.dok-panel'), function (p) {
      if (p.getAttribute('data-tab') === tab) { p.removeAttribute('hidden'); } else { p.setAttribute('hidden', ''); }
    });
  }

  /* Год меняет содержимое всех четырёх панелей сразу: вкладка при этом
     остаётся на месте, иначе выбор года сбрасывал бы выбор типа. */
  function pickYear(btn) {
    docYear = btn.getAttribute('data-id');
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="doc-year"]'), function (b) {
      var on = b.getAttribute('data-id') === docYear;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = on;
    });
    TABS.forEach(function (t) {
      var panel = document.querySelector('.dok-panel[data-tab="' + t.id + '"]');
      if (panel) { panel.innerHTML = docRows(t); }
    });
  }

  function pickTaxYear(btn) {
    taxYear = +btn.getAttribute('data-id');
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="tax-year"]'), function (b) {
      var on = +b.getAttribute('data-id') === taxYear;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = on;
    });
    var note = document.querySelector('.dok-tax-year');
    if (note) { note.textContent = 'Справка за ' + taxYear + ' год'; }
  }

  /* --- сборка экрана ------------------------------------------------------ */

  function render() {
    var v = w.DATA.vision();
    var total = 0;
    TABS.forEach(function (t) { total += w.DATA.documents({ type: t.id }).length; });

    if (!total && !v.measurements.length) {
      document.getElementById('page').innerHTML =
        '<div class="dok-head"><h1 class="h1 page__title">Документы и результаты</h1></div>' +
        w.Render.emptyState({
          icon: 'clipboard',
          title: 'Документы появятся после первого визита',
          text: 'Заключения, выписки, справки и снимки попадают сюда сразу после приёма.',
          action: { text: 'Записаться', href: 'zapis-novaya.html' }
        });
      return;
    }

    document.getElementById('page').innerHTML =
      '<div class="dok-head">' +
        '<h1 class="h1 page__title">Документы и результаты</h1>' +
        '<div class="dok-head__acts">' +
          '<button class="btn btn--secondary" data-act="tax">' + ic('file-sign') +
            'Справка для налогового вычета</button>' +
        '</div>' +
      '</div>' +
      resultBlock(v) +
      visionBlock(v) +
      docsBlock();
  }

  function init() {
    w.Shell.mount({ active: 'dokumenty' });
    /* Действия регистрируются сразу после каркаса и до отрисовки:
       позже прибор уже снял список обслуженных действий. */
    w.Shell.on('doc-tab', pickTab);
    w.Shell.on('doc-year', pickYear);
    w.Shell.on('tax-year', pickTaxYear);
    w.Shell.on('tax', taxModal);
    w.Shell.on('share', shareCard);
    w.Shell.on('sign', function (t) {
      w.Render.sign(t.getAttribute('data-id'));
      render();
    });
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
