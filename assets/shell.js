/* Общий каркас всех экранов: шапка с логотипом, переключателем человека и
   выходом, боковое меню, значок замечания и панель прототипа в правом
   нижнем углу. Страницы про них ничего не знают: вызывают Shell.mount и
   кладут своё содержимое в #page. */
(function (w) {
  'use strict';

  /* Девять пунктов по спецификации. В макете нарисованы «Мои записи» и
     «Рекомендации» и нет лояльности — макет старше слияния с КП, источник истины спека. */
  var NAV = [
    { id: 'kabinet',      href: 'kabinet.html',      icon: 'home',           title: 'Главная' },
    { id: 'zapisi',       href: 'zapisi.html',       icon: 'calendar-check', title: 'Мои визиты' },
    { id: 'zapis-novaya', href: 'zapis-novaya.html', icon: 'calendar-plus',  title: 'Записаться' },
    { id: 'smeta',        href: 'smeta.html',        icon: 'invoice',        title: 'Счёт и смета' },
    { id: 'lechenie',     href: 'lechenie.html',     icon: 'drop',           title: 'Лечение' },
    { id: 'dokumenty',    href: 'dokumenty.html',    icon: 'file',           title: 'Документы' },
    { id: 'loyalnost',    href: 'loyalnost.html',    icon: 'card',           title: 'Лояльность' },
    { id: 'profil',       href: 'profil.html',       icon: 'user',           title: 'Профиль' },
    { id: 'vhod',         href: 'index.html',        icon: 'logout',         title: 'Выйти' }
  ];

  /* Реестр действий. Экран регистрирует свои через Shell.on(act, fn);
     клик по data-act без обработчика не молчит, а показывает окно —
     и попадает в отчёт прибора как мёртвая кнопка. */
  var ACTS = {};
  var deadActs = {};

  function icon(n, c) { return w.icon ? w.icon(n, c) : ''; }
  function esc(s) { return w.Render ? w.Render.esc(s) : String(s); }
  function el(html) { var t = document.createElement('div'); t.innerHTML = html; return t.firstElementChild; }

  /* --- имя человека в шапке ----------------------------------------------
     Два списка называют одного и того же человека по-разному: в списке людей
     имя стоит первым («Мария Соколова», «Нина Петровна Соколова»), а в карте
     пациента, которую правят в профиле, — ФИО фамилией вперёд («Соколова
     Мария Андреевна»). Порядок разный, поэтому разбора два, а подпись из них
     собирается одна: на демо-данных обе дают одно и то же, и правка ФИО
     меняет подпись, ничего не переставляя местами. */
  function fromList(name) {
    var p = String(name || '').trim().split(/\s+/);
    return p.length > 2
      ? { first: p[0], middle: p[1], last: p[2] }
      : { first: p[0] || '', middle: '', last: p[1] || '' };
  }
  function fromCard(name) {
    var p = String(name || '').trim().split(/\s+/);
    if (p.length < 2) { return { first: p[0] || '', middle: '', last: '' }; }
    return { first: p[1], middle: p[2] || '', last: p[0] };
  }

  /** ФИО, поправленное в профиле, или null. Слой правок лежит в Store под
      profile:<человек>:<поле>; шапка читает его тем же ключом — иначе в профиле
      новое имя, а в шапке остаётся старое. */
  function editedName(id) {
    var v = w.Store ? w.Store.value('profile:' + id + ':name') : null;
    v = (v === null || v === undefined) ? '' : String(v).trim();
    return v || null;
  }

  function nameOf(p) {
    var own = editedName(p.id);
    return own ? fromCard(own) : fromList(p.name);
  }

  /** Подпись человека на пилюле: себя — полным именем, ребёнка — с возрастом. */
  function personLabel(p) {
    var n = nameOf(p);
    if (p.isSelf) { return n.last ? n.first + ' ' + n.last : n.first; }
    var age = w.Render ? w.Render.fmt.age(p.birthDate) : 0;
    if (age < 18) { return n.first + ', ' + (w.Render ? w.Render.fmt.years(age) : age); }
    if (n.middle) { return n.first + ' ' + n.middle; }
    return n.last ? n.first + ' ' + n.last : n.first;
  }

  /** Имя для приветствия — из того же источника, что и пилюля: две надписи
      в шапке и на главной не должны расходиться. */
  function firstNameOf(id) {
    var found = null;
    (w.DATA ? w.DATA.people() : []).forEach(function (x) { if (x.id === id) { found = x; } });
    if (found) { return nameOf(found).first; }
    var own = editedName(id);
    if (own) { return fromCard(own).first; }
    var pt = w.DATA ? w.DATA.patient() : null;
    return pt ? pt.firstName : '';
  }

  /** Имя для приветствия. Взрослого с отчеством зовут по имени и отчеству:
      «Здравствуйте, Нина Петровна» — 74-летнюю Нину Петровну «Нина» коробит.
      Ребёнка и самого пациента — по имени. Правило то же, что у пилюли
      в шапке: две надписи на одном экране не зовут человека по-разному. */
  function greetNameOf(id) {
    var found = null;
    (w.DATA ? w.DATA.people() : []).forEach(function (x) { if (x.id === id) { found = x; } });
    if (!found) { return firstNameOf(id); }
    var n = nameOf(found);
    if (found.isSelf || !n.middle) { return n.first; }
    var age = w.Render ? w.Render.fmt.age(found.birthDate) : 0;
    return age < 18 ? n.first : n.first + ' ' + n.middle;
  }

  function screenName() {
    var page = document.getElementById('page');
    if (page && page.getAttribute('data-screen')) { return page.getAttribute('data-screen'); }
    return document.title.split('—')[0].trim() || 'экран';
  }

  /* --- шапка ----------------------------------------------------------- */
  function header() {
    var people = w.DATA ? w.DATA.people() : [];
    var current = w.Store ? w.Store.person() : 'self';
    var pills = people.map(function (p) {
      return '<button class="pill" type="button" data-act="person" data-id="' + esc(p.id) + '" ' +
        'aria-pressed="' + (p.id === current ? 'true' : 'false') + '">' + esc(personLabel(p)) + '</button>';
    }).join('');
    return el(
      '<header class="shell-header">' +
        '<a class="brand" href="kabinet.html">' +
          '<img class="brand__logo" src="assets/logo-fakt.png" alt="Клиника ФАКТ, глазная клиника" ' +
          'width="270" height="90"></a>' +
        '<span class="shell-header__divider"></span>' +
        '<span class="shell-header__title">Личный кабинет</span>' +
        '<span class="shell-header__spacer"></span>' +
        '<span class="shell-header__who" id="shell-who">Пациент</span>' +
        '<div class="pills" role="group" aria-labelledby="shell-who">' + pills + '</div>' +
        '<span class="shell-header__divider"></span>' +
        '<a class="btn btn--secondary btn--sm" href="index.html">' + icon('logout') + 'Выйти</a>' +
      '</header>');
  }

  function nav(active) {
    return el('<nav class="shell-nav" aria-label="Разделы кабинета">' + NAV.map(function (n) {
      return '<a class="nav-item' + (n.id === active ? ' is-active' : '') + '" href="' + n.href + '"' +
        (n.id === active ? ' aria-current="page"' : '') + '>' + icon(n.icon) + '<span>' + n.title + '</span></a>';
    }).join('') + '</nav>');
  }

  /* Ссылку на прототип пересылают дальше, и коллега открывает конкретный
     экран, минуя вход с объяснением. Значок замечания на экране молчит —
     у него только title и aria-label. Строка над содержимым называет механизм
     словами и стоит на каждом экране каркаса; подписи на самой кнопке нет
     намеренно: с ней обвязка разрасталась и накрывала колонку.

     Длиннее двух строк ей быть нельзя: на 390 она разворачивалась в четыре
     и отодвигала содержимое на 92 px — одиннадцатую часть высоты окна под
     служебную инструкцию. Отсюда телеграфная краткость.

     Слово «прототип» из неё убирать нельзя: другой пометки на экранах каркаса
     нет, а ссылку пересылают дальше — коллега открывает smeta.html, минуя
     вход, и должен видеть, что кабинет не рабочий. Прибор это проверяет
     на каждом экране (check_page).

     Цвет, форму, место и действие строка называет теми же словами, что окно
     «Замечаний пока нет»; расхождение прибор ловит (check_remark_phrase). */
  function hint() {
    return el('<p class="shell-hint">Прототип. Замечание — ' +
      'белый значок с облачком справа внизу.</p>');
  }

  /* --- панель прототипа ------------------------------------------------ */
  function dock() {
    var count = w.Store ? w.Store.remarks().length : 0;
    return el(
      /* Обвязка стоит столбиком из двух круглых кнопок, а не строкой с
         подписями. Подписи делали её 299 px шириной, и на стартовом виде
         экрана она накрывала кнопку строки целиком — «Отметить» на лечении
         не нажималась вовсе, пока страницу не прокрутишь. Столбик в 40 px
         уже колонки содержимого не задевает: подписи ушли в title и
         aria-label, счётчик замечаний остался на месте. */
      '<div class="proto-dock">' +
        '<button class="proto-btn proto-btn--ghost" type="button" data-act="remark" ' +
          'title="Замечание" aria-label="Оставить замечание">' +
          icon('message') +
          (count ? '<span class="proto-btn__count">' + count + '</span>' : '') +
        '</button>' +
        '<button class="proto-btn" type="button" data-act="proto" aria-expanded="false" ' +
          'title="Панель прототипа" aria-label="Панель прототипа">' +
          icon('sparkle') +
        '</button>' +
      '</div>');
  }

  function panel() {
    var scenarios = w.Store.scenarios(), current = w.Store.scenario(), flags = w.Store.flags();
    var remarks = w.Store.remarks().length;
    return el(
      '<div class="proto-panel" id="proto-panel">' +
        '<div class="proto-panel__group">' +
          '<p class="label">Сценарий</p>' +
          '<div class="stack--tight">' + scenarios.map(function (s) {
            return '<label class="choice"><input type="radio" name="proto-scenario" value="' + s.id + '"' +
              (s.id === current ? ' checked' : '') + '><span>' + s.title + '</span></label>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="proto-panel__group">' +
          '<label class="choice"><input type="checkbox" id="proto-invite"' + (flags.invite ? ' checked' : '') + '>' +
          '<span>Показать блок приглашения знакомого</span></label>' +
        '</div>' +
        '<div class="proto-panel__group stack--tight">' +
          '<button class="btn btn--secondary btn--sm btn--block" type="button" data-act="copy-remarks">' +
            'Скопировать все замечания' + (remarks ? ' (' + remarks + ')' : '') + '</button>' +
          '<button class="btn btn--secondary btn--sm btn--block" type="button" data-act="restore-cancels">' +
            'Вернуть расписание как было</button>' +
          '<button class="btn btn--secondary btn--sm btn--block" type="button" data-act="reset">Сбросить прототип</button>' +
        '</div>' +
        '<p class="proto-panel__note">Сброс возвращает демо-данные к началу и не трогает замечания. ' +
          'Панель прототипа — в рабочей версии её не будет.</p>' +
      '</div>');
  }

  function togglePanel() {
    var open = document.getElementById('proto-panel');
    var btn = document.querySelector('[data-act="proto"]');
    if (open) { open.parentNode.removeChild(open); btn.setAttribute('aria-expanded', 'false'); return; }
    document.body.appendChild(panel());
    btn.setAttribute('aria-expanded', 'true');
    document.querySelectorAll('input[name="proto-scenario"]').forEach(function (r) {
      r.addEventListener('change', function () { w.Store.setScenario(r.value); reloadPage(); });
    });
    var inv = document.getElementById('proto-invite');
    inv.addEventListener('change', function () { w.Store.setFlag('invite', inv.checked); });
  }

  /* --- замечания -------------------------------------------------------
     Кнопка «Сохранить» обслуживается через Shell.on, как любое действие:
     свой слушатель на data-act оставлял действие незарегистрированным, и
     общий обработчик поверх сохранения открывал окно «появится в рабочей
     версии». Это ломало ровно тот механизм, которым заказчик даёт правки. */
  var remarkModal = null;

  function remarkDialog() {
    remarkModal = w.Render.modal({
      title: 'Замечание к экрану «' + screenName() + '»',
      text: 'Пометка сохранится в браузере вместе с именем экрана и сценарием. Забрать все пометки можно кнопкой «Скопировать все замечания» в панели прототипа.',
      html: '<label class="field"><span class="field__label label">Текст замечания</span>' +
            '<textarea class="input" id="remark-text" rows="4"></textarea></label>',
      foot: '<button class="btn btn--primary" data-act="remark-save">Сохранить</button>' +
            '<button class="btn btn--secondary" data-act="modal-close">Отмена</button>',
      onClose: function () { remarkModal = null; }
    });
  }

  function saveRemark() {
    var m = remarkModal;
    if (!m) { return; }
    var field = m.querySelector('#remark-text');
    var text = field ? field.value.trim() : '';
    if (!text) { if (field) { field.classList.add('input--error'); field.focus(); } return; }
    w.Store.addRemark({ screen: screenName(), text: text });
    m.close();
    remarkModal = null;
    refreshDock();
  }

  /** Шапка перечитывает себя после любого действия экрана: правка ФИО
      в профиле обязана поменять пилюлю на том же экране, а не после перехода
      на соседний. Меняем узел только когда разметка правда другая — иначе
      прожимка кнопок приняла бы обновление шапки за след пустого обработчика
      и перестала находить мёртвые кнопки. */
  function refreshHeader() {
    var old = document.querySelector('.shell-header');
    if (!old) { return; }
    var fresh = header();
    if (fresh && fresh.outerHTML !== old.outerHTML) { old.parentNode.replaceChild(fresh, old); }
  }

  function refreshDock() {
    var old = document.querySelector('.proto-dock');
    if (old) { old.parentNode.replaceChild(dock(), old); }
    var p = document.getElementById('proto-panel');
    if (p) { p.parentNode.removeChild(p); togglePanel(); }
  }

  /* Прототип открывают двойным кликом, то есть с file://, где асинхронный
     navigator.clipboard может не ответить вовсе: заказчик жмёт «Скопировать» и
     не видит ничего. Поэтому копируем синхронно и в любом случае показываем
     результат — либо «скопировано», либо текст для ручного копирования. */
  function copyRemarks() {
    var text = w.Store.remarksText();
    if (!text) {
      w.Render.modal({ title: 'Замечаний пока нет',
        text: 'Белый значок с облачком есть на каждом экране: нажмите, напишите пометку — она попадёт в этот список.' });
      return;
    }
    var copied = false;
    try {
      var box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', 'readonly');
      box.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(box);
      box.select();
      copied = document.execCommand('copy');
      document.body.removeChild(box);
    } catch (e) { copied = false; }
    if (copied) {
      w.Render.modal({ title: 'Замечания скопированы',
        text: 'Список ушёл в буфер обмена простым текстом — вставьте его в письмо.' });
      return;
    }
    w.Render.modal({ title: 'Замечания', text: 'Браузер не дал скопировать сам — выделите текст и скопируйте вручную:',
      html: '<textarea class="input" rows="10" readonly>' + esc(text) + '</textarea>' });
  }

  /* --- общие обработчики ------------------------------------------------ */
  function wire() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act], [data-soon]') : null;
      if (!t) { return; }
      var soon = t.getAttribute('data-soon');
      if (soon !== null) { e.preventDefault(); w.Render.soon(soon || undefined); return; }
      var act = t.getAttribute('data-act');
      if (ACTS[act]) { e.preventDefault(); ACTS[act](t, e); refreshHeader(); return; }
      /* Незарегистрированное действие: заказчик видит окно, прибор — находку. */
      deadActs[act] = true;
      reportWidth();
      e.preventDefault();
      w.Render.soon();
    });
    w.addEventListener('resize', function () { reportWidth(); });
  }

  /** Перечитать экран после ручного переключения сценария, человека или отметки.
      Единственный путь: всё, что меняет состояние, зовёт его, а не location.reload. */
  function reloadPage() {
    var q = w.location.search;
    if (!/[?&](scenario|person)=/.test(q)) { w.location.reload(); return; }
    /* адрес мог принести scenario/person — после ручного переключения их надо
       снять, иначе перезагрузка вернёт прежний выбор. Остальные параметры
       остаются: check=1 включает отчёт для прибора и терять его нельзя. */
    var kept = q.replace(/^\?/, '').split('&').filter(function (part) {
      return part && !/^(scenario|person)=/.test(part);
    }).join('&');
    w.location.href = w.location.pathname + (kept ? '?' + kept : '');
  }

  /* --- действия, общие для всех экранов -------------------------------- */
  function registerShellActs() {
    Shell.on('proto', function () { togglePanel(); });
    Shell.on('remark', function () { remarkDialog(); });
    Shell.on('remark-save', function () { saveRemark(); });
    Shell.on('copy-remarks', function () { copyRemarks(); });
    Shell.on('reset', function () { w.Store.reset(); w.location.href = 'index.html'; });
    /* Отмену записи заказчик пробует из любопытства — вернуть её должно быть
       дешевле, чем полным сбросом. Ключи отмен заводит экран, знает о них панель. */
    Shell.on('restore-cancels', function () {
      var values = w.Store.values();
      for (var k in values) {
        if (k.indexOf('cancel:') === 0 || k.indexOf('move:') === 0 || k.indexOf('book:') === 0) {
          w.Store.setValue(k, null);
        }
      }
      reloadPage();
    });
    Shell.on('person', function (t) { w.Store.setPerson(t.getAttribute('data-id')); reloadPage(); });
    Shell.on('modal-close', function () { /* окно закрывает себя само */ });
    Shell.on('dose', function (t) {
      w.Store.toggleDose(t.getAttribute('data-id'));
      reloadPage();
    });
    /* «Как добраться» — не заглушка: адрес, вход и часы уже лежат в данных. */
    Shell.on('route', function (t) {
      var id = t.getAttribute('data-branch'), branch = null;
      (w.DATA ? w.DATA.branches() : []).forEach(function (b) { if (b.id === id) { branch = b; } });
      if (!branch) { w.Render.soon('Как добраться'); return; }
      w.Render.modal({
        title: 'Как добраться',
        text: branch.title,
        html: '<ul class="rows">' +
          '<li class="row row--compact">' + icon('pin') + '<span class="row__body"><span class="strong">' +
            esc(branch.city) + ', ' + esc(branch.address) + '</span></span></li>' +
          '<li class="row row--compact">' + icon('arrow-right') + '<span class="row__body">' + esc(branch.howToGet) + '</span></li>' +
          '<li class="row row--compact">' + icon('clock') + '<span class="row__body">' + esc(branch.hours) + '</span></li>' +
          '<li class="row row--compact">' + icon('message') + '<span class="row__body">' + esc(branch.phone) + '</span></li>' +
        '</ul>'
      });
    });
  }

  /* Под ?check=1 страница сама отчитывается о размерах и о том, какие действия
     обслуживает: прибор читает это из разметки и не зависит от порядка скриптов. */
  /* Ответ кешируется на один замер, а не навсегда: overflow-x у меню включает
     медиазапрос, и значение, снятое на 390px, врало бы на широких замерах. */
  var measureRun = 0;

  /** Отвечает ли узел за своё горизонтальное переполнение САМ — прокручивает
      вбок нарочно или нарочно обрезает. Признак объявлен в CSS свойством
      --scroll-x: 1 на самом узле, а не выведен из вычисленного стиля:
      у контейнера, который прокручивается только по вертикали (модальное
      окно — max-height плюс overflow: auto), браузер считает overflow-x тоже
      auto, и по стилю два случая неразличимы. Пока признаком служил
      вычисленный overflow-x, замер не видел внутрь модального окна вовсе:
      элемент шириной 3000 px внутри .modal давал widest, равный ширине окна,
      и пустой список переполнений. Признак один на обе ноги замера: иначе
      прозревает одна, а вторая остаётся слепой к тому же узлу. */
  function ownsOverflowX(node) {
    if (node.__sxRun !== measureRun) {
      node.__sxRun = measureRun;
      node.__sx = String(w.getComputedStyle(node).getPropertyValue('--scroll-x')).trim() === '1';
    }
    return node.__sx;
  }

  /** Ближайший предок, который сам прокручивает содержимое по горизонтали.
      Внутри такого предка широкая таблица — норма, а не переполнение экрана:
      за край страницы отвечает сам контейнер, его и меряем. */
  function scrollClipper(node) {
    var p = node.parentElement;
    while (p && p !== document.documentElement) {
      if (ownsOverflowX(p)) { return p; }
      p = p.parentElement;
    }
    return null;
  }

  /** Обрезает ли элемент собственное содержимое нарочно. Тот же признак, что
      и у прокрутки: вычисленный overflow-x здесь врал ровно так же — .modal
      с его overflow: auto выпадал из этой ноги замера, и широкое поле внутри
      окна не находилось, пока оно не вылезало за вьюпорт. */
  function clipsOnPurpose(node) { return ownsOverflowX(node); }

  /* --- обвязка и колонка содержимого не пересекаются --------------------
     Правило геометрическое и потому не зависит ни от высоты окна, ни от
     того, попал ли под обвязку орган управления. Пока непересечение держалось
     тем, что под обвязкой случайно никого не оказалось, зазор был случайным:
     на 1440 кнопка строки расходилась с обвязкой на 9 px, а проверка стояла
     на двух высотах окна из бесконечного числа. Полосу под обвязку колонка
     оставляет в CSS (--dock-lane), здесь — сверка. */
  var COLUMNS = '.page';

  /** Заходит ли плавающая обвязка в колонку содержимого. Пустая строка — нет. */
  /* Шапка и каркас живут в одной ширине. Выше --page-max содержимое
     перестаёт расти, и если шапка продолжает тянуться, логотип с пилюлями
     уезжают к краям экрана от своей же колонки. Прибор этого не видел:
     он проверяет переполнение, а не выравнивание — дефект был виден глазом
     на уменьшенном масштабе при полностью зелёном прогоне. */
  function shellAlign() {
    var head = document.querySelector('.shell-header');
    var body = document.querySelector('.shell-body');
    if (!head || !body) { return ''; }
    var brand = head.querySelector('.brand');
    var last = head.lastElementChild;
    if (!brand || !last) { return ''; }
    var b = body.getBoundingClientRect();
    if (!b.width) { return ''; }
    var l = brand.getBoundingClientRect(), r = last.getBoundingClientRect();
    if (l.left < b.left - 1 || r.right > b.right + 1) {
      return 'шапка вышла за каркас: содержимое ' + Math.round(l.left) + '–' +
        Math.round(r.right) + ', каркас ' + Math.round(b.left) + '–' + Math.round(b.right);
    }
    /* Логотип стоит ровно над столбцом значков меню. Ниже 1000px меню
       становится горизонтальной лентой, столбца нет — там не проверяем. */
    var item = document.querySelector('.nav-item');
    if (item && w.innerWidth > 1000) {
      var it = item.getBoundingClientRect();
      var inner = it.left + (parseFloat(w.getComputedStyle(item).paddingLeft) || 0);
      if (it.width && Math.abs(l.left - inner) > 2) {
        return 'логотип не над столбцом меню: логотип ' + Math.round(l.left) +
          ', пункт меню ' + Math.round(inner);
      }
    }
    return '';
  }

  function dockLane() {
    var dockEl = document.querySelector('.proto-dock');
    if (!dockEl) { return ''; }
    var d = dockEl.getBoundingClientRect();
    if (!d.width || !d.height) { return ''; }
    var cols = document.querySelectorAll(COLUMNS), out = '';
    for (var i = 0; i < cols.length && !out; i++) {
      var r = cols[i].getBoundingClientRect();
      if (!r.width || !r.height) { continue; }
      var st = w.getComputedStyle(cols[i]);
      var left = r.left + (parseFloat(st.paddingLeft) || 0);
      var right = r.right - (parseFloat(st.paddingRight) || 0);
      if (d.left < right - 0.5 && d.right > left + 0.5) {
        out = 'обвязка заходит в колонку ' + tagOf(cols[i]) + ': обвязка ' +
          Math.round(d.left) + '–' + Math.round(d.right) + ', колонка ' +
          Math.round(left) + '–' + Math.round(right);
      }
    }
    return out;
  }

  /** Имя элемента для отчёта прибору: тег и первый класс. */
  function tagOf(node) {
    return node.tagName.toLowerCase() +
      (node.className && node.className.baseVal === undefined ? '.' + String(node.className).split(' ')[0] : '');
  }

  /* --- плавающие элементы поверх органов управления -----------------------
     Замер ширин видит только правый край и про то, что кнопка «Отметить» ушла
     под панель прототипа, не знает ничего: панель плавает, ширины не меняет,
     край не двигает. К плавающим элементам прибор уже был слеп однажды —
     здесь его глаза.

     Отдаём не вердикт, а координаты: коробки органов управления в координатах
     ДОКУМЕНТА, коробки плавающих — в координатах окна (они от прокрутки не
     зависят). Пересечение на любой позиции прокрутки после этого считается
     арифметикой, а не новым обходом DOM на каждый пиксель: обход всех
     элементов на каждой из сорока позиций × семь ширин × три сценария —
     это минуты на экран. */
  var CONTROLS = 'button, a[href], input, select, textarea, [data-act], [data-soon]';

  function floating() {
    var sx = w.pageXOffset || 0, sy = w.pageYOffset || 0;
    var nodes = document.body.querySelectorAll('*');
    var fixedNodes = [], fixedBoxes = [], i, r;
    for (i = 0; i < nodes.length; i++) {
      if (w.getComputedStyle(nodes[i]).position !== 'fixed') { continue; }
      r = nodes[i].getBoundingClientRect();
      if (!r.width || !r.height) { continue; }
      fixedNodes.push(nodes[i]);
      fixedBoxes.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, who: tagOf(nodes[i]) });
    }
    var controls = [], list = document.body.querySelectorAll(CONTROLS);
    for (i = 0; i < list.length; i++) {
      var node = list[i], up = node, inside = false;
      /* Кнопки самой плавающей панели под правило не попадают: она и есть
         плавающий элемент, накрывать сама себя ей не запрещено. */
      while (up) { if (fixedNodes.indexOf(up) > -1) { inside = true; break; } up = up.parentElement; }
      if (inside) { continue; }
      r = node.getBoundingClientRect();
      if (!r.width || !r.height) { continue; }
      controls.push({
        left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy,
        who: tagOf(node) + ' «' + String(node.textContent || '').trim().slice(0, 20) + '»'
      });
    }
    return {
      fixed: fixedBoxes, controls: controls, scroll: sy,
      viewport: { width: w.innerWidth, height: w.innerHeight },
      height: document.documentElement.scrollHeight,
      /* Открытое окно или развёрнутая панель — намеренная перекрышка, её
         открыл сам человек и сам закроет. Правило про них молчит. */
      opened: !!document.querySelector('.modal-backdrop, .proto-panel')
    };
  }

  /** Органы управления, до которых прокруткой не добраться: на каждой позиции,
      где такой орган целиком в окне, его накрывает плавающая обвязка.

      Требовать «не накрыт ни при какой прокрутке» нельзя — это не про вёрстку,
      а про геометрию: обвязка плавает над колонкой содержимого, а колонка на
      всех ширинах матрицы доходит до края окна (справа остаётся 37–57 px при
      ширине обвязки 299). Любая плавающая кнопка проходит над кнопкой строки
      на промежуточной прокрутке, пока обвязка вообще существует. Что чинится
      и потому проверяется — достижимость: у каждого органа управления должна
      быть позиция, где до него можно дотянуться. Полосу под обвязку внизу
      страницы отводит mount() ровно для этого. */
  var SWEEP_STEP = 24;

  /** Кого накрывает плавающая обвязка при заданной прокрутке. Отдельный
      прибор от stuck(): тот спрашивает «есть ли хоть одна свободная позиция»
      и на длинной странице находит её почти всегда — ровно тот случай, ради
      которого кладётся полоса внизу, из него и выпадал. Самый низ прокрутки
      проверяется одним замером и по-честному. */
  function coveredAt(f, scroll) {
    var out = [];
    if (!f || f.opened) { return out; }
    f.controls.forEach(function (c) {
      var top = c.top - scroll, bottom = c.bottom - scroll;
      if (bottom <= 0 || top >= f.viewport.height) { return; }
      f.fixed.forEach(function (b) {
        if (out.length >= 5) { return; }
        if (c.left < b.right && c.right > b.left && top < b.bottom && bottom > b.top) {
          out.push(b.who + ' накрывает ' + c.who);
        }
      });
    });
    return out;
  }

  /** Самая нижняя позиция прокрутки страницы. */
  function maxScrollOf(f) { return Math.max(0, f.height - f.viewport.height); }

  /** Органы управления, до центра которых на этой прокрутке не дотянуться:
      обвязка накрыла середину кнопки, и мышь попадает в обвязку, а не в неё.

      Отдельное правило от stuck(): тот спрашивает «есть ли хоть одна позиция
      прокрутки, где орган свободен», и на длинной странице находит её почти
      всегда. Заказчик страницу не крутит: он видит стартовый вид и жмёт —
      а на лечении кнопка «Отметить» у строки 21:00 была накрыта целиком,
      и прибор молчал, потому что прокрутка её освобождала.

      Судим по центру, а не по любому пересечению: обвязка плавает над
      колонкой, которая на всех ширинах доходит почти до края окна, и краем
      задевает всё, что стоит у правого поля. Кнопка, накрытая с угла,
      нажимается; кнопка, у которой накрыт центр, — нет. */
  function swallowed(f, scroll) {
    var out = [];
    if (!f || f.opened) { return out; }
    f.controls.forEach(function (c) {
      if (out.length >= 5) { return; }
      var cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2 - scroll;
      if (cy < 0 || cy > f.viewport.height) { return; }
      f.fixed.forEach(function (b) {
        if (out.length >= 5) { return; }
        if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
          out.push(b.who + ' накрывает середину ' + c.who);
        }
      });
    });
    return out;
  }

  function stuck(f) {
    var out = [];
    if (!f || f.opened) { return out; }
    var vh = f.viewport.height, maxScroll = Math.max(0, f.height - vh);
    var steps = [], y;
    for (y = 0; y <= maxScroll; y += SWEEP_STEP) { steps.push(y); }
    if (steps[steps.length - 1] !== maxScroll) { steps.push(maxScroll); }
    var free = {}, seen = {};
    steps.forEach(function (pos) {
      f.controls.forEach(function (c, i) {
        var top = c.top - pos, bottom = c.bottom - pos;
        /* Судим только орган, целиком помещающийся в окно: наполовину видный
           не «накрыт», а не долистан. */
        if (top < 0 || bottom > vh) { return; }
        seen[i] = true;
        var hit = false;
        f.fixed.forEach(function (b) {
          if (c.left < b.right && c.right > b.left && top < b.bottom && bottom > b.top) { hit = true; }
        });
        if (!hit) { free[i] = true; }
      });
    });
    f.controls.forEach(function (c, i) {
      if (seen[i] && !free[i] && out.length < 5) { out.push('до него не добраться: ' + c.who); }
    });
    return out;
  }

  function reportWidth(force) {
    if (!force && w.location.search.indexOf('check=1') < 0) { return; }
    measureRun++;
    var max = 0, who = '', over = [];
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var node = all[i];
      if (!node.getBoundingClientRect) { continue; }
      var r = node.getBoundingClientRect();
      /* Нулевые размеры — у скрытого. position:fixed меряется наравне с остальным:
         панель прототипа, кнопки в углу и модальные окна не слепая зона. */
      if (!r.width || !r.height) { continue; }
      if (scrollClipper(node)) { continue; }
      /* Второй слепой угол замера: содержимое не выходит за край страницы,
         но не помещается в свою ячейку. Коробка абзаца при этом ровно по
         ячейке, и самый правый край её не выдаёт — так «137 500 ₽» наезжало
         на соседнюю ячейку итогов на всей полосе 1281–1448, а прибор молчал.
         Меряем текст: scrollWidth больше clientWidth у элемента, который сам
         ничего не обрезает. */
      if (node.scrollWidth > node.clientWidth + 1 && !clipsOnPurpose(node) && over.length < 5) {
        over.push(tagOf(node) + ' ' + node.scrollWidth + '>' + node.clientWidth +
          ' «' + String(node.textContent || '').trim().slice(0, 24) + '»');
      }
      if (r.right > max) {
        max = r.right;
        who = tagOf(node);
      }
    }
    /* Перекрытие считаем для страницы как она загружена: это то состояние,
       в котором её открывает заказчик. Остальные позиции прокрутки обходит
       tools/frame.html — оттуда же он берёт floating(). */
    var f = floating();
    document.body.setAttribute('data-dock-lane', dockLane());
    document.body.setAttribute('data-shell-align', shellAlign());
    document.body.setAttribute('data-stuck', stuck(f).join(' | '));
    document.body.setAttribute('data-covered-start', swallowed(f, 0).join(' | '));
    document.body.setAttribute('data-covered-end', coveredAt(f, maxScrollOf(f)).join(' | '));
    document.body.setAttribute('data-widest', Math.ceil(max) + ' ' + who);
    document.body.setAttribute('data-viewport', w.innerWidth);
    document.body.setAttribute('data-overflow', over.join(' | '));
    document.body.setAttribute('data-live-acts', Object.keys(ACTS).join(' '));
    document.body.setAttribute('data-dead-acts', Object.keys(deadActs).join(' '));
    return { widest: Math.ceil(max), who: who, viewport: w.innerWidth, overflow: over, floating: f };
  }

  var Shell = {
    /** active — id пункта меню; bare: true — экран без шапки и меню (вход). */
    mount: function (o) {
      o = o || {};
      registerShellActs();
      var page = document.getElementById('page');
      if (!o.bare && page) {
        var body = el('<div class="shell-body"></div>');
        var main = el('<main class="shell-main" id="main"></main>');
        page.parentNode.insertBefore(body, page);
        body.appendChild(nav(o.active));
        body.appendChild(main);
        main.appendChild(hint());
        main.appendChild(page);
        document.body.insertBefore(header(), body);
      }
      document.body.appendChild(dock());
      wire();
      w.setTimeout(reportWidth, 0);
      return true;
    },
    /** Экран регистрирует своё действие: Shell.on('cancel', fn) для data-act="cancel". */
    on: function (act, fn) {
      ACTS[act] = fn;
      /* Прибор читает реестр из разметки: он не должен зависеть от того,
         когда экран зарегистрировал своё действие — до монтирования или после. */
      if (document.body) { document.body.setAttribute('data-live-acts', Object.keys(ACTS).join(' ')); }
      return Shell;
    },
    /** Замер для прибора: самый правый край содержимого и ширина окна. */
    measure: function () { return reportWidth(true); },
    /** Действия, у которых есть обработчик на этой странице. */
    acts: function () { return Object.keys(ACTS); },
    /** Плавающая обвязка и органы управления — для проверки перекрытий. */
    floating: floating,
    /** Органы управления, до которых из-за плавающей обвязки не добраться. */
    stuck: stuck,
    /** Кого обвязка накрыла по центру на заданной прокрутке. */
    swallowed: swallowed,
    /** Кого накрывает плавающая обвязка при заданной прокрутке. */
    coveredAt: coveredAt,
    /** Самая нижняя позиция прокрутки. */
    maxScrollOf: maxScrollOf,
    /** Заходит ли обвязка в колонку содержимого: строка-описание или пустая. */
    dockLane: dockLane,
    shellAlign: shellAlign,
    /** Имя человека для приветствия: тот же источник, что у пилюли в шапке. */
    greetName: greetNameOf,
    nav: function () { return NAV.slice(); }
  };

  w.Shell = Shell;
})(window);
