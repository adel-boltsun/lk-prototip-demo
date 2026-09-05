/* Экран 7 «Табло заявок» — панель клиники.
   Администратор видит единое табло направлений от всех партнёров: пациент,
   кто направил, услуга с клиникой, статус с датой, сумма с начислением и
   смена статуса. Поиск, лента статусов, три фильтра и порядок по дате
   работают вместе: отбор один, а не шесть независимых. Текущая выборка
   выгружается файлом, собранным здесь же, без сети.

   🔴 Композиция перенесена с утверждённого рисунка соседнего экрана
   (vrach-zayavki.png): у табло та же природа — заголовок, отбор, широкая
   таблица, раскрытие строки, — и своего рисунка ему не рисовали. Что приём
   поменял против прежней сборки:

   1. Восемь колонок свёрнуты в шесть зон плюс поле раскрытия. Прежним восьми
      не хватало ширины уже на 1366, и таблица жила в собственной прокрутке
      (.table-wrap). В зонах прокрутки вбок нет — обёртка снята.
   2. Раскрытие вернулось ВНУТРЬ таблицы, полосой под своей строкой: карточке
      больше не надо ехать вбок вместе со строками, и связь со строкой держит
      соседство, а не подсветка с номером в шапке.
   3. Первичная ось отбора — лента статусов со счётчиками, а не выпадающий
      список: список прячет раскладку потока, а её администратор должен
      видеть краем глаза. Врач, клиника и период остались выпадающими —
      они сужают поток, а не показывают его.
   4. Тревога стоит отдельной строкой под плашкой статуса и написана
      действием. Слова — из шва: подстроку из них экран не выкраивает.

   🔴 Смена статуса вернулась в строку — своей зоной перед полем раскрытия.
   Оба довода, загнавшие её когда-то в подвал раскрытой карточки, отпали:
   прокрутки вбок больше нет (зоны с долями вместо восьми колонок), а правило
   перекрытия плавающей панелью прибор считает по видимой полосе органа.
   Табло существует ради движения потока, и прятать его главный глагол за
   раскрытием нельзя. Довод «сначала прочти, потом комментируй» держит само
   окно: оно называет направление, услугу, врача и текущую ступень, поэтому
   комментарий пишется зряче и без раскрытия строки.

   Отбор считает шов (DATA.referrals): тот же отбор нужен таблице врача, и
   двух его копий быть не должно. Смену статуса тоже делает шов
   (DATA.setReferralStatus) — тогда её видит и кабинет врача, куда изменение
   обязано доехать. Общие блоки — панель отбора, лента, таблица на зонах,
   плашка, лестница и карточка — живут в Render; своих версий экран не заводит.

   Состояния — по таблице спецификации, экран 7: табло · смена статуса ·
   экспорт · пусто. Данные только через DATA.
   Утверждения по таблице — tools/test-admin-tablo.html. */
