/* Экран 3 «Мои визиты».
   Две вкладки: предстоящие и прошедшие. Отмена спрашивает причину и оставляет
   карточку на месте серой. Прошедшие сгруппированы по годам, показываются
   по пять, ищутся и фильтруются по дате, врачу и услуге. С прошедшего визита
   можно записаться к тому же врачу, передать врача знакомому и — после
   состоявшегося контрольного осмотра — оставить отзыв.
   Вкладка живёт в адресе, поиск и фильтры — в Store по слоту на вкладку:
   переключение вкладки перезагружает страницу и не должно терять отбор.
   Состояния — по таблице спецификации, экран 3: пусто · прошедших много ·
   перенесена · отменена. Данные только через DATA, повторяющиеся блоки —
   через Render. Утверждения по таблице — tools/test-zapisi.html. */
(function (w) {
  'use strict';

  var STEP = 5;                       /* «Показать ещё» добавляет по пять (спека, экран 3) */

  var fmt = w.Render.fmt;
  var section = w.Render.section;

  function esc(v) { return w.Render.esc(v); }
  function ic(n, c) { return w.icon ? w.icon(n, c) : ''; }

  var view = { tab: 'upcoming', search: '', year: '', doctor: '', service: '', shown: STEP };

  /* --- поиск и фильтры живут в Store, а не в переменной модуля -----------
     Вкладка — обычная ссылка, то есть перезагрузка страницы: состояние вида
     обязано её пережить, иначе отфильтрованный список теряется, стоит
     заглянуть в соседнюю вкладку. Слот на каждую вкладку свой — у прошедших
     и предстоящих разные списки и разные фильтры. Адрес не трогаем: им
     ходит прибор, и ?scenario= с ?person= ломать нельзя. */
  var FILTERS = ['year', 'doctor', 'service'];

  function slot(name) { return 'zapisi:' + view.tab + ':' + name; }

  function loadView() {
    var have = { year: {}, doctor: {}, service: {} };
    raw(view.tab).forEach(function (a) {
      have.year[String(new Date(a.datetime).getFullYear())] = true;
      have.doctor[a.doctorId] = true;
      have.service[a.service] = true;
    });
    view.search = w.Store.value(slot('search')) || '';
    FILTERS.forEach(function (name) {
      var v = w.Store.value(slot(name));
      /* Значения, которого в этой вкладке уже нет — сменили человека или
         сценарий, — тихо забываем: иначе список пуст, а причина не видна. */
      if (v && !have[name][v]) { w.Store.setValue(slot(name), null); v = null; }
      view[name] = v || '';
    });
    view.shown = STEP;
  }

  function saveView(name, value) { w.Store.setValue(slot(name), value || null); }

  function resetView() {
    view.search = '';
    w.Store.setValue(slot('search'), null);
    FILTERS.forEach(function (name) { view[name] = ''; w.Store.setValue(slot(name), null); });
    view.shown = STEP;
  }
  var shareModal = null;

  /* --- справочник врачей ------------------------------------------------- */
  var byId = null;
  function doctor(id) {
    if (!byId) {
      byId = {};
      w.DATA.doctors({}).forEach(function (d) { byId[d.id] = d; });
    }
    return byId[id] || null;
  }
  function doctorName(id) { var d = doctor(id); return d ? d.name : ''; }

  /* --- список визитов ---------------------------------------------------- */

  /* Отмена и перенос, шов и записи прототипа — правила общие, живут в Render
     и зовутся отсюда. Своей копии тут нет намеренно: разошедшиеся копии
     правила и есть та поломка, из-за которой этот экран показывал старое
     расписание после записи. */
  function raw(tab) { return w.Render.seenAppointments({ when: tab === 'past' ? 'past' : 'upcoming' }); }

  function matches(a) {
    var q = view.search.trim().toLowerCase();
    if (q) {
      var hay = (doctorName(a.doctorId) + ' ' + a.service).toLowerCase();
      if (hay.indexOf(q) < 0) { return false; }
    }
    if (view.year && String(new Date(a.datetime).getFullYear()) !== view.year) { return false; }
    if (view.doctor && a.doctorId !== view.doctor) { return false; }
    if (view.service && a.service !== view.service) { return false; }
    return true;
  }

  /* --- напоминания: фразу собирает экран из полей шва (G12) --------------- */


  /* Обещание про напоминания живёт в Render одним правилом: раньше оно стояло
     здесь и на главной двумя копиями, и обе читали шов мимо профиля. */
  function remindLine() {
    var text = w.Render.remindText();
    if (!text) { return ''; }
    return '<p class="viz-remind">' + ic('clock', 'ic--sm') + '<span>' + esc(text) + '</span></p>';
  }

  /* --- отзыв: только после состоявшегося контрольного осмотра (G05.2) -----
     Состоявшимся считаем осмотр, чья запись лежит в прошедших или чья дата
     уже прошла. Назначение осмотра — русский текст плана лечения, и мы его
     не разбираем: связь даёт appointmentId. */
  function reviewOpen() {
    var t = w.DATA.treatment();
    if (!t || !t.checkups || !t.checkups.length) { return false; }
    var past = {};
    w.DATA.appointments({ when: 'past' }).forEach(function (a) { past[a.id] = true; });
    var now = new Date();
    var open = false;
    t.checkups.forEach(function (c) {
      if ((c.appointmentId && past[c.appointmentId]) || (c.date && new Date(c.date) < now)) { open = true; }
    });
    return open;
  }

  /* --- блоки экрана ------------------------------------------------------ */

  function tabs() {
    var items = [
      { id: 'upcoming', title: 'Предстоящие' },
      { id: 'past', title: 'Прошедшие' }
    ];
    return '<div class="tabs">' + items.map(function (t) {
      var on = t.id === view.tab;
      return '<a class="tab" href="zapisi.html?tab=' + t.id + '"' +
        (on ? ' aria-current="page"' : '') + '>' + esc(t.title) + '</a>';
    }).join('') + '</div>';
  }

  /** Значения фильтров берутся из самого списка: пустых вариантов не бывает. */
  function options(list, value, label) {
    var seen = [], out = '';
    list.forEach(function (a) {
      var v = value(a);
      if (v && seen.indexOf(v) < 0) { seen.push(v); }
    });
    seen.forEach(function (v) { out += '<option value="' + esc(v) + '">' + esc(label(v)) + '</option>'; });
    return out;
  }

  function filter(name, title, iconName, opts) {
    return '<span class="select">' +
      '<span class="select__ic">' + ic(iconName, 'ic--sm') + '</span>' +
      '<select data-filter="' + name + '" aria-label="Фильтр: ' + esc(title) + '">' +
        '<option value="">' + esc(title) + '</option>' + opts +
      '</select>' +
      '<span class="select__chevron">' + ic('chevron', 'ic--sm') + '</span></span>';
  }

  function toolbar(list) {
    if (!list.length) { return ''; }
    var years = options(list, function (a) { return String(new Date(a.datetime).getFullYear()); }, function (v) { return v; });
    var docs = options(list, function (a) { return a.doctorId; }, doctorName);
    var servs = options(list, function (a) { return a.service; }, function (v) { return v; });
    return '<div class="viz-tools">' +
      '<span class="search viz-search"><span class="search__ic">' + ic('search', 'ic--sm') + '</span>' +
        '<input class="search__input" type="text" id="viz-search" ' +
        'placeholder="Поиск по врачу или услуге" aria-label="Поиск по врачу или услуге" value="' + esc(view.search) + '"></span>' +
      filter('year', 'Дата', 'calendar-check', years) +
      filter('doctor', 'Врач', 'stethoscope', docs) +
      filter('service', 'Услуга', 'clipboard', servs) +
    '</div>';
  }

  function extras(a) {
    if (a.status === 'cancelled') { return ''; }
    if (view.tab !== 'past') { return remindLine(); }
    var acts = '<button class="btn btn--quiet" type="button" data-act="share" data-id="' + esc(a.id) + '">' +
      ic('message', 'ic--sm') + 'Отправить врача знакомому</button>';
    if (reviewOpen()) {
      acts += '<button class="btn btn--quiet" type="button" data-act="review" data-id="' + esc(a.id) + '">' +
        ic('check', 'ic--sm') + 'Оставить отзыв</button>';
    }
    return '<div class="viz-extra">' + acts + '</div>';
  }

  /* Карточка приходит сюда уже такой, какой её видит пациент: отмену и перенос
     наложил raw(). Второй раз накладывать нельзя — перенос перенёсся бы сам
     с себя, и «Перенесена с» показывала бы новое время вместо прежнего. */
  function item(a) {
    return '<div class="viz-item">' + w.Render.appointmentCard(a) + extras(a) + '</div>';
  }

  /** Прошедшие идут группами по годам: год — заголовок секции, а не подпись. */
  function byYears(list) {
    var years = [], groups = {};
    list.forEach(function (a) {
      var y = String(new Date(a.datetime).getFullYear());
      if (!groups[y]) { groups[y] = []; years.push(y); }
      groups[y].push(a);
    });
    return years.map(function (y) {
      return section({
        title: y,
        aside: 'Визитов: ' + groups[y].length,
        cls: 'viz-year',
        body: groups[y].map(item).join('')
      });
    }).join('');
  }

  function emptyBlock(list) {
    if (list.length) {
      return w.Render.emptyState({
        title: 'Ничего не нашлось',
        text: 'По этому запросу визитов нет. Измените запрос или снимите фильтры.',
        icon: 'clip',
        action: { text: 'Сбросить фильтры', act: 'filters-reset' }
      });
    }
    return w.Render.emptyState({
      title: 'Здесь появятся ваши визиты',
      text: view.tab === 'past'
        ? 'Состоявшиеся приёмы останутся здесь вместе с заключениями.'
        : 'Пока у вас нет предстоящих визитов. Выберите врача и удобное время — запись займёт минуту.',
      action: { text: 'Записаться', href: 'zapis-novaya.html' }
    });
  }

  function renderList() {
    var all = raw(view.tab);
    var found = all.filter(matches);
    var box = document.getElementById('viz-list');
    if (!found.length) { box.innerHTML = emptyBlock(all); return; }
    var slice = found.slice(0, view.shown);
    var rest = found.length - slice.length;
    box.innerHTML = (view.tab === 'past' ? byYears(slice) : slice.map(item).join('')) +
      (rest > 0
        ? '<div class="viz-more"><button class="btn btn--secondary" type="button" data-act="more">' +
          ic('plus') + 'Показать ещё ' + Math.min(STEP, rest) + ' из ' + rest + '</button></div>'
        : '');
  }

  function render() {
    var all = raw(view.tab);
    document.getElementById('page').innerHTML =
      '<h1 class="h1 page__title">Мои визиты</h1>' +
      '<div class="viz-bar">' + tabs() + toolbar(all) + '</div>' +
      '<div id="viz-list"></div>';
    bindTools();
    renderList();
  }

  /* Поиск и фильтры — не кнопки каркаса: слушатели вешаются на свои поля,
     и перерисовывается только список, чтобы поле не теряло фокус. */
  function bindTools() {
    var search = document.getElementById('viz-search');
    if (search) {
      search.addEventListener('input', function () {
        view.search = search.value;
        saveView('search', search.value);
        view.shown = STEP;
        renderList();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (sel) {
      sel.value = view[sel.getAttribute('data-filter')] || '';
      sel.addEventListener('change', function () {
        view[sel.getAttribute('data-filter')] = sel.value;
        saveView(sel.getAttribute('data-filter'), sel.value);
        view.shown = STEP;
        renderList();
      });
    });
  }

  /* --- отмена записи ------------------------------------------------------
     Окно отмены общее с главной: дату в нём даёт тот же asSeen, что рисует
     карточку. Своей копии окна экран не держит — расхождение карточки и окна
     в датах и завелось из-за двух копий. */

  /* --- передать врача знакомому (G05) -------------------------------------
     Отдаём не адрес сайта, а ссылку, которая открывает запись сразу
     на этом враче. Вознаграждения за приглашение здесь нет. */

  function shareLink(doctorId) {
    var page = 'zapis-novaya.html?doctor=' + encodeURIComponent(doctorId);
    return w.location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + page;
  }

  function share(btn) {
    var a = w.Render.findAppointment(btn.getAttribute('data-id'));
    var d = a ? doctor(a.doctorId) : null;
    if (!d) { w.Render.soon('Отправить врача знакомому'); return; }
    var href = 'zapis-novaya.html?doctor=' + encodeURIComponent(d.id);
    shareModal = w.Render.modal({
      title: 'Отправить врача знакомому',
      text: d.name + ' · ' + d.position + '. Ссылка открывает запись сразу на этом враче — знакомому не придётся искать его на сайте.',
      /* .input--sm — ступень 46px из общей шкалы: «кнопки и поля форм».
         Голый .input даёт 62px, ступень поля формы входа, и поле встаёт
         выше кнопок под ним. */
      html: '<input class="input input--sm viz-link" id="share-link" type="text" readonly value="' + esc(shareLink(d.id)) + '">',
      foot: '<button class="btn btn--primary" data-act="share-copy">Скопировать ссылку</button>' +
            '<a class="btn btn--secondary" href="' + esc(href) + '">Открыть запись</a>' +
            '<button class="btn btn--secondary" data-act="modal-close">Закрыть</button>',
      onClose: function () { shareModal = null; }
    });
  }

  /* Копируем синхронно: на file:// асинхронный navigator.clipboard молчит,
     когда окно не в фокусе, и заказчик не понимает, сработало ли. */
  function shareCopy(btn) {
    var field = shareModal ? shareModal.querySelector('#share-link') : null;
    if (!field) { return; }
    var copied = false;
    try {
      field.removeAttribute('readonly');
      field.select();
      copied = document.execCommand('copy');
      field.setAttribute('readonly', 'readonly');
    } catch (e) { copied = false; }
    btn.textContent = copied ? 'Ссылка скопирована' : 'Скопируйте ссылку вручную';
    btn.className = 'btn btn--secondary';
  }

  /* --- отзыв (G05.2) ------------------------------------------------------ */

  function review(btn) {
    var a = w.Render.findAppointment(btn.getAttribute('data-id'));
    var d = a ? doctor(a.doctorId) : null;
    w.Render.modal({
      title: 'Оставить отзыв',
      text: (d ? d.name + '. ' : '') + 'Контрольный осмотр позади — результат уже виден. Выберите площадку, отзыв займёт минуту.',
      html: '<div class="stack--tight">' +
        '<button class="btn btn--secondary btn--block" data-soon="Отзыв на Яндекс.Картах">Яндекс.Карты</button>' +
        '<button class="btn btn--secondary btn--block" data-soon="Отзыв на ПроДокторов">ПроДокторов</button>' +
      '</div>'
    });
  }

  /* --- сборка ------------------------------------------------------------- */

  function tabFromUrl() {
    var m = /[?&]tab=(upcoming|past)/.exec(w.location.search);
    return m ? m[1] : 'upcoming';
  }

  function init() {
    view.tab = tabFromUrl();
    w.Shell.mount({ active: 'zapisi' });
    /* Действия регистрируются сразу после каркаса и до отрисовки:
       позже прибор уже снял список обслуженных действий. */
    w.Shell.on('cancel', function (btn) { w.Render.cancelDialog(btn.getAttribute('data-id')); });
    w.Shell.on('cancel-confirm', function () { w.Render.cancelConfirm(); render(); });
    w.Shell.on('share', share);
    w.Shell.on('share-copy', shareCopy);
    w.Shell.on('review', review);
    w.Shell.on('more', function () { view.shown += STEP; renderList(); });
    w.Shell.on('filters-reset', function () { resetView(); render(); });
    loadView();
    render();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
