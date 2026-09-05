/* ЕДИНСТВЕННЫЙ ШОВ К БЭКЕНДУ ДЛЯ КАБИНЕТА ВРАЧА-ПАРТНЁРА И АДМИН-ПАНЕЛИ.
   Объявляет тот же глобальный DATA, что и assets/mock.js, — имя шва одно на
   весь прототип. НИ ОДНА страница не подключает оба файла: экраны пациента
   берут mock.js, экраны врача и клиники — этот. Иначе второй скрипт молча
   затирает первый, и кабинет показывает чужие данные.

   Данные выдуманы целиком. Врачи-партнёры — сторонние медики, и ни одного
   настоящего врача чужой клиники здесь нет; пациенты выдуманы тоже.
   Фактура клиники ФАКТ (город, адрес, телефон, услуги и цены) — с factmed.ru.
   Медицинского содержания нет: ни диагнозов, ни назначений — врач называет
   услугу из прайса, диагноз ставит клиника.

   Сценарий DATA читает из Store сам — экраны его не передают. */
(function (w) {
  'use strict';

  /* --- даты считаются от сегодня, чтобы прототип не устаревал ---------- */
  function at(days, time) {
    var t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + days);
    if (time) { var p = time.split(':'); t.setHours(+p[0], +p[1]); }
    return t.toISOString();
  }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  /* Числовой хвост, одинаковый при каждом открытии: демо-данные не должны
     меняться от перезагрузки, иначе заказчик видит разные цифры на одном
     экране и считает это дефектом. */
  function seed(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 100000; }
    return h;
  }

  /* --- фактура клиники: только с factmed.ru ---------------------------- */
  /* Пятигорск подтверждён сайтом клиники до адреса и телефона. Краснодар
     клиника называет, а адреса на сайте нет — стоит видимая заглушка, а не
     правдоподобная улица. */
  var CLINICS = [
    { id: 'c-pyatigorsk', city: 'Пятигорск', title: 'Клиника ФАКТ на Московской',
      address: 'улица Московская, 105', phone: '8 800 505 46 12',
      hours: 'Ежедневно 08:00 — 20:00' },
    { id: 'c-krasnodar', city: 'Краснодар', title: 'Клиника ФАКТ в Краснодаре',
      address: '[уточняется]', phone: '8 800 505 46 12',
      hours: '[уточняется]' }
  ];

  /* 🔴 Одна услуга — одна цена во всех местах данных. Цены с factmed.ru, те же,
     что в кабинете пациента (assets/mock.js). Направление называет услугу из
     этого списка — своего прайса у экранов нет. */
  var SERVICES = [
    { id: 's-diag',   title: 'Комплексная диагностика зрения',            price: 4500 },
    { id: 's-kids',   title: 'Консультация детского офтальмолога',        price: 5000 },
    { id: 's-watch',  title: 'Динамическое наблюдение после обследования', price: 3500 },
    { id: 's-lasik',  title: 'Лазерная коррекция зрения CLEAR, оба глаза', price: 128000 }
  ];

  /* --- лестница статусов: перечень принадлежит клинике ------------------
     Четыре ступени из КП, раздел 3, плюс два закрывающих исхода. Иных
     статусов не выдумывать: перечень уточняется до продакшна. */
  var LADDER = [
    { id: 'created', title: 'Направление создано', step: true },
    { id: 'booked',  title: 'Записан',             step: true },
    { id: 'served',  title: 'Оказана услуга',      step: true },
    { id: 'accrued', title: 'Бонус начислен',      step: true },
    { id: 'noshow',  title: 'Не дошёл',            step: false },
    { id: 'cancelled', title: 'Отменено',          step: false }
  ];
  var STEP_IDS = ['created', 'booked', 'served', 'accrued'];

  /* --- ставка начисления ------------------------------------------------
     🔴 Ставку назначил владелец 04.09 на время показа: 10 % от суммы услуги.
     Своего правила начисления клиника не давала и на продакшн-сценарии его
     ещё напишет, поэтому число ходит по экранам ТОЛЬКО вместе с подписью о
     том, что ставка демонстрационная. Подпись — не украшение: ровно она
     отличает решение владельца от выдуманного факта о клинике, и убрать её
     нельзя.

     Ставка живёт здесь одной константой, и подпись со словом «10 %» считается
     от неё же: разойтись число и его название физически не могут, а экран,
     который захочет назвать ставку, обязан взять слова отсюда, а не сочинить
     свои. */
  var BONUS_RATE = 0.1;
  var BONUS_RATE_LABEL = Math.round(BONUS_RATE * 100) + '%';
  var BONUS_RULE = BONUS_RATE_LABEL + ' от суммы услуги — демонстрационная ставка; ' +
    'сроки выплат клиника пока не назвала';
  var BONUS_NOTE = 'Ставка ' + BONUS_RATE_LABEL + ' демонстрационная — правило начисления ' +
    'клиника пока не давала';

  /** Начисление направления: ставка от суммы оказанной услуги.

      🔴 Формула одна на оба пути — сборку демо-данных и наложение решения
      администратора. Двух формул тут уже было достаточно, чтобы у одного и
      того же направления сумма менялась сама: 800 ₽ до смены статуса и 600 ₽
      после того, как клиника отметила услугу и начислила бонус. Заказчик
      видит, как цифра меняется без причины, и называет это дефектом. */
  function bonusOf(price) {
    return Math.round((Number(price) || 0) * BONUS_RATE);
  }

  /* Слова администратора для демо-пути «заявка отклонена». Настоящую причину
     пишет админ-панель и кладёт в Store; эта строка нужна, чтобы состояние
     можно было показать до того, как панель собрана. */
  var DEMO_REJECT = 'Место работы не подтвердилось: в указанной клинике вас не нашли. Позвоните — уточним и откроем доступ.';

  /* --- врач-партнёр, чей кабинет открыт --------------------------------
     Выдуманный сторонний медик: он не работает в ФАКТе и не взят из списка
     врачей чужой клиники. */
  var PARTNER = {
    id: 'p-1',
    name: 'Ветлугина Анна Сергеевна',
    specialty: 'Врач-терапевт',
    city: 'Пятигорск',
    workplace: 'Частный кабинет, Пятигорск',
    phone: '+7 (928) 100-24-57',
    email: 'a.vetlugina@example.ru',
    status: 'confirmed',
    confirmedAt: at(-96),
    notifyStatus: true,
    notifyBonus: true
  };

  /* Партнёры для реестра клиники. Все выдуманы. */
  /* Телефон и почта заведены у всех: карточка партнёра звонит по ним, а до неё
     контакты держал один PARTNER — хозяин кабинета. Реестр их не рисует, ему
     они и не нужны; расходиться двум спискам контактов нельзя, поэтому у
     хозяина кабинета они те же, что в PARTNER.

     🔴 confirmedAt здесь НЕ появляется, хотя карточка его просит. Поле занято
     вторым смыслом: реестр по нему метит новичка, подтверждённого прямо в
     прототипе («Новый партнёр»), и проставленная всем дата пометила бы новыми
     всех шестерых. У демонстрационных партнёров даты подтверждения в данных
     нет — карточка показывает это заглушкой и объясняет словами, а не
     подставляет правдоподобное число. */
  var PARTNERS = [
    { id: 'p-1', name: 'Ветлугина Анна Сергеевна',   specialty: 'Врач-терапевт',        city: 'Пятигорск',  workplace: 'Частный кабинет, Пятигорск',        phone: '+7 (928) 100-24-57', email: 'a.vetlugina@example.ru' },
    { id: 'p-2', name: 'Гордеев Павел Игоревич',     specialty: 'Врач общей практики',  city: 'Пятигорск',  workplace: 'Медцентр «Пример», Пятигорск',      phone: '+7 (911) 214-38-56', email: 'p.gordeev@example.ru' },
    { id: 'p-3', name: 'Лапшина Ольга Дмитриевна',   specialty: 'Врач-педиатр',         city: 'Ессентуки',  workplace: 'Частная практика, Ессентуки',       phone: '+7 (928) 730-51-40', email: 'o.lapshina@example.ru' },
    { id: 'p-4', name: 'Юрчук Марина Леонидовна',    specialty: 'Врач-эндокринолог',    city: 'Краснодар',  workplace: 'Медцентр «Образец», Краснодар',     phone: '+7 (918) 402-66-13', email: 'm.yurchuk@example.ru' },
    { id: 'p-5', name: 'Бабенко Тимур Русланович',   specialty: 'Врач-невролог',        city: 'Краснодар',  workplace: 'Частный кабинет, Краснодар',        phone: '+7 (918) 155-89-24', email: 't.babenko@example.ru' },
    { id: 'p-6', name: 'Ситникова Дарья Олеговна',   specialty: 'Врач общей практики',  city: 'Минеральные Воды', workplace: 'Частная практика, Минеральные Воды', phone: '+7 (928) 917-30-68', email: 'd.sitnikova@example.ru' }
  ];

  /* Пациенты выдуманы. Возраст лежит числом: от него зависит только то,
     детский приём или взрослый, — медицинского содержания в направлении нет. */
  var PATIENT_NAMES = [
    ['Тарасов Егор Витальевич', 41], ['Никулина Вера Павловна', 63],
    ['Демченко Алла Игоревна', 35], ['Плотников Юрий Семёнович', 58],
    ['Ерохина Полина Романовна', 9], ['Савельев Кирилл Антонович', 27],
    ['Гаврилюк Инна Тарасовна', 46], ['Панкратов Лев Данилович', 7],
    ['Ильченко Оксана Юрьевна', 52], ['Мещеряков Артур Львович', 33],
    ['Костина Наталья Егоровна', 61], ['Рябинин Глеб Максимович', 12],
    ['Шевелёва Лариса Ивановна', 49], ['Дорохов Матвей Сергеевич', 38],
    ['Бурмистрова Яна Кирилловна', 24], ['Заболотный Роман Ильич', 55],
    ['Тимошенко Алиса Егоровна', 6], ['Кайдалова Жанна Львовна', 44],
    ['Устюжанин Пётр Артёмович', 67], ['Логвинова Мария Тимофеевна', 31],
    ['Хайруллин Ринат Маратович', 40], ['Свиридова Ксения Павловна', 29],
    ['Полторацкий Илья Русланович', 36], ['Емельяненко Вера Данииловна', 71],
    ['Ковтун Богдан Олегович', 15], ['Жердева Ирина Валерьевна', 47],
    ['Ануфриев Степан Львович', 22], ['Мазурок Елена Тарасовна', 59],
    ['Трубников Данила Егорович', 11], ['Селиванова Ада Игоревна', 68],
    ['Гуменюк Артём Богданович', 43], ['Лаптева Софья Романовна', 26],
    ['Кондрашов Никита Львович', 34], ['Ямпольская Регина Юрьевна', 50]
  ];

  function phoneOf(i) {
    var tail = 1000 + (seed('tel' + i) % 8999);
    return '+7 (9' + (10 + (i % 80)) + ') ' + String(200 + (i % 700)) + '-' +
      String(tail).slice(0, 2) + '-' + String(tail).slice(2, 4);
  }

  /* --- сборка направлений ----------------------------------------------
     Номер, дата и ступень выводятся из порядкового номера, а не выписаны
     руками: тридцать четыре направления руками — это тридцать четыре места,
     где расходится сумма с услугой. Форма хранения наружу не выставляется. */
  function build(i, partnerId, statusId, daysAgo) {
    var id = 'r-' + i;
    var svc = SERVICES[seed('svc' + i + partnerId) % SERVICES.length];
    var clinic = CLINICS[seed('cl' + i + partnerId) % CLINICS.length];
    var pat = PATIENT_NAMES[i % PATIENT_NAMES.length];
    var age = pat[1];
    /* Детский приём — только детям: услуга обязана сойтись с возрастом,
       иначе таблица показывает взрослого на детской консультации. */
    if (age < 18) { svc = SERVICES[1]; }
    else if (svc.id === 's-kids') { svc = SERVICES[0]; }

    var reached = STEP_IDS.indexOf(statusId);
    /* 🔴 «Не дошёл» — исход того, кто БЫЛ ЗАПИСАН: не дойти можно только до
       приёма, на который записан. Пока лестница обрывалась сразу после
       «направление создано», потеря падала в первый разрыв воронки — туда,
       где пациенты ждут записи от клиники, — и карточка партнёра показывала
       нашу сторону виноватой стороной врача. «Отменено» так не разворачивается:
       отменить направление можно и до записи. */
    var opened = reached < 0 ? (statusId === 'noshow' ? 1 : 0) : reached;
    var steps = [];
    for (var s = 0; s <= opened; s++) {
      steps.push({ id: STEP_IDS[s], title: LADDER[s].title, at: at(-daysAgo + s * 2) });
    }
    if (reached < 0) {
      steps.push({ id: statusId, title: statusId === 'noshow' ? 'Не дошёл' : 'Отменено',
                   at: at(-daysAgo + 3) });
    }

    var served = reached >= 2;
    var accrued = reached >= 3;
    /* Сумма оказанной услуги — цена из прайса клиники, начисление — ставка от
       неё. Ставка демонстрационная, и подпись об этом ходит вместе с числом:
       без неё показ читает 10 % как согласованное правило программы. */
    var bonus = accrued ? bonusOf(svc.price) : null;

    return {
      id: id,
      number: 'Н-' + (1000 + i),
      partnerId: partnerId,
      patientName: pat[0],
      patientPhone: phoneOf(i),
      patientAge: age,
      clinicId: clinic.id,
      clinicCity: clinic.city,
      serviceId: svc.id,
      serviceTitle: svc.title,
      servicePrice: svc.price,
      comment: (i % 3 === 0) ? 'Пациент просил записать на утро.' : '',
      createdAt: at(-daysAgo),
      updatedAt: steps[steps.length - 1].at,
      status: statusId,
      statusTitle: titleOf(statusId),
      steps: steps,
      amount: served ? svc.price : null,
      bonus: bonus,
      bonusNote: accrued ? BONUS_NOTE : null,
      bonusPaid: accrued && (i % 2 === 0),
      clinicComments: served ? ['Услуга оказана, пациент на контроле клиники.'] : [],
      stuck: stuckReason(statusId, daysAgo)
    };
  }

  function titleOf(id) {
    var t = id;
    LADDER.forEach(function (l) { if (l.id === id) { t = l.title; } });
    return t;
  }

  /* «Требует внимания» — свойство самого направления, а не выдумка экрана:
     иначе главная и таблица разойдутся в том, кто застрял. */
  /* «1 день · 2 дня · 5 дней». Своё, а не из Render: шов данных не должен
     ждать, когда загрузится файл отрисовки. */
  function dayWord(n) {
    var t = n % 100, u = n % 10;
    if (t > 10 && t < 20) { return 'дней'; }
    if (u === 1) { return 'день'; }
    if (u > 1 && u < 5) { return 'дня'; }
    return 'дней';
  }
  function stuckReason(statusId, daysAgo) {
    if (statusId === 'noshow') { return 'Пациент не дошёл — позвонить и предложить другую дату'; }
    if (statusId === 'cancelled') { return 'Направление отменено — уточнить причину у пациента'; }
    if (STEP_IDS.indexOf(statusId) < 2 && daysAgo > 14) {
      /* Счёт дней, а не «дольше двух недель»: на утверждённом рисунке врач
         читает «без движения 24 дня» и по числу решает, звонить ли сегодня. */
      return 'Без движения ' + daysAgo + ' ' + dayWord(daysAgo) + ' — напомнить клинике';
    }
    return null;
  }

  /* Раскладка по ступеням: 14 направлений активного партнёра и 34 по клинике.
     Числа взяты из спецификации, §Демо-данные: «14 направлений на всех
     ступенях лестницы, из них два застряли» и «табло из 30+ направлений
     от шести врачей». */
  var OWN_PLAN = [
    ['accrued', 62], ['accrued', 55], ['accrued', 48],
    ['served', 41], ['served', 34],
    /* Три застрявших, по одному на каждую причину, как в спецификации: не дошёл,
       отменённое и созданное 23 дня назад, которое клиника так и не записала.
       Третью причину даёт возраст, а не статус, поэтому она и появляется правкой
       одного числа: количество направлений спецификация держит на четырнадцати.
       Остальные записанные и созданные моложе двух недель — иначе они тоже
       попадают в «требует внимания» и обещанных трёх строк заказчик не видит. */
    ['noshow', 38], ['cancelled', 30],
    ['booked', 12], ['booked', 9], ['booked', 6],
    ['created', 23], ['created', 8], ['created', 4], ['created', 2]
  ];

  function ownReferrals() {
    return OWN_PLAN.map(function (row, i) { return build(i, PARTNER.id, row[0], row[1]); });
  }

  /* Табло клиники: свои четырнадцать плюс двадцать от остальных пятерых. */
  function allReferrals() {
    var out = ownReferrals();
    var statuses = ['accrued', 'served', 'booked', 'created', 'noshow', 'cancelled'];
    for (var i = 0; i < 20; i++) {
      var partner = PARTNERS[1 + (i % (PARTNERS.length - 1))];
      out.push(build(14 + i, partner.id, statuses[seed('st' + i) % statuses.length],
                     3 + (seed('day' + i) % 70)));
    }
    return out;
  }

  /* --- очередь модерации: выдуманные заявки ---------------------------- */
  var QUEUE = [
    { id: 'q-1', name: 'Астафьев Роман Валерьевич', specialty: 'Врач-кардиолог',
      city: 'Пятигорск', workplace: 'Частный кабинет, Пятигорск',
      phone: '+7 (928) 411-77-02', email: 'r.astafev@example.ru', at: at(-2) },
    { id: 'q-2', name: 'Нечипоренко Влада Юрьевна', specialty: 'Врач-педиатр',
      city: 'Краснодар', workplace: 'Медцентр «Образец», Краснодар',
      phone: '+7 (918) 305-64-19', email: 'v.nechiporenko@example.ru', at: at(-5) }
  ];

  function scenario() { return w.Store ? w.Store.scenario() : 'vrach-active'; }

  /* --- направления, заведённые в самом прототипе -----------------------
     Слот, номер и порядковый счёт принадлежат шву: §Границы отдают ему
     генерацию номеров, и экран формы своей нумерации не держит — иначе
     номера двух источников разойдутся, и на них же ссылается пациент. */
  var OWN_SLOT = 'vrach:referral:';
  /* Решение клиники по доступу партнёра. Слот на партнёра: приостановить
     одного, не тронув остальных, — это и есть решение 5 карточки. */
  var ACCESS_SLOT = 'admin:partner:access:';
  /* Порог, после которого партнёр считается замолчавшим. Тот же счёт дней,
     что у застрявшего направления (stuckReason): «две недели без движения» —
     одна мера на прототип, а не две похожие. */
  var SILENT_AFTER = 14;
  /* Короткие месяцы для полосы динамики. Своё, а не из Render: шов данных
     не должен ждать, когда загрузится файл отрисовки. */
  var SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
                      'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  /** Сколько дней прошло с даты. Целыми сутками, как их считает человек. */
  function daysSince(iso) {
    return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  }
  var NUMBER_BASE = 2000;
  /* Решение администратора по направлению: новый статус с комментарием и
     собственный журнал. Оба слота живут в Store, поэтому смена статуса
     переживает перезагрузку — §Решения, «Журнал действий живёт в Store». */
  var STATUS_SLOT = 'vrach:status:';
  var LOG_SLOT = 'vrach:log:';
  /* Слова клиники по направлению лежат отдельно от журнала намеренно. Журнал
     отвечает на «кто и когда сменил статус», комментарии — на «что клиника
     написала»: это одно действие, показанное с двух сторон, и текст его
     принадлежит комментариям. Пока комментарий стоял внутри записи журнала,
     карточка врача уверяла, что клиника ничего не написала, и строкой ниже
     показывала её слова — одно действие читалось как два разных. */
  var COMMENT_SLOT = 'vrach:comment:';
  var ADMIN_WHO = 'Администратор клиники';
  /* Решение по заявке на регистрацию. Слот занят таском 01
     (vrach:moderation:<id>), и живёт он в Store — поэтому подтверждение
     и отказ переживают перезагрузку, как того требует §Решения. */
  var MOD_SLOT = 'vrach:moderation:';
  var MOD_TITLES = { approved: 'Подтверждена', rejected: 'Отклонена' };
  /* Заявка, поданная анкетой в самом прототипе. Устроена как заведённое
     направление: форма зовёт шов, шов кладёт запись в Store, а читатель
     подклеивает её к демонстрационным. Пока форма писала только состояние
     своего экрана, она обещала врачу проверку, а у администратора в очереди
     по-прежнему висели две демо-карточки — петля была разорвана. */
  var REG_SLOT = 'vrach:zayavka:';

  function byId(list, id) {
    var found = null;
    list.forEach(function (x) { if (x.id === id) { found = x; } });
    return found;
  }

  /** Следующий порядковый номер среди заведённых. Считается по занятым
      слотам, а не счётчиком в переменной: перезагрузка обнуляет переменную,
      и второе направление молча затирает первое. */
  function nextOrdinal(prefix) {
    var top = 0, vals = w.Store ? w.Store.values() : {};
    for (var k in vals) {
      if (k.indexOf(prefix) !== 0) { continue; }
      var n = parseInt(String(k.slice(prefix.length)).replace(/\D+/g, ''), 10);
      if (n > top) { top = n; }
    }
    return top + 1;
  }

  /** Заведённые направления текущего сценария. Сценарий записан в самой
      записи: кабинет нового партнёра не показывает то, что отправили из
      кабинета активного, — это разные демо-состояния одного прототипа.
      Запись без этого поля не показывается нигде: чья она, неизвестно. */
  function storedReferrals() {
    var vals = w.Store ? w.Store.values() : {}, out = [];
    for (var k in vals) {
      if (k.indexOf(OWN_SLOT) !== 0) { continue; }
      var r = vals[k];
      if (!r || !r.id || !visibleHere(r.scenario)) { continue; }
      out.push(clone(r));
    }
    return out;
  }

  /** Видно ли из текущего сценария то, что завели в сценарии `rec`.

      Своё видно всегда. Сверх этого — ОДНО намеренное исключение: табло
      клиники в сценарии `admin` видит и направления, заведённые в врачебных
      сценариях. Причина в показе: заказчик заводит направление врачом и тут
      же переключается в администратора посмотреть, как это выглядит с той
      стороны. Замкнутая петля «врач направил — клиника увидела» и есть то,
      ради чего кабинет показывают, и рвать её ради чистоты изоляции значит
      выключить главную демонстрацию.

      Обратное исключение не заводится: кабинет врача чужих направлений
      по-прежнему не видит, и кабинет нового партнёра остаётся пустым. */
  function visibleHere(rec) {
    var sc = scenario(), id = String(rec || '');
    if (!id) { return false; }
    if (id === sc) { return true; }
    return sc === 'admin' && !!w.Store && w.Store.roleOf(id) === 'vrach';
  }

  /* Кабинет врача показывает только свои направления, админ-панель — все.
     Роль берётся из сценария: он и есть переключатель прототипа. */
  function pool() {
    var sc = scenario();
    var base = sc === 'admin' ? allReferrals() : (sc === 'vrach-new' ? [] : ownReferrals());
    /* Отправленное формой направление обязано попасть в таблицу: экран успеха
       обещает это дважды, плашкой и ссылкой. Демонстрационные и заведённые
       лежат в одном списке — отличать их таблице незачем. */
    return base.concat(storedReferrals()).map(applyStatus);
  }

  /** Наложить решение администратора, если оно есть.

      Накладывается здесь, на выходе из шва, а не в табло: тогда смену видят
      все, кто читает направления, — и табло клиники, где статус меняли, и
      таблица врача, куда изменение обязано доехать. Обратный путь петли
      держится ровно этой строкой. */
  function applyStatus(src) {
    var ov = w.Store ? w.Store.value(STATUS_SLOT + src.id) : null;
    var said = w.Store ? w.Store.value(COMMENT_SLOT + src.id) : null;
    var spoke = !!(said && said.length);
    if ((!ov || !byId(LADDER, ov.status)) && !spoke) { return src; }
    /* Наложение отдаёт копию, а не правит переданное: весь остальной шов
       отдаёт clone, и производитель направлений вправе рассчитывать, что
       его объект не перепишут по дороге. */
    var r = clone(src);
    /* Слова клиники — часть самого направления, поэтому подклеиваются здесь,
       на выходе из шва: их обязаны увидеть все читатели, и врач в первую
       очередь — комментарий писали ему. */
    if (spoke) { r.clinicComments = (r.clinicComments || []).concat(clone(said)); }
    if (!ov || !byId(LADDER, ov.status)) { return r; }
    var marks = ov.marks || {};
    var was = {};
    (r.steps || []).forEach(function (s) {
      if (STEP_IDS.indexOf(s.id) >= 0) { was[s.id] = s.at; }
    });
    /* Ступень, проставленная администратором, помечается own: её запись —
       с автором и комментарием — лежит в собственном журнале, и вторая
       строка о том же действии читалась бы как два разных действия. */
    function mark(id) {
      if (was[id]) { return { id: id, title: titleOf(id), at: was[id] }; }
      return { id: id, title: titleOf(id), at: marks[id] || ov.at, own: true };
    }
    var reached = STEP_IDS.indexOf(ov.status), steps = [], i;
    if (reached >= 0) {
      for (i = 0; i <= reached; i++) { steps.push(mark(STEP_IDS[i])); }
    } else {
      for (i = 0; i < STEP_IDS.length && was[STEP_IDS[i]]; i++) { steps.push(mark(STEP_IDS[i])); }
      if (!steps.length) { steps.push({ id: STEP_IDS[0], title: titleOf(STEP_IDS[0]), at: r.createdAt }); }
      steps.push({ id: ov.status, title: titleOf(ov.status), at: marks[ov.status] || ov.at, own: true });
    }
    r.status = ov.status;
    r.statusTitle = titleOf(ov.status);
    r.steps = steps;
    /* Решение администратора — это движение: время последнего изменения
       считается по нему, а не по дате последней ступени. Иначе направление,
       которое клиника только что двинула, остаётся «без движения дольше
       двух недель» — главная врача зовёт звонить по тому, что уже решено. */
    r.updatedAt = ov.at;
    /* Сумма услуги появляется, когда услуга оказана, и это цена из прайса.
       Начисление считается той же одной формулой, что и у демо-данных, — от
       цены услуги по демонстрационной ставке, и ходит вместе со своей
       подписью. Своей формулы у этого пути нет намеренно. */
    r.amount = reached >= 2 ? r.servicePrice : null;
    var pays = reached >= 3;
    r.bonus = pays ? bonusOf(r.servicePrice) : null;
    r.bonusNote = pays ? BONUS_NOTE : null;
    if (!pays) { r.bonusPaid = false; }
    r.stuck = stuckReason(ov.status,
      Math.floor((Date.now() - new Date(r.updatedAt).getTime()) / 86400000));
    return r;
  }

  function inPeriod(iso, period) {
    if (!period || period === 'all') { return true; }
    var days = { '30': 30, '90': 90, '365': 365 }[String(period)];
    if (!days) { return true; }
    return (Date.now() - new Date(iso).getTime()) / 86400000 <= days;
  }

  /* --- решения по заявкам на регистрацию --------------------------------
     Решение лежит в Store слотом vrach:moderation:<id> и потому переживает
     перезагрузку: заказчик подтверждает врача, обновляет страницу и видит
     его в реестре, а не заявку обратно в очереди. */

  /** Очередь целиком: демонстрационные заявки плюс поданные в прототипе.

      Порядок стабильный — сперва демонстрационные, потом поданные по своему
      номеру. На нём стоит partnerIdOf: сортируй список по дате, и новая
      заявка сдвинула бы номер уже подтверждённого партнёра.

      Сценарий у заявки не спрашивается, в отличие от направления. Подаёт её
      человек, у которого кабинета ещё нет, и читатель у неё ровно один —
      очередь клиники, закрытая сценарием admin. Отбирать здесь нечего и не
      для кого. */
  function applications() {
    var vals = w.Store ? w.Store.values() : {}, own = [];
    for (var k in vals) {
      if (k.indexOf(REG_SLOT) !== 0) { continue; }
      if (vals[k] && vals[k].id) { own.push(clone(vals[k])); }
    }
    own.sort(function (a, b) {
      return parseInt(String(a.id).replace(/\D+/g, ''), 10) -
             parseInt(String(b.id).replace(/\D+/g, ''), 10);
    });
    return clone(QUEUE).concat(own);
  }

  /** Идентификатор, под которым подтверждённая заявка встаёт в реестр.

      Заявка и партнёр — два разных пространства идентификаторов, и смешивать
      их нельзя: реестр партнёров кормит фильтр «по врачу» на табло заявок, и
      «q-1» в этом фильтре — не врач, а заявка, по построению без единого
      направления. Номер выводится из места заявки в очереди, а не выдаётся
      счётчиком: счётчик обнуляется перезагрузкой, и второй подтверждённый
      занимал бы номер первого. */
  function partnerIdOf(id) {
    var n = -1;
    applications().forEach(function (q, i) { if (q.id === id) { n = i; } });
    return n < 0 ? null : 'p-' + (PARTNERS.length + n + 1);
  }

  /** Решение по заявке id вместе с самой заявкой, иначе null. */
  function decisionOf(id) {
    var d = w.Store ? w.Store.value(MOD_SLOT + id) : null;
    var q = byId(applications(), id);
    if (!d || !d.decision || !q) { return null; }
    return {
      id: id, decision: d.decision, decisionTitle: MOD_TITLES[d.decision] || d.decision,
      partnerId: d.decision === 'approved' ? partnerIdOf(id) : null,
      reason: d.reason || '', at: d.at, who: d.who || ADMIN_WHO, application: clone(q)
    };
  }

  /** Записать решение. Заявка берётся из очереди, поэтому решить дважды
      нельзя и решать вне сценария клиники — тоже: очередь принадлежит ей.
      Отказ без причины не пишется вовсе. */
  function decide(id, decision, reason, who) {
    var text = String(reason || '').trim();
    var open = DATA.moderationQueue().filter(function (q) { return q.id === id; })[0];
    if (!open || !w.Store) { return null; }
    if (decision === 'rejected' && !text) { return null; }
    var now = new Date().toISOString();
    w.Store.setValue(MOD_SLOT + id, {
      decision: decision, reason: text, at: now, who: String(who || ADMIN_WHO)
    });
    /* Отказ доезжает до врача. Экран регистрации читает решение из слота
       vrach-reg — так его закрепил таск 01, — и без этой записи окно отказа
       обещало администратору то, чего не происходит: причину он написал,
       а врач по-прежнему видел «заявка ушла на проверку».

       Слот один на прототип: врач-заявитель в демо один, и второй отказ
       переписывает первый — это то же состояние показа, а не журнал. */
    if (decision === 'rejected') {
      w.Store.setValue('vrach-reg', { status: 'rejected', reason: text, at: now });
    }
    return decisionOf(id);
  }

  var DATA = {
    /** Карточка врача-партнёра, чей кабинет открыт. У нового партнёра
        те же поля: он подтверждён, у него просто ещё нет направлений. */
    partner: function () {
      var p = clone(PARTNER);
      if (scenario() === 'vrach-new') { p.confirmedAt = at(-1); }
      var edited = w.Store ? w.Store.value('vrach:profile') : null;
      if (edited) { for (var k in edited) { p[k] = edited[k]; } }
      return p;
    },

    /** Направления с фильтрами. Пустой набор фильтров отдаёт всё, что видно
        текущей роли: врач — свои, клиника — все. */
    referrals: function (opts) {
      opts = opts || {};
      var q = String(opts.query || '').trim().toLowerCase();
      return pool().filter(function (r) {
        if (opts.status && opts.status !== 'all' && r.status !== opts.status) { return false; }
        if (opts.doctor && opts.doctor !== 'all' && r.partnerId !== opts.doctor) { return false; }
        if (opts.clinic && opts.clinic !== 'all' && r.clinicId !== opts.clinic) { return false; }
        if (!inPeriod(r.createdAt, opts.period)) { return false; }
        if (q && (r.patientName + ' ' + r.patientPhone + ' ' + r.number).toLowerCase().indexOf(q) < 0) { return false; }
        return true;
      }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    },

    /** Одно направление по идентификатору или номеру, иначе null. Ищется там
        же, откуда берётся список: заведённые в прототипе подклеивает pool(),
        и отбор по сценарию у обоих один.

        Второго пути — прямого чтения слота Store — здесь нет намеренно. Он
        был и сценарий не смотрел, а раз список заведённые уже отдаёт, служил
        он ровно чужим записям: направление, заведённое активным партнёром,
        открывалось по номеру в кабинете нового. */
    referral: function (id) {
      var found = null;
      pool().forEach(function (r) { if (r.id === id || r.number === id) { found = r; } });
      return found ? clone(found) : null;
    },

    /** Начисления: итог, выплачено, ждёт выплаты и строка на операцию.
        Правило начисления демонстрационное: своего клиника не публиковала. */
    bonuses: function () {
      var items = [];
      pool().forEach(function (r) {
        if (r.bonus === null || r.bonus === undefined) { return; }
        items.push({
          id: r.id, at: r.updatedAt, patientName: r.patientName,
          serviceTitle: r.serviceTitle, amount: r.amount, bonus: r.bonus,
          note: BONUS_NOTE, paid: r.bonusPaid,
          status: r.bonusPaid ? 'Выплачено' : 'Ждёт выплаты'
        });
      });
      var accrued = 0, paid = 0, pending = 0;
      items.forEach(function (b) {
        accrued += b.bonus;
        if (b.paid) { paid += b.bonus; } else { pending += b.bonus; }
      });
      return { accrued: accrued, paid: paid, pending: pending,
               rule: BONUS_RULE, note: BONUS_NOTE, items: items };
    },

    /** Завести направление и получить номер. Шов присваивает идентификатор,
        номер, первую ступень лестницы и сценарий, кладёт запись в хранилище
        прототипа и отдаёт её целиком. Экран формы передаёт только введённое:
        patientName, patientPhone, patientAge, clinicId, serviceId, comment —
        клинику, услугу и цену шов разворачивает из своих справочников. */
    createReferral: function (input) {
      input = input || {};
      var n = nextOrdinal(OWN_SLOT);
      var now = new Date().toISOString();
      var clinic = byId(CLINICS, input.clinicId) || CLINICS[0];
      var svc = byId(SERVICES, input.serviceId) || SERVICES[0];
      var first = STEP_IDS[0];
      var rec = {
        id: 'r-own-' + n,
        number: 'Н-' + (NUMBER_BASE + n),
        partnerId: PARTNER.id,
        patientName: String(input.patientName || '').trim(),
        patientPhone: String(input.patientPhone || '').trim(),
        patientAge: Number(input.patientAge),
        clinicId: clinic.id,
        clinicCity: clinic.city,
        serviceId: svc.id,
        serviceTitle: svc.title,
        servicePrice: svc.price,
        comment: String(input.comment || '').trim(),
        createdAt: now,
        updatedAt: now,
        status: first,
        statusTitle: titleOf(first),
        steps: [{ id: first, title: titleOf(first), at: now }],
        /* Суммы и начисления нет: она появляется, когда услуга оказана,
           и это решение клиники, а не наше. */
        amount: null,
        bonus: null,
        bonusNote: null,
        bonusPaid: false,
        clinicComments: [],
        stuck: null,
        scenario: scenario()
      };
      if (w.Store) { w.Store.setValue(OWN_SLOT + rec.id, rec); }
      return clone(rec);
    },

    /** Решение администратора по направлению: новый статус и комментарий.

        Шов кладёт решение и запись журнала в хранилище прототипа, поэтому
        смена переживает перезагрузку. Комментарий обязателен: без него запись
        журнала не объясняет, почему статус сменился, и смена читается как
        сбой — отсюда null вместо записи, а не молчаливое сохранение.
        Статус берётся из лестницы клиники: седьмого шов не заводит.

        Возвращает направление после смены или null, если направления нет,
        статус чужой либо комментарий пуст. Автор по умолчанию —
        администратор клиники: смену статуса делает она. */
    setReferralStatus: function (id, input) {
      input = input || {};
      var r = DATA.referral(id);
      var comment = String(input.comment || '').trim();
      if (!r || !byId(LADDER, input.status) || !comment || !w.Store) { return null; }
      var now = new Date().toISOString();
      var who = String(input.who || ADMIN_WHO);
      /* Отметки о том, когда ступень проставили здесь: без них вторая смена
         статуса переставляла бы дату уже пройденной ступени на сегодня. */
      var prev = w.Store.value(STATUS_SLOT + r.id) || {};
      var marks = {}, k;
      for (k in (prev.marks || {})) { marks[k] = prev.marks[k]; }
      var reached = STEP_IDS.indexOf(input.status);
      for (var i = 0; i <= reached; i++) { if (!marks[STEP_IDS[i]]) { marks[STEP_IDS[i]] = now; } }
      if (reached < 0 && !marks[input.status]) { marks[input.status] = now; }
      w.Store.setValue(STATUS_SLOT + r.id,
        { status: input.status, at: now, who: who, comment: comment, marks: marks });
      /* Комментарий уходит в слова клиники, а не в запись журнала. Журнал
         говорит «кто и когда сменил статус», комментарий — «что клиника
         написала»; один и тот же текст в обоих местах читается как два
         разных события по одному действию. */
      var said = (w.Store.value(COMMENT_SLOT + r.id) || []).slice();
      said.push(comment);
      w.Store.setValue(COMMENT_SLOT + r.id, said);
      var log = (w.Store.value(LOG_SLOT + r.id) || []).slice();
      log.push({ at: now, who: who,
                 what: 'Статус изменён: «' + titleOf(input.status) + '»' });
      w.Store.setValue(LOG_SLOT + r.id, log);
      return DATA.referral(r.id);
    },

    /** Прайс клиники: услуга и цена с factmed.ru. */
    services: function () { return clone(SERVICES); },

    /** Клиники, куда врач направляет пациента. */
    clinics: function () { return clone(CLINICS); },

    /** Реестр партнёров клиники со сводкой по каждому. В сценарии, где
        клиника только запускает программу, реестр пуст — это состояние
        экрана 8, а не отсутствие данных.

        Считается по pool(), а не по демонстрационному набору: тогда реестр
        и табло говорят об одних и тех же направлениях. Направление, только
        что заведённое врачом, попадает в «направлений» партнёра, а статус,
        поставленный администратором на табло, — в «дошло». Два счёта одного
        и того же расходятся на первом же показе, и заказчик читает это как
        дефект — он и есть дефект. */
    partners: function () {
      if (scenario() !== 'admin') { return []; }
      var all = pool();
      var rows = PARTNERS.map(function (p) {
        var mine = all.filter(function (r) { return r.partnerId === p.id; });
        var arrived = mine.filter(function (r) { return STEP_IDS.indexOf(r.status) >= 2; });
        var sum = 0, accrued = 0, last = null;
        mine.forEach(function (r) {
          if (r.amount) { sum += r.amount; }
          if (r.bonus) { accrued += r.bonus; }
          if (!last || r.createdAt > last) { last = r.createdAt; }
        });
        var row = clone(p);
        row.referrals = mine.length;
        row.arrived = arrived.length;
        row.servicesSum = sum;
        row.accrued = accrued;
        row.lastAt = last;
        return row;
      });
      /* Подтверждённая заявка — партнёр реестра: ровно ради этого
         администратор её и подтверждал. Направлений у новичка ещё нет, и
         счётчики честно нулевые, а не пустые. */
      applications().forEach(function (q) {
        var d = decisionOf(q.id);
        if (!d || d.decision !== 'approved') { return; }
        rows.push({
          id: d.partnerId, applicationId: q.id,
          name: q.name, specialty: q.specialty, city: q.city,
          workplace: q.workplace, referrals: 0, arrived: 0,
          servicesSum: 0, accrued: 0, lastAt: null, confirmedAt: d.at
        });
      });
      return rows;
    },

    /** Заявки на регистрацию, ждущие решения администратора. Решённые
        в самом прототипе уходят из очереди — решение живёт в Store. */
    moderationQueue: function () {
      if (scenario() !== 'admin') { return []; }
      return applications().filter(function (q) { return !decisionOf(q.id); })
        .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    },

    /** Подать заявку на регистрацию врача-партнёра. Шов присваивает
        идентификатор и время подачи, кладёт заявку в хранилище прототипа и
        отдаёт её целиком; анкета передаёт только введённое. Дальше заявка
        живёт как демонстрационная: встаёт в очередь модерации, растит
        счётчик вкладки и принимает решение администратора.

        Своего состояния экрана шов не трогает: «заявка на проверке» —
        это слот vrach-reg, и пишет его сама анкета. */
    createRegistration: function (input) {
      input = input || {};
      var rec = {
        id: 'q-own-' + nextOrdinal(REG_SLOT),
        name: String(input.name || '').trim(),
        specialty: String(input.specialty || '').trim(),
        city: String(input.city || '').trim(),
        workplace: String(input.workplace || '').trim(),
        phone: String(input.phone || '').trim(),
        email: String(input.email || '').trim(),
        at: new Date().toISOString()
      };
      if (w.Store) { w.Store.setValue(REG_SLOT + rec.id, rec); }
      return clone(rec);
    },

    /** Подтвердить заявку на регистрацию. Возвращает решение или null, если
        заявки нет в очереди — уже решённую второй раз не решают.

        Кладёт решение в Store, поэтому подтверждение переживает
        перезагрузку: заявка уходит из очереди, партнёр встаёт в реестр. */
    approveRegistration: function (id, who) {
      return decide(id, 'approved', '', who);
    },

    /** Отклонить заявку с причиной. Причина обязательна: отказ без неё
        ничего не объясняет ни врачу, ни следующему администратору, —
        отсюда null вместо молчаливой записи.

        Слова по умолчанию у демо-отказа есть (DATA.rejectionReason), но
        подставляет их экран: шов чужой причины не сочиняет. */
    rejectRegistration: function (id, reason, who) {
      return decide(id, 'rejected', reason, who);
    },

    /** Решения по заявкам, принятые в самом прототипе: свежие сверху.
        Каждое несёт саму заявку — иначе решение не о ком. */
    registrationDecisions: function () {
      if (scenario() !== 'admin') { return []; }
      var out = [];
      applications().forEach(function (q) {
        var d = decisionOf(q.id);
        if (d) { out.push(d); }
      });
      return out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    },

    /** Журнал действий по направлению: что и когда с ним делали.
        Записи, сделанные в самом прототипе, лежат в Store и подклеиваются
        сюда — иначе смена статуса пропадает после перезагрузки. */
    actionLog: function (id) {
      var r = null;
      pool().forEach(function (x) { if (x.id === id || x.number === id) { r = x; } });
      var log = [];
      if (r) {
        r.steps.forEach(function (s) {
          /* Ступень, проставленную администратором в самом прототипе, журнал
             отсюда не берёт: её запись — с автором и комментарием — лежит
             в собственном журнале ниже. */
          if (s.own) { return; }
          log.push({ at: s.at, who: s.id === 'created' ? 'Врач-партнёр' : 'Клиника',
                     what: s.title });
        });
      }
      var own = w.Store ? w.Store.value(LOG_SLOT + (r ? r.id : id)) : null;
      if (own && own.length) { log = log.concat(own); }
      return clone(log).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    },

    /** Слова администратора для демо-показа отклонённой заявки. Настоящее
        решение пишет админ-панель; здесь — то, что видит заказчик, пока её нет. */
    rejectionReason: function () { return DEMO_REJECT; },

    /* --- карточка партнёра: одна страница про одного врача ---------------
       Пять способов посмотреть на одного и того же человека. Каждый считается
       по pool() — тому жеисточника, из которого живут реестр и табло: два счёта
       одного и того же расходятся на первом показе, и заказчик читает это
       как дефект. */

    /** Реквизиты партнёра для его карточки: строка реестра плюс контакты,
        дата подтверждения и состояние доступа.

        🔴 confirmedAt у демонстрационных партнёров НЕТ, и заглушка здесь
        честная: даты подтверждения в данных не проставлено. Подставить
        правдоподобное число нельзя — это был бы выдуманный факт о клинике.
        У партнёра, подтверждённого прямо в прототипе, дата настоящая: её
        поставил администратор, и она приходит из решения по заявке. */
    partnerCard: function (id) {
      var row = null;
      DATA.partners().forEach(function (p) { if (p.id === id) { row = p; } });
      if (!row) { return null; }
      var src = null;
      PARTNERS.forEach(function (p) { if (p.id === id) { src = p; } });
      if (src) {
        row.phone = src.phone;
        row.email = src.email;
      }
      /* Хозяин кабинета правит свой профиль сам — карточка обязана показывать
         то же, что он у себя видит, иначе клиника звонит по старому телефону. */
      var me = DATA.partner();
      if (me && me.id === id) {
        row.name = me.name;
        row.specialty = me.specialty;
        row.city = me.city;
        row.workplace = me.workplace;
        row.phone = me.phone;
        row.email = me.email;
        row.confirmedAt = me.confirmedAt || row.confirmedAt || null;
      }
      row.confirmedAt = row.confirmedAt || null;
      row.confirmedBy = ADMIN_WHO;
      var off = w.Store ? w.Store.value(ACCESS_SLOT + id) : null;
      row.access = (off && off.access === 'paused') ? 'paused' : 'open';
      row.accessAt = off ? off.at : null;
      return row;
    },

    /** Приостановить доступ партнёру и вернуть его. Решение живёт в Store,
        поэтому переживает перезагрузку, как и остальные решения клиники.
        Отдаёт карточку после решения либо null, если партнёра в реестре нет. */
    setPartnerAccess: function (id, open) {
      if (!DATA.partnerCard(id) || !w.Store) { return null; }
      w.Store.setValue(ACCESS_SLOT + id, open
        ? null
        : { access: 'paused', at: new Date().toISOString() });
      return DATA.partnerCard(id);
    },

    /** Воронка потока по одному партнёру: четыре ступени лестницы со
        счётчиками и разрывы между ними с разбором, кто в разрыве стоит.

        Ступень считается по ПРОЙДЕННОМУ ПУТИ, а не по текущему статусу:
        не дошедший пациент был записан, и «записались» обязано его считать.
        Иначе потеря падает в первый разрыв — туда, где клиника не записала, —
        и врач отвечает за нашу очередь.

        Причины в разрыве отдаются машиной, а не фразой: слова про «ждут
        записи в клинике» пишет экран, факты про клинику — шов. У причины
        с единственным случаем приезжают его дата и число дней: «1 записан
        28.07» администратор читает как повод позвонить сегодня. */
    partnerFlow: function (id) {
      var mine = pool().filter(function (r) { return r.partnerId === id; });
      var passed = {};
      STEP_IDS.forEach(function (sid) { passed[sid] = []; });
      var by = { waiting: [], cancelled: [], pending: [], noshow: [], unpaid: [] };
      mine.forEach(function (r) {
        (r.steps || []).forEach(function (st) {
          if (passed[st.id]) { passed[st.id].push(r); }
        });
        if (r.status === 'created') { by.waiting.push(r); }
        if (r.status === 'cancelled') { by.cancelled.push(r); }
        if (r.status === 'booked') { by.pending.push(r); }
        if (r.status === 'noshow') { by.noshow.push(r); }
        if (r.status === 'served') { by.unpaid.push(r); }
      });
      var total = mine.length;
      function reason(key) {
        var list = by[key];
        if (!list.length) { return null; }
        var one = list.length === 1 ? list[0] : null;
        return { id: key, count: list.length,
                 at: one ? one.createdAt : null,
                 days: one ? daysSince(one.createdAt) : null };
      }
      /* 🔴 Потеря считается РАЗНОСТЬЮ ступеней, а не суммой причин. Сумма
         причин — объяснение потери, и разойтись с ней она может: причина
         берётся по текущему статусу, а ступень — по пройденному пути. Пока
         разрыв показывал сумму причин, воронка умела печатать «8» под
         ступенью и «−5» рядом с ней, и 14 − 5 не сходилось с 8 у читателя
         на глазах. Арифметика в воронке обязана закрываться. */
      function gap(after, keys) {
        var reasons = [];
        keys.forEach(function (k) { var x = reason(k); if (x) { reasons.push(x); } });
        var i = STEP_IDS.indexOf(after);
        var was = i === 0 ? total : passed[after].length;
        return { after: after, lost: was - passed[STEP_IDS[i + 1]].length, reasons: reasons };
      }
      var first = null, last = null;
      mine.forEach(function (r) {
        if (!first || r.createdAt < first) { first = r.createdAt; }
        if (!last || r.createdAt > last) { last = r.createdAt; }
      });
      var quiet = last === null ? null : daysSince(last);
      return {
        id: id, total: total, firstAt: first, lastAt: last,
        silentDays: quiet, silent: quiet !== null && quiet >= SILENT_AFTER,
        steps: STEP_IDS.map(function (sid, i) {
          var n = i === 0 ? total : passed[sid].length;
          return { id: sid, count: n, share: total ? n / total : 0 };
        }),
        gaps: [
          gap('created', ['waiting', 'cancelled']),
          gap('booked', ['pending', 'noshow']),
          gap('served', ['unpaid'])
        ]
      };
    },

    /** Место партнёра в ряду остальных по доле дошедших до услуги.

        Средняя считается по НАПРАВЛЕНИЯМ, а не как среднее долей: партнёр
        с четырьмя направлениями и партнёр с четырнадцатью весят в ней
        по-разному, и среднее долей завышало бы вклад мелких.

        Партнёры без единого направления в ряд не встают: доля 0 % у того,
        кто ещё не начинал, сдвинула бы и среднее, и место остальных. */
    partnerRank: function (id) {
      var all = pool(), rows = [];
      var sumRefs = 0, sumArrived = 0;
      DATA.partners().forEach(function (p) {
        var mine = all.filter(function (r) { return r.partnerId === p.id; });
        if (!mine.length) { return; }
        var arrived = mine.filter(function (r) {
          var got = false;
          (r.steps || []).forEach(function (st) { if (st.id === 'served') { got = true; } });
          return got;
        }).length;
        sumRefs += mine.length;
        sumArrived += arrived;
        rows.push({ id: p.id, name: p.name, share: arrived / mine.length, mine: p.id === id });
      });
      var me = null, best = 0;
      rows.forEach(function (x) {
        if (x.mine) { me = x; }
        if (x.share > best) { best = x.share; }
      });
      if (!me) { return null; }
      var above = 0, same = 0;
      rows.forEach(function (x) {
        if (x.share > me.share) { above++; }
        else if (x.share === me.share) { same++; }
      });
      return {
        id: id, share: me.share, average: sumRefs ? sumArrived / sumRefs : 0,
        best: best, place: above + 1, shared: same - 1, total: rows.length,
        points: rows.sort(function (a, b) { return a.share - b.share; })
      };
    },

    /** Направлений по месяцам за последние months месяцев, свежий месяц
        последним. Ряд — наша фикция ради окна наблюдения, а не факт клиники:
        месяцы, в которых партнёр ещё не работал, честно нулевые, и экран
        объясняет их словами, а не прячет. */
    partnerMonths: function (id, months) {
      var n = months || 6;
      var now = new Date(), out = [];
      for (var i = n - 1; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push({
          key: d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2),
          title: SHORT_MONTHS[d.getMonth()], count: 0
        });
      }
      pool().forEach(function (r) {
        if (r.partnerId !== id) { return; }
        var key = String(r.createdAt).slice(0, 7);
        out.forEach(function (m) { if (m.key === key) { m.count++; } });
      });
      return out;
    },

    /** Деньги по одному партнёру: сумма оказанных услуг, начислено, ждёт
        выплаты и история операций. Подпись про демонстрационную ставку
        приезжает вместе с числами — печатать ставку самому экрану нечем. */
    partnerMoney: function (id) {
      var items = [], services = 0, accrued = 0, paid = 0, pending = 0;
      pool().forEach(function (r) {
        if (r.partnerId !== id) { return; }
        if (r.amount) { services += r.amount; }
        if (r.bonus === null || r.bonus === undefined) { return; }
        accrued += r.bonus;
        if (r.bonusPaid) { paid += r.bonus; } else { pending += r.bonus; }
        items.push({ id: r.id, number: r.number, at: r.updatedAt, bonus: r.bonus,
                     amount: r.amount, note: BONUS_NOTE, paid: r.bonusPaid,
                     status: r.bonusPaid ? 'Выплачено' : 'Ждёт выплаты' });
      });
      items.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      return { servicesSum: services, accrued: accrued, paid: paid, pending: pending,
               rule: BONUS_RULE, note: BONUS_NOTE, items: items };
    },

    /** Лестница статусов и два закрывающих исхода. Перечень принадлежит
        клинике: экраны берут подписи отсюда и своих не выдумывают. */
    statuses: function () { return clone(LADDER); }
  };

  w.DATA = DATA;
})(window);