(function (w) {
  'use strict';

  var SLOT = 'admin:tablo:';
  var NEW_FIRST = 'new';
  var UNKNOWN = '[уточняется]';

  /* Периоды отбора: подписи наши, границы считает шов (DATA.referrals
     принимает period). Значения строками — это ключи фильтра, а не числа. */
  var PERIODS = [
    { value: '30', title: 'За 30 дней' },
    { value: '90', title: 'За 90 дней' },
    { value: '365', title: 'За год' }
  ];

  var fmt = w.Render.fmt;
  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  var view = { search: '', doctor: '', clinic: '', status: '', period: '', sort: NEW_FIRST, open: null };
  /* Окно смены статуса и отчёт о последней выгрузке живут в памяти страницы:
     ни то ни другое не состояние прототипа. Сам результат смены — состояние,
     и его держит шов в Store. */
  var dialog = null, dialogId = null, exported = '';

  /* --- отбор живёт в Store ------------------------------------------------
     Раскрытая карточка и отбор переживают перезагрузку: заказчик щёлкает
     панель прототипа, страница перезагружается, и терять отбор ей нельзя. */
  function slot(name) { return SLOT + name; }
  function save(name, value) { w.Store.setValue(slot(name), value || null); }

  function known(list, id, key) {
    var ok = false;
    list.forEach(function (x) { if (String(x[key || 'id']) === String(id)) { ok = true; } });
    return ok;
  }

  /** Забытый отбор проверяется по спискам клиники: перечни статусов, врачей
      и клиник принадлежат ей и могут смениться, а пустая таблица без видимой
      причины читается как поломка. */
  function remembered(name, list, key) {
    var v = w.Store.value(slot(name)) || '';
    if (v && !known(list, v, key)) { v = ''; save(name, null); }
    return v;
  }

  function loadView() {
    view.search = w.Store.value(slot('search')) || '';
    view.status = remembered('status', w.DATA.statuses());
    view.doctor = remembered('doctor', w.DATA.partners());
    view.clinic = remembered('clinic', w.DATA.clinics());
    view.period = remembered('period', PERIODS, 'value');
    view.sort = w.Store.value(slot('sort')) === 'old' ? 'old' : NEW_FIRST;
    view.open = w.Store.value(slot('open')) || null;
    if (view.open && !w.DATA.referral(view.open)) { view.open = null; save('open', null); }
  }

  function resetView() {
    exported = '';
    view.search = ''; view.doctor = ''; view.clinic = '';
    view.status = ''; view.period = ''; view.sort = NEW_FIRST;
    ['search', 'doctor', 'clinic', 'status', 'period', 'sort'].forEach(function (n) { save(n, null); });
  }

  function filtering() {
    return !!(view.search || view.doctor || view.clinic || view.status || view.period);
  }

  /* --- выборка ------------------------------------------------------------
     Один вызов шва на все органы отбора: складывать их между собой — его
     дело, а не экрана. Порядок — вид, а не другая выборка. */
  function raw() { return w.DATA.referrals({}); }

  function found() {
    var list = w.DATA.referrals({
      query: view.search,
      status: view.status || 'all',
      doctor: view.doctor || 'all',
      clinic: view.clinic || 'all',
      period: view.period || 'all'
    });
    if (view.sort === 'old') {
      list = list.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    }
    return list;
  }

  /** Город врача-партнёра из реестра клиники. Своего справочника врачей
      у экрана нет: реестр принадлежит шву. */
  function partnerCity(r) {
    var city = '';
    w.DATA.partners().forEach(function (p) { if (p.id === r.partnerId) { city = p.city || ''; } });
    return city;
  }

  /* --- строка отбора ------------------------------------------------------
     Органы отбора рисует общий блок Render.filterBar — тот же, что берёт
     реестр партнёров. Списки вариантов приходят из шва: своих названий
     врачей и клиник экран не выдумывает. Статуса в панели нет — он ушёл
     на ленту; порядок прижат к правому краю общим .filters__tail, потому
     что он про вид списка, а не про отбор. */

  function options(list, key, title) {
    return list.map(function (x) { return { value: x[key], title: x[title] }; });
  }

  function toolbar() {
    return w.Render.filterBar({
      id: 'tb-filters',
      fields: [
        { name: 'search', kind: 'search', label: 'Поиск по фамилии, телефону или номеру',
          placeholder: 'Поиск по фамилии, телефону или номеру', value: view.search },
        { name: 'doctor', label: 'Фильтр по врачу', icon: 'user', value: view.doctor,
          all: 'Все врачи', options: options(w.DATA.partners(), 'id', 'name') },
        { name: 'clinic', label: 'Фильтр по клинике', icon: 'building', value: view.clinic,
          all: 'Все клиники', options: options(w.DATA.clinics(), 'id', 'city') },
        { name: 'period', label: 'Фильтр по периоду', icon: 'clock', value: view.period,
          all: 'За всё время', options: PERIODS },
        { name: 'sort', label: 'Порядок по дате', icon: 'calendar-check', value: view.sort,
          tail: true, options: [
            { value: NEW_FIRST, title: 'Сначала новые' },
            { value: 'old', title: 'Сначала старые' }
          ] }
      ]
    });
  }

  /* Лента считает ВЕСЬ поток, а не пересечение с остальным отбором: она
     показывает раскладку, по которой выбирают. Счётчик, который меняется от
     набранной фамилии, перестаёт быть раскладкой и становится вторым
     результатом. */
  function tally() {
    return w.Render.referralTally({ list: raw(), active: view.status, act: 'tally' });
  }

  /* --- зоны строки -------------------------------------------------------- */

  function patient(r) {
    /* Телефон и номер направления не ломаются посреди цифр, но перенос между
       ними разрешён: одной неразрывной строкой они на узкой зоне вылезают
       за её границу. Точка-разделитель уезжает во ВТОРУЮ половину: оставленная
       за телефоном, она добавляла ему 14 px и поднимала пол зоны со 133 до 147,
       хотя на экране от перестановки ничего не меняется. */
    return '<span class="tb-name">' + esc(r.patientName) + '</span>' +
      '<span class="tb-sub"><span class="tb-nw">' + esc(r.patientPhone) + '</span> ' +
      '<span class="tb-nw">· ' + esc(r.number) + '</span></span>';
  }

  /** Кто направил: имя из реестра и город под ним. Обезличенного «партнёра»
      здесь нет — имя врача и есть то, ради чего табло читают. */
  function who(r) {
    var name = w.Render.referralPartnerName(r);
    var city = partnerCity(r);
    /* Фамилия — ссылка в карточку партнёра: вторая точка входа в неё. Дороже
       первой, но на показе это тот жест, которым ЛПР сам себе объясняет
       ценность экрана. Возврат назван адресом (iz=tablo): администратор
       работал со своим отбором и обязан вернуться к нему.
       Имени нет — нет и ссылки: [уточняется] никуда не ведёт. */
    return '<span class="tb-line">' +
      (name
        ? '<a href="admin-partner.html?vrach=' + esc(encodeURIComponent(r.partnerId)) +
          '&iz=tablo">' + esc(name) + '</a>'
        : '<span class="muted">' + esc(UNKNOWN) + '</span>') + '</span>' +
      '<span class="tb-sub">' + (city ? esc(city) : esc(UNKNOWN)) + '</span>';
  }

  function service(r) {
    return '<span class="tb-line">' + esc(r.serviceTitle) + '</span>' +
      '<span class="tb-sub">' + esc(r.clinicCity) + '</span>';
  }

  /* Тревога вытесняет дату, а не встаёт рядом с ней: у застрявшего
     направления дата отправки — не то, что администратор читает первым.

     🔴 Фразу целиком отдаёт шов (поле stuck). Экран не выкраивает из неё
     половину «что делать»: подстрока, найденная в чужом тексте, тихо умирает
     от смены формулировки в данных. Слова написаны со стороны врача — и это
     ровно то, что администратору полезно прочесть: он видит, с чем к нему
     сейчас придут. */
  function statusCell(r) {
    var sub = r.stuck
      ? '<span class="tb-stuck">' + ic('warn', 'ic--sm') +
        '<span>' + esc(r.stuck) + '</span></span>'
      : '<span class="tb-sub">направлен ' + esc(fmt.exact(r.createdAt)) + '</span>';
    return w.Render.referralBadge(r) + sub;
  }

  /* Деньги по ступени. Пусто не оставляем и прочерк не ставим: у большинства
     строк ни суммы, ни начисления, и пустая зона читалась бы как поломка.
     Начисление идёт короткой формой со звёздочкой, а подпись к ней приходит
     из того же вызова и стоит полосой под таблицей: голое число выглядит
     ставкой, согласованной клиникой, а её назначил владелец на время показа. */
  function money(r, bonus) {
    if (r.status === 'created' || r.status === 'booked') {
      return '<span class="tb-later">после приёма</span>';
    }
    if (r.status === 'noshow' || r.status === 'cancelled') {
      return '<span class="tb-later">услуга не оказана</span>';
    }
    var cell = bonus.cell(r);
    return '<span class="tb-sum">' + (r.amount ? esc(fmt.money(r.amount)) : '') + '</span>' +
      '<span class="tb-sub">' + (cell ? 'начислено ' + cell : 'бонус считает клиника') + '</span>';
  }

  /** Смена статуса зоной строки. Подпись на кнопке короткая — зона узкая; имя
      пациента уходит в имя для чтения с экрана, иначе четырнадцать кнопок
      подряд читаются как четырнадцать одинаковых «Сменить». */
  function action(r) {
    return '<button class="btn btn--secondary tb-act" type="button" data-act="status-open"' +
      ' data-id="' + esc(r.id) + '"' +
      ' aria-label="' + esc('Сменить статус: ' + r.patientName + ', ' + r.number) + '">' +
      'Сменить</button>';
  }

  var COLS = [
    { title: 'Пациент', cls: 'tb-z1' },
    { title: 'Направил', cls: 'tb-z2' },
    { title: 'Услуга и клиника', cls: 'tb-z3' },
    { title: 'Статус', cls: 'tb-z4' },
    /* «Сумма и начисление» — подпись соседнего экрана, но там на зону денег
       отдано 16 % ширины, а здесь зон шесть. Одно слово «НАЧИСЛЕНИЕ» вразрядку
       просит 129 px и в одиночку съедало пятнадцатую долю таблицы — ту самую,
       которой не хватало услуге, чтобы не рассыпаться на четыре строки.
       Короткая подпись называет обе половины, а сама ячейка и так подписана
       словами: «начислено 500 ₽», «бонус считает клиника», «после приёма». */
    { title: 'Сумма и бонус', cls: 'tb-z5', num: true },
    /* Зона действия без подписи. Соседняя зона денег прижата к правому краю,
       и любая подпись здесь встаёт вплотную к «НАЧИСЛЕНИЕ» — на 1440 они
       читались одним словом. Имя действия несёт сама кнопка: глазу
       «Сменить», чтению с экрана — aria-label с фамилией пациента
       (четырнадцать кнопок подряд иначе одинаковы). */
    { title: '', cls: 'tb-z6' }
  ];

  /* Полоса раскрытия — общая карточка направления в широкой раскладке:
     лестница в ряд, комментарии и журнал колонками рядом. Столбиком та же
     карточка занимает под 850 px, и список выталкивало за нижний край экрана.
     Кнопок в подвале карточки нет: смена статуса стоит в строке, прямо над
     полосой, и второй такой же кнопкой в двадцати пикселях ниже она бы только
     двоилась. */
  function table(list) {
    /* Ячейка и сноска приходят одним вызовом: короткая форма числа без своей
       подписи наружу не выходит, и забыть её здесь физически нечем. */
    var bonus = w.Render.referralBonusColumn(list, { bar: true, barCls: 'tb-foot' });
    var all = raw().length;
    return w.Render.zoneTable({
      cls: 'tb-table',
      cols: COLS,
      toggle: 'ref-toggle',
      rows: list.map(function (r) {
        var open = view.open === r.id;
        return {
          id: r.id, open: open, label: r.patientName,
          cells: [patient(r), who(r), service(r), statusCell(r), money(r, bonus), action(r)],
          band: open ? w.Render.referralCard(r, { wide: true }) : ''
        };
      }),
      foot: {
        left: list.length === all
          ? esc('Показаны все ' + all + ' ' +
              fmt.plural(all, 'направление', 'направления', 'направлений'))
          : esc('Показано ' + list.length + ' из ' + all),
        /* Выгрузка стоит у счёта строк, а не в панели отбора: файл — это ровно
           та выборка, которую подвал только что назвал, и щёлкать её удобнее
           там, где прочитал число. */
        right: '<button class="act" type="button" data-act="export">Выгрузить в файл' +
          ic('download', 'ic--sm') + '</button>'
      }
    }) + bonus.footnote;
  }

  /* --- заголовок списка ---------------------------------------------------
     Подпись справа от линейки говорит про весь список сразу: сколько их,
     сколько ждут действия и в каком порядке они лежат. Под отбором она меняется
     на долю: «0 из 14» объясняет пустую таблицу раньше, чем администратор
     решит, что она сломалась. */
  function aside(shown, all) {
    if (filtering()) { return shown + ' из ' + all + ' подходят под отбор'; }
    var stuck = 0;
    raw().forEach(function (r) { if (r.stuck) { stuck++; } });
    return all + ' ' + fmt.plural(all, 'направление', 'направления', 'направлений') +
      (stuck ? ' · ' + stuck + ' ' + fmt.plural(stuck, 'требует', 'требуют', 'требуют') +
        ' внимания' : '') +
      ' · ' + (view.sort === 'old' ? 'старые сверху' : 'свежие сверху');
  }

  /* --- пустые состояния ---------------------------------------------------
     Их два, и они про разное: пустой отбор чинится сбросом фильтров, пустое
     табло — тем, что программа только запускается. Один текст на оба случая
     отправил бы администратора искать несуществующие фильтры. */
  function nothingFound() {
    /* Сноска только там, где пусто именно из-за пересечения: счётчик на ленте
       показывает единицы, а таблица пуста, и это выглядит как расхождение
       прибора с самим собой. Когда орган отбора один, объяснять нечего. */
    var crossed = view.status && (view.search || view.doctor || view.clinic || view.period)
      ? w.Render.hintBar({
          cls: 'tb-foot', icon: 'message',
          text: 'Счётчики на ленте считают все направления, а таблица — их пересечение ' +
            'с остальным отбором: направление попадает в счётчик своей ступени и всё ' +
            'равно не выходит в таблицу.'
        })
      : '';
    return '<div class="card tb-nothing">' + w.Render.emptyState({
      round: true,
      title: 'Направлений по этому отбору нет',
      text: 'Ни одно направление не подходит под поиск, врача, клинику, статус и период. Измените запрос или снимите отбор.',
      icon: 'search',
      action: { text: 'Сбросить отбор', act: 'filters-reset', cls: 'btn--secondary' }
    }) + '</div>' + crossed;
  }

  function nothingYet() {
    return '<div class="card tb-nothing">' + w.Render.emptyState({
      round: true,
      title: 'Направлений пока нет',
      text: 'Как только врачи-партнёры начнут направлять пациентов, их заявки появятся здесь — с фамилией врача, услугой и статусом.',
      icon: 'clipboard'
    }) + '</div>';
  }

  /* --- выгрузка -----------------------------------------------------------
     Файл собирается здесь и отдаётся через Blob: ни сервера, ни библиотеки.
     Разделитель — точка с запятой, а впереди метка кодировки: без неё русские
     буквы приезжают в таблицу крякозябрами, и выгрузка бесполезна ровно тому,
     кто её просил. */
  function quote(v) {
    return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
  }

  /** Строки файла = текущая выборка, зона в зону с таблицей.
      Начисление уходит вместе со своей подписью отдельной колонкой: голое
      число и в файле читается как согласованная клиникой ставка, а ставку
      назначил владелец на время показа. Подпись берётся у того же блока
      Render, что и на экране. */
  function csv(list) {
    var head = ['Номер', 'Пациент', 'Телефон', 'Направил', 'Город врача', 'Клиника',
      'Услуга', 'Направлен', 'Статус', 'Сумма услуги', 'Начислено', 'Подпись к начислению'];
    var rows = list.map(function (r) {
      var paid = r.bonus !== null && r.bonus !== undefined;
      return [r.number, r.patientName, r.patientPhone,
        w.Render.referralPartnerName(r) || UNKNOWN, partnerCity(r) || UNKNOWN, r.clinicCity,
        r.serviceTitle, fmt.exact(r.createdAt), w.Render.referralStatusTitle(r.status),
        r.amount ? r.amount : '', paid ? r.bonus : '',
        paid ? w.Render.referralBonusNote(r) : ''].map(quote).join(';');
    });
    return [head.map(quote).join(';')].concat(rows).join('\r\n');
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function exportFile() {
    var list = found();
    if (!list.length) {
      exported = 'Выгружать нечего: по этому отбору направлений нет.';
      renderList();
      return;
    }
    var name = 'tablo-zayavok-' + stamp() + '.csv';
    var url = w.URL.createObjectURL(new w.Blob(['﻿' + csv(list)], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    w.URL.revokeObjectURL(url);
    /* Файл уходит на диск молча: без строки на экране щелчок по «выгрузить»
       выглядит так, будто ничего не произошло. */
    exported = 'Выгружено строк: ' + list.length + ' — файл ' + name;
    renderList();
  }

  /* --- смена статуса ------------------------------------------------------
     Окно, а не выпадающий список прямо в зоне: смена требует комментария, и
     место под него в зоне таблицы взять негде. Сам перечень статусов
     принадлежит клинике — седьмого варианта окно не заводит.

     Окно называет направление целиком: услугу, врача и текущую ступень. Так
     кнопка в строке не превращается в смену статуса вслепую — то, ради чего
     смену когда-то и держали в подвале раскрытой карточки. */
  function statusOpen(btn) {
    var r = w.DATA.referral(btn.getAttribute('data-id'));
    if (!r) { w.Render.soon('Смена статуса'); return; }
    dialogId = r.id;
    var opts = w.DATA.statuses().map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === r.status ? ' selected' : '') + '>' +
        esc(s.title) + '</option>';
    }).join('');
    var name = w.Render.referralPartnerName(r) || UNKNOWN;
    dialog = w.Render.modal({
      title: 'Сменить статус направления',
      text: r.number + ' · ' + r.patientName + ' · ' + r.serviceTitle + ' · ' + r.clinicCity +
        '. Направил ' + name + '. Сейчас: ' + w.Render.referralStatusTitle(r.status) +
        '. Новый статус и комментарий увидит врач, направивший пациента.',
      html: '<label class="field"><span class="label">Новый статус</span>' +
          '<span class="select tb-pick"><span class="select__ic">' + ic('clipboard', 'ic--sm') + '</span>' +
          '<select id="tb-new-status">' + opts + '</select>' +
          '<span class="select__chevron">' + ic('chevron', 'ic--sm') + '</span></span></label>' +
        '<label class="field"><span class="label">Комментарий</span>' +
          '<textarea class="input" id="tb-note" rows="3" ' +
          'placeholder="Что произошло с направлением"></textarea></label>' +
        '<p class="tb-error" id="tb-error" role="alert"></p>',
      foot: '<button class="btn btn--primary" type="button" data-act="status-save">Сохранить</button>' +
            '<button class="btn btn--secondary" type="button" data-act="modal-close">Отмена</button>',
      onClose: function () { dialog = null; dialogId = null; }
    });
  }

  function fail(text) {
    var box = dialog ? dialog.querySelector('#tb-error') : null;
    if (box) { box.textContent = text; }
  }

  /** Сохранить решение. Комментарий обязателен: запись журнала без него не
      объясняет, почему статус сменился, и врач читает смену как сбой.
      Запись делает шов — он же кладёт её в журнал и в состояние прототипа. */
  function statusSave() {
    if (!dialog || !dialogId) { return; }
    var pick = dialog.querySelector('#tb-new-status');
    var note = dialog.querySelector('#tb-note');
    var comment = note ? String(note.value || '').trim() : '';
    if (!comment) {
      fail('Напишите комментарий: его увидит врач, направивший пациента.');
      if (note) { note.focus(); }
      return;
    }
    var saved = w.DATA.setReferralStatus(dialogId, { status: pick ? pick.value : '', comment: comment });
    if (!saved) { fail('Статус не сохранился: выберите статус из списка клиники.'); return; }
    dialog.close();
    /* Лента пересобирается вместе с таблицей: смена статуса двигает счётчики
       ступеней, и оставленная нетронутой лента разошлась бы с таблицей. */
    renderTally();
    renderList();
  }

  /* --- отрисовка ---------------------------------------------------------- */

  function renderList() {
    var box = document.getElementById('tb-list');
    var all = raw();
    if (!all.length) { box.innerHTML = nothingYet(); return; }
    var list = found();
    /* Отчёт о выгрузке — полосой под таблицей, у той самой кнопки, которая
       файл и собрала. Над таблицей он читался как заголовок списка. */
    var done = exported
      ? w.Render.hintBar({ cls: 'tb-foot tb-done', icon: 'download', text: exported })
      : '';
    box.innerHTML = w.Render.sectionHead({
      title: 'Направления партнёров', aside: aside(list.length, all.length)
    }) + (list.length ? table(list) : nothingFound()) + done;
  }

  /* Лента перерисовывается вместе с таблицей: выбранная ступень на ней —
     часть состояния таблицы, а не отдельный орган со своей памятью. */
  function renderTally() {
    var box = document.getElementById('tb-tally');
    if (box) { box.innerHTML = tally(); }
  }

  function render() {
    document.getElementById('page').innerHTML =
      '<h1 class="h1 page__title">Табло заявок</h1>' +
      (raw().length ? toolbar() + '<div id="tb-tally"></div>' : '') +
      '<div id="tb-list"></div>';
    if (raw().length) {
      renderTally();
      /* Обработчик перерисовывает СПИСОК, а не страницу: панель, собранная
         заново на каждой букве, теряет фокус поля поиска. */
      w.Render.filterBind('#tb-filters', function (name, value) {
        view[name] = value;
        save(name, name === 'sort' && value === NEW_FIRST ? null : value);
        /* Отчёт о выгрузке живёт до первой смены отбора: он называет число
           строк, и над сузившейся таблицей висело «выгружено 34», когда в ней
           осталось четыре. */
        exported = '';
        renderList();
      });
    }
    renderList();
  }

  /* --- органы отбора и раскрытие ------------------------------------------ */

  /** Щелчок по ступени ленты. Повторный снимает отбор: ступень работает
      переключателем, а не радиокнопкой без выхода — иначе снять её можно
      только через «сбросить отбор». */
  function pickStatus(btn) {
    var id = btn.getAttribute('data-id') || '';
    view.status = view.status === id ? '' : id;
    save('status', view.status);
    exported = '';
    renderTally();
    renderList();
  }

  /* Раскрыта одна: две открытые полосы в таблице теряют строку, от которой
     они, и читаются как отдельные записи. */
  function toggle(btn) {
    var id = btn.getAttribute('data-id');
    view.open = view.open === id ? null : id;
    save('open', view.open);
    renderList();
    /* Таблица длиннее экрана, и полоса может раскрыться за его нижним краем:
       без этого щелчок выглядит как «ничего не произошло». block: 'nearest'
       не двигает страницу, когда полоса и так видна. */
    var box = document.querySelector('.ztable__band.is-open');
    if (box && box.scrollIntoView) { box.scrollIntoView({ block: 'nearest' }); }
  }

  /* Полоса может быть раскрыта уже при открытии страницы: слот переживает
     перезагрузку, а заказчик щёлкает панель прототипа. Прокрутка ставит
     строку под шапку страницы: та прилипшая, и без отступа она накрыла бы
     имя пациента. */
  function showOpen() {
    if (!view.open) { return; }
    var box = document.querySelector('.ztable__band.is-open');
    if (!box) { return; }
    var head = document.querySelector('.shell-header');
    var pad = (head ? head.getBoundingClientRect().height : 0) + 16;
    var top = box.getBoundingClientRect().top + (w.pageYOffset || 0) - pad;
    w.scrollTo(0, top > 0 ? top : 0);
  }

  function init() {
    /* Сценарий чужой роли уводит на её главную: рисовать себя поверх
       уходящей страницы нельзя. Тот же выход у экранов кабинета врача. */
    if (!w.Shell.mount({ active: 'admin-tablo', role: 'admin' })) { return; }
    w.Shell.on('ref-toggle', toggle);
    w.Shell.on('tally', pickStatus);
    w.Shell.on('filters-reset', function () { resetView(); render(); });
    w.Shell.on('export', exportFile);
    w.Shell.on('status-open', statusOpen);
    w.Shell.on('status-save', statusSave);
    loadView();
    render();
    showOpen();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
