/* Экран 4 «Мои направления».
   Врач видит все свои направления списком: пациент, услуга с клиникой,
   статус с датой и тревогой, сумма с начислением. Поиск, лента статусов и
   порядок по дате работают вместе: отбор один, а не три независимых. Строка
   раскрывается полосой под собой — путь пациента по шагам, комментарии
   и журнал.

   🔴 Композиция перенесена с утверждённого рисунка (vrach-zayavki.png),
   и рисунок в спорных местах главнее прежней сборки. Что он поменял:

   1. Семь колонок свёрнуты в четыре зоны неравной ширины плюс поле
      раскрытия. Семи колонкам нужно было 1174 px там, где колонка на 1440
      даёт 1010, и таблица жила в собственной прокрутке. В зонах прокрутки
      вбок нет — и поэтому раскрытая карточка вернулась ВНУТРЬ таблицы,
      полосой под своей строкой, а не под всей таблицей.
   2. Первичная ось отбора — лента статусов со счётчиками, а не выпадающий
      список: список прячет раскладку потока, а врач должен видеть её краем
      глаза. Порядок остался выпадающим — он про вид, а не про отбор.
   3. Тревога стоит отдельной строкой под плашкой статуса и написана
      действием. Слова — из шва: подстроку из них экран не выкраивает.

   Отбор уходит в шов (DATA.referrals), а не считается здесь: тот же отбор
   нужен табло клиники. Общие блоки — лента, таблица на зонах, плашка,
   лестница, карточка — живут в Render и зовутся отсюда.

   Состояния — по таблице спецификации, экран 4: список · карточка ·
   ничего не найдено · пусто. Данные только через DATA.
   Утверждения по таблице — tools/test-vrach-zayavki.html. */
