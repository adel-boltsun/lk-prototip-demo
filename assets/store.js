/* Изменяемое состояние прототипа: сценарий, выбранный человек, черновик
   мастера записи, отметки о закапывании, тумблеры, именованные значения
   и замечания.
   Всё лежит в localStorage под ОДНИМ ключом — «Сбросить прототип» его удаляет.
   Формат хранения наружу не выставляется: только функции ниже. */
(function (w) {
  'use strict';

  var KEY = 'fakt-lk-prototip';

  var SCENARIOS = [
    { id: 'new',    title: 'Новый пациент' },
    { id: 'before', title: 'До операции' },
    { id: 'after',  title: 'После операции' }
  ];

  /* Люди прототипа: id проверяются так же, как сценарии. Сами карточки — в mock.js. */
  var PERSONS = ['self', 'child', 'parent'];

  var DEFAULTS = {
    scenario: 'before',
    person: 'self',
    draft: null,
    doses: {},
    seq: 0,
    flags: { invite: false },
    values: {},
    remarks: []
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function read() {
    var raw = null;
    try { raw = w.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var s = clone(DEFAULTS);
    if (raw) {
      try {
        var saved = JSON.parse(raw);
        for (var k in DEFAULTS) {
          if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] !== undefined) { s[k] = saved[k]; }
        }
      } catch (e) { /* испорченный ключ — работаем на значениях по умолчанию */ }
    }
    return s;
  }

  function write(s) {
    state = s;
    try { w.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* приватный режим */ }
    return s;
  }

  var state = read();

  /* Сценарий и человека можно задать адресом: index.html?scenario=after&person=child.
     Этим пользуется tools/check.py и ссылки вида «открыть запись у этого врача». */
  (function fromUrl() {
    var q = w.location.search;
    if (!q) { return; }
    var changed = false;
    var sc = /[?&]scenario=([a-z]+)/.exec(q);
    if (sc && byId(SCENARIOS, sc[1])) { state.scenario = sc[1]; changed = true; }
    var pr = /[?&]person=([a-z]+)/.exec(q);
    if (pr && PERSONS.indexOf(pr[1]) > -1) { state.person = pr[1]; changed = true; }
    if (changed) { write(state); }
  })();

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }

  var Store = {
    /** Список сценариев для панели прототипа: [{id, title}]. */
    scenarios: function () { return clone(SCENARIOS); },

    scenario: function () { return state.scenario; },
    setScenario: function (id) {
      if (!byId(SCENARIOS, id)) { return state.scenario; }
      state.scenario = id;
      state.draft = null;              /* черновик мастера принадлежит сценарию */
      state.doses = {};
      write(state);
      return id;
    },

    person: function () { return state.person; },
    persons: function () { return PERSONS.slice(); },
    setPerson: function (id) {
      if (PERSONS.indexOf(id) < 0) { return state.person; }
      state.person = id;
      write(state);
      return id;
    },

    /** Черновик мастера записи. setDraft(null) — забыть. */
    draft: function () { return state.draft ? clone(state.draft) : null; },
    setDraft: function (obj) {
      state.draft = obj ? clone(obj) : null;
      write(state);
      return state.draft;
    },

    /** Отметка «закапал». Читается через DATA.treatment(): там doses уже с учётом отметок. */
    toggleDose: function (id) {
      var key = state.scenario + ':' + state.person + ':' + id;
      state.doses[key] = !state.doses[key];
      write(state);
      return state.doses[key];
    },
    doses: function () {
      var out = {}, prefix = state.scenario + ':' + state.person + ':';
      for (var k in state.doses) {
        if (k.indexOf(prefix) === 0) { out[k.slice(prefix.length)] = state.doses[k]; }
      }
      return out;
    },

    /** Тумблеры панели прототипа. Сейчас один: invite — блок приглашения знакомого. */
    flags: function () { return clone(state.flags); },
    setFlag: function (id, on) {
      state.flags[id] = !!on;
      write(state);
      return state.flags[id];
    },

    /** Именованное состояние: слот с произвольным значением, а не только «да/нет».
        Причина отмены — строка, и класть её в имя флага больше не нужно.
        setValue(key, null) — забыть слот. */
    value: function (key) {
      var v = state.values[key];
      return v === undefined ? null : v;
    },
    setValue: function (key, v) {
      if (v === null || v === undefined) { delete state.values[key]; } else { state.values[key] = v; }
      write(state);
      return this.value(key);
    },
    /** Все занятые слоты — тем, кому нужно обойти их скопом (например, сброс отмен). */
    values: function () { return clone(state.values); },

    /** Записи, заведённые в самом прототипе: мастер записи кладёт сюда готовую
        карточку, экраны показывают её рядом с тем, что отдал шов.

        Механизм тот же, что у отмены, — именованное значение, а не подмена
        данных: DATA.appointments() остаётся прежним. Это сахар поверх values,
        а не четвёртый механизм; обе функции пишут и читают те же слоты.
        Слот скоупится сценарием и человеком, как дозы: запись, сделанная
        в кабинете Марии до операции, не должна всплыть в кабинете Артёма.
        Разница с дозами одна — смену сценария записи переживают, потому что
        лежат в values, и убирает их «Сбросить прототип» вместе со всем
        остальным. */
    addBooking: function (rec) {
      if (!rec) { return null; }
      /* id выдаёт счётчик, а не хеш полей записи: у хеша девять тысяч корзин,
         и рано или поздно две разные записи попадают в одну — вторая молча
         затирает первую, потому что setValue пишет по тому же ключу. */
      state.seq = (state.seq || 0) + 1;
      var copy = clone(rec);
      copy.id = 'n-' + state.seq;
      /* Запись файлится под того, ДЛЯ КОГО она сделана, а не под того, кто
         записывал. Мария записывает Артёма — карточка обязана наступить
         в кабинете Артёма и не наступить у Марии; иначе это тот же дефект
         «состояние не доехало», только по оси человека. */
      var who = PERSONS.indexOf(copy.personId) > -1 ? copy.personId : state.person;
      this.setValue('book:' + state.scenario + ':' + who + ':' + copy.id, copy);
      return copy;
    },
    /** Все записи прототипа этого сценария, чьи бы они ни были. Расписание
        клиники общее: окно, занятое для ребёнка, занято и для мамы, — и запись,
        уехавшая переносом в чужой кабинет, обязана находиться из обоих. */
    allBookings: function () {
      var out = [], prefix = 'book:' + state.scenario + ':';
      for (var k in state.values) {
        if (k.indexOf(prefix) === 0) { out.push(clone(state.values[k])); }
      }
      out.sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });
      return out;
    },
    /** Запись прототипа по id или null: заведена ли она здесь или пришла из шва. */
    booking: function (id) {
      var found = null;
      this.allBookings().forEach(function (a) { if (a.id === id) { found = a; } });
      return found;
    },
    /** Записи текущего человека. Чья запись — решает personId в ней самой,
        а не имя слота: перенос отдаёт запись другому человеку, и слот,
        выданный при заведении, после этого врёт. */
    bookings: function () {
      var who = state.person;
      return this.allBookings().filter(function (a) { return !a.personId || a.personId === who; });
    },

    /** Замечания заказчика: экран, сценарий, текст, время. */
    remarks: function () { return clone(state.remarks); },
    addRemark: function (r) {
      state.remarks.push({
        screen: r.screen || 'экран',
        scenario: r.scenario || state.scenario,
        text: String(r.text || '').trim(),
        at: new Date().toISOString()
      });
      write(state);
      return state.remarks.length;
    },
    /** Весь список простым текстом — то, что уходит в буфер обмена. */
    remarksText: function () {
      var titles = {};
      SCENARIOS.forEach(function (s) { titles[s.id] = s.title.toLowerCase(); });
      return state.remarks.map(function (r) {
        return r.screen + ' · сценарий «' + (titles[r.scenario] || r.scenario) + '»\n   ' + r.text;
      }).join('\n\n');
    },

    /** Сброс прототипа: сценарий, человек, черновик, отметки, тумблеры, значения.
        Замечания переживают сброс: они не состояние прототипа, а то, ради чего
        заказчик его открыл. Иначе одна отменённая из любопытства запись
        возвращается ценой всех накопленных пометок. */
    reset: function () {
      var remarks = state.remarks;
      state = clone(DEFAULTS);
      state.remarks = remarks;
      write(state);
      return true;
    }
  };

  w.Store = Store;
})(window);
