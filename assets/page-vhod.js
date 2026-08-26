/* Экран входа: телефон → код → главная.
   Состояния взяты из спецификации, экран 1: пусто, неверный формат номера,
   код не подошёл, ожидание повтора, успех. */
(function (w) {
  'use strict';

  var RESEND_SECONDS = 45;

  function $(id) { return document.getElementById(id); }

  function digits(v) { return String(v).replace(/\D/g, ''); }

  /** Приводит ввод к виду +7 (918) 445-12-08 и возвращает разметку. */
  function maskPhone(raw) {
    var d = digits(raw);
    if (d.charAt(0) === '8' || d.charAt(0) === '7') { d = d.slice(1); }
    d = d.slice(0, 10);
    if (!d) { return ''; }
    var out = '+7 (' + d.slice(0, 3);
    if (d.length >= 3) { out += ')'; }
    if (d.length > 3) { out += ' ' + d.slice(3, 6); }
    if (d.length > 6) { out += '-' + d.slice(6, 8); }
    if (d.length > 8) { out += '-' + d.slice(8, 10); }
    return out;
  }

  function show(node, text) { node.textContent = text; node.hidden = false; }
  function hide(node) { node.textContent = ''; node.hidden = true; }

  function init() {
    var form = $('login-form');
    var phone = $('phone');
    var phoneMsg = $('phone-msg');
    var send = $('send-code');
    var sendHint = $('send-hint');
    var codeStep = $('code-step');
    var code = $('code');
    var codeMsg = $('code-msg');
    var enter = $('enter');
    var resendHint = $('resend-hint');
    var resend = $('resend');
    var timer = null;

    function phoneComplete() { return digits(phone.value).length === 10 || digits(phone.value).length === 11; }

    function syncSend() {
      var ok = phoneComplete();
      send.disabled = !ok;
      sendHint.hidden = ok;
      if (ok) { hide(phoneMsg); phone.classList.remove('input--error'); }
    }

    phone.addEventListener('input', function () {
      var pos = phone.selectionStart === phone.value.length;
      phone.value = maskPhone(phone.value);
      if (pos) { phone.selectionStart = phone.selectionEnd = phone.value.length; }
      syncSend();
    });

    /* Неполный номер: подсказка под полем, введённое остаётся на месте. */
    phone.addEventListener('blur', function () {
      if (phone.value && !phoneComplete()) {
        phone.classList.add('input--error');
        show(phoneMsg, 'Номер введён не полностью. Нужно десять цифр после +7.');
      }
    });

    function startTimer() {
      var left = RESEND_SECONDS;
      resend.hidden = true;
      function tick() {
        resendHint.textContent = 'Запросить новый код через 0:' + ('0' + left).slice(-2);
        if (left <= 0) {
          clearInterval(timer);
          resendHint.textContent = 'Код не пришёл?';
          resend.hidden = false;
          return;
        }
        left--;
      }
      tick();
      timer = setInterval(tick, 1000);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!phoneComplete()) {
        phone.classList.add('input--error');
        show(phoneMsg, 'Номер введён не полностью. Нужно десять цифр после +7.');
        phone.focus();
        return;
      }
      codeStep.hidden = false;
      send.disabled = true;
      send.textContent = 'Код отправлен на ' + phone.value;
      sendHint.hidden = true;
      startTimer();
      code.focus();
    });

    w.Shell.on('login-resend', function () { startTimer(); code.focus(); });

    code.addEventListener('input', function () {
      code.value = digits(code.value).slice(0, 4);
      hide(codeMsg);
      code.classList.remove('input--error');
    });

    w.Shell.on('login-enter', function () {
      /* В прототипе пускают любые четыре цифры. */
      if (!/^\d{4}$/.test(code.value)) {
        code.classList.add('input--error');
        show(codeMsg, 'Код не подошёл. Проверьте или запросите новый.');
        code.focus();
        return;
      }
      if (timer) { clearInterval(timer); }
      w.location.href = 'kabinet.html';
    });

    code.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enter.click(); } });

    /* Глаз в логотипе — из общего набора иконок. */
    var mark = $('login-mark');
    if (mark && w.icon) { mark.innerHTML = w.icon('eye'); }

    w.Shell.mount({ active: 'vhod', bare: true });

    syncSend();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})(window);
