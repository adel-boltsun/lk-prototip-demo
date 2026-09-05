/* Экран 8 «Партнёры» — панель клиники.
   Две вкладки на одном экране. Реестр: кто партнёр, где работает, сколько
   направил и сколько из них дошло, на какую сумму и что с неё начислено.
   Очередь модерации: заявки на регистрацию с контактами и датой, две кнопки
   решения, у вкладки счётчик непросмотренных.

   🔴 Композиция реестра перенесена с собранного по рисунку соседнего экрана
   («Мои направления»), и в спорных местах она главнее прежней сборки.
   Что она поменяла:

   1. Восемь колонок свёрнуты в четыре зоны неравной ширины. Восьми колонкам
      нужно было больше места, чем колонка отдаёт на 1440, и реестр жил в
      собственной прокрутке вбок. Зоны собраны не по колонке на поле: строка
      здесь описывает не событие, а ЧЕЛОВЕКА и его результат, и зоны отвечают
      на четыре вопроса подряд — кто это, где работает, что сделал, сколько
      это принесло клинике. Механическая раскладка рвала последнюю пару:
      сумма услуг и начисленное с неё — одна мысль, а не два числа рядом.
   2. Первичная ось отбора — лента городов со счётчиками, а не выпадающий
      список: список прячет раскладку реестра по городам. Порядок остался
      выпадающим — он про вид списка, а не про отбор, и прижат к правому краю.
   3. Пустых зон в строке не остаётся. У нового партнёра нули везде, и
      «0 ₽» со сноской про демонстрационную ставку подписывал бы пустоту:
      зона говорит словами, чего ещё не было.

   Решение по заявке делает шов (DATA.approveRegistration и
   DATA.rejectRegistration) — он же кладёт его в Store, поэтому подтверждение
   и отказ переживают перезагрузку. Подтверждённый врач встаёт в реестр той же
   строкой, что и остальные: реестр считает шов, экран его не пересчитывает.

   Общие блоки — панель отбора, пустое состояние, окно, короткая форма
   начисления — живут в Render; своих версий экран не заводит. Отдельно про
   начисление: сумма приходит из DATA и наружу идёт только через
   Render.referralBonusColumn — число без подписи здесь получить нельзя.

   Состояния — по таблице спецификации, экран 8: есть партнёры · очередь
   пуста · реестр пуст. Данные только через DATA.
   Утверждения по таблице — tools/test-admin-partnery.html. */
