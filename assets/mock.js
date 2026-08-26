/* ЕДИНСТВЕННЫЙ ШОВ К БЭКЕНДУ.
   Все демонстрационные данные прототипа в трёх сценариях. Ни один экран
   не берёт данные мимо DATA. В продакшне этот файл заменяется слоем к API
   1С Медицина с теми же именами функций и теми же структурами — экраны
   не меняются.

   Данные выдуманы целиком: пациентов, врачей, диагнозов и сумм клиники здесь нет.
   Сценарий и человека DATA читает из Store сам — экраны их не передают. */
(function (w) {
  'use strict';

  /* --- даты считаются от сегодня, чтобы прототип не устаревал ---------- */
  function at(days, time) {
    var t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + days);
    if (time) { var p = time.split(':'); t.setHours(+p[0], +p[1]); }
    return t.toISOString();
  }
  function ymd(days) {
    var t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() + days);
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function pick(map, scenario, person) {
    var byPerson = map[scenario] || {};
    return byPerson[person] !== undefined ? byPerson[person] : byPerson.self;
  }

  /* --- справочники: одни во всех сценариях ---------------------------- */
  var BRANCHES = [
    /* 🔴 Один кабинет — одна клиника (ADR 0003). Единственный подтверждённый
       филиал: город, адрес, название и телефон взяты с factmed.ru (спека,
       «Фактура клиники»). Выдуманных филиалов в данных нет.
       howToGet источником не подтверждён и потому не сочиняется: поле стоит
       видимой заглушкой, пока клиника не пришлёт схему прохода. */
    { id: 'b-moskovskaya', city: 'Пятигорск', title: 'Клиника ФАКТ на Московской',
      address: 'улица Московская, 105', howToGet: 'Схему прохода уточняем у клиники',
      hours: 'Ежедневно 08:00 — 21:00', phone: '8 800 505 46 12' }
  ];

  /* Врачи — только те, чьи имена и цены стоят в рисунках (design/zapis-novaya--shag-3.png,
     design/dokumenty.png, design/zapisi.png). Стаж, степень и число операций
     клиника не публиковала — null, а не выдуманное число: сочинять факты
     о реальном человеке нельзя, об этом и сноска на шаге выбора врача.
     Все принимают в единственном филиале, поэтому у каждого направления
     есть к кому пойти. */
  var DOCTORS = [
    { id: 'd-mihnevich', name: 'Михневич Константин Викторович',
      position: 'Главный врач, врач-офтальмолог высшей категории',
      degree: null, experienceYears: null, operationsCount: null,
      photo: 'assets/doctors/mihnevich.webp', price: 4500,
      directions: ['diagnostics', 'lasik', 'cataract', 'glaucoma'], branchId: 'b-moskovskaya' },
    { id: 'd-kumykova', name: 'Кумыкова София Витальевна',
      position: 'Заместитель главного врача, врач-офтальмолог высшей категории',
      degree: null, experienceYears: null, operationsCount: null,
      photo: 'assets/doctors/kumykova.webp', price: 6000,
      directions: ['diagnostics', 'lasik', 'cataract', 'dryeye', 'glaucoma'], branchId: 'b-moskovskaya' },
    { id: 'd-sergienko', name: 'Сергиенко Алексей Анатольевич',
      position: 'Детский врач-офтальмолог',
      degree: null, experienceYears: null, operationsCount: null,
      photo: null, price: 5000,
      directions: ['kids', 'diagnostics'], branchId: 'b-moskovskaya' }
  ];

  /* 🔴 Одна услуга — одна цена во всех местах данных. Смета, карточка визита
     и карточка врача берут суммы отсюда, поэтому диагностика не может стоить
     где-то 3 500, а где-то 4 200. Цены выверены по рисункам (design/smeta.png,
     design/zapisi.png, design/zapis-novaya--shag-3.png). */
  var PRICE = {
    diag:     4500,   // Комплексная диагностика зрения (factmed.ru)
    surgeon:  1500,   // Консультация лазерного хирурга
    watch:    3500,   // Динамическое наблюдение после обследования
    lasik:  128000,   // Лазерная коррекция зрения CLEAR, оба глаза
    kids:     5000,   // Консультация детского офтальмолога (design/zapisi.png)
    deputy:   6000,   // Приём заместителя главного врача (design/zapis-novaya--shag-3.png)
    included:    0    // Визит внутри плана, отдельной цены за него клиника не называет
  };
  /* Оплачено внутри плана — это метка, а не замена цены. Услуга со своей ценой
     несёт и цену, и метку: design/smeta.png показывает «Динамическое наблюдение
     после обследования» как «3 500 ₽ · включено в пакет», а design/zapisi.png
     печатает на карточке того же визита «СТОИМОСТЬ ПРИЁМА 3 500 ₽».
     Ноль в price остаётся только там, где отдельной цены нет вовсе. */
  var SERVICE = {
    diag:     'Комплексная диагностика зрения',
    surgeon:  'Консультация лазерного хирурга',
    watch:    'Динамическое наблюдение после обследования',
    lasik:    'Лазерная коррекция зрения CLEAR, оба глаза',
    kids:     'Консультация детского офтальмолога',
    visit:    'Приём офтальмолога',
    cataract: 'Консультация по катаракте'
  };

  var PEOPLE = [
    /* relation — родство, а не подпись: у себя самого родства нет, поэтому null.
       Как назвать эту строку на экране, решает экран по isSelf — шов фразу
       «Это вы» не сочиняет. */
    { id: 'self',   name: 'Мария Соколова',        birthDate: '1986-03-14', relation: null,     isSelf: true },
    { id: 'child',  name: 'Артём Соколов',         birthDate: ymd(-2670),   relation: 'Сын',    isSelf: false },
    { id: 'parent', name: 'Нина Петровна Соколова', birthDate: '1951-11-08', relation: 'Мама',   isSelf: false }
  ];

  var PATIENTS = {
    self: {
      id: 'self', name: 'Соколова Мария Андреевна', firstName: 'Мария', birthDate: '1986-03-14',
      phone: '+7 918 445-12-08', email: 'm.sokolova@example.com',
      address: 'Пятигорск, улица Ставропольская, 68, кв. 41',
      passport: { series: '0318', number: '447215' },
      policy: { number: '2378 4410 0025 9931', company: 'СК «Полис-Юг»' },
      consents: [
        { id: 'c-pd',    title: 'Обработка персональных данных', given: true,  date: at(-420, '10:00') },
        { id: 'c-remind', title: 'Напоминания о визитах',        given: true,  date: at(-420, '10:00') },
        { id: 'c-news',  title: 'Рассылка новостей клиники',     given: false, date: null }
      ]
    },
    child: {
      id: 'child', name: 'Соколов Артём Дмитриевич', firstName: 'Артём', birthDate: ymd(-2670),
      phone: '+7 918 445-12-08', email: 'm.sokolova@example.com',
      address: 'Пятигорск, улица Ставропольская, 68, кв. 41',
      passport: null,
      policy: { number: '2378 4410 0031 7742', company: 'СК «Полис-Юг»' },
      consents: [
        { id: 'c-pd', title: 'Обработка персональных данных законным представителем', given: true, date: at(-180, '12:20') },
        { id: 'c-remind', title: 'Напоминания о визитах', given: true, date: at(-180, '12:20') }
      ]
    },
    parent: {
      id: 'parent', name: 'Соколова Нина Петровна', firstName: 'Нина', birthDate: '1951-11-08',
      phone: '+7 918 331-70-52', email: null,
      address: 'Пятигорск, улица Гаврилова, 9, кв. 12',
      passport: { series: '0301', number: '118934' },
      policy: { number: '2378 4410 0009 1146', company: 'СК «Полис-Юг»' },
      consents: [
        { id: 'c-pd', title: 'Обработка персональных данных', given: true, date: at(-95, '09:40') },
        { id: 'c-remind', title: 'Напоминания о визитах', given: false, date: null }
      ]
    }
  };

  var BRING_DIAG = [
    'Паспорт — оригинал',
    'Полис ОМС или ДМС — можно электронный',
    'Очки или линзы — те, что носите сейчас',
    'Список лекарств — названия и дозировки',
    'Сопровождающий — за руль после приёма нельзя'
  ];
  var BRING_SHORT = ['Паспорт — оригинал', 'Полис ОМС или ДМС — можно электронный'];

  /* --- записи по сценариям и людям ------------------------------------ */
  var A = {};
  /* Спека: «записан на диагностику через 3 дня». Рисунок design/zapisi.png
     рисует эту же карточку: 11:40, Михневич, комплексная диагностика 4 500 ₽.
     Диагностика в смете уже оплачена — её оплатили вперёд, приём впереди. */
  A.beforeSelfUp = {
    id: 'a-101', number: '4471', status: 'confirmed', datetime: at(3, '11:40'),
    direction: 'diagnostics', service: SERVICE.diag,
    doctorId: 'd-mihnevich', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.diag,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_DIAG, conclusionDocId: null
  };
  /* Консультация хирурга входит в пакет: в смете она со статусом included.
     Цена у неё своя и остаётся на карточке визита — метка стоит рядом с суммой,
     а не вместо неё (design/smeta.png: «1 500 ₽ · включено в пакет»). */
  A.beforeSelfPast = {
    id: 'a-090', number: '4318', status: 'done', datetime: at(-16, '10:00'),
    direction: 'lasik', service: SERVICE.surgeon,
    doctorId: 'd-kumykova', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.surgeon,
    included: true,
    movedFrom: null, cancelReason: null, bring: BRING_SHORT, conclusionDocId: 'doc-201'
  };
  /* Контрольный осмотр после коррекции идёт внутри плана, и отдельной цены
     за него клиника не называет: в смете такой строки нет, и выдумывать сумму
     нельзя. Поэтому price нулевой, а метка «включено в пакет» остаётся. */
  A.afterSelfUp = {
    id: 'a-140', number: '4602', status: 'confirmed', datetime: at(4, '09:20'),
    direction: 'lasik', service: 'Контрольный осмотр после коррекции',
    doctorId: 'd-mihnevich', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.included,
    included: true,
    movedFrom: at(2, '09:20'), cancelReason: null, bring: BRING_SHORT, conclusionDocId: null
  };
  A.afterSelfOp = {
    id: 'a-130', number: '4588', status: 'done', datetime: at(-3, '08:30'),
    direction: 'lasik', service: SERVICE.lasik,
    doctorId: 'd-mihnevich', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.lasik,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_DIAG, conclusionDocId: 'doc-210'
  };
  /* Осмотр на следующий день после коррекции: он уже состоялся, и на него
     ссылается контрольный осмотр в плане лечения. Этой парой достижимо
     «Оставить отзыв» на прошедшем визите — отзыв просят только после
     состоявшегося контрольного осмотра. */
  A.afterSelfCheckup = {
    id: 'a-135', number: '4595', status: 'done', datetime: at(-1, '09:20'),
    direction: 'lasik', service: 'Контрольный осмотр после коррекции',
    doctorId: 'd-mihnevich', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.included,
    included: true,
    movedFrom: null, cancelReason: null, bring: BRING_SHORT, conclusionDocId: 'doc-211'
  };
  A.afterSelfDiag = {
    id: 'a-120', number: '4471', status: 'done', datetime: at(-10, '11:40'),
    direction: 'diagnostics', service: SERVICE.diag,
    doctorId: 'd-mihnevich', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.diag,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_DIAG, conclusionDocId: 'doc-205'
  };
  /* design/zapisi.png пинует на этой карточке «СТОИМОСТЬ ПРИЁМА 3 500 ₽»,
     design/smeta.png — ту же услугу как «3 500 ₽ · включено в пакет».
     Значит визит несёт и сумму, и метку: одно другого не отменяет. */
  A.afterSelfCancelled = {
    id: 'a-125', number: '4520', status: 'cancelled', datetime: at(-6, '16:00'),
    direction: 'diagnostics', service: SERVICE.watch,
    doctorId: 'd-mihnevich', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.watch,
    included: true,
    movedFrom: null, cancelReason: 'Не смогу прийти', bring: BRING_SHORT, conclusionDocId: null
  };

  /* Прошлогодние визиты: без них у визитов не наступают ни группировка
     по годам, ни «Показать ещё». Сдвиги больше года гарантируют другой
     календарный год при любой сегодняшней дате. */
  A.afterSelfOld1 = {
    id: 'a-040', number: '3914', status: 'done', datetime: at(-430, '11:00'),
    direction: 'diagnostics', service: SERVICE.diag,
    doctorId: 'd-kumykova', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.diag,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_SHORT, conclusionDocId: 'doc-150'
  };
  A.afterSelfOld2 = {
    id: 'a-050', number: '3988', status: 'done', datetime: at(-400, '09:30'),
    direction: 'dryeye', service: SERVICE.visit,
    doctorId: 'd-kumykova', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.deputy,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_SHORT, conclusionDocId: null
  };
  A.afterSelfOld3 = {
    id: 'a-070', number: '4131', status: 'done', datetime: at(-340, '12:00'),
    direction: 'glaucoma', service: SERVICE.visit,
    doctorId: 'd-kumykova', branchId: 'b-moskovskaya', personId: 'self', price: PRICE.deputy,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_SHORT, conclusionDocId: 'doc-160'
  };

  A.beforeChildUp = {
    id: 'a-210', number: '4489', status: 'confirmed', datetime: at(1, '15:00'),
    direction: 'kids', service: SERVICE.kids,
    doctorId: 'd-sergienko', branchId: 'b-moskovskaya', personId: 'child', price: PRICE.kids,
    included: false,
    movedFrom: null, cancelReason: null, bring: ['Паспорт родителя — оригинал', 'Свидетельство о рождении — оригинал', 'Очки — если ребёнок их носит'],
    conclusionDocId: null
  };
  A.childPast = {
    id: 'a-200', number: '4297', status: 'done', datetime: at(-120, '15:30'),
    direction: 'kids', service: SERVICE.kids,
    doctorId: 'd-sergienko', branchId: 'b-moskovskaya', personId: 'child', price: PRICE.kids,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_SHORT, conclusionDocId: 'doc-301'
  };
  A.beforeParentUp = {
    id: 'a-310', number: '4493', status: 'moved', datetime: at(6, '13:10'),
    direction: 'cataract', service: SERVICE.diag,
    doctorId: 'd-kumykova', branchId: 'b-moskovskaya', personId: 'parent', price: PRICE.diag,
    included: false,
    movedFrom: at(4, '13:10'), cancelReason: null, bring: BRING_DIAG, conclusionDocId: null
  };
  A.parentPast = {
    id: 'a-300', number: '4188', status: 'done', datetime: at(-45, '09:00'),
    direction: 'cataract', service: SERVICE.cataract,
    doctorId: 'd-kumykova', branchId: 'b-moskovskaya', personId: 'parent', price: PRICE.deputy,
    included: false,
    movedFrom: null, cancelReason: null, bring: BRING_SHORT, conclusionDocId: 'doc-401'
  };

  /* Приём сегодня и без задач: даёт щёлкнуть в панели два состояния главной —
     «Запись сегодня» и «Всё готово к визиту». Без него оба собраны, но не видны. */
  A.afterChildToday = {
    id: 'a-220', number: '4655', status: 'confirmed', datetime: at(0, '15:30'),
    direction: 'kids', service: 'Контроль зрения после подбора очков',
    doctorId: 'd-sergienko', branchId: 'b-moskovskaya', personId: 'child', price: PRICE.kids,
    included: false,
    movedFrom: null, cancelReason: null,
    bring: ['Паспорт родителя — оригинал', 'Очки — те, что носит сейчас'],
    conclusionDocId: null
  };

  var APPOINTMENTS = {
    new:    { self: { upcoming: [], past: [] }, child: { upcoming: [], past: [] }, parent: { upcoming: [], past: [] } },
    before: {
      self:   { upcoming: [A.beforeSelfUp],   past: [A.beforeSelfPast] },
      child:  { upcoming: [A.beforeChildUp],  past: [] },
      parent: { upcoming: [A.beforeParentUp], past: [A.parentPast] }
    },
    after: {
      self:   { upcoming: [A.afterSelfUp],
                past: [A.afterSelfCheckup, A.afterSelfOp, A.afterSelfCancelled, A.afterSelfDiag,
                       A.afterSelfOld3, A.afterSelfOld2, A.afterSelfOld1] },
      child:  { upcoming: [A.afterChildToday], past: [A.childPast] },
      parent: { upcoming: [], past: [A.parentPast] }
    }
  };

  /* --- «От вас ждут»: задачи пациента к ближайшему визиту (D01) ---------
     Отдаём поля, а не собранные фразы: даты — ISO, суммы экран берёт из счёта.
     Это шов к API 1С, тексты интерфейса собираются на экране.
     🔴 Задача, ведущая в «Документы», называет свой бланк полем documentId, и
     бланк с этим id обязан лежать в DOCUMENTS того же сценария и человека.
     Пока связи не было, правило проверялось на глаз: бланк клали руками, а
     сойтись «задача → бланк» могло и случайно. Слепая приёмка нашла обратное —
     обещание вело на пустые вкладки. У задачи, ведущей на другой экран,
     documentId нет. */
  var TASKS = {
    new: { self: [], child: [], parent: [] },
    before: {
      self: [
        { id: 't-analyses', documentId: 'doc-202', kind: 'analyses', title: 'Сдать анализы',
          issuedAt: at(-6, '10:00'), dueAt: at(1, '18:00'),
          action: { label: 'Открыть направление', href: 'dokumenty.html' } },
        { id: 't-consent', documentId: 'doc-203', kind: 'consent', title: 'Подписать согласие на процедуру',
          issuedAt: at(-4, '12:00'), dueAt: at(2, '18:00'),
          action: { label: 'Открыть согласие', href: 'dokumenty.html' } },
        { id: 't-payment', kind: 'payment', title: 'Оплатить остаток по счёту',
          issuedAt: at(-16, '11:30'), dueAt: at(2, '18:00'),
          action: { label: 'Оплатить', href: 'smeta.html' } }
      ],
      child: [
        { id: 't-consent-child', documentId: 'doc-302', kind: 'consent', title: 'Подписать согласие законного представителя',
          issuedAt: at(-2, '09:00'), dueAt: at(0, '18:00'),
          action: { label: 'Открыть согласие', href: 'dokumenty.html' } }
      ],
      parent: [
        { id: 't-payment-parent', kind: 'payment', title: 'Оплатить остаток по счёту',
          issuedAt: at(-45, '10:20'), dueAt: at(-2, '18:00'),
          action: { label: 'Оплатить', href: 'smeta.html' } }
      ]
    },
    after: {
      self: [
        { id: 't-consent-checkup', documentId: 'doc-212', kind: 'consent', title: 'Подписать согласие на контрольный осмотр',
          issuedAt: at(-1, '10:00'), dueAt: at(3, '18:00'),
          action: { label: 'Открыть согласие', href: 'dokumenty.html' } }
      ],
      child: [], parent: []
    }
  };

  /* --- смета ----------------------------------------------------------- */
  /* Счёт несёт свой номер, врача и филиал: раньше экран сметы догадывался
     о них по ближайшей записи, а номер из рисунка не показывался вовсе.
     Состав и суммы — по design/smeta.png. Строка «включено в пакет» несёт
     свою цену: пациент видит, что именно ему включили, а не прочерк. */
  var EMPTY_INVOICE = {
    number: null, planTitle: null, assignedAt: null, fixedAt: null,
    doctorId: null, branchId: null, lines: [],
    total: 0, paid: 0, due: 0, dueDate: null, overdue: false, history: []
  };
  var LASIK_LINES = [
    { title: SERVICE.diag,    qty: 1, price: PRICE.diag,    status: 'paid' },
    { title: SERVICE.lasik,   qty: 1, price: PRICE.lasik,   status: 'due' },
    { title: SERVICE.watch,   qty: 1, price: PRICE.watch,   status: 'included' },
    { title: SERVICE.surgeon, qty: 1, price: PRICE.surgeon, status: 'included' }
  ];
  var LASIK_TOTAL = PRICE.diag + PRICE.lasik + PRICE.watch + PRICE.surgeon;  // 137 500 ₽
  var INVOICES = {
    new: { self: EMPTY_INVOICE, child: EMPTY_INVOICE, parent: EMPTY_INVOICE },
    before: {
      self: {
        number: '5218', planTitle: SERVICE.lasik,
        assignedAt: at(-16, '11:30'), fixedAt: at(-16, '11:30'),
        doctorId: 'd-mihnevich', branchId: 'b-moskovskaya',
        lines: clone(LASIK_LINES),
        total: LASIK_TOTAL, paid: PRICE.diag, due: LASIK_TOTAL - PRICE.diag,
        dueDate: at(2, '18:00'), overdue: false,
        history: []
      },
      child: EMPTY_INVOICE,
      parent: {
        number: '5194', planTitle: 'Обследование перед операцией по катаракте',
        assignedAt: at(-45, '10:20'), fixedAt: at(-45, '10:20'),
        doctorId: 'd-kumykova', branchId: 'b-moskovskaya',
        lines: [
          { title: SERVICE.cataract, qty: 1, price: PRICE.deputy, status: 'paid' },
          { title: SERVICE.diag,     qty: 1, price: PRICE.diag,   status: 'due' }
        ],
        total: PRICE.deputy + PRICE.diag, paid: PRICE.deputy, due: PRICE.diag,
        dueDate: at(-2, '18:00'), overdue: true,
        history: []
      }
    },
    after: {
      self: {
        number: '5218', planTitle: SERVICE.lasik,
        assignedAt: at(-16, '11:30'), fixedAt: at(-16, '11:30'),
        doctorId: 'd-mihnevich', branchId: 'b-moskovskaya',
        lines: [
          { title: SERVICE.diag,    qty: 1, price: PRICE.diag,    status: 'paid' },
          { title: SERVICE.lasik,   qty: 1, price: PRICE.lasik,   status: 'paid' },
          { title: SERVICE.watch,   qty: 1, price: PRICE.watch,   status: 'included' },
          { title: SERVICE.surgeon, qty: 1, price: PRICE.surgeon, status: 'included' }
        ],
        total: LASIK_TOTAL, paid: LASIK_TOTAL, due: 0, dueDate: null, overdue: false,
        history: [
          { date: at(-16, '11:30'), what: 'Смета назначена: план CLEAR на оба глаза, 137 500 ₽',
            why: 'Первичное назначение после комплексной диагностики зрения',
            approvedBy: 'Михневич Константин Викторович, главный врач' }
        ]
      },
      child: EMPTY_INVOICE,
      parent: EMPTY_INVOICE
    }
  };

  /* --- лечение --------------------------------------------------------- */
  var TREATMENT_AFTER_SELF = {
    title: 'Восстановление после лазерной коррекции',
    dayCurrent: 3, dayTotal: 30, startedAt: at(-3, '08:30'), finished: false,
    doses: [
      { id: 'dose-1', time: '09:00', drug: 'Капли противовоспалительные', dose: '1 капля в каждый глаз', done: true,  missed: false },
      { id: 'dose-2', time: '12:00', drug: 'Капли антибактериальные',     dose: '1 капля в каждый глаз', done: false, missed: true },
      { id: 'dose-3', time: '15:00', drug: 'Капли увлажняющие',           dose: '1 капля в каждый глаз', done: false, missed: false },
      { id: 'dose-4', time: '18:00', drug: 'Капли противовоспалительные', dose: '1 капля в каждый глаз', done: false, missed: false },
      { id: 'dose-5', time: '21:00', drug: 'Капли увлажняющие',           dose: '1 капля в каждый глаз', done: false, missed: false }
    ],
    redLine: {
      signs: ['Резкая боль в глазу', 'Резкое падение зрения', 'Вспышки или пелена перед глазом', 'Гнойное отделяемое'],
      phone: '8 800 505 46 12', hours: 'Круглосуточно'
    },
    normal: [
      { text: 'Слезотечение', until: 'первые 2–3 дня' },
      { text: 'Ощущение песка в глазах', until: 'первые 3–5 дней' },
      { text: 'Светобоязнь', until: 'первая неделя' },
      { text: 'Лёгкая пелена к вечеру', until: 'первые 2 недели' }
    ],
    restrictions: [
      { text: 'Баня и сауна', until: 'до 30-го дня' },
      { text: 'Бассейн и открытая вода', until: 'до 30-го дня' },
      { text: 'Спорт и нагрузки', until: 'до 14-го дня' },
      { text: 'Косметика для глаз', until: 'до 14-го дня' },
      { text: 'Тереть глаза', until: 'до 30-го дня' }
    ],
    /* Ближайшая доза за пределами сегодняшнего дня. Расписание повторяется
       день в день, но выводить это самому экрану нельзя: он бы догадывался.
       Шов называет момент прямо — «На сегодня всё» показывает его как факт. */
    nextDoseAt: at(1, '09:00'),
    /* id осмотра — своё поле, а не назначение строкой: назначением пользуется
       читатель, а прототип связывает с ним запись, которую пациент завёл сам.
       На русскую фразу такую связь не вешают — клиника её перепишет. */
    checkups: [
      /* Состоявшийся осмотр: после него у прошедшего визита открывается
         «Оставить отзыв». Связь с визитом — appointmentId, не разбор текста. */
      { id: 'chk-s1', date: at(-1, '09:20'), purpose: 'Осмотр на следующий день после коррекции', appointmentId: 'a-135' },
      { id: 'chk-s2', date: at(4, '09:20'), purpose: 'Контроль на 7-й день', appointmentId: 'a-140' },
      { id: 'chk-s3', date: null, purpose: 'Контроль на 30-й день', appointmentId: null }
    ]
  };

  /* Пройденный курс: у мамы после операции по катаракте план закрыт целиком.
     Так достижимо состояние «План завершён» — иначе finished: true нет ни
     у кого и состояние собрано, но заказчик его не увидит. */
  var TREATMENT_AFTER_PARENT = {
    title: 'Восстановление после операции по катаракте',
    dayCurrent: 30, dayTotal: 30, startedAt: at(-40, '09:00'), finished: true,
    nextDoseAt: null,
    doses: [],
    redLine: {
      signs: ['Резкая боль в глазу', 'Резкое падение зрения', 'Вспышки или пелена перед глазом', 'Гнойное отделяемое'],
      phone: '8 800 505 46 12', hours: 'Круглосуточно'
    },
    normal: [], restrictions: [],
    checkups: [
      { id: 'chk-p1', date: null, purpose: 'Итоговый осмотр после курса', appointmentId: null }
    ]
  };

  var TREATMENTS = {
    new:    { self: null, child: null, parent: null },
    before: { self: null, child: null, parent: null },
    after:  { self: TREATMENT_AFTER_SELF, child: null, parent: TREATMENT_AFTER_PARENT }
  };

  /* D02. Завершённые планы: активный план у DATA.treatment() один, о прошедших
     он не знает. Без этого списка состояние «активного лечения нет» на экране
     лечения пусто там, где у человека курс уже был. */
  var TREATMENTS_DONE = {
    new:    { self: [], child: [], parent: [] },
    before: { self: [], child: [], parent: [] },
    after:  {
      self: [],
      child: [
        { id: 'tr-child-1', title: 'Наблюдение после подбора очков',
          startedAt: at(-120, '16:00'), finishedAt: at(-90, '16:00'), dayTotal: 30 }
      ],
      /* Курс мамы пройден. Он же лежит в treatment() с finished: true — экран
         лечения показывает по нему состояние «План завершён». В списке
         пройденных он обязан быть в любом случае: пройденный курс описан
         одним способом, а не двумя, которые могут разойтись. */
      parent: [
        { id: 'tr-parent-1', title: TREATMENT_AFTER_PARENT.title,
          startedAt: TREATMENT_AFTER_PARENT.startedAt,
          finishedAt: at(-10, '09:00'), dayTotal: TREATMENT_AFTER_PARENT.dayTotal }
      ]
    }
  };

  /* --- документы ---------------------------------------------------------
     🔴 Словарь типов принадлежит шву, а не читателю. Что покрывает каждый код:

       conclusion  — заключения врача по приёму, осмотру, диагностике;
       extract     — выписки о проведённом вмешательстве;
       certificate — бумаги, которые клиника выдаёт пациенту на подпись или
                     для предъявления: справки (в том числе для налогового
                     вычета), направления на анализы и бланки согласий;
       image       — снимки исследований.

     Значение certificate шире слова «справка»: под ним живут и направления,
     и согласия. Подписи вкладок собирает экран, но опирается он на это
     определение — заводить пятый код под бланк нельзя, контракт закрыт.

     Бланки под задачами главной лежат здесь же: «Сдать анализы» открывает
     направление, «Подписать согласие» — бланк согласия. Без них блок «От вас
     ждут» вёл на пустые вкладки. Названия административные: что именно врач
     напишет внутри, решает клиника. */
  var DOCUMENTS = {
    new: { self: [], child: [], parent: [] },
    before: {
      self: [
        { id: 'doc-203', type: 'certificate', date: at(-4, '12:05'),  title: 'Согласие на проведение процедуры', doctorId: 'd-mihnevich' },
        { id: 'doc-202', type: 'certificate', date: at(-6, '10:05'),  title: 'Направление на анализы', doctorId: 'd-mihnevich' },
        { id: 'doc-201', type: 'conclusion',  date: at(-16, '11:10'), title: 'Заключение по консультации', doctorId: 'd-kumykova' }
      ],
      child: [
        { id: 'doc-302', type: 'certificate', date: at(-2, '09:05'), title: 'Согласие законного представителя', doctorId: 'd-sergienko' }
      ],
      parent: [ { id: 'doc-401', type: 'conclusion', date: at(-45, '09:50'), title: 'Заключение по катаракте', doctorId: 'd-kumykova' } ]
    },
    after: {
      self: [
        { id: 'doc-212', type: 'certificate', date: at(-1, '09:50'),   title: 'Согласие на контрольный осмотр', doctorId: 'd-mihnevich' },
        { id: 'doc-211', type: 'conclusion',  date: at(-1, '10:00'),   title: 'Заключение по осмотру', doctorId: 'd-mihnevich' },
        { id: 'doc-210', type: 'conclusion',  date: at(-3, '10:00'),   title: 'Заключение после лазерной коррекции', doctorId: 'd-mihnevich' },
        { id: 'doc-205', type: 'conclusion',  date: at(-10, '12:30'),  title: 'Заключение по диагностике', doctorId: 'd-mihnevich' },
        { id: 'doc-160', type: 'conclusion',  date: at(-340, '12:40'), title: 'Заключение по приёму', doctorId: 'd-kumykova' },
        { id: 'doc-150', type: 'conclusion',  date: at(-430, '11:40'), title: 'Заключение по диагностике', doctorId: 'd-kumykova' },
        { id: 'doc-206', type: 'extract',     date: at(-3, '13:00'),   title: 'Выписка о проведённой операции', doctorId: 'd-mihnevich' },
        { id: 'doc-207', type: 'certificate', date: at(-2, '10:15'),   title: 'Справка для налогового вычета', doctorId: 'd-mihnevich' },
        { id: 'doc-151', type: 'certificate', date: at(-400, '10:15'), title: 'Справка для налогового вычета', doctorId: 'd-kumykova' },
        { id: 'doc-208', type: 'image',       date: at(-10, '12:00'),  title: 'Снимок сетчатки, правый глаз', doctorId: 'd-mihnevich' },
        { id: 'doc-209', type: 'image',       date: at(-10, '12:05'),  title: 'Снимок сетчатки, левый глаз', doctorId: 'd-mihnevich' }
      ],
      child: [ { id: 'doc-301', type: 'conclusion', date: at(-120, '16:00'), title: 'Заключение детского офтальмолога', doctorId: 'd-sergienko' } ],
      parent: [ { id: 'doc-401', type: 'conclusion', date: at(-45, '09:50'), title: 'Заключение по катаракте', doctorId: 'd-kumykova' } ]
    }
  };

  /* --- зрение ------------------------------------------------------------
     doctorId — врач, чьими замерами получен результат. Без него экран
     документов брал врача у ближайшего по времени визита, то есть догадывался. */
  var VISION = {
    new: {
      self:   { measurements: [], forecast: null, doctorId: null },
      child:  { measurements: [], forecast: null, doctorId: null },
      parent: { measurements: [], forecast: null, doctorId: null }
    },
    before: {
      self: { measurements: [ { date: at(-16, '11:00'), od: 0.1, os: 0.1 } ],
              forecast: { od: 0.9, os: 0.9, madeAt: at(-16, '11:30') }, doctorId: 'd-kumykova' },
      child: { measurements: [], forecast: null, doctorId: null },
      parent: { measurements: [ { date: at(-45, '09:30'), od: 0.4, os: 0.3 } ], forecast: null, doctorId: 'd-kumykova' }
    },
    after: {
      self: {
        measurements: [
          { date: at(-16, '11:00'), od: 0.1, os: 0.1 },
          { date: at(-3, '13:00'),  od: 0.9, os: 0.8 },
          { date: at(-1, '10:30'),  od: 1.0, os: 1.0 }
        ],
        forecast: { od: 0.9, os: 0.9, madeAt: at(-16, '11:30') },
        doctorId: 'd-mihnevich'
      },
      child: { measurements: [ { date: at(-120, '15:45'), od: 0.8, os: 0.9 } ], forecast: null, doctorId: 'd-sergienko' },
      parent: { measurements: [ { date: at(-45, '09:30'), od: 0.4, os: 0.3 } ], forecast: null, doctorId: 'd-kumykova' }
    }
  };

  /* --- лояльность ------------------------------------------------------ */
  var OFFERS = [
    { id: 'of-1', title: 'Диагностика зрения со скидкой 50%', cost: 1500, available: true },
    { id: 'of-2', title: 'Повторная консультация офтальмолога', cost: 3000, available: false },
    { id: 'of-3', title: 'Набор увлажняющих капель', cost: 900, available: true }
  ];
  var RULES = { earnPercent: 5, lifetimeDays: 365 };
  var LOYALTY = {
    new: {
      self:   { balance: 0, card: null, expiring: null, history: [], offers: OFFERS, rules: RULES },
      child:  { balance: 0, card: null, expiring: null, history: [], offers: OFFERS, rules: RULES },
      parent: { balance: 0, card: null, expiring: null, history: [], offers: OFFERS, rules: RULES }
    },
    before: {
      self: {
        balance: 175, card: { number: '5500 0041 8827', qrPayload: 'FAKT-LK-DEMO-550000418827' },
        expiring: null,
        history: [ { date: at(-16, '11:40'), visitId: 'a-090', kind: 'earn', points: 175, balanceAfter: 175 } ],
        offers: OFFERS, rules: RULES
      },
      child:  { balance: 0, card: null, expiring: null, history: [], offers: OFFERS, rules: RULES },
      parent: { balance: 175, card: { number: '5500 0041 9014', qrPayload: 'FAKT-LK-DEMO-550000419014' },
                expiring: { points: 175, date: at(12, '23:59') },
                history: [ { date: at(-45, '10:00'), visitId: 'a-300', kind: 'earn', points: 175, balanceAfter: 175 } ],
                offers: OFFERS, rules: RULES }
    },
    after: {
      self: {
        balance: 3285, card: { number: '5500 0041 8827', qrPayload: 'FAKT-LK-DEMO-550000418827' },
        expiring: { points: 175, date: at(20, '23:59') },
        history: [
          { date: at(-3, '14:00'),  visitId: 'a-130', kind: 'earn',  points: 3900, balanceAfter: 4285 },
          { date: at(-2, '12:00'),  visitId: 'a-130', kind: 'spend', points: 1000, balanceAfter: 3285 },
          { date: at(-10, '12:40'), visitId: 'a-120', kind: 'earn',  points: 210,  balanceAfter: 385 },
          { date: at(-16, '11:40'), visitId: 'a-090', kind: 'earn',  points: 175,  balanceAfter: 175 }
        ],
        offers: OFFERS, rules: RULES
      },
      /* Накопил и списал всё: ноль на балансе при живой истории. Без такого
         человека состояние «баллов нет, история есть» не наступает нигде —
         нулевой баланс встречался только вместе с пустой историей. */
      child:  { balance: 0, card: { number: '5500 0041 8834', qrPayload: 'FAKT-LK-DEMO-550000418834' },
                expiring: null,
                history: [
                  { date: at(-2, '11:20'),   visitId: 'a-200', kind: 'spend', points: 250, balanceAfter: 0 },
                  { date: at(-120, '16:10'), visitId: 'a-200', kind: 'earn',  points: 250, balanceAfter: 250 }
                ],
                offers: OFFERS, rules: RULES },
      parent: { balance: 175, card: { number: '5500 0041 9014', qrPayload: 'FAKT-LK-DEMO-550000419014' },
                expiring: { points: 175, date: at(12, '23:59') },
                history: [ { date: at(-45, '10:00'), visitId: 'a-300', kind: 'earn', points: 175, balanceAfter: 175 } ],
                offers: OFFERS, rules: RULES }
    }
  };

  /* kind и leadMinutes — поля для экранов. Фразу «напомним за день и за час»
     собирает экран из leadMinutes; разбирать русский текст when нельзя, иначе
     смена формулировки молча гасит блок. when остаётся подписью для профиля.
     leadMinutes — за сколько минут до визита уходит напоминание, null — правило
     не про визит. */
  var NOTIFICATIONS = {
    channels: [ { id: 'sms', enabled: true }, { id: 'email', enabled: false } ],
    rules: [
      { id: 'n-day',    kind: 'visit',    leadMinutes: 1440, title: 'Напоминание о визите',      when: 'за день до визита' },
      { id: 'n-hour',   kind: 'visit',    leadMinutes: 60,   title: 'Напоминание о визите',      when: 'за час до визита' },
      { id: 'n-status', kind: 'status',   leadMinutes: null, title: 'Смена статуса записи',      when: 'сразу после изменения' },
      { id: 'n-doc',    kind: 'document', leadMinutes: null, title: 'Новый документ в кабинете', when: 'когда врач загрузил заключение' }
    ]
  };

  /* --- расписание: свободные окна считаются от doctorId и даты --------- */
  function seed(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) % 9973; } return h; }
  function buildSlots(doctorId, fromDay, days) {
    var out = [];
    for (var i = 0; i < days; i++) {
      var date = ymd(fromDay + i);
      var wd = new Date(date + 'T12:00:00').getDay();
      var times = [];
      if (wd !== 0) {
        for (var m = 9 * 60; m <= 17 * 60 + 30; m += 30) {
          var t = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
          var s = seed(doctorId + date + t);
          times.push({ time: t, free: (s % 10) > 3 && (fromDay + i) > 0 });
        }
      }
      out.push({ date: date, times: times });
    }
    return out;
  }

  function scenario() { return w.Store ? w.Store.scenario() : 'before'; }
  function person() { return w.Store ? w.Store.person() : 'self'; }

  var DATA = {
    /** Карточка текущего человека. */
    patient: function () { return clone(PATIENTS[person()] || PATIENTS.self); },

    /** Все, кого пациент ведёт в кабинете, включая себя.

        У нового пациента в кабинете он один: тех, кого он записывает, ещё не
        добавляли. Поэтому «Мои люди» в профиле пусты, а в шапке одна пилюля —
        состояние спеки «Людей нет» наступает щелчком по сценарию, а не только
        в коде. Отдаётся именно тот, чей кабинет открыт: иначе в шапке висела
        бы пилюля человека, которого сейчас не показывают. */
    people: function () {
      if (scenario() === 'new') {
        return clone(PEOPLE.filter(function (p) { return p.id === person(); }));
      }
      return clone(PEOPLE);
    },

    branches: function () { return clone(BRANCHES); },

    /** Врачи с фильтром по филиалу и направлению; nearestSlot — ближайшее свободное окно. */
    doctors: function (opts) {
      opts = opts || {};
      return DOCTORS.filter(function (d) {
        if (opts.branch && d.branchId !== opts.branch) { return false; }
        if (opts.direction && d.directions.indexOf(opts.direction) < 0) { return false; }
        return true;
      }).map(function (d) {
        var nearest = null, s = buildSlots(d.id, 1, 14);
        for (var i = 0; i < s.length && !nearest; i++) {
          for (var j = 0; j < s[i].times.length; j++) {
            if (s[i].times[j].free) { nearest = s[i].date + 'T' + s[i].times[j].time + ':00'; break; }
          }
        }
        return {
          id: d.id, name: d.name, position: d.position, degree: d.degree,
          experienceYears: d.experienceYears, operationsCount: d.operationsCount,
          photo: d.photo, price: d.price, directions: d.directions.slice(), nearestSlot: nearest
        };
      });
    },

    /** Сетка окон: две недели вперёд по умолчанию, шаг 30 минут. */
    slots: function (opts) {
      opts = opts || {};
      var from = 1, days = 14;
      if (opts.from) { from = Math.round((new Date(opts.from) - new Date(ymd(0))) / 86400000); }
      if (opts.to) { days = Math.max(1, Math.round((new Date(opts.to) - new Date(opts.from || ymd(0))) / 86400000) + 1); }
      return buildSlots(opts.doctorId || 'd-mihnevich', from, days);
    },

    appointments: function (opts) {
      var when = (opts && opts.when) || 'upcoming';
      var box = pick(APPOINTMENTS, scenario(), person()) || { upcoming: [], past: [] };
      return clone(box[when] || []);
    },

    /** Запись текущего пациента в текущем сценарии; чужие записи не отдаёт. */
    appointment: function (id) {
      var box = pick(APPOINTMENTS, scenario(), person()) || { upcoming: [], past: [] };
      var found = null;
      ['upcoming', 'past'].forEach(function (when) {
        (box[when] || []).forEach(function (a) { if (a.id === id) { found = a; } });
      });
      return found ? clone(found) : null;
    },

    /** Блок «От вас ждут»: что пациент должен сделать до визита. */
    tasks: function () { return clone(pick(TASKS, scenario(), person()) || []); },

    invoice: function () { return clone(pick(INVOICES, scenario(), person()) || EMPTY_INVOICE); },

    /** null, когда активного плана лечения нет. Отметки «закапал» подмешаны из Store. */
    treatment: function () {
      var t = pick(TREATMENTS, scenario(), person());
      if (!t) { return null; }
      t = clone(t);
      var marks = w.Store ? w.Store.doses() : {};
      t.doses.forEach(function (d) {
        if (Object.prototype.hasOwnProperty.call(marks, d.id)) {
          d.done = marks[d.id];
          if (d.done) { d.missed = false; }
        }
      });
      return t;
    },

    /** D02. Пройденные планы — то, чего активный treatment() не знает. */
    treatmentsDone: function () { return clone(pick(TREATMENTS_DONE, scenario(), person()) || []); },

    /** Годы, за которые клиника может выдать справку для вычета: годы
        оплаченных визитов плюс текущий. Экран их не считает — иначе список
        разъедется с тем, что клиника действительно готова подтвердить. */
    taxYears: function () {
      var years = {}, out = [];
      var box = pick(APPOINTMENTS, scenario(), person()) || { past: [] };
      (box.past || []).forEach(function (a) {
        if (a.status === 'done' && a.price > 0) { years[new Date(a.datetime).getFullYear()] = true; }
      });
      years[new Date().getFullYear()] = true;
      Object.keys(years).forEach(function (y) { out.push(+y); });
      out.sort(function (x, y) { return x - y; });
      return out;
    },

    documents: function (opts) {
      var list = pick(DOCUMENTS, scenario(), person()) || [];
      if (opts && opts.type) { list = list.filter(function (d) { return d.type === opts.type; }); }
      return clone(list);
    },

    vision: function () { return clone(pick(VISION, scenario(), person()) || { measurements: [], forecast: null }); },

    loyalty: function () { return clone(pick(LOYALTY, scenario(), person())); },

    notifications: function () { return clone(NOTIFICATIONS); },

    /** Подтвердил ли администратор связь карты пациента с 1С. */
    linkStatus: function () { return scenario() === 'new' ? 'pending' : 'confirmed'; }
  };

  w.DATA = DATA;
})(window);
