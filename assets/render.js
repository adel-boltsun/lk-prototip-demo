/* Общие блоки отрисовки: секция с заголовком, карточка записи, карточка врача,
   пустое состояние, таблица сметы, список закапываний, модальное окно.
   Блоки возвращают готовую разметку строкой (modal — открывает окно и
   возвращает его элемент). Детали разметки наружу не выставляются. */
(function (w) {
  'use strict';

  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function icon(name, cls) { return w.icon ? w.icon(name, cls) : ''; }

  /* Согласие, которое гасит все каналы разом, и подписи каналов. Опознание
     идёт по ключу, а не по русской фразе: фразу пишет клиника и меняет когда
     захочет. Подписи принадлежат читателю — шов отдаёт код канала. */
  var REMIND_CONSENT = 'c-remind';
  var CHANNEL = { sms: 'СМС', email: 'электронной почте' };

  /** «за день», «за час», «за 20 минут» — из числа минут, не из текста шва. */
  function leadPhrase(minutes) {
    if (minutes % 1440 === 0) {
      var d = minutes / 1440;
      return d === 1 ? 'за день' : 'за ' + d + ' ' + Fmt.plural(d, 'день', 'дня', 'дней');
    }
    if (minutes % 60 === 0) {
      var h = minutes / 60;
      return h === 1 ? 'за час' : 'за ' + h + ' ' + Fmt.plural(h, 'час', 'часа', 'часов');
    }
    return 'за ' + minutes + ' ' + Fmt.plural(minutes, 'минуту', 'минуты', 'минут');
  }

  /* --- даты по решению спецификации: «12 сентября, четверг», «14:30» ---- */
  /** Одно слово имени в родительном падеже. Роль обязательна: по окончанию
      её не угадать — «Нина» кончается на -ина ровно как фамилия «Соколова»,
      и правило фамилии дало бы «Ниной». Роль берётся из порядка слов:
      имя · отчество · фамилия. */
  function genWord(word, fem, role) {
    var s = String(word);
    if (role === 'last') {
      if (fem) {
        if (/(ская|цкая|ая)$/.test(s)) { return s.slice(0, -2) + 'ой'; }
        if (/(ова|ева|ёва|ина|ына)$/.test(s)) { return s.slice(0, -1) + 'ой'; }
        return s;
      }
      if (/(ский|цкий|ой)$/.test(s)) { return s.slice(0, -2) + 'ого'; }
      if (/(ов|ев|ёв|ин|ын)$/.test(s)) { return s + 'а'; }
      return /[бвгджзклмнпрстфхцчшщ]$/.test(s) ? s + 'а' : s;
    }
    if (role === 'middle') {
      if (/(овна|евна|ична|инична)$/.test(s)) { return s.slice(0, -1) + 'ы'; }
      if (/(ович|евич|ич)$/.test(s)) { return s + 'а'; }
      return s;
    }
    if (fem || /[ая]$/.test(s)) {
      if (/[ия]я$/.test(s)) { return s.slice(0, -1) + 'и'; }
      if (/я$/.test(s)) { return s.slice(0, -1) + 'и'; }
      if (/[гкхжчшщ]а$/.test(s)) { return s.slice(0, -1) + 'и'; }
      if (/а$/.test(s)) { return s.slice(0, -1) + 'ы'; }
      return s;
    }
    if (/[йь]$/.test(s)) { return s.slice(0, -1) + 'я'; }
    return /[бвгджзклмнпрстфхцчшщ]$/.test(s) ? s + 'а' : s;
  }

  /* Окончания, по которым слово опознаётся отчеством и фамилией. Опознание —
     единственное, что отличает «Мария Соколова» от карточного «Соколова Мария
     Андреевна»: порядок слов по одному окончанию не восстановить, а склонение
     не в том порядке даёт «Соколовы Мария Андреевна». */
  var MIDDLE_RE = /(ович|евич|ьевич|овна|евна|ична|инична)$/;
  var LAST_RE = /(ов|ев|ёв|ин|ын|ский|цкий|ова|ева|ёва|ина|ына|ская|цкая|ой|ая)$/;

  /** Роли слов, если строка опознана как «имя [отчество] фамилия».
      null — не опознали: тогда склонять нечего. Карточный порядок в проекте
      живёт (DATA.patient().name — «Соколова Мария Андреевна»), и правило
      обязано его отклонить, а не молча выдать выдуманную форму. */
  function nameRoles(parts) {
    var n = parts.length;
    /* Три слова: порядок задаёт отчество посередине. «Соколова Мария
       Андреевна» отчества посередине не имеет — отклоняем. */
    if (n === 3) {
      return (MIDDLE_RE.test(parts[1]) && LAST_RE.test(parts[2]))
        ? ['first', 'middle', 'last'] : null;
    }
    /* Два слова: порядок восстановим, только если первое на фамилию не похоже.
       «Нина Соколова» и «Соколова Нина» по окончаниям неразличимы — «Нина»
       кончается на -ина ровно как фамилия, — и обе отклоняются. */
    if (n !== 2) { return null; }
    if (MIDDLE_RE.test(parts[0]) || LAST_RE.test(parts[0])) { return null; }
    return LAST_RE.test(parts[1]) ? ['first', 'last'] : null;
  }

  var Fmt = {
    date: function (iso) { var d = new Date(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()]; },
    dateFull: function (iso) { var d = new Date(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + WEEKDAYS[d.getDay()]; },
    weekday: function (iso) { return WEEKDAYS[new Date(iso).getDay()]; },
    time: function (iso) { var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); },
    /** Точная дата — только там, где важна точность: смета и документы. */
    exact: function (iso) {
      var d = new Date(iso);
      return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    },
    money: function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; },
    /** Русское число: «1 день», «2 дня», «5 дней». Объявлено здесь один раз —
        правило одно на все экраны, и правка в нём не может доехать до одного экрана и не доехать до шести
        остальных. Само число подставляет зовущий: где-то оно с разрядами, где-то без. */
    plural: function (n, one, few, many) {
      var tail = n % 10, hun = n % 100;
      if (tail === 1 && hun !== 11) { return one; }
      if (tail > 1 && tail < 5 && (hun < 10 || hun > 20)) { return few; }
      return many;
    },
    /** «через 3 дня», «сегодня», «3 дня назад» */
    relative: function (iso) {
      var a = new Date(iso); a.setHours(0, 0, 0, 0);
      var b = new Date(); b.setHours(0, 0, 0, 0);
      var n = Math.round((a - b) / 86400000);
      if (n === 0) { return 'сегодня'; }
      if (n === 1) { return 'завтра'; }
      if (n === -1) { return 'вчера'; }
      var abs = Math.abs(n), word = Fmt.plural(abs, 'день', 'дня', 'дней');
      return n > 0 ? 'через ' + abs + ' ' + word : abs + ' ' + word + ' назад';
    },
    years: function (n) { return n + ' ' + Fmt.plural(n, 'год', 'года', 'лет'); },
    /** Родительный падеж имени: «Приём для Марии Соколовой». Правило одно
        на весь проект — склонение уже лежало копиями и разъезжалось.

        Функция публичная и порядок слов не выбирает, поэтому проверяет его
        сама: склоняет только то, что опознала как «имя [отчество] фамилия»,
        всё остальное отдаёт именительным. Отказ громче ошибки — «Соколовы
        Мария Андреевна» на экране пациента хуже, чем несклонённое имя. */
    genitive: function (name) {
      var s = String(name === null || name === undefined ? '' : name).trim();
      if (!s) { return ''; }
      var parts = s.split(/\s+/);
      var roles = nameRoles(parts);
      if (!roles) { return s; }
      var mid = roles.indexOf('middle');
      var fem = (mid > -1 && /(овна|евна|ична|инична)$/.test(parts[mid])) ||
        /(ова|ева|ёва|ина|ына|ская|цкая|ая)$/.test(parts[parts.length - 1]);
      return parts.map(function (p, i) { return genWord(p, fem, roles[i]); }).join(' ');
    },
    age: function (birthDate) {
      var b = new Date(birthDate), n = new Date();
      var a = n.getFullYear() - b.getFullYear();
      if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) { a--; }
      return a;
    }
  };

  /* Причины отмены — спека, экран 3. «Передумал» звучит упрёком там, где
     пациент ничего не должен объяснять. */
  var CANCEL_REASONS = ['Не смогу прийти', 'Изменились планы', 'Записался в другое время', 'Другая причина'];
  var cancelBox = null, cancelId = null;

  var STATUS = {
    confirmed: 'Подтверждена', moved: 'Перенесена', cancelled: 'Отменена', done: 'Состоялась'
  };
  /* Тон бейджа статуса — по макету design/zapisi.png: подтверждён зелёный,
     перенесена жёлтая, отменена серая, состоялась спокойная рамка. */
  var STATUS_TONE = {
    confirmed: 'ok', moved: 'warn', cancelled: 'off', done: 'quiet'
  };

  /** Бейдж: рамка или заливка со словом. Цветом текста статус не показывают —
      в макете это именно плашка. tone: ok · warn · off · quiet. */
  function badge(text, tone) {
    return '<span class="badge badge--' + esc(tone || 'quiet') + '">' + esc(text) + '</span>';
  }

  /** Инициалы для плитки: первые буквы двух первых слов. Плитка стоит в трёх
      местах — врач в карточке, врач в мастере, человек в профиле, — и разбор имени
      на буквы у них обязан быть один: двойная фамилия или лишний пробел иначе даёт
      разные буквы на соседних экранах. */
  function initials(name) {
    return String(name === null || name === undefined ? '' : name)
      .split(' ').slice(0, 2).map(function (p) { return p.charAt(0); }).join('');
  }

  /** Фотография врача или инициалы, когда шов отдал photo: null.
      Форма плитки — общий класс .face, cls — модификатор места. */
  function doctorPhoto(d, cls) {
    if (d.photo) {
      return '<img class="face face--photo ' + esc(cls) + ' ' + esc(cls) + '--photo" src="' + esc(d.photo) +
        '" alt="" aria-hidden="true" loading="lazy">';
    }
    return '<span class="face ' + esc(cls) + '" aria-hidden="true">' + esc(initials(d.name)) + '</span>';
  }

  /* Словарь модификаторов карточки записи. Состояние карточки — дело компонента:
     экран не заводит рядом свой класс и не красит .appt снаружи. */
  var APPT_MODS = { cancelled: 'appt--off', today: 'appt--today' };

  /** Ближайшая неотмеченная доза дня: первая, которую ещё не закапали и не
      пропустили. Считается здесь одним способом — и списком, и экранами. */
  function nextDose(day) {
    var doses = (day && day.doses) ? day.doses : (day || []);
    for (var i = 0; i < doses.length; i++) {
      if (!doses[i].done && !doses[i].missed) { return doses[i]; }
    }
    return null;
  }

  /* «Паспорт — оригинал» → жирное название и серое пояснение */
  function splitNote(s) {
    var i = String(s).indexOf(' — ');
    return i < 0 ? { title: s, note: '' } : { title: String(s).slice(0, i), note: String(s).slice(i + 3) };
  }

  var Render = {
    esc: esc,
    fmt: Fmt,
    nextDose: nextDose,
    initials: initials,

    /** Копия записи в отменённом виде: статус и причина поверх того, что отдал
        шов. Данные шва не подменяются — DATA.appointment(id) остаётся прежним.
        Отмена в прототипе живёт в Store.value('cancel:<id>'), а не в данных. */
    asCancelled: function (a, reason) {
      var copy = {};
      for (var k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) { copy[k] = a[k]; } }
      copy.status = 'cancelled';
      copy.cancelReason = reason || a.cancelReason || null;
      return copy;
    },

    /** Копия записи с новым временем: статус, новое время и прежняя дата
        строкой «Перенесена с …». Данные шва не подменяются. */
    asMoved: function (a, to) {
      var copy = {};
      for (var k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) { copy[k] = a[k]; } }
      copy.status = 'moved';
      copy.movedFrom = a.datetime;
      copy.datetime = to.datetime;
      if (to.doctorId) { copy.doctorId = to.doctorId; }
      /* Пациент переносится вместе с записью. Мастер даёт сменить человека
         на шаге 4, шаг 5 и экран успеха его подтверждают — если копия его
         не несёт, запись остаётся у того, кто переносил, и четвёртый экран
         опровергает три предыдущих. */
      if (to.personId) { copy.personId = to.personId; }
      return copy;
    },

    /* --- что видит пациент ------------------------------------------------
       Запись живёт в двух местах: шов отдаёт то, что у клиники, Store держит
       то, что нащёлкали в прототипе, — отмену, перенос, новую запись. Правило
       старшинства (отмена бьёт перенос) и правило поиска (запись из шва и
       запись прототипа равноправны) объявлены здесь по одному разу и зовутся
       экранами. Копий быть не должно: этот таск завёлся ровно потому, что два
       экрана разошлись в том, в каком состоянии запись, — а расхождению нужны
       две копии правила, чтобы следующая правка тронула одну и забыла вторую. */

    /** Имена слотов Store, в которых живёт нащёлканное состояние записи. Собираются
        здесь, рядом с правилом старшинства: экран, склеивший имя сам, пишет в слот,
        который остальные не читают. */
    cancelKey: function (id) { return 'cancel:' + id; },
    moveKey: function (id) { return 'move:' + id; },

    /** Причина отмены строкой — или null, если запись не отменяли. */
    cancelReason: function (id) { return w.Store ? w.Store.value(Render.cancelKey(id)) : null; },

    /** Запись такой, какой её видит пациент прямо сейчас.

        Порядок наложения: сначала перенос, потом отмена. Старшинство отмены —
        про СТАТУС, а не про время: пациент отменяет ту запись, которую видит,
        и она стоит на перенесённой дате. Пока отмена накладывалась на исходную
        запись, она вместе со статусом откатывала и дату — перенёс на 5 сентября,
        отменил, увидел отменённой 27 августа. */
    asSeen: function (a) {
      if (!a) { return a; }
      var to = w.Store ? w.Store.value(Render.moveKey(a.id)) : null;
      var seen = (to && to.datetime) ? Render.asMoved(a, to) : a;
      var off = Render.cancelReason(a.id);
      return off ? Render.asCancelled(seen, off) : seen;
    },

    /** Ближайшая запись для главной: живая, а не любая первая по времени.
        Отменённая остаётся в списке визитов на своём месте, но «Ближайшее»
        на главной — это то, куда пациент идёт. Отменил на 26-е, записался
        на 27-е — главная обязана показать 27-е. Когда живых нет вовсе,
        показываем отменённую: состояние «запись отменена» из таблицы спеки
        наступает именно так. */
    nextAppointment: function () {
      var list = Render.seenAppointments({ when: 'upcoming' });
      var live = null;
      list.forEach(function (a) { if (!live && a.status !== 'cancelled') { live = a; } });
      return live || (list.length ? list[0] : null);
    },

    /** Запись по id — и из шва, и заведённая в самом прототипе. Без наложения:
        мастеру записи нужна исходная, экрану — пропущенная через asSeen.
        Записи прототипа берутся по всему сценарию, а не по текущему человеку:
        перенос отдаёт запись другому человеку, и найти её после этого обязаны
        оба кабинета — иначе она пропадает по дороге. */
    findAppointment: function (id) {
      var found = w.DATA ? w.DATA.appointment(id) : null;
      if (found) { return found; }
      (w.Store ? w.Store.allBookings() : []).forEach(function (a) { if (a.id === id) { found = a; } });
      return found;
    },

    /** Можно ли ещё перенести или отменить эту запись.

        Одно правило на все экраны. Оно было написано дважды: карточка визита
        гасила кнопки за сутки до приёма, а строка контрольного осмотра
        на «Лечении» предлагала перенести вчерашний визит — и он уезжал
        в будущее, оставаясь во вкладке «Прошедшие». Прошедшее не переносится:
        переносят то, что ещё не состоялось. */
    canMove: function (a) {
      if (!a) { return false; }
      if (a.status === 'cancelled' || a.status === 'done') { return false; }
      return (new Date(a.datetime) - new Date()) >= 86400000;
    },

    /** Записать перенос. Единственное место, где он оформляется.

        Слот несёт и нового пациента: перенос — это то же действие, что запись,
        и оно тоже принадлежит тому, ДЛЯ КОГО сделано. Запись из шва в чужой
        кабинет попасть не может — шов отдаёт только текущего человека, — поэтому
        уезжающая к другому человеку копия ложится в Store рядом с обычными
        записями прототипа. Записи самого прототипа перекладывать не нужно:
        allBookings видит их из любого кабинета, а чей это визит, решает
        personId в самой записи. */
    moveTo: function (id, to) {
      var src = Render.findAppointment(id);
      if (!src || !w.Store) { return null; }
      var target = to.personId || src.personId;
      w.Store.setValue(Render.moveKey(id), {
        datetime: to.datetime, doctorId: to.doctorId || src.doctorId, personId: target
      });
      if (target !== src.personId && !w.Store.booking(id)) {
        var rec = Render.asMoved(src, { datetime: to.datetime, doctorId: to.doctorId, personId: target });
        delete rec.id;
        w.Store.addBooking(rec);
      }
      return Render.asSeen(Render.findAppointment(id));
    },

    /** Список визитов, какими их видит пациент: шов плюс записи прототипа,
        наложение, сортировка по тому времени, которое на экране.

        Две вещи решаются здесь и только здесь. Чей это визит — по personId
        уже наложенной копии, а не по тому, из чьего списка он пришёл: иначе
        перенесённая на другого человека запись остаётся у того, кто переносил.
        В какой он вкладке — по тому времени, которое видно на экране, а не
        по корзине шва: перенесённый вперёд визит стоял в «Прошедших»
        с кнопкой «Оставить отзыв» о ещё не состоявшемся приёме. Мера — день,
        а не минута: приём сегодня в 15:30 в четыре часа дня остаётся сегодняшним,
        и главная не обязана терять его в середине дня. Состоявшийся визит
        прошедший по статусу — час дня тут ничего не решает. */
    seenAppointments: function (opts) {
      var when = (opts && opts.when) || 'upcoming';
      var who = w.Store ? w.Store.person() : null;
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var seen = {}, list = [];
      (w.DATA ? w.DATA.appointments({ when: 'upcoming' }) : [])
        .concat(w.DATA ? w.DATA.appointments({ when: 'past' }) : [])
        .concat(w.Store ? w.Store.allBookings() : [])
        .forEach(function (raw) {
          if (seen[raw.id]) { return; }
          seen[raw.id] = true;
          var a = Render.asSeen(raw);
          if (who && a.personId && a.personId !== who) { return; }
          var day = new Date(a.datetime); day.setHours(0, 0, 0, 0);
          var past = a.status === 'done' || day < today;
          if ((when === 'past') !== past) { return; }
          list.push(a);
        });
      list.sort(function (a, b) {
        var x = new Date(a.datetime), y = new Date(b.datetime);
        return when === 'past' ? y - x : x - y;
      });
      return list;
    },

    /* --- занятые окна ------------------------------------------------------
       Свободно то, что отдал шов, МИНУС то, что уже заняли в самом прототипе.
       Пока это правило не было объявлено, шестью кликами проходили две записи
       к одному врачу на одну минуту, а день оставался подписан «12 окон»:
       легенда рисовала «свободно / занято», занятости при этом не существовало.
       Занятость общая на кабинет: окно, занятое для ребёнка, занято и для мамы —
       это расписание клиники, а не список одного человека. */

    /** Карта занятых окон: 'врач|дата|время' → true. Отменённые не занимают. */
    takenSlots: function () {
      var taken = {};
      var all = (w.DATA ? w.DATA.appointments({ when: 'upcoming' }) : [])
        .concat(w.Store ? w.Store.allBookings() : []);
      all.forEach(function (raw) {
        var a = Render.asSeen(raw);
        if (a.status === 'cancelled' || a.status === 'done') { return; }
        var d = new Date(a.datetime);
        var date = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        var time = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        taken[a.doctorId + '|' + date + '|' + time] = true;
      });
      return taken;
    },

    /** Сетка окон, какой её видит пациент: шов минус занятое. Экран, который
        показывает окна, обязан звать её, а не DATA.slots напрямую. */
    seenSlots: function (opts) {
      var taken = Render.takenSlots();
      var doctorId = (opts && opts.doctorId) || null;
      return (w.DATA ? w.DATA.slots(opts) : []).map(function (day) {
        return {
          date: day.date,
          times: day.times.map(function (t) {
            return { time: t.time, free: t.free && !taken[doctorId + '|' + day.date + '|' + t.time] };
          })
        };
      });
    },

    /** Ближайшее свободное окно врача — тем же правилом, что и сетка.
        Карточка врача обещала окно, которое пациент только что занял. */
    nearestFreeSlot: function (d) {
      if (!d) { return null; }
      var taken = Render.takenSlots(), found = null;
      (w.DATA ? w.DATA.slots({ doctorId: d.id }) : []).forEach(function (day) {
        day.times.forEach(function (t) {
          if (!found && t.free && !taken[d.id + '|' + day.date + '|' + t.time]) {
            found = day.date + 'T' + t.time + ':00';
          }
        });
      });
      return found;
    },

    /* --- от вас ждут -------------------------------------------------------
       Задача главной и документ на вкладке «Документов» — две стороны одного:
       задача называет свой документ полем documentId. Ссылка задачи обязана
       приводить именно к нему, а не на экран, где его надо искать глазами:
       обе ссылки вели на голый dokumenty.html, тот открывался на «Заключениях»,
       а обещанный бланк лежал в «Справках и бланках» — у ребёнка приземление
       выходило на слова «Заключений пока нет». */

    /** Слот подписи документа: подписанное в прототипе переживает перезагрузку. */
    signKey: function (docId) { return 'sign:' + docId; },
    signedAt: function (docId) { return w.Store ? w.Store.value(Render.signKey(docId)) : null; },
    sign: function (docId) {
      if (w.Store) { w.Store.setValue(Render.signKey(docId), new Date().toISOString()); }
      return Render.signedAt(docId);
    },

    /** Адрес, по которому задача приводит к обещанному. Собирается здесь один
        раз: экран, склеивший его сам, приведёт не туда, и заметит это заказчик. */
    taskHref: function (t) {
      if (!t || !t.action) { return ''; }
      return t.documentId ? 'dokumenty.html?doc=' + encodeURIComponent(t.documentId) : t.action.href;
    },

    /** Задачи, которые ещё открыты: подписанное в прототипе закрывает свою
        задачу. Иначе «ОТ ВАС ЖДУТ» просит подписать то, что уже подписано. */
    seenTasks: function () {
      return (w.DATA ? w.DATA.tasks() : []).filter(function (t) {
        return !(t.documentId && Render.signedAt(t.documentId));
      });
    },

    /** Ждёт ли этот документ подписи пациента и какого рода задача его ждёт. */
    awaitedDoc: function (docId) {
      var found = null;
      Render.seenTasks().forEach(function (t) { if (t.documentId === docId) { found = t; } });
      return found;
    },

    /* --- напоминания -------------------------------------------------------
       Обещание «напомним по СМС» стояло двумя копиями — на главной и в визитах, —
       и обе читали шов мимо профиля: заказчик снимал согласие, профиль честно
       писал «выключены», а карточка визита продолжала обещать СМС. Согласие
       и каналы решают одно и то же в одном месте. */

    /** Состояние напоминаний: {on, leads, channels}. on: false — согласие снято. */
    reminders: function () {
      var n = w.DATA ? w.DATA.notifications() : { rules: [], channels: [] };
      var who = w.Store ? w.Store.person() : null;
      var on = true;
      (w.DATA ? w.DATA.patient().consents : []).forEach(function (c) {
        if (c.id !== REMIND_CONSENT) { return; }
        var own = w.Store ? w.Store.value('consent:' + who + ':' + c.id) : null;
        on = own ? !!own.given : !!c.given;
      });
      var leads = [], channels = [], status = false;
      n.rules.forEach(function (r) {
        if (r.kind === 'visit' && typeof r.leadMinutes === 'number') { leads.push(r.leadMinutes); }
        if (r.kind === 'status') { status = true; }
      });
      leads.sort(function (a, b) { return b - a; });
      n.channels.forEach(function (c) {
        var own = w.Store ? w.Store.value('notify:' + c.id) : null;
        var enabled = own === null ? c.enabled : !!own;
        if (enabled && CHANNEL[c.id]) { channels.push(CHANNEL[c.id]); }
      });
      return { on: on, leads: leads, channels: channels, status: status };
    },

    /** Что обещает карточка визита про напоминания. Пустая строка — молчим. */
    remindText: function (opts) {
      var r = Render.reminders();
      if (!r.on) { return 'Напоминания о визитах выключены в профиле — ни СМС, ни письма не придут.'; }
      if (!r.leads.length && !r.status) { return ''; }
      var text = '';
      if (r.leads.length) {
        text = 'Напомним ' + r.leads.map(leadPhrase).join(' и ') + ' до визита' +
          (r.channels.length ? ' по ' + r.channels.join(' и ')
                             : ', как только включите каналы в профиле') + '.';
      }
      if (r.status && !(opts && opts.short)) {
        text += (text ? ' ' : '') + 'Сообщим сразу, если запись перенесут или отменят.';
      }
      return text;
    },

    /* --- контрольные осмотры ----------------------------------------------
       План лечения называет осмотр, запись — его исполнение. Связь идёт одним
       полем: appointmentId у шва, а для назначенного в прототипе — слот ниже.
       Без него «Записаться» у контроля на 30-й день обещала назначить осмотр,
       запись появлялась в визитах, а план продолжал писать «Дата пока
       не назначена». */
    checkupKey: function (c) { return 'checkup:' + (c && c.id ? c.id : ''); },

    /** Запись этого осмотра — из шва или назначенная в прототипе, — уже
        с наложенным состоянием. null, если осмотр ещё не назначен. */
    checkupAppointment: function (c) {
      if (!c) { return null; }
      var id = c.appointmentId || (w.Store ? w.Store.value(Render.checkupKey(c)) : null);
      if (!id) { return null; }
      var a = Render.asSeen(Render.findAppointment(id));
      return a || null;
    },

    /** Секция экрана: заголовок с линейкой и подпись справа от неё.
        section({ title, aside, cls, body }) — body уже готовая разметка. */
    section: function (o) {
      o = o || {};
      return '<section class="section' + (o.cls ? ' ' + esc(o.cls) : '') + '">' +
        '<div class="section__head"><h2 class="label">' + esc(o.title) + '</h2>' +
        (o.aside ? '<span class="section__aside">' + esc(o.aside) + '</span>' : '') + '</div>' +
        (o.body || '') + '</section>';
    },

    /** Крупная карточка записи: дата и время, врач, клиника, адрес, действия. */
    appointmentCard: function (a) {
      if (!a) { return ''; }
      var doctor = null, branch = null;
      (w.DATA ? w.DATA.doctors({}) : []).forEach(function (d) { if (d.id === a.doctorId) { doctor = d; } });
      (w.DATA ? w.DATA.branches() : []).forEach(function (b) { if (b.id === a.branchId) { branch = b; } });
      var off = a.status === 'cancelled';
      var done = a.status === 'done';
      var today = !off && !done && Fmt.relative(a.datetime) === 'сегодня';
      /* Правило клиники — не позднее чем за 24 часа. Живая кнопка «Отменить»
         рядом с этой строкой обещает то, чего в рабочей версии не будет.
         Само правило — Render.canMove, одно на все экраны. */
      var late = !off && !done && !Render.canMove(a);
      var mods = (off ? ' ' + APPT_MODS.cancelled : '') + (today ? ' ' + APPT_MODS.today : '');

      /* У несостоявшегося визита нет ни заключения, ни переноса: остаётся
         записаться заново. Отменённая запись — не то же самое, что прошедшая. */
      var actions = off
        ? '<a class="btn btn--primary btn--block" href="zapis-novaya.html?doctor=' + esc(a.doctorId) + '">' + icon('calendar-plus') + 'Записаться заново</a>'
        : done
        ? '<button class="btn btn--secondary btn--block" data-soon="Заключение">' + icon('file') + 'Заключение</button>' +
          '<a class="btn btn--secondary btn--block" href="zapis-novaya.html?doctor=' + esc(a.doctorId) + '">' + icon('calendar-plus') + 'Записаться снова</a>'
        : '<button class="btn btn--primary btn--block" data-act="route" data-branch="' + esc(a.branchId) + '">' + icon('navigation') + 'Как добраться</button>' +
          (late
            ? '<span class="btn btn--secondary btn--block btn--disabled" aria-disabled="true">' + icon('clock') + 'Перенести</span>' +
              '<span class="btn btn--secondary btn--block btn--disabled" aria-disabled="true">' + icon('close') + 'Отменить</span>' +
              '<p class="muted appt__hint">До приёма меньше суток — перенести и отменить здесь уже нельзя. ' +
                'Позвоните в клинику: ' + esc(branch ? branch.phone : '') + '.</p>'
            : '<a class="btn btn--secondary btn--block" href="zapis-novaya.html?move=' + esc(a.id) + '">' + icon('clock') + 'Перенести</a>' +
              '<button class="btn btn--secondary btn--block" data-act="cancel" data-id="' + esc(a.id) + '">' + icon('close') + 'Отменить</button>' +
              '<p class="muted appt__hint">Перенос и отмена — не позднее чем за 24 часа до приёма.</p>');

      /* Статус — плашкой над датой, как в макете: цвета текста мало, серую
         отменённую от состоявшейся глазом не отличить. */
      var stamp = '<p class="appt__badge">' + badge(STATUS[a.status] || a.status, STATUS_TONE[a.status]) + '</p>';
      var when = off
        ? stamp +
          '<p class="display">' + esc(Fmt.date(a.datetime)) + '</p>' +
          '<p class="time">' + esc(Fmt.time(a.datetime)) + '</p>' +
          (a.movedFrom ? '<p class="muted">Перенесена с ' + esc(Fmt.date(a.movedFrom)) + '</p>' : '') +
          (a.cancelReason ? '<p class="muted appt__status">Причина: ' + esc(a.cancelReason) + '</p>' : '')
        : stamp +
          '<p class="label">' + esc(Fmt.weekday(a.datetime)) + '</p>' +
          '<p class="display">' + esc(Fmt.date(a.datetime)) + '</p>' +
          '<p class="muted">' + esc(Fmt.relative(a.datetime)) + '</p>' +
          '<p class="time">' + esc(Fmt.time(a.datetime)) + '</p>' +
          (a.movedFrom ? '<p class="muted">Перенесена с ' + esc(Fmt.date(a.movedFrom)) + '</p>' : '');

      /* Стоимость приёма — над кнопками, как в макете. Сумма и метка «включено
         в пакет» стоят рядом, а не вместо друг друга: design/zapisi.png пинует
         на отменённой карточке «3 500 ₽», design/smeta.png показывает ту же
         услугу как «3 500 ₽ · включено в пакет». Ноль значит, что отдельной
         цены за визит нет вовсе, — тогда остаётся одна метка, но не «0 ₽». */
      var sum = a.price ? '<p class="time">' + esc(Fmt.money(a.price)) + '</p>' : '';
      var mark = a.included ? '<p class="appt__mark">' + badge('включено в пакет', 'quiet') + '</p>' : '';
      var cost = (sum || mark)
        ? '<div class="appt__cost"><p class="label">Стоимость приёма</p>' + sum + mark + '</div>'
        : '';

      return '<article class="card appt' + mods + '" data-appointment="' + esc(a.id) + '">' +
        '<div class="appt__when">' + when + '</div>' +
        '<div class="appt__who">' +
          '<div class="appt__line">' +
            (doctor ? doctorPhoto(doctor, 'appt__face') : icon('stethoscope')) +
            '<div><p class="label">Врач</p><p class="strong">' + esc(doctor ? doctor.name : '') + '</p>' +
            (doctor ? '<p class="muted">' + esc(doctor.position) + '</p>' : '') + '</div></div>' +
          '<div class="appt__line">' + icon('clipboard') +
            '<div><p class="label">Услуга</p><p class="strong">' + esc(a.service) + '</p></div></div>' +
          '<div class="appt__line">' + icon('building') +
            '<div><p class="label">Клиника</p><p class="strong">' + esc(branch ? branch.title : '') + '</p>' +
            '<p class="muted">' + esc(branch ? branch.city + ', ' + branch.address : '') + '</p>' +
            '<p class="muted">' + esc(branch ? branch.hours : '') + '</p></div></div>' +
        '</div>' +
        '<div class="appt__acts stack">' + cost + actions + '</div>' +
      '</article>';
    },

    /** Карточка врача для мастера записи. */
    doctorCard: function (d) {
      if (!d) { return ''; }
      var nearest = Render.nearestFreeSlot(d);
      return '<article class="card doctor" data-doctor="' + esc(d.id) + '">' +
        doctorPhoto(d, 'doctor__photo') +
        '<div class="doctor__body">' +
          '<p class="row__title">' + esc(d.name) + '</p>' +
          '<p class="muted">' + esc(d.position) + (d.degree ? ' · ' + esc(d.degree) : '') + '</p>' +
          /* Стаж и число операций печатаются, только если они известны:
             у настоящего врача их выдумывать нельзя, шов отдаёт null. */
          (d.experienceYears || d.operationsCount
            ? '<p class="muted">' +
                (d.experienceYears ? 'Стаж ' + esc(Fmt.years(d.experienceYears)) : '') +
                (d.experienceYears && d.operationsCount ? ' · ' : '') +
                (d.operationsCount ? 'операций: ' + esc(d.operationsCount) : '') + '</p>'
            : '') +
        '</div>' +
        /* Подписи над суммой и окном — как в макете: без них две цифры рядом
           читаются как одна строка непонятно про что. */
        '<div class="doctor__aside">' +
          '<p class="label">Стоимость приёма</p>' +
          '<p class="strong">' + esc(Fmt.money(d.price)) + '</p>' +
        '</div>' +
        '<div class="doctor__aside">' +
          '<p class="label">Ближайшее окно</p>' +
          /* Окно берётся тем же правилом, что и сетка мастера: карточка обещала
             время, которое пациент уже занял минуту назад. */
          '<p class="strong">' + (nearest
            ? esc(Fmt.date(nearest)) + ', ' + esc(Fmt.time(nearest))
            : '<span class="muted">Нет свободных окон</span>') + '</p>' +
        '</div>' +
      '</article>';
    },

    /** Пустое состояние: иконка, заголовок, пояснение, действие. */
    emptyState: function (o) {
      o = o || {};
      var action = '';
      if (o.action) {
        if (o.action.href) {
          action = '<a class="btn btn--primary" href="' + esc(o.action.href) + '">' + esc(o.action.text) + '</a>';
        } else if (o.action.act) {
          /* Экран обязан зарегистрировать это действие: Shell.on(act, fn). */
          action = '<button class="btn btn--primary" data-act="' + esc(o.action.act) + '">' + esc(o.action.text) + '</button>';
        } else {
          action = '<button class="btn btn--primary" data-soon="' + esc(o.action.text) + '">' + esc(o.action.text) + '</button>';
        }
      }
      return '<div class="empty">' +
        '<div class="empty__icon">' + icon(o.icon || 'calendar-check', 'ic--xl') + '</div>' +
        '<p class="empty__title">' + esc(o.title || o.text || '') + '</p>' +
        (o.title && o.text ? '<p class="empty__text">' + esc(o.text) + '</p>' : '') +
        (action ? '<div class="empty__action">' + action + '</div>' : '') +
      '</div>';
    },

    /** Таблица сметы: услуга, количество, цена, статус бейджем.
        Итоги здесь не живут: в макете они отдельным блоком под таблицей —
        см. Render.invoiceTotals. Таблица уезжает внутри своей обёртки,
        а не разносит страницу по ширине. */
    invoiceTable: function (inv) {
      if (!inv || !inv.lines.length) { return ''; }
      var st = { paid: 'оплачено', due: 'к оплате', included: 'включено в пакет' };
      var tone = { paid: 'ok', due: 'warn', included: 'quiet' };
      var rows = inv.lines.map(function (l) {
        /* Строка «включено в пакет» показывает свою сумму, а не прочерк:
           пациент видит, что именно ему включили и во что это оценено. */
        return '<tr><td>' + esc(l.title) + '</td><td class="num">' + esc(l.qty) + '</td>' +
          '<td class="num">' + esc(Fmt.money(l.price * l.qty)) + '</td>' +
          '<td>' + badge(st[l.status] || l.status, tone[l.status]) + '</td></tr>';
      }).join('');
      return '<div class="card card--table"><div class="table-wrap"><table class="table">' +
        '<thead><tr><th>Услуга</th><th class="num">Кол-во</th><th class="num">Цена</th><th>Статус</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div></div>';
    },

    /** Итоги счёта отдельным блоком: назначено, оплачено, остаток и срок.
        cells — необязательные подписи под цифрами {total, paid, due, when},
        их собирает экран: шов множественных чисел не сочиняет. */
    invoiceTotals: function (inv, notes) {
      if (!inv || !inv.lines.length) { return ''; }
      notes = notes || {};
      function cell(label, value, note, cls) {
        return '<div class="totals__cell">' +
          '<p class="label">' + esc(label) + '</p>' +
          '<p class="' + (cls || 'display') + '">' + value + '</p>' +
          (note ? '<p class="totals__note">' + note + '</p>' : '') +
        '</div>';
      }
      var when;
      if (!inv.due) {
        when = cell('Счёт', '<span class="text-accent">' + icon('check', 'ic--lg') + ' Оплачен полностью</span>',
          notes.when || 'Остаток нулевой — доплачивать нечего.', 'totals__when');
      } else if (!inv.dueDate) {
        when = cell('Срок оплаты остатка', 'Срок не назначен', notes.when || 'Клиника назовёт срок отдельно.', 'totals__when');
      } else if (inv.overdue) {
        when = cell('Срок оплаты остатка',
          '<span class="text-danger">срок вышел ' + esc(Fmt.exact(inv.dueDate)) + '</span>',
          '<span class="text-danger strong">' + esc(Fmt.relative(inv.dueDate)) + '</span>', 'totals__when');
      } else {
        when = cell('Срок оплаты остатка', esc(Fmt.exact(inv.dueDate)),
          notes.when || esc(Fmt.relative(inv.dueDate)), 'totals__when');
      }
      return '<div class="card totals">' +
        cell('Назначено', esc(Fmt.money(inv.total)), notes.total || '') +
        cell('Оплачено', '<span class="text-accent">' + esc(Fmt.money(inv.paid)) + '</span>', notes.paid || '') +
        cell('Остаток', esc(Fmt.money(inv.due)), notes.due || '') +
        when +
      '</div>';
    },

    /** График закапываний на день: время, препарат, доза, отметка. */
    doseList: function (day) {
      var doses = (day && day.doses) ? day.doses : (day || []);
      if (!doses.length) { return ''; }
      var next = nextDose(doses);
      var nextId = next ? next.id : null;
      return '<ul class="rows">' + doses.map(function (d) {
        var cls = 'row' + (d.missed && !d.done ? ' is-missed' : '') + (d.id === nextId ? ' is-next' : '');
        return '<li class="' + cls + '">' +
          '<span class="row__icon">' + icon('drop') + '</span>' +
          '<span class="row__body"><span class="row__title">' + esc(d.time) + ' · ' + esc(d.drug) + '</span>' +
          '<span class="row__sub">' + esc(d.dose) + (d.missed && !d.done ? ' · пропущено в ' + esc(d.time) : '') + '</span></span>' +
          '<span class="row__action"><button class="btn btn--sm ' + (d.done ? 'btn--secondary' : 'btn--primary') +
          '" data-act="dose" data-id="' + esc(d.id) + '" aria-pressed="' + (d.done ? 'true' : 'false') + '">' +
          (d.done ? 'Закапал' : 'Отметить') + '</button></span>' +
        '</li>';
      }).join('') + '</ul>';
    },

    /** Список «что взять с собой» — строки вида «Паспорт — оригинал».

        Значок берётся по порядку строки, и заглушке доставался первый —
        паспорт: рядом со «Список подберём к визиту» стоял значок документа,
        которого в строке нет. Заглушка опознаётся по пометке `[уточняется]`
        (ADR 0010: она осталась там, где источника нет вовсе) — по пометке,
        а не по словам фразы: формулировку экран волен менять, пометку нет. */
    bringList: function (items) {
      return '<ul class="rows">' + (items || []).map(function (s, i) {
        var p = splitNote(s);
        var icons = ['passport', 'shield', 'glasses', 'clip', 'warn'];
        var known = String(s).indexOf('[уточняется]') < 0;
        return '<li class="row row--compact">' + icon(known ? icons[i % icons.length] : 'clock') +
          '<span class="row__body"><span class="strong">' + esc(p.title) + '</span>' +
          (p.note ? ' <span class="muted">' + esc(p.note) + '</span>' : '') + '</span></li>';
      }).join('') + '</ul>';
    },

    /** Модальное окно. Возвращает элемент; закрывается крестиком, Esc и по фону. */
    modal: function (o) {
      o = o || {};
      var wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = '<div class="modal modal-wrap" role="dialog" aria-modal="true" aria-label="' + esc(o.title || 'Окно') + '">' +
        '<button class="modal__close" data-act="modal-close" aria-label="Закрыть">' + icon('close') + '</button>' +
        '<h2 class="modal__title">' + esc(o.title || '') + '</h2>' +
        (o.text ? '<p class="modal__text">' + esc(o.text) + '</p>' : '') +
        (o.html ? '<div class="modal__body">' + o.html + '</div>' : '') +
        '<div class="modal__foot">' + (o.foot || '<button class="btn btn--secondary" data-act="modal-close">Понятно</button>') + '</div>' +
      '</div>';
      function close() {
        if (wrap.parentNode) { wrap.parentNode.removeChild(wrap); }
        document.removeEventListener('keydown', onKey);
        if (o.onClose) { o.onClose(); }
      }
      function onKey(e) { if (e.key === 'Escape') { close(); } }
      wrap.addEventListener('click', function (e) {
        if (e.target === wrap || (e.target.closest && e.target.closest('[data-act="modal-close"]'))) { close(); }
      });
      document.addEventListener('keydown', onKey);
      wrap.close = close;
      document.body.appendChild(wrap);
      var focusable = wrap.querySelector('button, [href], input, textarea');
      if (focusable) { focusable.focus(); }
      return wrap;
    },

    /* --- окно отмены записи -----------------------------------------------
       Окно жило двумя копиями — на главной и в визитах, — и обе брали дату
       у DATA.appointment(id), то есть исходную: карточка над окном говорила
       «28 августа, перенесена с 26-го», а окно — «Приём 26 августа». Дата
       в окне обязана быть той же, что на карточке, поэтому запись проходит
       через asSeen, а само окно объявлено здесь один раз. */

    /** Открыть окно отмены записи id. Возвращает окно или null, если записи
        уже нет: тогда показано «появится в рабочей версии». */
    cancelDialog: function (id) {
      var a = Render.asSeen(Render.findAppointment(id));
      if (!a) { Render.soon('Отмена записи'); return null; }
      cancelId = a.id;
      cancelBox = Render.modal({
        title: 'Отменить запись',
        text: 'Приём ' + Fmt.dateFull(a.datetime) + ' в ' + Fmt.time(a.datetime) +
              '. Отменить можно не позднее чем за 24 часа. Причину увидит регистратура.',
        html: '<div class="stack--tight">' + CANCEL_REASONS.map(function (r, i) {
          return '<label class="choice"><input type="radio" name="cancel-reason" value="' + i + '"' +
            (i === 0 ? ' checked' : '') + '><span>' + esc(r) + '</span></label>';
        }).join('') + '</div>',
        foot: '<button class="btn btn--danger" data-act="cancel-confirm">Отменить запись</button>' +
              '<button class="btn btn--secondary" data-act="modal-close">Оставить как есть</button>',
        onClose: function () { cancelBox = null; }
      });
      return cancelBox;
    },

    /** Подтвердить отмену: причина уходит в общий слот. Возвращает id
        отменённой записи — экрану остаётся перерисовать себя. */
    cancelConfirm: function () {
      var picked = cancelBox ? cancelBox.querySelector('input[name="cancel-reason"]:checked') : null;
      var id = cancelId;
      if (id && w.Store) {
        w.Store.setValue(Render.cancelKey(id),
          CANCEL_REASONS[picked ? +picked.value : 0] || CANCEL_REASONS[CANCEL_REASONS.length - 1]);
      }
      if (cancelBox) { cancelBox.close(); }
      cancelBox = null;
      cancelId = null;
      return id;
    },

    /** Окно для действий, которых в прототипе нет (A02 → R05). */
    soon: function (what) {
      return Render.modal({
        title: what || 'Действие появится в рабочей версии',
        text: 'В прототипе это действие не выполняется. В рабочей версии кабинета оно будет доступно.'
      });
    }
  };

  w.Render = Render;
})(window);