(function (w) {
  'use strict';

  var SLOT = 'zayavki:';
  var NEW_FIRST = 'new';

  var fmt = w.Render.fmt;
  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  var view = { search: '', status: '', sort: NEW_FIRST, open: null };

  /* --- отбор живёт в Store ------------------------------------------------
     Раскрытая карточка и отбор переживают перезагрузку: заказчик щёлкает
     панель прототипа, страница перезагружается, и терять отбор ей нельзя. */
  function slot(name) { return SLOT + name; }
  function save(name, value) { w.Store.setValue(slot(name), value || null); }

  function knownStatus(id) {
    var ok = false;
    w.DATA.statuses().forEach(function (s) { if (s.id === id) { ok = true; } });
    return ok;
  }

  function loadView() {
    view.search = w.Store.value(slot('search')) || '';
    view.sort = w.Store.value(slot('sort')) === 'old' ? 'old' : NEW_FIRST;
    view.open = w.Store.value(slot('open')) || null;
    /* Статуса, которого в лестнице клиники нет, экран не помнит: перечень
       принадлежит ей и может смениться, а пустой список без видимой причины
       читается как поломка. */
    var st = w.Store.value(slot('status')) || '';
    if (st && !knownStatus(st)) { st = ''; save('status', null); }
    view.status = st;
    if (view.open && !w.DATA.referral(view.open)) { view.open = null; save('open', null); }
  }

  function resetView() {
    view.search = '';
    view.status = '';
    view.sort = NEW_FIRST;
    save('search', null);
    save('status', null);
    save('sort', null);
  }

  function filtering() { return !!(view.search || view.status); }

  /* --- выборка ------------------------------------------------------------
     Один проход: поиск, статус и порядок применяются вместе. Отбор делает шов,
     порядок — экран: «сначала старые» это вид, а не другая выборка. */
  function raw() { return w.DATA.referrals({}); }

  function found() {
    var list = w.DATA.referrals({ query: view.search, status: view.status || 'all' });
    if (view.sort === 'old') {
      list = list.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    }
    return list;
  }

  /* --- строка отбора ------------------------------------------------------
     Поиск слева, порядок прижат к правому краю: он про вид списка, а не про
     отбор, и стоять с ним в один ряд не должен. Обе половины рисует общая
     панель Render.filterBar — своей копии поля у экрана нет. */
  function toolbar() {
    return w.Render.filterBar({
      id: 'zv-tools',
      fields: [
        { name: 'search', kind: 'search', label: 'Поиск по фамилии или телефону',
          placeholder: 'Поиск по фамилии или телефону', value: view.search },
        { name: 'sort', kind: 'select', label: 'Порядок по дате', icon: 'clock',
          value: view.sort, tail: true, options: [
            { value: 'new', title: 'Сначала новые' },
            { value: 'old', title: 'Сначала старые' }
          ] }
      ]
    });
  }

  /* Лента считает ВЕСЬ поток, а не пересечение с поиском: она показывает
     раскладку, по которой выбирают. Счётчик, который меняется от набранной
     фамилии, перестаёт быть раскладкой и становится вторым результатом. */
  function tally() {
    return w.Render.referralTally({ list: raw(), active: view.status, act: 'tally' });
  }

  /* --- строки таблицы ----------------------------------------------------- */

  function patient(r) {
    /* Телефон и номер направления не ломаются посреди цифр, но перенос между
       ними разрешён: одной неразрывной строкой они на 1280 вылезали за
       границу своей зоны на три пикселя. */
    return '<span class="zv-name">' + esc(r.patientName) + '</span>' +
      '<span class="zv-sub"><span class="zv-nw">' + esc(r.patientPhone) + '</span> · ' +
      '<span class="zv-nw">' + esc(r.number) + '</span></span>';
  }

  function service(r) {
    return '<span class="zv-svc">' + esc(r.serviceTitle) + '</span>' +
      '<span class="zv-sub">' + esc(r.clinicCity) + '</span>';
  }

  /* Тревога вытесняет дату, а не встаёт рядом с ней: у застрявшего
     направления дата отправки — не то, что надо прочесть первым.

     🔴 Фразу целиком отдаёт шов (поле stuck). Экран не выкраивает из неё
     половину «что делать»: подстрока, найденная в чужом тексте, тихо
     умирает от смены формулировки в данных, и этот дефект здесь уже
     ловили дважды. */
  function statusCell(r) {
    var sub = r.stuck
      ? '<span class="zv-stuck">' + ic('warn', 'ic--sm') +
        '<span>' + esc(r.stuck) + '</span></span>'
      : '<span class="zv-sub">направлен ' + esc(fmt.exact(r.createdAt)) + '</span>';
    return w.Render.referralBadge(r) + sub;
  }

  /* Деньги по ступени. Пусто не оставляем и прочерк не ставим: у девяти строк
     из четырнадцати ни суммы, ни начисления, и пустая правая зона читалась бы
     как поломка. Слова те же, что в раскрытой карточке, только короче.
     Начисление идёт короткой формой со звёздочкой, а подпись к ней приходит
     из того же вызова и стоит полосой под таблицей: голое число выглядит
     ставкой, согласованной клиникой, а её назначил владелец на время показа. */
  function money(r, bonus) {
    if (r.status === 'created' || r.status === 'booked') {
      return '<span class="zv-later">после приёма</span>';
    }
    if (r.status === 'noshow' || r.status === 'cancelled') {
      return '<span class="zv-later">услуга не оказана</span>';
    }
    var cell = bonus.cell(r);
    return '<span class="zv-sum">' + (r.amount ? esc(fmt.money(r.amount)) : '') + '</span>' +
      '<span class="zv-sub">' + (cell ? 'начислено ' + cell : 'бонус считает клиника') + '</span>';
  }

  var COLS = [
    { title: 'Пациент', cls: 'zv-z1' },
    { title: 'Услуга и клиника', cls: 'zv-z2' },
    { title: 'Статус', cls: 'zv-z3' },
    { title: 'Сумма и начисление', cls: 'zv-z4', num: true }
  ];

  /* Полоса раскрытия — общая карточка направления в широкой раскладке:
     лестница в ряд, комментарии и журнал колонками рядом. Столбиком та же
     карточка занимала 847 px, и список выталкивало за нижний край экрана. */
  function table(list) {
    /* Ячейка и сноска приходят одним вызовом: короткая форма числа без своей
       подписи наружу не выходит, и забыть её здесь физически нечем. */
    var bonus = w.Render.referralBonusColumn(list, { bar: true, barCls: 'zv-foot' });
    var all = raw().length;
    return w.Render.zoneTable({
      cls: 'zv-table',
      cols: COLS,
      toggle: 'ref-toggle',
      rows: list.map(function (r) {
        var open = view.open === r.id;
        return {
          id: r.id, open: open, label: r.patientName,
          cells: [patient(r), service(r), statusCell(r), money(r, bonus)],
          band: open ? w.Render.referralCard(r, { wide: true }) : ''
        };
      }),
      foot: {
        left: list.length === all
          ? esc('Показаны все ' + all + ' ' +
              fmt.plural(all, 'направление', 'направления', 'направлений'))
          : esc('Показано ' + list.length + ' из ' + all),
        right: '<a class="act" href="vrach-napravlenie.html">Направить ещё пациента' +
          ic('arrow-right', 'ic--sm') + '</a>'
      }
    }) + bonus.footnote;
  }

  /* --- заголовок списка ---------------------------------------------------
     Подпись справа от линейки говорит про весь список сразу: сколько их,
     сколько ждут действия врача и в каком порядке они лежат. Под отбором она
     меняется на долю: «0 из 14» объясняет пустой экран раньше, чем врач
     решит, что список сломался. */
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
     Их два, и они про разное: пустой отбор чинится сбросом фильтров, пустой
     кабинет — первым направлением. Один текст на оба случая отправил бы
     нового партнёра искать несуществующие фильтры. */
  function nothingFound() {
    /* Сноска только там, где пусто именно из-за пересечения: счётчик на ленте
       показывает единицы, а список пуст, и это выглядит как расхождение
       прибора с самим собой. Когда орган отбора один, объяснять нечего. */
    var crossed = view.search && view.status
      ? w.Render.hintBar({
          cls: 'zv-foot', icon: 'message',
          text: 'Счётчики на ленте считают все направления, а список — их пересечение ' +
            'с поиском: направление попадает в счётчик своей ступени и всё равно ' +
            'не выходит в список.'
        })
      : '';
    return '<div class="card zv-nothing">' + w.Render.emptyState({
      round: true,
      title: 'По этому запросу ничего нет',
      text: 'Ни одно направление не подходит под поиск и фильтр. Измените запрос или снимите отбор.',
      icon: 'search',
      action: { text: 'Сбросить отбор', act: 'filters-reset', cls: 'btn--secondary' }
    }) + '</div>' + crossed;
  }

  function nothingYet() {
    return '<div class="card zv-nothing">' + w.Render.emptyState({
      round: true,
      title: 'Вы ещё никого не направили',
      text: 'Направления появятся здесь сразу после отправки формы: вы увидите, записался ли пациент, дошёл ли он и что начислила клиника.',
      icon: 'calendar-plus',
      action: { text: 'Направить пациента', href: 'vrach-napravlenie.html' }
    }) + '</div>';
  }

  function renderList() {
    var box = document.getElementById('zv-list');
    var all = raw();
    if (!all.length) { box.innerHTML = nothingYet(); return; }
    var list = found();
    box.innerHTML = w.Render.sectionHead({
      title: 'Все направления', aside: aside(list.length, all.length)
    }) + (list.length ? table(list) : nothingFound());
  }

  /* Лента перерисовывается вместе со списком: выбранная ступень на ней —
     часть состояния списка, а не отдельный орган со своей памятью. */
  function renderTally() {
    var box = document.getElementById('zv-tally');
    if (box) { box.innerHTML = tally(); }
  }

  function render() {
    document.getElementById('page').innerHTML =
      '<h1 class="h1 page__title">Мои направления</h1>' +
      (raw().length ? toolbar() + '<div id="zv-tally"></div>' : '') +
      '<div id="zv-list"></div>';
    if (raw().length) {
      renderTally();
      /* Обработчик перерисовывает СПИСОК, а не страницу: панель, собранная
         заново на каждой букве, теряет фокус поля поиска. */
      w.Render.filterBind('#zv-tools', function (name, value) {
        view[name] = value;
        save(name, name === 'sort' && value === NEW_FIRST ? null : value);
        /* Лента пересобирается вместе со списком, хотя её счётчики от поиска
           и не меняются. Оставленная нетронутой, она была бы права по виду и
           не проверяема по существу: несостоявшаяся перерисовка скрывала бы
           счётчик, который на самом деле считает пересечение. */
        renderTally();
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
    /* Список длиннее экрана, и полоса может раскрыться за его нижним краем:
       без этого щелчок выглядит как «ничего не произошло». block: 'nearest'
       не двигает страницу, когда полоса и так видна. */
    var box = document.querySelector('.ztable__band.is-open');
    if (box && box.scrollIntoView) { box.scrollIntoView({ block: 'nearest' }); }
  }

  /* Полосу раскрывает не только щелчок по строке: с главной сюда ведёт
     «Открыть направление», и слот приходит уже заполненным. Прокрутка ставит
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
       уходящей страницы нельзя. Тот же выход у главной врача. */
    if (!w.Shell.mount({ active: 'vrach-zayavki', role: 'vrach' })) { return; }
    w.Shell.on('ref-toggle', toggle);
    w.Shell.on('tally', pickStatus);
    w.Shell.on('filters-reset', function () { resetView(); render(); });
    loadView();
    render();
    showOpen();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