(function (w) {
  'use strict';

  var SLOT = 'admin:partnery:';
  var REESTR = 'reestr';
  var MODER = 'moderaciya';
  var BY_REFS = 'refs';
  var UNKNOWN = '[уточняется]';

  /* Порядок в реестре. Спецификация просит два: по числу направлений и по
     сумме оказанных услуг. Имя — третий и нейтральный: по нему ищут
     конкретного врача, когда фамилию уже знают. */
  var ORDERS = [
    { value: BY_REFS, title: 'Больше направлений' },
    { value: 'sum', title: 'Больше сумма услуг' },
    { value: 'name', title: 'По имени' }
  ];
  /* Тот же порядок словами свода над таблицей. Подписи разные намеренно: в
     органе отбора стоит команда («больше направлений»), в своде — описание
     того, что перед глазами («больше направлений сверху»). */
  var ORDER_NOTE = {
    refs: 'больше направлений сверху',
    sum: 'больше сумма услуг сверху',
    name: 'по имени'
  };

  var fmt = w.Render.fmt;
  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  var view = { tab: REESTR, search: '', city: '', sort: BY_REFS };
  /* Окно отказа и итог последнего решения живут в памяти страницы: ни то ни
     другое не состояние прототипа. Само решение — состояние, и его держит
     шов в Store. */
  var dialog = null, dialogId = null, said = '';

  /* --- вкладка и отбор живут в Store --------------------------------------
     Заказчик щёлкает панель прототипа, страница перезагружается — и терять
     ни выбранную вкладку, ни отбор ей нельзя. */
  function slot(name) { return SLOT + name; }
  function save(name, value) { w.Store.setValue(slot(name), value || null); }

  /** Вкладка, названная адресом. Нужна прибору: матрица ширин открывает
      страницу по адресу и до кнопок не добирается, а мерить надо обе
      вкладки. В Store такая вкладка не пишется — иначе замер ширин менял бы
      то, что покажет следующее открытие страницы. */
  function asked() { return /[?&]vkladka=moderaciya\b/.test(w.location.search) ? MODER : ''; }

  function known(list, id, key) {
    var ok = false;
    list.forEach(function (x) { if (String(x[key || 'id']) === String(id)) { ok = true; } });
    return ok;
  }

  /** Забытый отбор проверяется по спискам клиники: города приходят из реестра
      и меняются вместе с ним, а пустая таблица без видимой причины читается
      как поломка. */
  function remembered(name, list, key) {
    var v = w.Store.value(slot(name)) || '';
    if (v && !known(list, v, key)) { v = ''; save(name, null); }
    return v;
  }

  function loadView() {
    view.tab = asked() || (w.Store.value(slot('tab')) === MODER ? MODER : REESTR);
    view.search = w.Store.value(slot('search')) || '';
    view.city = remembered('city', cities(), 'value');
    view.sort = remembered('sort', ORDERS, 'value') || BY_REFS;
  }

  function resetView() {
    view.search = ''; view.city = ''; view.sort = BY_REFS;
    ['search', 'city', 'sort'].forEach(function (n) { save(n, null); });
  }

  /* --- выборка ------------------------------------------------------------
     Реестр целиком считает шов: сколько направил, сколько дошло, на какую
     сумму и когда в последний раз. Экран отбирает и упорядочивает — своей
     арифметики по направлениям у него нет, иначе реестр и табло разойдутся
     в числах об одном и том же. */
  function all() { return w.DATA.partners(); }

  /** Города реестра — из самого реестра, а не из списка клиник: партнёр
      работает там, где работает, и в Ессентуках клиники ФАКТа нет. */
  function cities() {
    var seen = {}, out = [];
    all().forEach(function (p) {
      if (p.city && !seen[p.city]) { seen[p.city] = true; out.push({ value: p.city, title: p.city }); }
    });
    return out.sort(function (a, b) { return a.value < b.value ? -1 : 1; });
  }

  function matches(p, q) {
    return (p.name + ' ' + p.city + ' ' + p.workplace + ' ' + p.specialty)
      .toLowerCase().indexOf(q) > -1;
  }

  /* Отбор ли виноват в коротком списке — вопрос свода над таблицей и пустого
     состояния под ней. Порядок сюда не входит: он списка не сужает. */
  function filtering() { return !!(view.search || view.city); }

  function found() {
    var q = String(view.search || '').trim().toLowerCase();
    var list = all().filter(function (p) {
      if (view.city && p.city !== view.city) { return false; }
      if (q && !matches(p, q)) { return false; }
      return true;
    });
    return list.sort(function (a, b) {
      if (view.sort === 'name') { return a.name < b.name ? -1 : 1; }
      var key = view.sort === 'sum' ? 'servicesSum' : 'referrals';
      if (b[key] !== a[key]) { return b[key] - a[key]; }
      return a.name < b.name ? -1 : 1;
    });
  }

  /* --- вкладки ------------------------------------------------------------
     Счётчик — длина очереди модерации, и второго счёта у него нет: цифра на
     вкладке и число карточек под ней обязаны совпадать, иначе администратор
     ищет заявку, которой нет. */
  function queue() { return w.DATA.moderationQueue(); }

  function counter() {
    var n = queue().length;
    return n ? '<span class="pt-tab__count" id="pt-count">' + n + '</span>' : '';
  }

  function tab(id, title, extra) {
    var on = view.tab === id;
    return '<button class="pt-tab' + (on ? ' is-on' : '') + '" type="button" role="tab"' +
      ' data-act="tab" data-id="' + id + '" aria-selected="' + (on ? 'true' : 'false') + '"' +
      ' aria-controls="pt-body">' + esc(title) + (extra || '') + '</button>';
  }

  function tabs() {
    return '<div class="pt-tabs" role="tablist">' +
      tab(REESTR, 'Реестр партнёров') +
      tab(MODER, 'На модерации', counter()) +
      '</div>';
  }

  /* --- реестр -------------------------------------------------------------
     Поиск слева, порядок в реестре прижат к правому краю общим .filters__tail:
     порядок — про вид списка, а не про отбор, и в один ряд с ним не встаёт.
     Панель рисует общий блок Render.filterBar — тот же, что у табло заявок. */
  function toolbar() {
    return w.Render.filterBar({
      id: 'pt-filters',
      fields: [
        { name: 'search', kind: 'search', label: 'Поиск по врачу, городу или месту работы',
          placeholder: 'Поиск по врачу, городу или месту работы', value: view.search, wide: true },
        { name: 'sort', kind: 'select', label: 'Порядок в реестре', icon: 'clipboard',
          value: view.sort, tail: true, options: ORDERS }
      ]
    });
  }

  /** Город лентой со счётчиками, а не выпадающим списком: город — первичная
      ось отбора реестра, и список её прячет. Администратор узнаёт, что в
      Краснодаре у клиники двое партнёров, а в Ессентуках один, только
      открыв список; лента говорит это сразу.

      Счётчик считает ВЕСЬ реестр, а не пересечение с поиском: лента
      показывает раскладку, по которой выбирают, и число, меняющееся от
      набранной фамилии, перестало бы быть раскладкой.

      Точки у пунктов нет: у города нет тона, и красить его было бы
      украшением — тон в ленте означает ступень статуса. */
  function cityTally() {
    var whole = all();
    var items = [{ id: '', title: 'Все города', count: whole.length, hold: true }];
    cities().forEach(function (c) {
      var n = 0;
      whole.forEach(function (p) { if (p.city === c.value) { n++; } });
      items.push({ id: c.value, title: c.title, count: n });
    });
    return w.Render.tallyRibbon({
      items: items, active: view.city, act: 'city-pick', label: 'Отбор по городу'
    });
  }

  /** Короткая форма начисления и её сноска приходят одним вызовом общего
      блока: получить число без подписи физически нельзя, и это намеренно —
      ставку назначил владелец на время показа, а голая сумма читается как
      согласованная клиникой. Блок читает поле bonus, поэтому свод по партнёру
      подаётся ему под этим именем. Ноль показывается пустой ячейкой:
      «0 ₽» со сноской про демонстрационную ставку — это подпись ни к чему. */
  function sum(p) { return p.accrued ? p.accrued : null; }

  function bonusColumn(list) {
    /* bar: подпись уходит полосой-пояснением под карточку таблицы, как на
       соседнем экране: она про весь список, а не про последнюю строку. */
    var col = w.Render.referralBonusColumn(list.map(function (p) {
      return { id: p.id, bonus: sum(p) };
    }), { bar: true, barCls: 'pt-note' });
    return {
      cell: function (p) { return col.cell({ bonus: sum(p) }); },
      footnote: col.footnote
    };
  }

  /* --- зоны строки --------------------------------------------------------
     Строка описывает не событие, а человека и его результат, и зоны идут
     четырьмя вопросами подряд: кто это · где работает · что сделал · сколько
     это принесло клинике. */

  /** Кто. R29i: партнёр везде назван по имени — обезличенного «партнёра» в
      реестре нет. Метка новичка стоит здесь же: ряд нулей справа объясняется
      тем, кто этот человек, а не тем, что реестр сломался. */
  function whoZone(p) {
    /* Имя — ссылка в карточку партнёра: строка реестра и есть первая из двух
       точек входа в неё. Возврат назван адресом (iz=reestr), потому что вторая
       точка входа — фамилия на табло — обязана вернуть человека на табло,
       а не в чужой список. */
    return '<a class="pt-name" href="admin-partner.html?vrach=' +
        encodeURIComponent(p.id) + '&iz=reestr">' + esc(p.name) + '</a>' +
      '<span class="pt-sub">' + esc(p.specialty || UNKNOWN) + '</span>' +
      (p.confirmedAt ? '<span class="badge badge--ok pt-new">Новый партнёр</span>' : '');
  }

  /** Где работает. Город под местом работы, а не отдельной колонкой: две
      колонки на один ответ и разносили строку по ширине. */
  function placeZone(p) {
    return '<span class="pt-place">' + esc(p.workplace || UNKNOWN) + '</span>' +
      '<span class="pt-sub">' + esc(p.city || UNKNOWN) + '</span>';
  }

  /** Что сделал: сколько направил, сколько из них дошло и когда направлял в
      последний раз. «Дошло» — доля от направленного, и стоять оно должно под
      ним, а не отдельным числом в стороне: два счётчика рядом читаются как
      независимые. Дата затихшего партнёра — тот же разговор: она объясняет,
      почему числа слева не растут. */
  function flowZone(p) {
    if (!p.referrals) {
      return '<span class="pt-num">0</span>' +
        '<span class="pt-sub">ещё не направлял</span>';
    }
    return '<span class="pt-num">' + p.referrals + '</span>' +
      '<span class="pt-sub">дошло ' + p.arrived + '</span>' +
      (p.lastAt
        ? '<span class="pt-sub">последнее <span class="pt-nw">' +
            esc(fmt.exact(p.lastAt)) + '</span></span>'
        : '');
  }

  /** Сколько принёс. Сумма оказанных услуг крупно, начисленное с неё — под
      ней: это одна мысль, а не два числа рядом. Начисление идёт короткой
      формой со звёздочкой, подпись к ней приходит из того же вызова и стоит
      полосой под таблицей. Пустой зоны не остаётся: у нового партнёра ни
      суммы, ни начисления, и пустая правая половина строки читается как
      поломка. */
  function moneyZone(p, bonus) {
    if (!p.servicesSum) {
      return '<span class="pt-later">услуг ещё не было</span>';
    }
    var cell = bonus.cell(p);
    return '<span class="pt-num">' + esc(fmt.money(p.servicesSum)) + '</span>' +
      '<span class="pt-sub">' + (cell ? 'начислено ' + cell : 'бонус считает клиника') + '</span>';
  }

  var COLS = [
    { title: 'Врач', cls: 'pt-z1' },
    { title: 'Где работает', cls: 'pt-z2' },
    { title: 'Направления', cls: 'pt-z3' },
    { title: 'Сумма и начисление', cls: 'pt-z4', num: true }
  ];

  /** Таблица на зонах — общий приём Render.zoneTable. Раскрытия у реестра
      нет: строка про человека договорена целиком, и разворачивать в ней
      нечего — путь пациента живёт на табло заявок. */
  function table(list) {
    var bonus = bonusColumn(list);
    var whole = all().length;
    return w.Render.zoneTable({
      cls: 'pt-table',
      cols: COLS,
      rows: list.map(function (p) {
        return {
          id: p.id, label: p.name,
          cells: [whoZone(p), placeZone(p), flowZone(p), moneyZone(p, bonus)]
        };
      }),
      foot: {
        left: esc(list.length === whole
          ? 'Показаны все ' + whole + ' ' +
            fmt.plural(whole, 'партнёр', 'партнёра', 'партнёров')
          : 'Показано ' + list.length + ' из ' + whole)
      }
    }) + bonus.footnote;
  }

  /** Подпись справа от линейки: сколько партнёров, сколько из них ещё не
      направляли и в каком порядке лежит список. Затихший партнёр — то, ради
      чего реестр и читают, и в своде он виден раньше, чем в строках. Под
      отбором подпись меняется на долю: «0 из 6» объясняет пустой экран
      раньше, чем администратор решит, что реестр сломался. */
  function aside(shown, whole) {
    if (filtering()) { return shown + ' из ' + whole + ' подходят под отбор'; }
    var idle = 0;
    all().forEach(function (p) { if (!p.referrals) { idle++; } });
    return whole + ' ' + fmt.plural(whole, 'партнёр', 'партнёра', 'партнёров') +
      (idle ? ' · ' + idle + ' ещё не направляли' : '') + ' · ' + ORDER_NOTE[view.sort];
  }

  /* Пустых состояния у реестра два, и они про разное: пустой отбор чинится
     сбросом фильтров, пустой реестр — тем, что программа только запускается.
     Один текст на оба случая отправил бы администратора искать фильтры,
     которых он не ставил. Оба остаются в карточке: без неё страница на
     пустом отборе теряет коробку и прыгает. */
  function noneFound() {
    return '<div class="card pt-nothing">' + w.Render.emptyState({
      round: true,
      title: 'Партнёров по этому отбору нет',
      text: 'Ни один врач не подходит под поиск и выбранный город. Измените запрос или снимите отбор.',
      icon: 'search',
      action: { text: 'Сбросить фильтры', act: 'filters-reset', cls: 'btn--secondary' }
    }) + '</div>';
  }

  function noneYet() {
    return '<div class="card pt-nothing">' + w.Render.emptyState({
      round: true,
      title: 'Партнёров ещё нет',
      text: 'Клиника только запускает партнёрскую программу. Первый врач встанет в реестр, как только вы подтвердите его заявку на вкладке «На модерации».',
      icon: 'user'
    }) + '</div>';
  }

  function renderList() {
    var box = document.getElementById('pt-list');
    if (!box) { return; }
    var whole = all();
    if (!whole.length) { box.innerHTML = noneYet(); return; }
    var list = found();
    box.innerHTML = w.Render.sectionHead({
      title: 'Все партнёры', aside: aside(list.length, whole.length)
    }) + (list.length ? table(list) : noneFound());
  }

  /* Лента перерисовывается вместе со списком: выбранный город на ней — часть
     состояния списка, а не отдельный орган со своей памятью. */
  function renderTally() {
    var box = document.getElementById('pt-tally');
    if (box) { box.innerHTML = cityTally(); }
  }

  function registry() {
    return (all().length ? toolbar() + '<div id="pt-tally"></div>' : '') +
      '<div id="pt-list"></div>';
  }

  /* --- очередь модерации --------------------------------------------------
     Заявка — карточка в три зоны, разделённые волосяными линиями: слева якорь
     очереди (сколько ждёт), в середине личность и контакты, справа решение.
     Так карточка читается сверху вниз одним взглядом по левому столбцу, а
     кнопки стоят своей колонкой и не гуляют по высоте вслед за контактами.
     Раскладка перенесена с утверждённого рисунка экрана, а не собрана из
     готовых блоков: дизайн-система даёт детали, композицию — рисунок. */

  /** Сколько заявка ждёт ответа. Считается от полуночи, как и Fmt.relative:
      иначе «5 дней» превращается в «4 дня» в зависимости от часа, когда
      администратор открыл экран. Крупное число слева — и якорь карточки,
      и ключ, по которому очередь отсортирована. */
  function waited(iso) {
    if (!iso) { return UNKNOWN; }
    var a = new Date(iso); a.setHours(0, 0, 0, 0);
    var b = new Date(); b.setHours(0, 0, 0, 0);
    var n = Math.round((b - a) / 86400000);
    if (n <= 0) { return 'сегодня'; }
    return n + ' ' + fmt.plural(n, 'день', 'дня', 'дней');
  }

  /** Порядок очереди — от самой давней заявки. Шов отдаёт свежие сверху: это
      его порядок, а переупорядочивание принадлежит экрану, как и отбор в
      реестре. Крупный срок слева имеет смысл, только если список по нему и
      отсортирован — иначе число читается как украшение. */
  function waiting() {
    return queue().slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }

  /** Контакт строкой «значок · прописная подпись · значение», вертикальным
      стеком. Раньше четыре поля стояли равными колонками во всю ширину
      карточки, и почта с телефоном читались как таблица, а не как карточка
      человека. */
  function meta(name, label, value) {
    return '<div class="pt-app__meta">' +
      '<span class="pt-app__ic">' + ic(name) + '</span>' +
      '<span class="pt-app__field"><span class="label">' + esc(label) + '</span>' +
        '<span class="pt-app__value">' +
          (value ? w.Render.soft(value) : '<span class="muted">' + esc(UNKNOWN) + '</span>') +
        '</span></span></div>';
  }

  /** Карточка заявки — общий приём Render.zoneCard: три зоны, волосяные линии
      между ними и поле внутри каждой приходят оттуда, своей копии у экрана
      больше нет. Экран отдаёт только содержимое зон и класс композиции
      .pt-app, который назначает ширины с рисунка (280 / резина / 300).
      Левая зона — общий приём Render.anchor: крупный срок с подписью над ним
      и датой подачи под ним. */
  function appCard(q) {
    return w.Render.zoneCard({ cls: 'pt-app', id: q.id, zones: [
      { cls: 'pt-app__wait', body: w.Render.anchor({
          label: 'Ждёт ответа',
          value: waited(q.at),
          note: q.at ? 'Заявка от ' + fmt.exact(q.at) : UNKNOWN
        }) },
      { cls: 'pt-app__who', body:
        '<div class="pt-app__head">' +
          '<span class="pt-app__name">' + esc(q.name) + '</span>' +
          '<span class="pt-app__spec">' + esc(q.specialty || UNKNOWN) + '</span>' +
        '</div>' +
        '<div class="pt-app__contacts">' +
          meta('building', 'Место работы', q.workplace) +
          meta('phone', 'Телефон', q.phone) +
          meta('mail', 'Почта', q.email) +
        '</div>' },
      { cls: 'pt-app__decide', body:
        '<button class="btn btn--primary btn--block" type="button" data-act="approve" data-id="' + esc(q.id) + '">' +
          ic('check', 'ic--sm') + 'Подтвердить</button>' +
        '<button class="btn btn--secondary btn--block" type="button" data-act="reject-open" data-id="' + esc(q.id) + '">' +
          ic('close', 'ic--sm') + 'Отклонить</button>' +
        '<p class="pt-app__why">При отказе нужна причина — врач увидит её на ' +
          'экране регистрации.</p>' }
    ] });
  }

  /** Счётчик у заголовка очереди. Число здесь второе: первое стоит на самой
      вкладке, и разойтись они не могут — обоим его считает одна очередь.
      Сам заголовок с линейкой рисует общий приём Render.sectionHead, его
      зовёт Render.section вместе с телом секции. */
  function queueAside(n) {
    return n + ' ' + fmt.plural(n, 'заявка', 'заявки', 'заявок');
  }

  /** Замыкающая сноска: список кончился не потому, что сломался. Заявки
      заводит не клиника — врач по ссылке-приглашению, и ждать следующую
      администратору больше неоткуда. Полоса-пояснение — общий приём
      Render.hintBar; экран добавляет только отступ от списка классом
      .pt-foot. */
  function queueFoot() {
    return w.Render.hintBar({
      icon: 'link', cls: 'pt-foot',
      text: 'Следующая заявка появится здесь, как только врач заполнит анкету ' +
        'по ссылке-приглашению.'
    });
  }

  /** Пустая очередь по рисунку: значок в круге, заголовок, две строки
      объяснения и тихая ссылка в реестр. Всё, кроме ссылки, рисует общий блок
      Render.emptyState, и круг — его вариант {round}, а не правила в стилях
      экрана: тот же круг просит соседний экран, и второй копии этого вида
      быть не должно. Ссылка стоит рядом с блоком своим общим классом .act, а
      не в его слоте действия: слот отдаёт главную зелёную кнопку, а уходить
      из разобранной очереди некуда и торопить незачем. */
  function queueEmpty() {
    return w.Render.emptyState({
      round: true,
      title: 'Новых заявок на регистрацию нет',
      text: 'Все заявки от врачей разобраны. Следующая появится здесь, как только врач заполнит анкету по ссылке-приглашению.',
      icon: 'inbox'
    }) +
      '<p class="pt-empty__act"><button class="act" type="button" data-act="open-reestr">' +
        'Открыть реестр партнёров' + ic('arrow-right', 'ic--sm') + '</button></p>';
  }

  /* Решение видно после того, как принято. Без этого блока «отклонить
     с причиной» сохраняет причину в никуда: заявка исчезает из очереди, и
     проверить, что записалось, может только прибор. */
  function doneRow(d) {
    var ok = d.decision === 'approved';
    return '<article class="card pt-done__item" data-id="' + esc(d.id) + '">' +
      '<div class="pt-done__head"><span class="strong">' + esc(d.application.name) + '</span>' +
        '<span class="badge ' + (ok ? 'badge--ok' : 'badge--off') + '">' +
          esc(d.decisionTitle) + '</span>' +
        '<span class="muted">' + esc(fmt.exact(d.at)) + ' · ' + esc(d.who) + '</span></div>' +
      '<p class="pt-done__why">' + (ok
        ? 'Партнёр добавлен в реестр.'
        : 'Причина: ' + esc(d.reason || UNKNOWN)) + '</p>' +
    '</article>';
  }

  function decided() {
    var list = w.DATA.registrationDecisions();
    if (!list.length) { return ''; }
    return '<section class="pt-done"><h2 class="h2">Решения по заявкам</h2>' +
      '<div class="stack">' + list.map(doneRow).join('') + '</div></section>';
  }

  function moderation() {
    var list = waiting(), done = decided();
    /* Пустое состояние встаёт по центру рабочей области, но только когда под
       ним ничего нет: с журналом решений внизу центрировать нечего, и высокая
       коробка отодвинула бы журнал за нижний край. */
    return (said ? '<p class="pt-said">' + esc(said) + '</p>' : '') +
      (list.length
        ? w.Render.section({
            cls: 'pt-queue', title: 'Ждут решения', aside: queueAside(list.length),
            body: '<div class="pt-apps">' + list.map(appCard).join('') + '</div>' +
              queueFoot()
          })
        : '<div class="pt-empty' + (done ? '' : ' pt-empty--tall') + '">' +
            queueEmpty() + '</div>') +
      done;
  }

  /* --- решения ------------------------------------------------------------ */

  function fail(text) {
    var box = dialog ? dialog.querySelector('#pt-error') : null;
    if (box) { box.textContent = text; }
  }

  function approve(btn) {
    var d = w.DATA.approveRegistration(btn.getAttribute('data-id'));
    if (!d) { w.Render.soon('Подтверждение заявки'); return; }
    said = 'Заявка подтверждена: ' + d.application.name + ' — врач встал в реестр партнёров.';
    afterDecision();
  }

  /** Окно отказа, а не сразу отказ: причину надо где-то написать, и в подвале
      карточки места под неё нет. Слова по умолчанию подставляет экран из
      DATA.rejectionReason() — так на показе отказ выглядит отказом, а не
      пустым полем; переписать их администратор может целиком. */
  function rejectOpen(btn) {
    var id = btn.getAttribute('data-id');
    var q = queue().filter(function (x) { return x.id === id; })[0];
    if (!q) { w.Render.soon('Отклонение заявки'); return; }
    dialogId = id;
    dialog = w.Render.modal({
      title: 'Отклонить заявку',
      text: q.name + ' · ' + q.specialty + '. Причину увидит врач на экране регистрации.',
      html: '<label class="field"><span class="label">Причина отказа</span>' +
          '<textarea class="input" id="pt-why" rows="4" ' +
          'placeholder="Почему заявка отклонена">' + esc(w.DATA.rejectionReason()) + '</textarea></label>' +
        '<p class="pt-error" id="pt-error" role="alert"></p>',
      foot: '<button class="btn btn--danger" type="button" data-act="reject-save">Отклонить заявку</button>' +
            '<button class="btn btn--secondary" type="button" data-act="modal-close">Отмена</button>',
      onClose: function () { dialog = null; dialogId = null; }
    });
  }

  /** Сохранить отказ. Причина обязательна: отказ без неё ничего не объясняет
      ни врачу, ни следующему администратору. Записывает шов — он же кладёт
      решение в состояние прототипа. */
  function rejectSave() {
    if (!dialog || !dialogId) { return; }
    var why = dialog.querySelector('#pt-why');
    var text = why ? String(why.value || '').trim() : '';
    if (!text) {
      fail('Напишите причину отказа: её увидит врач на экране регистрации.');
      if (why) { why.focus(); }
      return;
    }
    var d = w.DATA.rejectRegistration(dialogId, text);
    if (!d) { fail('Заявка не сохранилась: похоже, решение по ней уже принято.'); return; }
    said = 'Заявка отклонена: ' + d.application.name + ' — причина сохранена.';
    dialog.close();
    afterDecision();
  }

  /* --- отрисовка ---------------------------------------------------------- */

  /** Счётчик вкладки после решения. Перерисовывается сам счётчик, а не
      страница: щелчок по кнопке в карточке не должен уносить из-под пальца
      всё вокруг. */
  function renderTabs() {
    var box = document.querySelector('.pt-tabs');
    if (box) { box.outerHTML = tabs(); }
  }

  function renderBody() {
    var box = document.getElementById('pt-body');
    if (!box) { return; }
    if (view.tab === MODER) { box.innerHTML = moderation(); return; }
    box.innerHTML = registry();
    /* Перерисовывается список, а не вкладка: панель, перерисованная на каждой
       букве, теряет фокус поля поиска. */
    w.Render.filterBind('#pt-filters', function (name, value) {
      view[name] = value;
      save(name, name === 'sort' && value === BY_REFS ? null : value);
      /* Лента пересобирается вместе со списком, хотя её счётчики от поиска и
         не меняются. Оставленная нетронутой, она была бы права по виду и
         не проверяема по существу: несостоявшаяся перерисовка скрывала бы
         счётчик, который на самом деле считает пересечение. */
      renderTally();
      renderList();
    });
    renderTally();
    renderList();
  }

  function afterDecision() {
    renderTabs();
    renderBody();
  }

  function switchTab(btn) {
    var id = btn.getAttribute('data-id') === MODER ? MODER : REESTR;
    view.tab = id;
    /* Вкладка по умолчанию сворачивается в null — как отбор и сортировка
       рядом: в Store лежит только то, что отличается от вида по умолчанию.
       Запись «реестр» держалась ради прожимки, которая считала мёртвой
       кнопку, ничего не изменившую; теперь прожимка не спрашивает движения
       у вкладки, объявившей себя выбранной, и запись ради прибора не нужна. */
    save('tab', id === MODER ? MODER : null);
    /* Итог прошлого решения к другой вкладке не относится и на ней не висит. */
    said = '';
    /* Вкладки перерисовываются целиком: у активной меняется и метка, и
       признак для чтения с экрана, а фокус остаётся на кнопке, по которой
       щёлкнули, — её возвращает разметка на том же месте. */
    renderTabs();
    var again = document.querySelector('.pt-tab[data-id="' + id + '"]');
    if (again) { again.focus(); }
    renderBody();
  }

  function render() {
    document.getElementById('page').innerHTML =
      '<h1 class="h1 page__title">Партнёры</h1>' + tabs() +
      '<div id="pt-body" role="tabpanel"></div>';
    renderBody();
  }

  function init() {
    /* Сценарий чужой роли уводит на её главную: рисовать себя поверх
       уходящей страницы нельзя. Тот же выход у табло заявок. */
    if (!w.Shell.mount({ active: 'admin-partnery', role: 'admin' })) { return; }
    w.Shell.on('tab', switchTab);
    /* Ссылка из пустой очереди уводит на соседнюю вкладку тем же путём, что и
       сама вкладка: switchTab читает data-id, и его отсутствие означает
       реестр. Своего пути у ссылки нет — иначе у вкладки стало бы два
       переключателя, и разъехались бы они не сразу. */
    w.Shell.on('open-reestr', switchTab);
    w.Shell.on('approve', approve);
    w.Shell.on('reject-open', rejectOpen);
    w.Shell.on('reject-save', rejectSave);
    /* Город с ленты: перерисовываются лента и список, а не страница. Лента
       считает весь реестр, поэтому её счётчики от выбора не меняются —
       меняется только то, какой пункт нажат. */
    w.Shell.on('city-pick', function (btn) {
      view.city = btn.getAttribute('data-id') || '';
      save('city', view.city);
      renderTally();
      renderList();
    });
    w.Shell.on('filters-reset', function () { resetView(); renderBody(); });
    loadView();
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
