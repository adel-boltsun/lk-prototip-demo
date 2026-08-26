/* Обложка «Зачем это клинике» — index.html.
   Единственный экран прототипа, который читают. Его открывает клиника сама,
   по ссылке, без нас рядом. Поэтому вся неизменная часть лежит разметкой в
   index.html, а сюда вынесено только то, что зависит от состояния прототипа:
   выбранный сценарий и список замечаний.

   Своих действий экран не заводит: «Скопировать все замечания» — это то же
   действие copy-remarks, что и в панели прототипа, его обслуживает каркас. */
(function (w) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return w.Render.esc(s); }

  /** «1 пометка», «2 пометки», «5 пометок» — подпись под счётчиком. */
  function marksWord(n) { return w.Render.fmt.plural(n, 'пометка', 'пометки', 'пометок'); }

  /** Заголовки сценариев берём у Store: своей копии списка здесь нет. */
  function scenarioTitles() {
    var map = {};
    w.Store.scenarios().forEach(function (s) { map[s.id] = s.title; });
    return map;
  }

  function renderScenario() {
    var box = $('pro-now');
    if (!box) { return; }
    var title = scenarioTitles()[w.Store.scenario()];
    box.innerHTML = title ? 'Сейчас выбран сценарий «' + esc(title) + '».' : '';
  }

  function remarkRow(r, titles) {
    var where = r.screen + (titles[r.scenario] ? ' · сценарий «' + titles[r.scenario] + '»' : '');
    return '<li class="row row--compact"><span class="row__body">' +
      '<span class="row__title">' + esc(r.text) + '</span>' +
      '<span class="row__sub">' + esc(where) + '</span>' +
      '</span></li>';
  }

  function renderRemarks() {
    var box = $('pro-remarks');
    if (!box) { return; }
    var list = w.Store.remarks();
    var titles = scenarioTitles();
    var n = list.length;

    var intro = n
      ? 'Пометки сохранены в этом браузере. Кнопка ниже соберёт их в один текст — вместе с экранами, ' +
        'на которых они оставлены.'
      : 'Пока ни одной пометки. Нажмите белый значок с облачком справа внизу на любом экране кабинета — ' +
        'пометка появится здесь вместе с названием экрана.';
    var hint = n
      ? 'Список уйдёт в буфер обмена одним текстом'
      : 'Неактивна, пока нет пометок';

    box.innerHTML =
      '<p class="pro-remarks__text">' + esc(intro) + '</p>' +
      '<div class="pro-remarks__act">' +
        '<button class="btn btn--secondary" type="button" data-act="copy-remarks"' +
          (n ? '' : ' disabled') + '>' +
          (w.icon ? w.icon('clipboard') : '') + 'Скопировать все замечания</button>' +
        '<span class="label label--muted">' + esc(hint) + '</span>' +
      '</div>' +
      (n ? '<ul class="rows pro-remarks__list">' + list.map(function (r) {
        return remarkRow(r, titles);
      }).join('') + '</ul>' : '');

    $('pro-count-n').textContent = String(n);
    $('pro-count-w').textContent = marksWord(n);
  }

  function init() {
    var arrow = $('pro-arrow');
    if (arrow && w.icon) { arrow.innerHTML = w.icon('arrow-right'); }

    w.Shell.mount({ bare: true });

    renderScenario();
    renderRemarks();

    /* Пометку сохраняет каркас, и своего события об этом у него нет: без
       перерисовки счётчик на обложке остаётся вчерашним, хотя пометка уже
       записана. Слушаем на перехвате — обработчик каркаса к этому моменту
       ещё не убрал кнопку из окна, а setTimeout ставит перерисовку после него. */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t || t.getAttribute('data-act') !== 'remark-save') { return; }
      w.setTimeout(renderRemarks, 0);
    }, true);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
