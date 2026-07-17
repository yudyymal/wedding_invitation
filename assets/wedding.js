/* ==========================================================================
   wedding.js — логика приглашения:
   - вступительный экран (голубки + сердечки)
   - персонализация по ?guest=
   - анкета RSVP с ветвлением
   - отправка данных в Google Apps Script

   НАСТРОЙКА: впишите ваш URL Google Apps Script Web App ниже.
   Как его получить — см. SETUP.md
   ========================================================================== */
(function () {
  'use strict';

  /* ======================= 1. НАСТРОЙКИ ======================= */
  var APPS_SCRIPT_URL = 'ВСТАВЬТЕ_СЮДА_URL_ВАШЕГО_APPS_SCRIPT_WEB_APP';

  var DEFAULT_HELLO = 'Дорогие друзья';

  /* ======================= 2. УТИЛИТЫ ======================= */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function getParam(name) {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get(name);
    } catch (e) { return null; }
  }
  function isConfigured() {
    return APPS_SCRIPT_URL && APPS_SCRIPT_URL.indexOf('ВСТАВЬТЕ_СЮДА') === -1;
  }

  var guestId = getParam('guest');
  var guestData = null; // ответ бэкенда

  /* ======================= 3. ВСТУПИТЕЛЬНЫЙ ЭКРАН ======================= */
  function renderHelloText() {
    var hello = (guestData && guestData.found && guestData.hello_form) ? guestData.hello_form : DEFAULT_HELLO;
    var line1 = qs('#intro-hello-1');
    var line2 = qs('#intro-hello-2');
    if (line1) line1.textContent = hello;
    if (line2) line2.textContent = 'вам пришло приглашение';
  }

  function initIntro() {
    var introScreen = qs('#intro-screen');
    // Если есть персональная ссылка — показываем "Загрузка" пока не пришли данные из таблицы
    if (guestId && isConfigured() && introScreen) {
      introScreen.classList.add('is-loading');
    } else {
      renderHelloText();
    }

    var openLink = qs('#intro-open');
    if (openLink && introScreen) {
      openLink.addEventListener('click', function (e) {
        e.preventDefault();
        introScreen.classList.add('intro-hidden');
        document.body.classList.remove('intro-lock');
        setTimeout(function () { introScreen.style.display = 'none'; }, 900);
      });
    }
  }

  /* ======================= 4. ЗАГРУЗКА ДАННЫХ ГОСТЯ ======================= */
  function fetchGuest(cb) {
    if (!guestId || !isConfigured()) { cb(null); return; }
    fetch(APPS_SCRIPT_URL + '?guest=' + encodeURIComponent(guestId))
      .then(function (r) { return r.json(); })
      .then(function (data) { cb(data); })
      .catch(function () { cb(null); });
  }

  function applyChildrenBlock() {
    var box = document.getElementById('wed6-kids');
    if (!box) return;
    // Показываем предупреждение "оставьте детей дома", когда детям приходить нельзя (children_allowed = 0).
    var allowed = guestData && guestData.found ? Number(guestData.children_allowed) : null;
    if (allowed === 0) box.classList.add('wed6-show');
    else box.classList.remove('wed6-show');
  }

  /* ======================= 5. АНКЕТА RSVP ======================= */
  var DRINK_OPTIONS = [
    'Всё что нальют', 'Красное вино', 'Белое вино', 'Шампанское',
    'Водка', 'Виски', 'Коньяк', 'Самогон', 'Другое', 'Не пью алкоголь'
  ];
  var HOT_FOOD_OPTIONS = ['Мясо', 'Рыба', 'Не принципиально'];

  var formState = { groupChoice: null, people: {}, declineReason: '' };

  function personDefaults(p) {
    return {
      personal_id: p.personal_id,
      name: p.name || '',
      last_name: p.last_name || '',
      first_name: p.first_name || '',
      patronymic: p.patronymic || '',
      will_come_personal: p.will_come_personal !== undefined && p.will_come_personal !== '' ? String(p.will_come_personal) : '',
      drink: p.drink ? (Array.isArray(p.drink) ? p.drink.slice() : String(p.drink).split(',').map(function (s) { return s.trim(); }).filter(Boolean)) : [],
      drink_other: p.drink_other || '',
      no_alcohol_pref: p.no_alcohol_pref !== undefined ? String(p.no_alcohol_pref) : '',
      no_alcohol_pref_text: p.no_alcohol_pref_text || '',
      allergy: p.allergy !== undefined ? String(p.allergy) : '',
      allergy_text: p.allergy_text || '',
      hot_food: p.hot_food || '',
      transport_to: p.transport_to !== undefined ? String(p.transport_to) : '',
      stay_second_day: p.stay_second_day !== undefined ? String(p.stay_second_day) : '',
      sleep_place: p.sleep_place || '',
      transport_from: p.transport_from !== undefined ? String(p.transport_from) : '',
      transport_from_option: p.transport_from_option || ''
    };
  }

  function checkGroup(name, options, currentArr, onChange) {
    var wrap = el('div', { class: 'rsvp-options' });
    currentArr = currentArr || [];
    options.forEach(function (opt) {
      var value = typeof opt === 'string' ? opt : opt.value;
      var label = typeof opt === 'string' ? opt : opt.label;
      var isActive = currentArr.indexOf(value) > -1;
      var btn = el('button', { type: 'button', class: 'rsvp-option' + (isActive ? ' active' : ''), text: label });
      btn.addEventListener('click', function () {
        var idx = currentArr.indexOf(value);
        if (idx > -1) { currentArr.splice(idx, 1); btn.classList.remove('active'); }
        else { currentArr.push(value); btn.classList.add('active'); }
        onChange(currentArr);
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function radioGroup(name, options, current, onChange) {
    var wrap = el('div', { class: 'rsvp-options' });
    options.forEach(function (opt) {
      var value = typeof opt === 'string' ? opt : opt.value;
      var label = typeof opt === 'string' ? opt : opt.label;
      var btn = el('button', { type: 'button', class: 'rsvp-option' + (current === value ? ' active' : '') , text: label });
      btn.addEventListener('click', function () {
        qsa('.rsvp-option', wrap).forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        onChange(value);
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function textField(labelText, value, onInput, placeholder) {
    var wrap = el('div', { class: 'rsvp-field' });
    if (labelText) wrap.appendChild(el('label', { class: 'rsvp-label', text: labelText }));
    var input = el('input', { type: 'text', class: 'rsvp-input', value: value || '', placeholder: placeholder || '' });
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function renderPersonCard(personId) {
    var data = formState.people[personId];
    var card = el('div', { class: 'rsvp-card' });
    var titleText = data.name
      ? data.name + ', пожалуйста, заполните анкету'
      : 'Пожалуйста, заполните анкету';
    card.appendChild(el('div', { class: 'rsvp-card-title', text: titleText }));

    card.appendChild(textField('Фамилия', data.last_name, function (v) { data.last_name = v; }));
    card.appendChild(textField('Имя', data.first_name, function (v) { data.first_name = v; }));
    card.appendChild(textField('Отчество', data.patronymic, function (v) { data.patronymic = v; }));

    var comeWrap = el('div', { class: 'rsvp-field' });
    comeWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Придёте?' }));
    var restBox = el('div', { class: 'rsvp-sub' });
    function renderRest() {
      restBox.innerHTML = '';
      if (data.will_come_personal !== '1') return;

      // Напитки
      var drinkWrap = el('div', { class: 'rsvp-field' });
      drinkWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Что предпочитаете из напитков? (можно выбрать несколько)' }));
      var drinkOtherBox = el('div', {});
      function renderDrinkExtras() {
        drinkOtherBox.innerHTML = '';
        if (data.drink.indexOf('Другое') > -1) {
          drinkOtherBox.appendChild(textField(null, data.drink_other, function (v) { data.drink_other = v; }, 'Ваш вариант'));
        }
        if (data.drink.indexOf('Не пью алкоголь') > -1) {
          var prefWrap = el('div', { class: 'rsvp-field' });
          prefWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Есть особые предпочтения?' }));
          var prefBtns = radioGroup('nap_' + personId, [{ value: '1', label: 'Да' }, { value: '0', label: 'Нет' }], data.no_alcohol_pref, function (v) {
            data.no_alcohol_pref = v; renderDrinkExtras();
          });
          prefWrap.appendChild(prefBtns);
          drinkOtherBox.appendChild(prefWrap);
          if (data.no_alcohol_pref === '1') {
            drinkOtherBox.appendChild(textField(null, data.no_alcohol_pref_text, function (v) { data.no_alcohol_pref_text = v; }, 'Ваши предпочтения'));
          }
        }
      }
      drinkWrap.appendChild(checkGroup('drink_' + personId, DRINK_OPTIONS, data.drink, function () { renderDrinkExtras(); }));
      drinkWrap.appendChild(drinkOtherBox);
      renderDrinkExtras();
      restBox.appendChild(drinkWrap);

      // Аллергия
      var allergyWrap = el('div', { class: 'rsvp-field' });
      allergyWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Есть ли у вас аллергия на продукты?' }));
      var allergyTextBox = el('div', {});
      function renderAllergyExtra() {
        allergyTextBox.innerHTML = '';
        if (data.allergy === '1') {
          allergyTextBox.appendChild(textField(null, data.allergy_text, function (v) { data.allergy_text = v; }, 'На что аллергия'));
        }
      }
      allergyWrap.appendChild(radioGroup('allergy_' + personId, [{ value: '1', label: 'Да' }, { value: '0', label: 'Нет' }], data.allergy, function (v) { data.allergy = v; renderAllergyExtra(); }));
      allergyWrap.appendChild(allergyTextBox);
      renderAllergyExtra();
      restBox.appendChild(allergyWrap);

      // Горячее
      var hotWrap = el('div', { class: 'rsvp-field' });
      hotWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Что предпочитаете из горячего?' }));
      hotWrap.appendChild(radioGroup('hot_' + personId, HOT_FOOD_OPTIONS, data.hot_food, function (v) { data.hot_food = v; }));
      restBox.appendChild(hotWrap);

      // Транспорт до площадки
      var transToWrap = el('div', { class: 'rsvp-field' });
      transToWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Необходим ли транспорт до площадки?' }));
      transToWrap.appendChild(radioGroup('transto_' + personId, [
        { value: '1', label: 'Да, готов рассмотреть общую площадку сбора' },
        { value: '0', label: 'Нет, доберусь самостоятельно' }
      ], data.transport_to, function (v) { data.transport_to = v; }));
      restBox.appendChild(transToWrap);

      // Второй день
      var secondWrap = el('div', { class: 'rsvp-field' });
      secondWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Есть ли у вас желание остаться на второй день и продолжить праздник?' }));
      var sleepBox = el('div', {});
      function renderSleep() {
        sleepBox.innerHTML = '';
        if (data.stay_second_day === '1') {
          var sleepWrap = el('div', { class: 'rsvp-field' });
          sleepWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Есть ли у вас место переночевать?' }));
          sleepWrap.appendChild(radioGroup('sleep_' + personId, [
            { value: 'yes', label: 'Да' },
            { value: 'yes_party', label: 'Да, но я бы хотел тусить вместе' },
            { value: 'no_need', label: 'Нет, но мне надо место переночевать' }
          ], data.sleep_place, function (v) { data.sleep_place = v; }));
          sleepBox.appendChild(sleepWrap);
        }
      }
      secondWrap.appendChild(radioGroup('stay_' + personId, [{ value: '1', label: 'Да' }, { value: '0', label: 'Нет' }], data.stay_second_day, function (v) { data.stay_second_day = v; renderSleep(); }));
      secondWrap.appendChild(sleepBox);
      renderSleep();
      restBox.appendChild(secondWrap);

      // Транспорт обратно
      var transFromWrap = el('div', { class: 'rsvp-field' });
      transFromWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Необходим ли транспорт от площадки по завершению вечера?' }));
      var transFromOptBox = el('div', {});
      function renderTransFromOpt() {
        transFromOptBox.innerHTML = '';
        if (data.transport_from === '1') {
          var optWrap = el('div', { class: 'rsvp-field' });
          optWrap.appendChild(radioGroup('transfromopt_' + personId, [
            { value: 'city_together', label: 'Можно добраться до города вместе' },
            { value: 'taxi', label: 'Лучше такси до дома' },
            { value: 'party', label: 'Да, едем дальше тусить' }
          ], data.transport_from_option, function (v) { data.transport_from_option = v; }));
          transFromOptBox.appendChild(optWrap);
        }
      }
      transFromWrap.appendChild(radioGroup('transfrom_' + personId, [
        { value: '1', label: 'Да' },
        { value: '0', label: 'Нет, доберусь самостоятельно' }
      ], data.transport_from, function (v) { data.transport_from = v; renderTransFromOpt(); }));
      transFromWrap.appendChild(transFromOptBox);
      renderTransFromOpt();
      restBox.appendChild(transFromWrap);
    }
    comeWrap.appendChild(radioGroup('come_' + personId, [{ value: '1', label: 'Да' }, { value: '0', label: 'Нет' }], data.will_come_personal, function (v) {
      data.will_come_personal = v; renderRest();
    }));
    card.appendChild(comeWrap);
    card.appendChild(restBox);
    renderRest();

    return card;
  }

  function currentPeopleList() {
    if (guestData && guestData.found && guestData.people && guestData.people.length) {
      return guestData.people;
    }
    // нет персональной ссылки / гость не найден — одна самостоятельно заполняемая карточка
    return [{ personal_id: 'self', name: '', last_name: '', first_name: '', patronymic: '' }];
  }

  function renderRSVP() {
    var root = qs('#rsvp-app');
    if (!root) return;
    root.innerHTML = '';

    var hasGuest = !!(guestData && guestData.found);
    var groupId = hasGuest ? guestData.group_id : '';
    var peopleList = currentPeopleList();

    // инициализация состояния по людям (не перетираем уже введённые данные при повторном рендере)
    peopleList.forEach(function (p) {
      if (!formState.people[p.personal_id]) {
        formState.people[p.personal_id] = personDefaults(p);
      }
    });

    if (formState.groupChoice === null && hasGuest && guestData.will_come_group !== undefined && guestData.will_come_group !== '') {
      formState.groupChoice = String(guestData.will_come_group);
    }
    if (!formState.declineReason && hasGuest && guestData.decline_reason) {
      formState.declineReason = guestData.decline_reason;
    }

    var groupWrap = el('div', { class: 'rsvp-field' });
    groupWrap.appendChild(el('label', { class: 'rsvp-label rsvp-label-big', text: 'Придёте?' }));
    var body = el('div', { class: 'rsvp-group-body' });

    function renderGroupBody() {
      body.innerHTML = '';
      if (formState.groupChoice === '1') {
        peopleList.forEach(function (p) {
          body.appendChild(renderPersonCard(p.personal_id));
        });
        body.appendChild(submitButton(function () { submitGroupForm(groupId, peopleList); }));
      } else if (formState.groupChoice === '0') {
        var reasonWrap = el('div', { class: 'rsvp-field' });
        reasonWrap.appendChild(el('label', { class: 'rsvp-label', text: 'Пожалуйста, напишите причину, по которой не сможете присутствовать, либо нажмите «Отправить»' }));
        var textarea = el('textarea', { class: 'rsvp-textarea', placeholder: 'Ваш комментарий (необязательно)' });
        textarea.value = formState.declineReason;
        textarea.addEventListener('input', function () { formState.declineReason = textarea.value; });
        reasonWrap.appendChild(textarea);
        body.appendChild(reasonWrap);
        body.appendChild(submitButton(function () { submitGroupForm(groupId, []); }));
      } else if (formState.groupChoice === '9') {
        body.appendChild(submitButton(function () { submitGroupForm(groupId, []); }));
      }
    }

    groupWrap.appendChild(radioGroup('groupchoice', [
      { value: '1', label: 'С удовольствием придём' },
      { value: '0', label: 'К сожалению, не сможем присутствовать' },
      { value: '9', label: 'Сообщим позже' }
    ], formState.groupChoice, function (v) { formState.groupChoice = v; renderGroupBody(); }));

    root.appendChild(groupWrap);
    root.appendChild(body);
    renderGroupBody();
  }

  function submitButton(handler) {
    var btn = el('button', { type: 'button', class: 'rsvp-submit', text: 'Отправить' });
    btn.addEventListener('click', handler);
    return btn;
  }

  function showThankYou() {
    var overlay = el('div', { class: 'rsvp-thanks-overlay' }, [
      el('div', { class: 'rsvp-thanks-box' }, [
        el('div', { class: 'gv-title', style: 'font-size:40px;', text: 'Спасибо!' }),
        el('p', { text: 'Ваш ответ сохранён. Если планы изменятся — просто откройте свою ссылку ещё раз и отредактируйте ответы.' }),
        (function () { var b = el('button', { type: 'button', class: 'rsvp-submit', text: 'Закрыть' }); b.addEventListener('click', function () { overlay.remove(); }); return b; })()
      ])
    ]);
    document.body.appendChild(overlay);
  }

  function postToBackend(payload, onDone) {
    if (!isConfigured()) {
      alert('Форма пока не подключена к базе (не задан APPS_SCRIPT_URL). Обратитесь к разработчику сайта.');
      return;
    }
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function () { onDone(); }).catch(function () {
      alert('Не удалось отправить анкету. Проверьте соединение и попробуйте ещё раз.');
    });
  }

  function serializePerson(p) {
    var copy = {};
    for (var k in p) { copy[k] = p[k]; }
    copy.drink = Array.isArray(p.drink) ? p.drink.join(', ') : (p.drink || '');
    return copy;
  }

  function submitGroupForm(groupId, peopleList) {
    var payload = {
      group_id: groupId || '',
      will_come_group: formState.groupChoice,
      decline_reason: formState.groupChoice === '0' ? formState.declineReason : '',
      people: formState.groupChoice === '1' ? peopleList.map(function (p) { return serializePerson(formState.people[p.personal_id]); }) : []
    };
    postToBackend(payload, showThankYou);
  }

  /* ======================= 5.4 ТАЙМЛАЙН РАСПИСАНИЯ ======================= */
  function initTimelineMarker() {
    var container = qs('#wed5-timeline');
    var marker = qs('#wed5-marker');
    var track = container ? container.querySelector('.wed5-track') : null;
    if (!container || !marker || !track) return;
    var ticking = false;
    function update() {
      ticking = false;
      var trackRect = track.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var anchor = vh * 0.5;
      var progress = (anchor - trackRect.top) / trackRect.height;
      progress = Math.max(0, Math.min(1, progress));
      marker.style.top = (8 + progress * (trackRect.height - 16)) + 'px';
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ======================= 5.5 SCROLL REVEAL ======================= */
  function initScrollReveal() {
    var targets = qsa('.reveal-up, .reveal-fade, .reveal-line');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (t) { t.classList.add('revealed'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }
  // при перерисовке анкеты в неё добавляются новые узлы — отслеживаем и их тоже
  function observeNewReveals(root) {
    if (!('IntersectionObserver' in window)) return;
    var targets = qsa('.reveal-up, .reveal-fade, .reveal-line', root);
    if (!targets.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ======================= 6. ИНИЦИАЛИЗАЦИЯ ======================= */
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    initIntro();
    initScrollReveal();
    initTimelineMarker();
    renderRSVP();
    fetchGuest(function (data) {
      guestData = data;
      renderHelloText();
      applyChildrenBlock();
      renderRSVP();
      var introScreen = qs('#intro-screen');
      if (introScreen) introScreen.classList.remove('is-loading');
    });
  });

})();
