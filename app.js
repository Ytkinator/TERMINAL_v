// === Initialize Lucide icons ===
lucide.createIcons();

// === API Configuration ===
var LOCAL_SERVER = 'http://localhost:9999';
var API_URL = LOCAL_SERVER + '/api/categories'; // proxied via server.py (credentials injected server-side)

// Map API category_id → screen key
var CATEGORY_SCREEN_MAP = {
  '1': 'tickets',    // Канатная дорога
  '2': 'alpaka',     // Парк Альпак
  '3': 'museum',     // Музей иллюзий
  '4': 'skypark'     // Skypark
};
var CATEGORY_SCREEN_SEQUENCE = ['tickets', 'alpaka', 'museum', 'skypark'];
var runtimeCategoryScreenMap = {};

var loadedCategories = [];
var dayTypesCalendar = []; // calendar of day types for 100 days ahead
var TERMINAL_TICKET_SECTION_ENABLED = false;
var TERMINAL_TICKET_SECTION_TITLE = 'Билеты';
var TERMINAL_SKIPASS_TOPUP_SECTION_ENABLED = false;
var TERMINAL_SKIPASS_TOPUP_SECTION_TITLE = 'Пополнение скипасса';
var TERMINAL_RENTAL_SECTION_ENABLED = false;
var TERMINAL_RENTAL_SECTION_TITLE = 'Прокат';
var TERMINAL_RENTAL_CREATE_ENABLED = false;
var TERMINAL_RENTAL_PAYMENT_ENABLED = false;
var pendingRentalPaymentOrder = null;
var TERMINAL_VISIT_SECTION_ENABLED = false;
var TERMINAL_VISIT_SECTION_TITLE = 'Посещения';
var loadedVisitCatalog = null;
var loadedVisitLocations = [];
var loadedVisitSlots = [];
var selectedVisitDate = '';
var selectedVisitLocationId = null;
var selectedVisitResourceId = null;
var selectedVisitPartySize = 1;
var pendingVisitBooking = null;
var visitClientActiveField = 'name';
var TERMINAL_INSTRUCTOR_SERVICE_ENABLED = false;
var TERMINAL_INSTRUCTOR_SERVICE_TITLE = 'Служба инструкторов';
var TERMINAL_GROUP_LESSONS_ENABLED = false;
var TERMINAL_GROUP_LESSONS_TITLE = 'Групповые занятия';
var TERMINAL_GROUP_LESSONS_IMAGE = '';
var TERMINAL_INDIVIDUAL_LESSONS_ENABLED = false;
var TERMINAL_INDIVIDUAL_LESSONS_TITLE = 'Индивидуальные занятия';
var TERMINAL_INDIVIDUAL_LESSONS_IMAGE = '';
var TERMINAL_GROUP_SECTION_ENABLED = false;
var TERMINAL_GROUP_SECTION_TITLE = 'Групповые занятия';
var TERMINAL_GROUP_PAYMENT_ENABLED = true;
var TERMINAL_GROUP_FREE_BOOKING_ENABLED = true;
var loadedGroups = [];
var selectedGroupDate = '';
var pendingGroupBooking = null;
var loadedInstructorCatalog = null;
var loadedInstructors = [];
var selectedInstructorDate = '';
var selectedInstructorStartTime = '';
var selectedInstructorEndTime = '';
var selectedInstructorImplementId = null;
var instructorSearchQuery = '';
var pendingInstructorBooking = null;
var instructorClientActiveField = 'name';
var rentalClientActiveField = 'name';
var RENTAL_CLIENT_NAME_KEYBOARD = [
  ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х'],
  ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
  ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю'],
  ['Пробел', '-', 'Стереть', 'Очистить']
];
var RENTAL_CLIENT_PHONE_KEYBOARD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['+7', '0', 'Стереть'],
  ['Очистить']
];
var TERMINAL_CAROUSEL_ENABLED = false;
var TERMINAL_CAROUSEL_IMAGES = [];
var TERMINAL_SPLASH_IMAGE = '';

// === Auto-translate API text via MyMemory (free, no key) ===
var TRANSLATE_LANGMAP = { en: 'ru|en', ar: 'ru|ar', zh: 'ru|zh-CN' };

function translateText(text, targetLang, callback) {
  if (!text || targetLang === 'ru') { callback(text); return; }
  var pair = TRANSLATE_LANGMAP[targetLang];
  if (!pair) { callback(text); return; }

  // Check localStorage cache
  var cacheKey = 'tr_' + targetLang + '_' + hashCode(text);
  var cached = localStorage.getItem(cacheKey);
  if (cached) { callback(cached); return; }

  var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + pair;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 8000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
        var translated = data.responseData.translatedText;
        localStorage.setItem(cacheKey, translated);
        callback(translated);
        return;
      }
    } catch (e) { console.error('[Translate] Parse error:', e); }
    callback(text);
  };
  xhr.onerror = function() { callback(text); };
  xhr.ontimeout = function() { callback(text); };
  xhr.send();
}

function hashCode(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

// Get today's tariff day_type from the calendar
function getTodayDayType() {
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;

  for (var i = 0; i < dayTypesCalendar.length; i++) {
    if (dayTypesCalendar[i].date === todayStr) {
      var calType = dayTypesCalendar[i].type;
      // Map calendar type → tariff day_type
      if (calType === 'working') return 'weekday';
      return calType; // 'weekend', 'holiday' match as-is
    }
  }
  return null; // not found in calendar
}

var SCREEN_BANNERS = emptyScreenBanners();

function emptyScreenBanners() {
  var result = {};
  CATEGORY_SCREEN_SEQUENCE.forEach(function(screenKey) {
    result[screenKey] = [];
  });
  return result;
}

function getCarouselImageSources(images) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images.map(function(image) {
    if (typeof image === 'string') {
      return image;
    }

    if (image && typeof image.url === 'string') {
      return image.url;
    }

    return '';
  }).filter(Boolean);
}

function getImageSource(image) {
  if (typeof image === 'string') {
    return image;
  }

  if (image && typeof image.url === 'string') {
    return image.url;
  }

  return '';
}

function applySplashImage() {
  var splashBg = document.querySelector('#screen-splash .splash-bg');
  if (!splashBg) return;

  if (!TERMINAL_SPLASH_IMAGE) {
    splashBg.style.backgroundImage = '';
    splashBg.style.backgroundSize = '';
    splashBg.style.backgroundRepeat = '';
    splashBg.style.backgroundPosition = '';
    return;
  }

  var nextImage = TERMINAL_SPLASH_IMAGE;
  var preload = new Image();
  preload.onload = function() {
    if (TERMINAL_SPLASH_IMAGE !== nextImage) return;

    splashBg.style.backgroundImage = 'url(\"' + nextImage.replace(/\"/g, '%22') + '\")';
    splashBg.style.backgroundSize = 'contain';
    splashBg.style.backgroundRepeat = 'no-repeat';
    splashBg.style.backgroundPosition = 'center';
  };
  preload.onerror = function() {
    console.warn('[API] splash image failed to load:', nextImage);
  };
  preload.src = nextImage;
}

function buildScreenBanners() {
  var result = emptyScreenBanners();

  if (!TERMINAL_CAROUSEL_ENABLED || TERMINAL_CAROUSEL_IMAGES.length === 0) {
    return result;
  }

  CATEGORY_SCREEN_SEQUENCE.forEach(function(screenKey) {
    result[screenKey] = TERMINAL_CAROUSEL_IMAGES.slice();
  });

  return result;
}

function getCategoryPhotoSources(cat) {
  var raw = cat.category_photo || cat.photo || cat.photos || '';

  if (Array.isArray(raw)) {
    return raw.filter(Boolean);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  var value = raw.trim();
  if (!value) {
    return [];
  }

  if (value.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (e) {
      console.warn('[API] category_photo JSON parse failed:', e);
    }
  }

  return [value];
}

function assignCategoryScreens(categories) {
  var usedScreens = {};
  runtimeCategoryScreenMap = {};

  categories.forEach(function(cat) {
    var legacyScreenKey = CATEGORY_SCREEN_MAP[String(cat.category_id)];
    if (legacyScreenKey && usedScreens[legacyScreenKey] !== true) {
      runtimeCategoryScreenMap[String(cat.category_id)] = legacyScreenKey;
      usedScreens[legacyScreenKey] = true;
    }
  });

  categories.forEach(function(cat) {
    var categoryId = String(cat.category_id);
    if (runtimeCategoryScreenMap[categoryId]) return;

    for (var i = 0; i < CATEGORY_SCREEN_SEQUENCE.length; i++) {
      var screenKey = CATEGORY_SCREEN_SEQUENCE[i];
      if (usedScreens[screenKey] === true) continue;

      runtimeCategoryScreenMap[categoryId] = screenKey;
      usedScreens[screenKey] = true;
      break;
    }
  });
}

function getScreenKeyForCategory(cat) {
  return runtimeCategoryScreenMap[String(cat.category_id)] || '';
}

function isTariffAvailableForToday(tariff, todayType) {
  if (!todayType) {
    return true;
  }

  return tariff.day_type === todayType || tariff.day_type === 'universal';
}

function isTicketScreen(screenName) {
  return CATEGORY_SCREEN_SEQUENCE.indexOf(screenName) !== -1;
}

function applyTicketSectionSettings() {
  var section = document.getElementById('ticket-section');
  var title = document.getElementById('ticket-section-title');

  if (title) {
    title.textContent = TERMINAL_TICKET_SECTION_TITLE || 'Билеты';
    title.removeAttribute('data-i18n');
  }

  if (section) {
    section.style.display = TERMINAL_TICKET_SECTION_ENABLED ? '' : 'none';
  }

  if (!TERMINAL_TICKET_SECTION_ENABLED) {
    var activeTicketScreen = CATEGORY_SCREEN_SEQUENCE.some(function(screenKey) {
      var screen = document.getElementById('screen-' + screenKey);
      return Boolean(screen && screen.classList.contains('active'));
    });

    if (activeTicketScreen && typeof navigateTo === 'function') {
      navigateTo('main');
    }
  }
}

function applySkipassTopupSectionSettings() {
  var section = document.getElementById('terminal-skipass-topup-section');
  var title = document.getElementById('terminal-skipass-topup-title');

  if (title) {
    title.textContent = TERMINAL_SKIPASS_TOPUP_SECTION_TITLE || 'Пополнение скипасса';
  }

  if (section) {
    section.style.display = TERMINAL_SKIPASS_TOPUP_SECTION_ENABLED ? '' : 'none';
  }
}

function applyRentalSectionSettings() {
  var section = document.getElementById('terminal-rental-section');
  var title = document.getElementById('terminal-rental-title');
  var createButton = document.getElementById('terminal-rental-create-btn');
  var paymentButton = document.getElementById('terminal-rental-payment-btn');

  if (title) {
    title.textContent = TERMINAL_RENTAL_SECTION_TITLE || 'Прокат';
    title.removeAttribute('data-i18n');
  }

  if (createButton) {
    createButton.style.display = TERMINAL_RENTAL_CREATE_ENABLED ? '' : 'none';
  }

  if (paymentButton) {
    paymentButton.style.display = TERMINAL_RENTAL_PAYMENT_ENABLED ? '' : 'none';
  }

  if (section) {
    var hasVisibleActions = TERMINAL_RENTAL_CREATE_ENABLED || TERMINAL_RENTAL_PAYMENT_ENABLED;
    section.style.display = TERMINAL_RENTAL_SECTION_ENABLED && hasVisibleActions ? '' : 'none';
  }
}

function applyVisitSectionSettings() {
  var section = document.getElementById('terminal-visit-section');
  var title = document.getElementById('terminal-visit-title');
  var screenTitle = document.getElementById('visits-screen-title');

  if (title) {
    title.textContent = TERMINAL_VISIT_SECTION_TITLE || 'Посещения';
  }

  if (screenTitle) {
    screenTitle.textContent = TERMINAL_VISIT_SECTION_TITLE || 'Посещения';
  }

  if (section) {
    section.style.display = TERMINAL_VISIT_SECTION_ENABLED ? '' : 'none';
  }
}

function applyGroupSectionSettings() {
  var section = document.getElementById('terminal-group-section');
  var title = document.getElementById('terminal-group-title');
  var screenTitle = document.getElementById('groups-screen-title');
  var groupButton = document.getElementById('terminal-group-open-btn');
  var individualButton = document.getElementById('terminal-individual-open-btn');
  var groupTitle = document.getElementById('terminal-group-action-title');
  var individualTitle = document.getElementById('terminal-individual-action-title');
  var groupImage = document.getElementById('terminal-group-action-image');
  var individualImage = document.getElementById('terminal-individual-action-image');

  if (title) {
    title.textContent = TERMINAL_INSTRUCTOR_SERVICE_TITLE || 'Служба инструкторов';
  }

  if (screenTitle) {
    screenTitle.textContent = TERMINAL_GROUP_LESSONS_TITLE || TERMINAL_GROUP_SECTION_TITLE || 'Групповые занятия';
  }

  if (groupTitle) {
    groupTitle.textContent = TERMINAL_GROUP_LESSONS_TITLE || 'Групповые занятия';
  }

  if (individualTitle) {
    individualTitle.textContent = TERMINAL_INDIVIDUAL_LESSONS_TITLE || 'Индивидуальные занятия';
  }

  if (groupButton) {
    groupButton.style.display = TERMINAL_GROUP_LESSONS_ENABLED ? '' : 'none';
  }

  if (individualButton) {
    individualButton.style.display = TERMINAL_INDIVIDUAL_LESSONS_ENABLED ? '' : 'none';
  }

  if (groupImage) {
    groupImage.style.backgroundImage = TERMINAL_GROUP_LESSONS_IMAGE ? 'url("' + TERMINAL_GROUP_LESSONS_IMAGE + '")' : '';
  }

  if (individualImage) {
    individualImage.style.backgroundImage = TERMINAL_INDIVIDUAL_LESSONS_IMAGE ? 'url("' + TERMINAL_INDIVIDUAL_LESSONS_IMAGE + '")' : '';
  }

  if (section) {
    var hasVisibleActions = TERMINAL_GROUP_LESSONS_ENABLED || TERMINAL_INDIVIDUAL_LESSONS_ENABLED;
    section.style.display = TERMINAL_INSTRUCTOR_SERVICE_ENABLED && hasVisibleActions ? '' : 'none';
  }
}

function handleSkipassTopupSectionClick() {
  if (!TERMINAL_SKIPASS_TOPUP_SECTION_ENABLED) {
    showAlert('Пополнение скипасса отключено');
    return;
  }

  navigateTo('scan-card');
}

function handleVisitSectionClick() {
  if (!TERMINAL_VISIT_SECTION_ENABLED) {
    showAlert('Посещения отключены');
    return;
  }

  navigateTo('visits');
  loadTerminalVisits();
}

function handleGroupSectionClick() {
  if (!TERMINAL_GROUP_LESSONS_ENABLED) {
    showAlert('Групповые занятия отключены');
    return;
  }

  navigateTo('groups');
  loadTerminalGroups();
}

function handleIndividualLessonsSectionClick() {
  if (!TERMINAL_INDIVIDUAL_LESSONS_ENABLED) {
    showAlert('Индивидуальные занятия отключены');
    return;
  }

  navigateTo('instructors');
  loadTerminalInstructors();
}

function handleRentalCreateClick() {
  if (!TERMINAL_RENTAL_CREATE_ENABLED) {
    showAlert('Создание проката отключено');
    return;
  }

  openRentalClientForm();
}

function setRentalClientActiveField(field) {
  rentalClientActiveField = field === 'phone' ? 'phone' : 'name';

  document.querySelectorAll('[data-rental-client-field]').forEach(function(fieldEl) {
    fieldEl.classList.toggle(
      'rental-client-field--active',
      fieldEl.getAttribute('data-rental-client-field') === rentalClientActiveField
    );
  });

  renderRentalClientKeyboard();
}

function renderRentalClientKeyboard() {
  var keyboardEl = document.getElementById('rental-client-keyboard');
  if (!keyboardEl) return;

  var layout = rentalClientActiveField === 'phone' ? RENTAL_CLIENT_PHONE_KEYBOARD : RENTAL_CLIENT_NAME_KEYBOARD;
  keyboardEl.className = 'rental-client-keyboard rental-client-keyboard--' + rentalClientActiveField;
  keyboardEl.innerHTML = '';

  layout.forEach(function(row) {
    var rowEl = document.createElement('div');
    rowEl.className = 'rental-client-keyboard-row';

    row.forEach(function(label) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rental-client-keyboard-key';

      if (label === 'Пробел') {
        button.classList.add('rental-client-keyboard-key--space');
      } else if (label === 'Стереть' || label === 'Очистить') {
        button.classList.add('rental-client-keyboard-key--action');
      }

      button.textContent = label === 'Стереть' ? '⌫' : label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', function() {
        handleRentalClientKeyboardKey(label);
      });
      rowEl.appendChild(button);
    });

    keyboardEl.appendChild(rowEl);
  });
}

function handleRentalClientKeyboardKey(label) {
  var errorEl = document.getElementById('rental-client-error');
  if (errorEl) errorEl.textContent = '';

  if (rentalClientActiveField === 'phone') {
    handleRentalClientPhoneKey(label);
    return;
  }

  handleRentalClientNameKey(label);
}

function handleRentalClientNameKey(label) {
  var input = document.getElementById('rental-client-name');
  if (!input) return;

  if (label === 'Стереть') {
    input.value = input.value.slice(0, -1);
    return;
  }

  if (label === 'Очистить') {
    input.value = '';
    return;
  }

  var value = label === 'Пробел' ? ' ' : label;
  input.value = normalizeRentalClientName(input.value + value);
}

function handleRentalClientPhoneKey(label) {
  var input = document.getElementById('rental-client-phone');
  if (!input) return;

  var digits = rentalPhoneDigits(input.value);

  if (label === 'Стереть') {
    digits = digits.slice(0, -1);
  } else if (label === 'Очистить' || label === '+7') {
    digits = '';
  } else if (/^\d$/.test(label) && digits.length < 10) {
    digits += label;
  }

  input.value = formatRentalPhoneFromDigits(digits);
}

function normalizeRentalClientName(value) {
  return value
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, 255);
}

function rentalPhoneDigits(value) {
  var digits = String(value || '').replace(/\D/g, '');

  if (digits.charAt(0) === '8') {
    digits = digits.slice(1);
  } else if (digits.charAt(0) === '7') {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

function formatRentalPhoneFromDigits(digits) {
  digits = String(digits || '').replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';

  var result = '+7';
  var area = digits.slice(0, 3);
  var prefix = digits.slice(3, 6);
  var part1 = digits.slice(6, 8);
  var part2 = digits.slice(8, 10);

  if (area) result += ' (' + area;
  if (area.length === 3) result += ')';
  if (prefix) result += ' ' + prefix;
  if (part1) result += '-' + part1;
  if (part2) result += '-' + part2;

  return result;
}

function openRentalClientForm() {
  var modal = document.getElementById('rental-client-modal');
  var nameInput = document.getElementById('rental-client-name');
  var phoneInput = document.getElementById('rental-client-phone');
  var errorEl = document.getElementById('rental-client-error');

  if (nameInput) {
    nameInput.value = '';
    nameInput.setAttribute('autocomplete', 'new-password');
  }
  if (phoneInput) {
    phoneInput.value = '';
    phoneInput.setAttribute('autocomplete', 'new-password');
  }
  if (errorEl) errorEl.textContent = '';
  setRentalClientActiveField('name');
  if (modal) modal.classList.add('active');

  setTimeout(function() {
    if (nameInput) nameInput.focus();
  }, 50);
}

function closeRentalClientForm() {
  var modal = document.getElementById('rental-client-modal');
  if (modal) modal.classList.remove('active');
}

function submitRentalClientForm(event) {
  if (event) event.preventDefault();

  var nameInput = document.getElementById('rental-client-name');
  var phoneInput = document.getElementById('rental-client-phone');
  var errorEl = document.getElementById('rental-client-error');
  var clientName = nameInput ? normalizeRentalClientName(nameInput.value).trim() : '';
  var clientPhone = phoneInput ? phoneInput.value.trim() : '';
  var phoneDigits = rentalPhoneDigits(clientPhone);

  if (!clientName || phoneDigits.length !== 10) {
    if (errorEl) errorEl.textContent = 'Укажите имя и телефон клиента';
    return;
  }

  closeRentalClientForm();
  createRentalOrderForClient(clientName, formatRentalPhoneFromDigits(phoneDigits));
}

function createRentalOrderForClient(clientName, clientPhone) {
  showPrintLoader();

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/rental/orders', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status !== 'ok' || !data.order) {
        throw new Error(data.message || 'Не удалось создать заказ проката');
      }

      printRentalOrderTicket(data.order, function() {
        hidePrintLoader();
        showAlert('Талон проката напечатан');
        navigateTo('main');
      });
    } catch (e) {
      hidePrintLoader();
      console.error('[RENTAL] Create parse/error:', e);
      showAlert(e.message || 'Ошибка создания проката');
    }
  };
  xhr.onerror = function() {
    hidePrintLoader();
    showAlert('Ошибка связи с сервером');
  };
  xhr.ontimeout = function() {
    hidePrintLoader();
    showAlert('Таймаут сервера');
  };
  xhr.send(JSON.stringify({
    client_name: clientName,
    client_phone: clientPhone
  }));
}

function handleRentalPaymentClick() {
  if (!TERMINAL_RENTAL_PAYMENT_ENABLED) {
    showAlert('Оплата проката отключена');
    return;
  }

  var orderKey = window.prompt('Отсканируйте QR заказа проката');
  if (!orderKey || !orderKey.trim()) {
    return;
  }

  lookupRentalOrderForPayment(orderKey.trim());
}

function printRentalOrderTicket(order, onDone) {
  var orderKey = order.order_key || '';
  var qrPayload = order.qr_payload || ('rent_order:' + orderKey);
  var ticket = TicketService.createTicket([
    { name: 'Заказ проката ' + orderKey, price: 0, qty: 1 }
  ], 0, 'Без оплаты');

  ticket.title = 'Прокат';
  ticket.type = 'Заказ ' + orderKey;
  ticket.number = orderKey || ticket.number;
  ticket.qrCode = qrPayload;
  ticket.scanHint = 'Для оформления проката отсканируйте QR в рентлайне';

  try {
    TicketService.printTicket(ticket, function() {
      if (onDone) onDone();
    });
  } catch (e) {
    console.error('[RENTAL] Print failed:', e);
    if (onDone) onDone();
  }
}

function lookupRentalOrderForPayment(orderKey) {
  showPaymentLoader('Проверяем заказ проката...');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/rental/orders/lookup', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    hidePaymentLoader();
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status !== 'ok' || !data.order) {
        throw new Error(data.message || 'Заказ проката не найден');
      }

      startRentalOrderPayment(data.order);
    } catch (e) {
      console.error('[RENTAL] Lookup failed:', e);
      showAlert(e.message || 'Ошибка поиска заказа');
    }
  };
  xhr.onerror = function() {
    hidePaymentLoader();
    showAlert('Ошибка связи с сервером');
  };
  xhr.ontimeout = function() {
    hidePaymentLoader();
    showAlert('Таймаут сервера');
  };
  xhr.send(JSON.stringify({ order_key: orderKey }));
}

function startRentalOrderPayment(order) {
  if (!order.can_pay) {
    showAlert(order.payment_block_reason || 'Заказ не готов к оплате');
    return;
  }

  var total = parseInt(order.total || 0);
  if (!total || total <= 0) {
    showAlert('Сумма проката не указана');
    return;
  }

  pendingRentalPaymentOrder = order;
  paymentSourceScreen = 'rental-order';
  pendingCartItems = [{ name: 'Прокат ' + (order.order_key || ''), price: total, qty: 1 }];
  pendingCartTotal = total;

  var payTotalEl = document.getElementById('pay-total-value');
  if (payTotalEl) payTotalEl.textContent = formatPrice(pendingCartTotal) + ' ₽';

  var orderItems = document.getElementById('pay-order-items');
  if (orderItems) {
    orderItems.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'pay-order-row';
    row.innerHTML = '<div class="pay-order-row-name"><span class="pay-order-dot"></span><span class="pay-order-row-label">Прокат ' +
      (order.order_key || '') + '</span></div><span class="pay-order-row-price">' +
      formatPrice(total) + ' ₽</span>';
    orderItems.appendChild(row);
  }

  navigateTo('payment');
  payByCard();
}

function loadTerminalGroups() {
  var stateEl = document.getElementById('groups-state');
  var listEl = document.getElementById('groups-list');

  if (stateEl) stateEl.textContent = 'Загружаем занятия...';
  if (listEl) listEl.innerHTML = '';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/groups/catalog', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status === 'error') {
        throw new Error(data.message || 'Не удалось загрузить групповые занятия');
      }

      TERMINAL_INSTRUCTOR_SERVICE_ENABLED = data.instructor_service_enabled === true || TERMINAL_INSTRUCTOR_SERVICE_ENABLED;
      TERMINAL_INSTRUCTOR_SERVICE_TITLE = data.instructor_service_title || TERMINAL_INSTRUCTOR_SERVICE_TITLE;
      TERMINAL_GROUP_LESSONS_ENABLED = data.enabled === true || data.group_lessons_enabled === true || data.group_section_enabled === true;
      TERMINAL_GROUP_LESSONS_TITLE = data.title || data.group_lessons_title || data.group_section_title || TERMINAL_GROUP_LESSONS_TITLE;
      TERMINAL_GROUP_SECTION_ENABLED = TERMINAL_GROUP_LESSONS_ENABLED;
      TERMINAL_GROUP_SECTION_TITLE = TERMINAL_GROUP_LESSONS_TITLE;
      TERMINAL_GROUP_PAYMENT_ENABLED = data.payment_enabled !== false;
      TERMINAL_GROUP_FREE_BOOKING_ENABLED = data.free_booking_enabled !== false;
      loadedGroups = Array.isArray(data.groups) ? data.groups : [];
      applyGroupSectionSettings();
      renderGroupDates();
      renderGroups();
    } catch (e) {
      console.error('[GROUPS] Catalog failed:', e);
      loadedGroups = [];
      renderGroupDates();
      renderGroups(e.message || 'Ошибка загрузки групп');
    }
  };
  xhr.onerror = function() {
    loadedGroups = [];
    renderGroupDates();
    renderGroups('Ошибка связи с сервером');
  };
  xhr.ontimeout = function() {
    loadedGroups = [];
    renderGroupDates();
    renderGroups('Таймаут сервера');
  };
  xhr.send('{}');
}

function renderGroupDates() {
  var tabsEl = document.getElementById('groups-date-tabs');
  if (!tabsEl) return;

  var dates = [];
  loadedGroups.forEach(function(group) {
    if (group.date && dates.indexOf(group.date) === -1) {
      dates.push(group.date);
    }
  });

  if (dates.length > 0 && dates.indexOf(selectedGroupDate) === -1) {
    selectedGroupDate = dates[0];
  }

  if (dates.length === 0) {
    selectedGroupDate = '';
  }

  tabsEl.innerHTML = '';
  dates.forEach(function(date) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'groups-date-tab' + (date === selectedGroupDate ? ' active' : '');
    btn.textContent = formatGroupDateTab(date);
    btn.onclick = function() {
      selectedGroupDate = date;
      renderGroupDates();
      renderGroups();
    };
    tabsEl.appendChild(btn);
  });
}

function renderGroups(errorMessage) {
  var listEl = document.getElementById('groups-list');
  var stateEl = document.getElementById('groups-state');
  if (!listEl || !stateEl) return;

  listEl.innerHTML = '';

  if (errorMessage) {
    stateEl.textContent = errorMessage;
    return;
  }

  var visibleGroups = loadedGroups.filter(function(group) {
    return !selectedGroupDate || group.date === selectedGroupDate;
  });

  if (visibleGroups.length === 0) {
    stateEl.textContent = 'Нет доступных групповых занятий';
    return;
  }

  stateEl.textContent = '';
  visibleGroups.forEach(function(group) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'group-card';
    card.onclick = function() { openGroupClientForm(group); };

    var imageStyle = group.image_url ? ' style="background-image:url(\'' + escapeAttr(group.image_url) + '\')"' : '';
    var seatsText = group.free_seats === null ? 'Места есть' : 'Свободно: ' + group.free_seats;
    var description = group.short_description || group.online_description || '';
    var meta = [group.trainer_name, group.implement_name].filter(Boolean).join(' · ');
    var priceText = parseInt(group.price || 0) > 0 ? formatPrice(parseInt(group.price || 0)) + ' ₽' : 'Бесплатно';

    card.innerHTML =
      '<div class="group-card__image"' + imageStyle + '></div>' +
      '<div class="group-card__body">' +
        '<div class="group-card__time">' + escapeHtml(group.start_time || '') + '–' + escapeHtml(group.fin_time || '') + '</div>' +
        '<div class="group-card__title">' + escapeHtml(group.name || group.template_name || 'Групповое занятие') + '</div>' +
        (meta ? '<div class="group-card__meta">' + escapeHtml(meta) + '</div>' : '') +
        (description ? '<div class="group-card__description">' + escapeHtml(description) + '</div>' : '') +
        '<div class="group-card__bottom">' +
          '<span class="group-card__price">' + priceText + '</span>' +
          '<span class="group-card__seats">' + escapeHtml(seatsText) + '</span>' +
        '</div>' +
      '</div>';

    listEl.appendChild(card);
  });

  lucide.createIcons();
}

function openGroupClientForm(group) {
  var price = parseInt(group.price || 0);

  if (price > 0 && !TERMINAL_GROUP_PAYMENT_ENABLED) {
    showAlert('Оплата групп отключена');
    return;
  }

  if (price === 0 && !TERMINAL_GROUP_FREE_BOOKING_ENABLED) {
    showAlert('Бесплатная запись отключена');
    return;
  }

  pendingGroupBooking = { group: group, clientName: '', clientPhone: '', isChild: false };

  var modal = document.getElementById('group-client-modal');
  var summary = document.getElementById('group-client-summary');
  var nameInput = document.getElementById('group-client-name');
  var phoneInput = document.getElementById('group-client-phone');
  var childInput = document.getElementById('group-client-child');
  var errorEl = document.getElementById('group-client-error');

  if (summary) {
    summary.textContent = (group.name || 'Групповое занятие') + ' · ' + formatGroupDate(group.date) + ' · ' +
      (group.start_time || '') + '–' + (group.fin_time || '') + ' · ' + (price > 0 ? formatPrice(price) + ' ₽' : 'Бесплатно');
  }
  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (childInput) childInput.checked = false;
  if (errorEl) errorEl.textContent = '';
  if (modal) modal.classList.add('active');

  setTimeout(function() {
    if (nameInput) nameInput.focus();
  }, 50);
}

function closeGroupClientForm() {
  var modal = document.getElementById('group-client-modal');
  if (modal) modal.classList.remove('active');
}

function submitGroupClientForm(event) {
  if (event) event.preventDefault();
  if (!pendingGroupBooking || !pendingGroupBooking.group) {
    closeGroupClientForm();
    return;
  }

  var nameInput = document.getElementById('group-client-name');
  var phoneInput = document.getElementById('group-client-phone');
  var childInput = document.getElementById('group-client-child');
  var errorEl = document.getElementById('group-client-error');
  var clientName = nameInput ? nameInput.value.trim() : '';
  var clientPhone = phoneInput ? phoneInput.value.trim() : '';

  if (!clientName || !clientPhone) {
    if (errorEl) errorEl.textContent = 'Укажите имя и телефон клиента';
    return;
  }

  pendingGroupBooking.clientName = clientName;
  pendingGroupBooking.clientPhone = clientPhone;
  pendingGroupBooking.isChild = childInput ? childInput.checked : false;
  closeGroupClientForm();

  var group = pendingGroupBooking.group;
  var price = parseInt(group.price || 0);

  if (price <= 0) {
    pendingCartItems = [{ name: group.name || 'Групповое занятие', price: 0, qty: 1 }];
    pendingCartTotal = 0;
    paymentSourceScreen = 'group';
    createTerminalGroupBooking('Без оплаты');
    return;
  }

  paymentSourceScreen = 'group';
  pendingCartItems = [{ name: group.name || 'Групповое занятие', price: price, qty: 1 }];
  pendingCartTotal = price;
  renderPaymentSummary();
  navigateTo('payment');
  payByCard();
}

function createTerminalGroupBooking(paymentMethod) {
  if (!pendingGroupBooking || !pendingGroupBooking.group) {
    showAlert('Группа не выбрана');
    goBackFromPayment();
    return;
  }

  var group = pendingGroupBooking.group;
  var paymentCode = generatePaymentCode();
  lastPaymentCode = paymentCode;
  lastPaymentMethod = paymentMethod;

  showPaymentLoader('Подтверждаем запись на занятие...');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/groups/pay', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    hidePaymentLoader();
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status !== 'ok') {
        throw new Error(data.message || 'Не удалось записаться на занятие');
      }

      printGroupTicket(data.contract, group, paymentMethod, function() {
        pendingGroupBooking = null;
        navigateTo('success');
        showReceiptInline();
        loadTerminalGroups();
      });
    } catch (e) {
      console.error('[GROUPS] Pay failed:', e);
      showAlert(e.message || 'Ошибка записи на занятие');
      goBackFromPayment();
    }
  };
  xhr.onerror = function() {
    hidePaymentLoader();
    showAlert('Ошибка связи с сервером');
    goBackFromPayment();
  };
  xhr.ontimeout = function() {
    hidePaymentLoader();
    showAlert('Таймаут сервера');
    goBackFromPayment();
  };
  xhr.send(JSON.stringify({
    terminal_order_id: 'GROUP-' + Date.now().toString(36).toUpperCase(),
    terminal_payment_code: paymentCode,
    group_id: group.id,
    client_name: pendingGroupBooking.clientName,
    client_phone: pendingGroupBooking.clientPhone,
    is_child: pendingGroupBooking.isChild,
    sum: parseInt(group.price || 0),
    payment_type: paymentMethod === 'Без оплаты' ? 8 : 1
  }));
}

function printGroupTicket(contract, group, paymentMethod, onDone) {
  var title = group.name || 'Групповое занятие';
  var price = parseInt(group.price || 0);
  var ticket = TicketService.createTicket([
    { name: title, price: price, qty: 1 }
  ], price, paymentMethod);

  ticket.title = 'Групповое занятие';
  ticket.type = title + ' · ' + formatGroupDate(group.date) + ' ' + (group.start_time || '');
  ticket.number = contract && contract.surrogate_id ? contract.surrogate_id : ticket.number;
  ticket.qrCode = contract && contract.surrogate_id ? contract.surrogate_id : ticket.qrCode;

  try {
    showPrintLoader();
    TicketService.printTicket(ticket, function() {
      hidePrintLoader();
      if (onDone) onDone();
    });
  } catch (e) {
    hidePrintLoader();
    console.error('[GROUPS] Print failed:', e);
    if (onDone) onDone();
  }
}

function loadTerminalInstructors() {
  var stateEl = document.getElementById('instructors-state');
  var listEl = document.getElementById('instructors-list');

  if (stateEl) stateEl.textContent = 'Загружаем инструкторов...';
  if (listEl) listEl.innerHTML = '';

  var payload = {};
  if (selectedInstructorDate) payload.date = selectedInstructorDate;
  if (selectedInstructorStartTime) payload.start_time = selectedInstructorStartTime;
  if (selectedInstructorEndTime) payload.end_time = selectedInstructorEndTime;
  if (selectedInstructorImplementId) payload.implement_id = selectedInstructorImplementId;

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/instructors/catalog', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status === 'error') {
        throw new Error(data.message || 'Не удалось загрузить инструкторов');
      }

      loadedInstructorCatalog = data;
      loadedInstructors = Array.isArray(data.trainers) ? data.trainers : [];
      TERMINAL_INDIVIDUAL_LESSONS_ENABLED = data.enabled === true || TERMINAL_INDIVIDUAL_LESSONS_ENABLED;
      TERMINAL_INDIVIDUAL_LESSONS_TITLE = data.title || TERMINAL_INDIVIDUAL_LESSONS_TITLE;
      if (data.filters) {
        selectedInstructorDate = data.filters.date || selectedInstructorDate;
        selectedInstructorStartTime = data.filters.start_time || selectedInstructorStartTime;
        selectedInstructorEndTime = data.filters.end_time || selectedInstructorEndTime;
        selectedInstructorImplementId = data.filters.implement_id || selectedInstructorImplementId;
      }
      applyGroupSectionSettings();
      renderInstructorFilters();
      renderInstructors();
    } catch (e) {
      console.error('[INSTRUCTORS] Catalog failed:', e);
      loadedInstructorCatalog = null;
      loadedInstructors = [];
      renderInstructorFilters();
      renderInstructors(e.message || 'Ошибка загрузки инструкторов');
    }
  };
  xhr.onerror = function() {
    loadedInstructors = [];
    renderInstructors('Ошибка связи с сервером');
  };
  xhr.ontimeout = function() {
    loadedInstructors = [];
    renderInstructors('Таймаут сервера');
  };
  xhr.send(JSON.stringify(payload));
}

function renderInstructorFilters() {
  var titleEl = document.getElementById('instructors-screen-title');
  var datesEl = document.getElementById('instructors-date-tabs');
  var startEl = document.getElementById('instructor-start-time');
  var endEl = document.getElementById('instructor-end-time');
  var implementsEl = document.getElementById('instructor-implement-tabs');

  var catalog = loadedInstructorCatalog || {};
  var dates = Array.isArray(catalog.dates) ? catalog.dates : [];
  var timeSlots = Array.isArray(catalog.time_slots) ? catalog.time_slots : [];
  var implements = Array.isArray(catalog.implements) ? catalog.implements : [];

  if (titleEl) {
    titleEl.textContent = catalog.title || TERMINAL_INDIVIDUAL_LESSONS_TITLE || 'Индивидуальные занятия';
  }

  if (datesEl) {
    datesEl.innerHTML = '';
    dates.forEach(function(item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'instructor-date-tab' + (item.date === selectedInstructorDate ? ' active' : '');
      btn.innerHTML = '<span>' + escapeHtml(String(item.weekday || '').toUpperCase()) + '</span><strong>' + escapeHtml(item.day || '') + '</strong>';
      btn.onclick = function() {
        selectedInstructorDate = item.date;
        loadTerminalInstructors();
      };
      datesEl.appendChild(btn);
    });
  }

  fillInstructorTimeSelect(startEl, timeSlots, selectedInstructorStartTime);
  fillInstructorTimeSelect(endEl, timeSlots, selectedInstructorEndTime);

  if (implementsEl) {
    implementsEl.innerHTML = '';
    implements.forEach(function(implement) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'instructor-filter-pill' + (parseInt(implement.id) === parseInt(selectedInstructorImplementId || 0) ? ' active' : '');
      btn.textContent = implement.name || 'Снаряд';
      btn.onclick = function() {
        selectedInstructorImplementId = implement.id;
        loadTerminalInstructors();
      };
      implementsEl.appendChild(btn);
    });
  }
}

function fillInstructorTimeSelect(selectEl, timeSlots, selectedValue) {
  if (!selectEl) return;

  selectEl.innerHTML = '';
  timeSlots.forEach(function(time) {
    var option = document.createElement('option');
    option.value = time;
    option.textContent = time;
    option.selected = time === selectedValue;
    selectEl.appendChild(option);
  });
}

function handleInstructorTimeChange() {
  var startEl = document.getElementById('instructor-start-time');
  var endEl = document.getElementById('instructor-end-time');
  selectedInstructorStartTime = startEl ? startEl.value : selectedInstructorStartTime;
  selectedInstructorEndTime = endEl ? endEl.value : selectedInstructorEndTime;

  if (compareInstructorTimes(selectedInstructorEndTime, selectedInstructorStartTime) <= 0 && loadedInstructorCatalog) {
    var slots = Array.isArray(loadedInstructorCatalog.time_slots) ? loadedInstructorCatalog.time_slots : [];
    var index = slots.indexOf(selectedInstructorStartTime);
    selectedInstructorEndTime = slots[index + 2] || slots[index + 1] || selectedInstructorEndTime;
    if (endEl) endEl.value = selectedInstructorEndTime;
  }

  loadTerminalInstructors();
}

function compareInstructorTimes(left, right) {
  return instructorTimeToMinutes(left) - instructorTimeToMinutes(right);
}

function instructorTimeToMinutes(value) {
  var parts = String(value || '').split(':');
  return (parseInt(parts[0] || '0') * 60) + parseInt(parts[1] || '0');
}

function handleInstructorSearchInput(input) {
  instructorSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderInstructors();
}

function renderInstructors(errorMessage) {
  var listEl = document.getElementById('instructors-list');
  var stateEl = document.getElementById('instructors-state');
  if (!listEl || !stateEl) return;

  listEl.innerHTML = '';

  if (errorMessage) {
    stateEl.textContent = errorMessage;
    return;
  }

  var visible = loadedInstructors.filter(function(trainer) {
    if (!instructorSearchQuery) return true;
    return String(trainer.name || '').toLowerCase().indexOf(instructorSearchQuery) !== -1;
  });

  if (visible.length === 0) {
    stateEl.textContent = 'Нет свободных инструкторов на выбранное время';
    return;
  }

  stateEl.textContent = '';
  visible.forEach(function(trainer) {
    var slot = trainer.selected_slot || (Array.isArray(trainer.available_slots) ? trainer.available_slots[0] : null) || {};
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'instructor-booking-card';
    card.onclick = function() { openInstructorClientForm(trainer); };

    var imageStyle = trainer.photo_url ? ' style="background-image:url(\'' + escapeAttr(trainer.photo_url) + '\')"' : '';
    var category = trainer.category_title || 'Инструктор';
    var price = parseInt(slot.price || 0);
    var time = (slot.start_time || selectedInstructorStartTime || '') + '–' + (slot.end_time || selectedInstructorEndTime || '');

    card.innerHTML =
      '<div class="instructor-booking-card__photo"' + imageStyle + '></div>' +
      '<div class="instructor-booking-card__body">' +
        '<div class="instructor-booking-card__name">' + escapeHtml(trainer.name || 'Инструктор') + '</div>' +
        '<div class="instructor-booking-card__meta">' + escapeHtml(category) + '</div>' +
        '<div class="instructor-booking-card__bottom">' +
          '<span>' + escapeHtml(time) + '</span>' +
          '<strong>' + formatPrice(price) + ' ₽</strong>' +
        '</div>' +
      '</div>';

    listEl.appendChild(card);
  });
}

function openInstructorClientForm(trainer) {
  var slots = Array.isArray(trainer.available_slots) ? trainer.available_slots : [];
  if (slots.length === 0) {
    showAlert('У инструктора нет доступных слотов');
    return;
  }

  pendingInstructorBooking = {
    trainer: trainer,
    slot: trainer.selected_slot || slots[0],
    clientName: '',
    clientPhone: ''
  };

  var modal = document.getElementById('instructor-client-modal');
  var summary = document.getElementById('instructor-client-summary');
  var timeSelect = document.getElementById('instructor-client-time');
  var nameInput = document.getElementById('instructor-client-name');
  var phoneInput = document.getElementById('instructor-client-phone');
  var errorEl = document.getElementById('instructor-client-error');

  if (timeSelect) {
    timeSelect.innerHTML = '';
    slots.forEach(function(slot) {
      var option = document.createElement('option');
      option.value = slot.start + '|' + slot.end + '|' + slot.implement_subtype_scope_id + '|' + slot.price;
      option.textContent = slot.start_time + '–' + slot.end_time + ' · ' + formatPrice(parseInt(slot.price || 0)) + ' ₽';
      option.selected = pendingInstructorBooking.slot && slot.start === pendingInstructorBooking.slot.start;
      timeSelect.appendChild(option);
    });
  }
  if (nameInput) {
    nameInput.value = '';
    nameInput.setAttribute('autocomplete', 'new-password');
  }
  if (phoneInput) {
    phoneInput.value = '';
    phoneInput.setAttribute('autocomplete', 'new-password');
  }
  if (errorEl) errorEl.textContent = '';
  updateInstructorClientSlotFromSelect();
  updateInstructorClientSummary(summary);
  setInstructorClientActiveField('name');
  if (modal) modal.classList.add('active');
}

function updateInstructorClientSlotFromSelect() {
  if (!pendingInstructorBooking) return;

  var timeSelect = document.getElementById('instructor-client-time');
  if (!timeSelect || !timeSelect.value) return;

  var parts = timeSelect.value.split('|');
  var slots = Array.isArray(pendingInstructorBooking.trainer.available_slots)
    ? pendingInstructorBooking.trainer.available_slots
    : [];
  var slot = slots.find(function(item) {
    return item.start === parts[0] && item.end === parts[1];
  });

  if (slot) {
    pendingInstructorBooking.slot = slot;
  }

  updateInstructorClientSummary();
}

function updateInstructorClientSummary(summaryEl) {
  if (!pendingInstructorBooking || !pendingInstructorBooking.slot) return;

  var summary = summaryEl || document.getElementById('instructor-client-summary');
  var slot = pendingInstructorBooking.slot;
  var trainer = pendingInstructorBooking.trainer || {};
  if (summary) {
    summary.textContent = (trainer.name || 'Инструктор') + ' · ' +
      formatGroupDate(slot.date) + ' · ' + slot.start_time + '–' + slot.end_time + ' · ' +
      formatPrice(parseInt(slot.price || 0)) + ' ₽';
  }
}

function closeInstructorClientForm() {
  var modal = document.getElementById('instructor-client-modal');
  if (modal) modal.classList.remove('active');
}

function setInstructorClientActiveField(field) {
  instructorClientActiveField = field === 'phone' ? 'phone' : 'name';

  document.querySelectorAll('[data-instructor-client-field]').forEach(function(fieldEl) {
    fieldEl.classList.toggle(
      'rental-client-field--active',
      fieldEl.getAttribute('data-instructor-client-field') === instructorClientActiveField
    );
  });

  renderInstructorClientKeyboard();
}

function renderInstructorClientKeyboard() {
  var keyboardEl = document.getElementById('instructor-client-keyboard');
  if (!keyboardEl) return;

  var layout = instructorClientActiveField === 'phone' ? RENTAL_CLIENT_PHONE_KEYBOARD : RENTAL_CLIENT_NAME_KEYBOARD;
  keyboardEl.className = 'rental-client-keyboard rental-client-keyboard--' + instructorClientActiveField;
  keyboardEl.innerHTML = '';

  layout.forEach(function(row) {
    var rowEl = document.createElement('div');
    rowEl.className = 'rental-client-keyboard-row';

    row.forEach(function(label) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rental-client-keyboard-key';
      if (label === 'Пробел') {
        button.classList.add('rental-client-keyboard-key--space');
      } else if (label === 'Стереть' || label === 'Очистить') {
        button.classList.add('rental-client-keyboard-key--action');
      }
      button.textContent = label === 'Стереть' ? '⌫' : label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', function() {
        handleInstructorClientKeyboardKey(label);
      });
      rowEl.appendChild(button);
    });

    keyboardEl.appendChild(rowEl);
  });
}

function handleInstructorClientKeyboardKey(label) {
  var errorEl = document.getElementById('instructor-client-error');
  if (errorEl) errorEl.textContent = '';

  if (instructorClientActiveField === 'phone') {
    handleInstructorClientPhoneKey(label);
    return;
  }

  handleInstructorClientNameKey(label);
}

function handleInstructorClientNameKey(label) {
  var input = document.getElementById('instructor-client-name');
  if (!input) return;

  if (label === 'Стереть') {
    input.value = input.value.slice(0, -1);
    return;
  }

  if (label === 'Очистить') {
    input.value = '';
    return;
  }

  var value = label === 'Пробел' ? ' ' : label;
  input.value = normalizeRentalClientName(input.value + value);
}

function handleInstructorClientPhoneKey(label) {
  var input = document.getElementById('instructor-client-phone');
  if (!input) return;

  var digits = rentalPhoneDigits(input.value);

  if (label === 'Стереть') {
    digits = digits.slice(0, -1);
  } else if (label === 'Очистить' || label === '+7') {
    digits = '';
  } else if (/^\d$/.test(label) && digits.length < 10) {
    digits += label;
  }

  input.value = formatRentalPhoneFromDigits(digits);
}

function submitInstructorClientForm(event) {
  if (event) event.preventDefault();
  if (!pendingInstructorBooking || !pendingInstructorBooking.trainer || !pendingInstructorBooking.slot) {
    closeInstructorClientForm();
    return;
  }

  updateInstructorClientSlotFromSelect();

  var nameInput = document.getElementById('instructor-client-name');
  var phoneInput = document.getElementById('instructor-client-phone');
  var errorEl = document.getElementById('instructor-client-error');
  var clientName = nameInput ? nameInput.value.trim() : '';
  var clientPhone = phoneInput ? phoneInput.value.trim() : '';

  if (!clientName || rentalPhoneDigits(clientPhone).length < 10) {
    if (errorEl) errorEl.textContent = 'Укажите имя и полный телефон клиента';
    return;
  }

  pendingInstructorBooking.clientName = clientName;
  pendingInstructorBooking.clientPhone = clientPhone;
  closeInstructorClientForm();

  var slot = pendingInstructorBooking.slot;
  var price = parseInt(slot.price || 0);
  paymentSourceScreen = 'individual-instructor';
  pendingCartItems = [{
    name: 'Индивидуальное занятие: ' + (pendingInstructorBooking.trainer.name || 'Инструктор'),
    price: price,
    qty: 1
  }];
  pendingCartTotal = price;
  renderPaymentSummary();
  navigateTo('payment');
  payByCard();
}

function createTerminalInstructorBooking(paymentMethod) {
  if (!pendingInstructorBooking || !pendingInstructorBooking.trainer || !pendingInstructorBooking.slot) {
    showAlert('Инструктор не выбран');
    goBackFromPayment();
    return;
  }

  var trainer = pendingInstructorBooking.trainer;
  var slot = pendingInstructorBooking.slot;
  var paymentCode = generatePaymentCode();
  lastPaymentCode = paymentCode;
  lastPaymentMethod = paymentMethod;

  showPaymentLoader('Подтверждаем запись к инструктору...');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/instructors/pay', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    hidePaymentLoader();
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status !== 'ok') {
        throw new Error(data.message || 'Не удалось записаться к инструктору');
      }

      printInstructorTicket(data.contract, trainer, slot, paymentMethod, function() {
        pendingInstructorBooking = null;
        navigateTo('success');
        showReceiptInline();
        loadTerminalInstructors();
      });
    } catch (e) {
      console.error('[INSTRUCTORS] Pay failed:', e);
      showAlert(e.message || 'Ошибка записи к инструктору');
      goBackFromPayment();
    }
  };
  xhr.onerror = function() {
    hidePaymentLoader();
    showAlert('Ошибка связи с сервером');
    goBackFromPayment();
  };
  xhr.ontimeout = function() {
    hidePaymentLoader();
    showAlert('Таймаут сервера');
    goBackFromPayment();
  };
  xhr.send(JSON.stringify({
    terminal_order_id: 'IND-' + Date.now().toString(36).toUpperCase(),
    terminal_payment_code: paymentCode,
    trainer_id: trainer.id,
    implement_id: slot.implement_id,
    implement_subtype_scope_id: slot.implement_subtype_scope_id,
    start: slot.start,
    end: slot.end,
    client_name: pendingInstructorBooking.clientName,
    client_phone: pendingInstructorBooking.clientPhone,
    sum: parseInt(slot.price || 0),
    payment_type: 1
  }));
}

function printInstructorTicket(contract, trainer, slot, paymentMethod, onDone) {
  var price = parseInt(slot.price || 0);
  var ticket = TicketService.createTicket([
    { name: 'Индивидуальное занятие', price: price, qty: 1 }
  ], price, paymentMethod);

  ticket.title = 'Индивидуальное занятие';
  ticket.type = (trainer.name || 'Инструктор') + ' · ' + formatGroupDate(slot.date) + ' ' + (slot.start_time || '');
  ticket.number = contract && contract.surrogate_id ? contract.surrogate_id : ticket.number;
  ticket.qrCode = contract && contract.surrogate_id ? contract.surrogate_id : ticket.qrCode;

  try {
    showPrintLoader();
    TicketService.printTicket(ticket, function() {
      hidePrintLoader();
      if (onDone) onDone();
    });
  } catch (e) {
    hidePrintLoader();
    console.error('[INSTRUCTORS] Print failed:', e);
    if (onDone) onDone();
  }
}

function loadTerminalVisits() {
  var stateEl = document.getElementById('visits-state');
  var listEl = document.getElementById('visit-slots-list');

  if (stateEl) stateEl.textContent = 'Загружаем посещения...';
  if (listEl) listEl.innerHTML = '';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/visits/catalog', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status === 'error') {
        throw new Error(data.message || 'Не удалось загрузить посещения');
      }

      loadedVisitCatalog = data;
      loadedVisitLocations = Array.isArray(data.locations) ? data.locations : [];
      TERMINAL_VISIT_SECTION_ENABLED = data.enabled === true || data.visit_section_enabled === true;
      TERMINAL_VISIT_SECTION_TITLE = data.title || data.visit_section_title || TERMINAL_VISIT_SECTION_TITLE;

      if (!selectedVisitDate) {
        selectedVisitDate = todayDateString();
      }
      if (!selectedVisitLocationId && loadedVisitLocations.length > 0) {
        selectedVisitLocationId = loadedVisitLocations[0].id;
      }

      applyVisitSectionSettings();
      renderVisitDates();
      renderVisitFilters();
      loadVisitAvailability();
    } catch (e) {
      console.error('[VISITS] Catalog failed:', e);
      loadedVisitCatalog = null;
      loadedVisitLocations = [];
      loadedVisitSlots = [];
      renderVisitDates();
      renderVisitFilters();
      renderVisitSlots(e.message || 'Ошибка загрузки посещений');
    }
  };
  xhr.onerror = function() {
    loadedVisitSlots = [];
    renderVisitSlots('Ошибка связи с сервером');
  };
  xhr.ontimeout = function() {
    loadedVisitSlots = [];
    renderVisitSlots('Таймаут сервера');
  };
  xhr.send('{}');
}

function renderVisitDates() {
  var tabsEl = document.getElementById('visits-date-tabs');
  if (!tabsEl) return;

  var horizon = loadedVisitCatalog ? parseInt(loadedVisitCatalog.booking_horizon_days || 14) : 14;
  horizon = Math.max(1, Math.min(14, horizon || 14));
  var dates = [];
  var today = new Date();

  for (var i = 0; i <= horizon; i++) {
    var date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    dates.push(dateToYmd(date));
  }

  if (dates.indexOf(selectedVisitDate) === -1) {
    selectedVisitDate = dates[0];
  }

  tabsEl.innerHTML = '';
  dates.forEach(function(date) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'instructor-date-tab' + (date === selectedVisitDate ? ' active' : '');
    btn.innerHTML = visitDateTabHtml(date);
    btn.onclick = function() {
      selectedVisitDate = date;
      renderVisitDates();
      loadVisitAvailability();
    };
    tabsEl.appendChild(btn);
  });
}

function renderVisitFilters() {
  var locationEl = document.getElementById('visit-location-select');
  var resourceEl = document.getElementById('visit-resource-select');
  var partyEl = document.getElementById('visit-party-size');

  if (locationEl) {
    locationEl.innerHTML = '';
    loadedVisitLocations.forEach(function(location) {
      var option = document.createElement('option');
      option.value = location.id;
      option.textContent = location.name || 'Локация';
      option.selected = parseInt(location.id) === parseInt(selectedVisitLocationId || 0);
      locationEl.appendChild(option);
    });
  }

  var location = selectedVisitLocation();
  var resources = location && Array.isArray(location.resources) ? location.resources : [];

  if (resourceEl) {
    resourceEl.innerHTML = '';
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = resources.length > 0 ? 'Все площадки' : 'Не требуется';
    allOption.selected = !selectedVisitResourceId;
    resourceEl.appendChild(allOption);

    resources.forEach(function(resource) {
      var option = document.createElement('option');
      option.value = resource.id;
      option.textContent = resource.name || 'Площадка';
      option.selected = parseInt(resource.id) === parseInt(selectedVisitResourceId || 0);
      resourceEl.appendChild(option);
    });
  }

  if (partyEl) {
    partyEl.value = String(selectedVisitPartySize || 1);
  }
}

function selectedVisitLocation() {
  return loadedVisitLocations.find(function(location) {
    return parseInt(location.id) === parseInt(selectedVisitLocationId || 0);
  }) || null;
}

function handleVisitLocationChange() {
  var select = document.getElementById('visit-location-select');
  selectedVisitLocationId = select && select.value ? parseInt(select.value) : null;
  selectedVisitResourceId = null;
  renderVisitFilters();
  loadVisitAvailability();
}

function handleVisitResourceChange() {
  var select = document.getElementById('visit-resource-select');
  selectedVisitResourceId = select && select.value ? parseInt(select.value) : null;
  loadVisitAvailability();
}

function handleVisitPartySizeChange() {
  var select = document.getElementById('visit-party-size');
  selectedVisitPartySize = select && select.value ? parseInt(select.value) : 1;
  loadVisitAvailability();
}

function loadVisitAvailability() {
  var stateEl = document.getElementById('visits-state');
  var listEl = document.getElementById('visit-slots-list');

  if (!TERMINAL_VISIT_SECTION_ENABLED) {
    renderVisitSlots('Посещения отключены');
    return;
  }

  if (!selectedVisitDate || !selectedVisitLocationId) {
    renderVisitSlots('Выберите локацию');
    return;
  }

  if (stateEl) stateEl.textContent = 'Загружаем свободное время...';
  if (listEl) listEl.innerHTML = '';

  var payload = {
    date: selectedVisitDate,
    location_id: selectedVisitLocationId,
    party_size: selectedVisitPartySize || 1
  };
  if (selectedVisitResourceId) {
    payload.location_resource_id = selectedVisitResourceId;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/visits/availability', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status === 'error') {
        throw new Error(data.message || 'Не удалось загрузить свободное время');
      }

      loadedVisitSlots = Array.isArray(data.slots) ? data.slots : [];
      renderVisitSlots();
    } catch (e) {
      console.error('[VISITS] Availability failed:', e);
      loadedVisitSlots = [];
      renderVisitSlots(e.message || 'Ошибка загрузки свободного времени');
    }
  };
  xhr.onerror = function() {
    loadedVisitSlots = [];
    renderVisitSlots('Ошибка связи с сервером');
  };
  xhr.ontimeout = function() {
    loadedVisitSlots = [];
    renderVisitSlots('Таймаут сервера');
  };
  xhr.send(JSON.stringify(payload));
}

function renderVisitSlots(errorMessage) {
  var listEl = document.getElementById('visit-slots-list');
  var stateEl = document.getElementById('visits-state');
  if (!listEl || !stateEl) return;

  listEl.innerHTML = '';

  if (errorMessage) {
    stateEl.textContent = errorMessage;
    return;
  }

  if (loadedVisitSlots.length === 0) {
    stateEl.textContent = 'Нет свободного времени';
    return;
  }

  stateEl.textContent = '';
  loadedVisitSlots.forEach(function(slot) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'visit-slot-card';
    card.onclick = function() { openVisitClientForm(slot); };

    var resourceName = slot.resource_name || selectedVisitLocationName();
    var capacity = slot.available_capacity == null ? 'Места есть' : 'Свободно: ' + slot.available_capacity;
    card.innerHTML =
      '<div class="visit-slot-card__time">' + escapeHtml(slot.start_time || '') + '–' + escapeHtml(slot.fin_time || '') + '</div>' +
      '<div class="visit-slot-card__title">' + escapeHtml(resourceName || '') + '</div>' +
      '<div class="visit-slot-card__bottom">' +
        '<span class="visit-slot-card__capacity">' + escapeHtml(capacity) + '</span>' +
        '<span class="visit-slot-card__price">' + formatPrice(parseInt(slot.total || slot.price || 0)) + ' ₽</span>' +
      '</div>';

    listEl.appendChild(card);
  });
}

function selectedVisitLocationName() {
  var location = selectedVisitLocation();
  return location ? location.name : '';
}

function openVisitClientForm(slot) {
  pendingVisitBooking = {
    slot: slot,
    hold: null,
    clientName: '',
    clientPhone: '',
    isChild: false
  };

  var modal = document.getElementById('visit-client-modal');
  var summary = document.getElementById('visit-client-summary');
  var nameInput = document.getElementById('visit-client-name');
  var phoneInput = document.getElementById('visit-client-phone');
  var ageInput = document.getElementById('visit-client-age');
  var errorEl = document.getElementById('visit-client-error');

  if (summary) {
    summary.textContent = selectedVisitLocationName() + ' · ' + formatGroupDate(selectedVisitDate) + ' · ' +
      (slot.start_time || '') + '–' + (slot.fin_time || '') + ' · ' +
      formatPrice(parseInt(slot.total || slot.price || 0)) + ' ₽';
  }
  if (nameInput) {
    nameInput.value = '';
    nameInput.setAttribute('autocomplete', 'new-password');
  }
  if (phoneInput) {
    phoneInput.value = '';
    phoneInput.setAttribute('autocomplete', 'new-password');
  }
  if (ageInput) ageInput.value = 'adult';
  if (errorEl) errorEl.textContent = '';
  setVisitClientActiveField('name');
  if (modal) modal.classList.add('active');
}

function closeVisitClientForm() {
  var modal = document.getElementById('visit-client-modal');
  if (modal) modal.classList.remove('active');
}

function setVisitClientActiveField(field) {
  visitClientActiveField = field === 'phone' ? 'phone' : 'name';

  document.querySelectorAll('[data-visit-client-field]').forEach(function(fieldEl) {
    fieldEl.classList.toggle(
      'rental-client-field--active',
      fieldEl.getAttribute('data-visit-client-field') === visitClientActiveField
    );
  });

  renderVisitClientKeyboard();
}

function renderVisitClientKeyboard() {
  var keyboardEl = document.getElementById('visit-client-keyboard');
  if (!keyboardEl) return;

  var layout = visitClientActiveField === 'phone' ? RENTAL_CLIENT_PHONE_KEYBOARD : RENTAL_CLIENT_NAME_KEYBOARD;
  keyboardEl.className = 'rental-client-keyboard rental-client-keyboard--' + visitClientActiveField;
  keyboardEl.innerHTML = '';

  layout.forEach(function(row) {
    var rowEl = document.createElement('div');
    rowEl.className = 'rental-client-keyboard-row';

    row.forEach(function(label) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rental-client-keyboard-key';
      if (label === 'Пробел') {
        button.classList.add('rental-client-keyboard-key--space');
      } else if (label === 'Стереть' || label === 'Очистить') {
        button.classList.add('rental-client-keyboard-key--action');
      }
      button.textContent = label === 'Стереть' ? '⌫' : label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', function() {
        handleVisitClientKeyboardKey(label);
      });
      rowEl.appendChild(button);
    });

    keyboardEl.appendChild(rowEl);
  });
}

function handleVisitClientKeyboardKey(label) {
  var errorEl = document.getElementById('visit-client-error');
  if (errorEl) errorEl.textContent = '';

  if (visitClientActiveField === 'phone') {
    handleVisitClientPhoneKey(label);
    return;
  }

  handleVisitClientNameKey(label);
}

function handleVisitClientNameKey(label) {
  var input = document.getElementById('visit-client-name');
  if (!input) return;

  if (label === 'Стереть') {
    input.value = input.value.slice(0, -1);
    return;
  }

  if (label === 'Очистить') {
    input.value = '';
    return;
  }

  var value = label === 'Пробел' ? ' ' : label;
  input.value = normalizeRentalClientName(input.value + value);
}

function handleVisitClientPhoneKey(label) {
  var input = document.getElementById('visit-client-phone');
  if (!input) return;

  var digits = rentalPhoneDigits(input.value);

  if (label === 'Стереть') {
    digits = digits.slice(0, -1);
  } else if (label === 'Очистить' || label === '+7') {
    digits = '';
  } else if (/^\d$/.test(label) && digits.length < 10) {
    digits += label;
  }

  input.value = formatRentalPhoneFromDigits(digits);
}

function submitVisitClientForm(event) {
  if (event) event.preventDefault();
  if (!pendingVisitBooking || !pendingVisitBooking.slot) {
    closeVisitClientForm();
    return;
  }

  var nameInput = document.getElementById('visit-client-name');
  var phoneInput = document.getElementById('visit-client-phone');
  var ageInput = document.getElementById('visit-client-age');
  var errorEl = document.getElementById('visit-client-error');
  var clientName = nameInput ? normalizeRentalClientName(nameInput.value).trim() : '';
  var clientPhone = phoneInput ? phoneInput.value.trim() : '';

  if (!clientName || rentalPhoneDigits(clientPhone).length < 10) {
    if (errorEl) errorEl.textContent = 'Укажите имя и полный телефон клиента';
    return;
  }

  pendingVisitBooking.clientName = clientName;
  pendingVisitBooking.clientPhone = formatRentalPhoneFromDigits(rentalPhoneDigits(clientPhone));
  pendingVisitBooking.isChild = ageInput ? ageInput.value === 'child' : false;
  closeVisitClientForm();
  createTerminalVisitHold();
}

function createTerminalVisitHold() {
  if (!pendingVisitBooking || !pendingVisitBooking.slot) {
    showAlert('Слот посещения не выбран');
    return;
  }

  var slot = pendingVisitBooking.slot;
  showPaymentLoader('Бронируем выбранное время...');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/visits/holds', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    hidePaymentLoader();
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || !data.hold) {
        throw new Error(data.message || 'Не удалось забронировать время');
      }

      pendingVisitBooking.hold = data.hold;
      var price = parseInt(slot.total || slot.price || 0);
      paymentSourceScreen = 'visit';
      pendingCartItems = [{
        name: 'Посещение: ' + selectedVisitLocationName(),
        price: price,
        qty: 1
      }];
      pendingCartTotal = price;
      renderPaymentSummary();
      navigateTo('payment');
      payByCard();
    } catch (e) {
      console.error('[VISITS] Hold failed:', e);
      showAlert(e.message || 'Ошибка бронирования посещения');
      navigateTo('visits');
      loadVisitAvailability();
    }
  };
  xhr.onerror = function() {
    hidePaymentLoader();
    showAlert('Ошибка связи с сервером');
  };
  xhr.ontimeout = function() {
    hidePaymentLoader();
    showAlert('Таймаут сервера');
  };
  xhr.send(JSON.stringify({
    start: slot.start,
    fin: slot.fin,
    location_id: slot.location_id,
    location_resource_id: slot.location_resource_id,
    party_size: selectedVisitPartySize || 1,
    visit_tariff_id: slot.tariff_id,
    client_name: pendingVisitBooking.clientName,
    client_phone: pendingVisitBooking.clientPhone,
    is_child: pendingVisitBooking.isChild
  }));
}

function cancelPendingVisitHold() {
  if (!pendingVisitBooking || !pendingVisitBooking.hold || !pendingVisitBooking.hold.key) return;

  var key = pendingVisitBooking.hold.key;
  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/visits/holds/' + encodeURIComponent(key) + '/cancel', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 8000;
  xhr.send('{}');
  pendingVisitBooking = null;
}

function createTerminalVisitPayment(paymentMethod) {
  if (!pendingVisitBooking || !pendingVisitBooking.hold || !pendingVisitBooking.hold.key) {
    showAlert('Бронь посещения не найдена');
    goBackFromPayment();
    return;
  }

  var key = pendingVisitBooking.hold.key;
  var slot = pendingVisitBooking.slot;
  var paymentCode = generatePaymentCode();
  lastPaymentCode = paymentCode;
  lastPaymentMethod = paymentMethod;

  showPaymentLoader('Подтверждаем оплату посещения...');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/visits/holds/' + encodeURIComponent(key) + '/pay', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    hidePaymentLoader();
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status !== 'ok') {
        throw new Error(data.message || 'Не удалось оплатить посещение');
      }

      printVisitTicket(data.visit, slot, paymentMethod, function() {
        pendingVisitBooking = null;
        navigateTo('success');
        showReceiptInline();
        loadVisitAvailability();
      });
    } catch (e) {
      console.error('[VISITS] Pay failed:', e);
      showAlert(e.message || 'Ошибка оплаты посещения');
      goBackFromPayment();
    }
  };
  xhr.onerror = function() {
    hidePaymentLoader();
    showAlert('Ошибка связи с сервером');
    goBackFromPayment();
  };
  xhr.ontimeout = function() {
    hidePaymentLoader();
    showAlert('Таймаут сервера');
    goBackFromPayment();
  };
  xhr.send(JSON.stringify({
    terminal_order_id: 'VISIT-' + Date.now().toString(36).toUpperCase(),
    terminal_payment_code: paymentCode,
    sum: parseInt(slot.total || slot.price || 0),
    payment_type: 1
  }));
}

function printVisitTicket(visit, slot, paymentMethod, onDone) {
  var price = parseInt(slot.total || slot.price || 0);
  var ticket = TicketService.createTicket([
    { name: 'Посещение', price: price, qty: 1 }
  ], price, paymentMethod);

  ticket.title = 'Посещение';
  ticket.type = (visit && visit.location_name ? visit.location_name : selectedVisitLocationName()) +
    ' · ' + formatGroupDate(selectedVisitDate) + ' ' + (slot.start_time || '');
  ticket.number = visit && visit.id ? String(visit.id) : ticket.number;
  ticket.qrCode = visit && visit.terminal_key ? visit.terminal_key : ticket.qrCode;

  try {
    showPrintLoader();
    TicketService.printTicket(ticket, function() {
      hidePrintLoader();
      if (onDone) onDone();
    });
  } catch (e) {
    hidePrintLoader();
    console.error('[VISITS] Print failed:', e);
    if (onDone) onDone();
  }
}

function todayDateString() {
  return dateToYmd(new Date());
}

function dateToYmd(date) {
  var yyyy = date.getFullYear();
  var mm = String(date.getMonth() + 1).padStart(2, '0');
  var dd = String(date.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function visitDateTabHtml(dateValue) {
  var parts = String(dateValue).split('-');
  if (parts.length !== 3) return escapeHtml(formatGroupDateTab(dateValue));

  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var weekday = isNaN(date.getTime()) ? '' : weekdays[date.getDay()];

  return '<span>' + escapeHtml(weekday.toUpperCase()) + '</span><strong>' + escapeHtml(parts[2]) + '</strong>';
}

function renderPaymentSummary() {
  var payTotalEl = document.getElementById('pay-total-value');
  if (payTotalEl) payTotalEl.textContent = formatPrice(pendingCartTotal) + ' ₽';

  var orderItems = document.getElementById('pay-order-items');
  if (!orderItems) return;

  orderItems.innerHTML = '';
  pendingCartItems.forEach(function(item) {
    var row = document.createElement('div');
    row.className = 'pay-order-row';
    row.innerHTML = '<div class="pay-order-row-name"><span class="pay-order-dot"></span><span class="pay-order-row-label">' +
      escapeHtml(item.name) + ' × ' + item.qty + '</span></div><span class="pay-order-row-price">' +
      formatPrice(item.price * item.qty) + ' ₽</span>';
    orderItems.appendChild(row);
  });
}

function formatGroupDate(dateValue) {
  if (!dateValue) return '';
  var parts = String(dateValue).split('-');
  if (parts.length !== 3) return String(dateValue);
  return parts[2] + '.' + parts[1];
}

function formatGroupDateTab(dateValue) {
  if (!dateValue) return '';
  var baseDate = formatGroupDate(dateValue);
  var parts = String(dateValue).split('-');
  if (parts.length !== 3) return baseDate;

  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(date.getTime())) return baseDate;

  var weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  return baseDate + ' (' + weekdays[date.getDay()] + ')';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function updateMainCategoryCards(categories) {
  applyTicketSectionSettings();

  if (!TERMINAL_TICKET_SECTION_ENABLED) {
    return;
  }

  var visibleScreenKeys = {};

  categories.forEach(function(cat) {
    var screenKey = getScreenKeyForCategory(cat);
    if (!screenKey) return;

    visibleScreenKeys[screenKey] = true;
    var card = document.querySelector('[data-ticket-entry="' + screenKey + '"]');
    if (!card) return;

    card.style.display = '';

    var title = card.querySelector('.ent-card-title');
    if (title && cat.category_name) {
      title.textContent = cat.category_name;
      title.removeAttribute('data-i18n');
    }

    var desc = card.querySelector('.ent-card-desc');
    var description = cat.category_description || cat.description || '';
    if (desc) {
      desc.textContent = description || '';
      desc.removeAttribute('data-i18n');
    }

    var photo = getCategoryPhotoSources(cat)[0];
    var photoEl = card.querySelector('.ent-card-photo');
    if (photoEl && photo) {
      photoEl.style.backgroundImage = 'url("' + photo.replace(/"/g, '%22') + '")';
    }
  });

  CATEGORY_SCREEN_SEQUENCE.forEach(function(screenKey) {
    var card = document.querySelector('[data-ticket-entry="' + screenKey + '"]');
    if (card) {
      card.style.display = visibleScreenKeys[screenKey] ? '' : 'none';
    }
  });
}

function loadCategories() {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', API_URL, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 10000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      // Save day types calendar (overwrite each time)
      if (data.day_types_calendar && data.day_types_calendar.length > 0) {
        dayTypesCalendar = data.day_types_calendar;
        console.log('[API] Loaded day_types_calendar: ' + dayTypesCalendar.length + ' days, today=' + getTodayDayType());
      }
      TERMINAL_CAROUSEL_ENABLED = data.carousel_enabled !== false;
      TERMINAL_CAROUSEL_IMAGES = TERMINAL_CAROUSEL_ENABLED ? getCarouselImageSources(data.carousel_images || []) : [];
      TERMINAL_TICKET_SECTION_ENABLED = data.ticket_section_enabled !== false;
      TERMINAL_TICKET_SECTION_TITLE = (typeof data.ticket_section_title === 'string' && data.ticket_section_title.trim())
        ? data.ticket_section_title.trim()
        : 'Билеты';
      TERMINAL_SKIPASS_TOPUP_SECTION_ENABLED = data.skipass_topup_section_enabled === true;
      TERMINAL_SKIPASS_TOPUP_SECTION_TITLE = (typeof data.skipass_topup_section_title === 'string' && data.skipass_topup_section_title.trim())
        ? data.skipass_topup_section_title.trim()
        : 'Пополнение скипасса';
      TERMINAL_RENTAL_SECTION_ENABLED = data.rental_section_enabled === true;
      TERMINAL_RENTAL_SECTION_TITLE = (typeof data.rental_section_title === 'string' && data.rental_section_title.trim())
        ? data.rental_section_title.trim()
        : 'Прокат';
      TERMINAL_RENTAL_CREATE_ENABLED = data.rental_create_enabled === true;
      TERMINAL_RENTAL_PAYMENT_ENABLED = data.rental_payment_enabled === true;
      TERMINAL_VISIT_SECTION_ENABLED = data.visit_section_enabled === true;
      TERMINAL_VISIT_SECTION_TITLE = (typeof data.visit_section_title === 'string' && data.visit_section_title.trim())
        ? data.visit_section_title.trim()
        : 'Посещения';
      TERMINAL_INSTRUCTOR_SERVICE_ENABLED = data.instructor_service_enabled === true;
      TERMINAL_INSTRUCTOR_SERVICE_TITLE = (typeof data.instructor_service_title === 'string' && data.instructor_service_title.trim())
        ? data.instructor_service_title.trim()
        : 'Служба инструкторов';
      TERMINAL_GROUP_LESSONS_ENABLED = data.group_lessons_enabled === true || data.group_section_enabled === true;
      TERMINAL_GROUP_LESSONS_TITLE = (typeof data.group_lessons_title === 'string' && data.group_lessons_title.trim())
        ? data.group_lessons_title.trim()
        : (typeof data.group_section_title === 'string' && data.group_section_title.trim())
          ? data.group_section_title.trim()
          : 'Групповые занятия';
      TERMINAL_GROUP_LESSONS_IMAGE = getImageSource(data.group_lessons_image || '');
      TERMINAL_INDIVIDUAL_LESSONS_ENABLED = data.individual_lessons_enabled === true;
      TERMINAL_INDIVIDUAL_LESSONS_TITLE = (typeof data.individual_lessons_title === 'string' && data.individual_lessons_title.trim())
        ? data.individual_lessons_title.trim()
        : 'Индивидуальные занятия';
      TERMINAL_INDIVIDUAL_LESSONS_IMAGE = getImageSource(data.individual_lessons_image || '');
      TERMINAL_GROUP_SECTION_ENABLED = TERMINAL_GROUP_LESSONS_ENABLED;
      TERMINAL_GROUP_SECTION_TITLE = TERMINAL_GROUP_LESSONS_TITLE;
      if (!TERMINAL_INSTRUCTOR_SERVICE_ENABLED && TERMINAL_GROUP_LESSONS_ENABLED) {
        TERMINAL_INSTRUCTOR_SERVICE_ENABLED = true;
      }
      TERMINAL_GROUP_SECTION_TITLE = (typeof TERMINAL_GROUP_SECTION_TITLE === 'string' && TERMINAL_GROUP_SECTION_TITLE.trim())
        ? TERMINAL_GROUP_SECTION_TITLE.trim()
        : 'Групповые занятия';
      TERMINAL_GROUP_PAYMENT_ENABLED = data.group_payment_enabled !== false;
      TERMINAL_GROUP_FREE_BOOKING_ENABLED = data.group_free_booking_enabled !== false;
      applyTicketSectionSettings();
      applySkipassTopupSectionSettings();
      applyRentalSectionSettings();
      applyVisitSectionSettings();
      applyGroupSectionSettings();
      populateMainBannerCarousel();
      TERMINAL_SPLASH_IMAGE = getImageSource(data.splash_image || '');
      applySplashImage();
      if (data.categories && data.categories.length > 0) {
        loadedCategories = data.categories;
        renderCategories(data.categories);
        console.log('[API] Loaded ' + data.categories.length + ' categories');
      }
    } catch (e) {
      console.error('[API] Parse error:', e);
    }
  };
  xhr.onerror = function() { console.error('[API] Network error'); };
  xhr.ontimeout = function() { console.error('[API] Timeout'); };
  xhr.send('{}'); // credentials injected by server.py
}

function renderCategories(categories) {
  assignCategoryScreens(categories);
  updateMainCategoryCards(categories);
  if (!TERMINAL_TICKET_SECTION_ENABLED) {
    SCREEN_BANNERS = emptyScreenBanners();
    populateScreenBanners();
    return;
  }

  SCREEN_BANNERS = buildScreenBanners();

  categories.forEach(function(cat) {
    var screenKey = getScreenKeyForCategory(cat);
    if (!screenKey) return;
    var screenId = 'screen-' + screenKey;
    var screen = document.getElementById(screenId);
    if (!screen) return;

    var categoryPhotos = getCategoryPhotoSources(cat);
    if (TERMINAL_CAROUSEL_ENABLED && categoryPhotos.length > 0) {
      var existingBanners = SCREEN_BANNERS[screenKey] || [];
      categoryPhotos.slice().reverse().forEach(function(src) {
        var existingIndex = existingBanners.indexOf(src);
        if (existingIndex !== -1) {
          existingBanners.splice(existingIndex, 1);
        }
        existingBanners.unshift(src);
      });
      SCREEN_BANNERS[screenKey] = existingBanners;
    }

    // Update title
    var titleEl = screen.querySelector('.tkt-title');
    if (titleEl && cat.category_name) titleEl.textContent = cat.category_name;

    // Update description (preserve line breaks from API)
    var descEl = screen.querySelector('.tkt-description p');
    var description = cat.category_description || cat.description || '';
    if (descEl && description) {
      var safe = description
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\r\n/g, '<br>').replace(/\n/g, '<br>').replace(/\r/g, '<br>');
      descEl.innerHTML = safe;
    }

    // Render tariffs (filtered by today's day type)
    var rowsContainer = screen.querySelector('.tkt-rows');
    if (!rowsContainer) return;
    rowsContainer.innerHTML = '';

    var tariffs = cat.category_tariffs || [];
    var todayType = getTodayDayType();
    var filteredTariffs = tariffs;
    if (todayType && tariffs.length > 0) {
      filteredTariffs = tariffs.filter(function(t) {
        return isTariffAvailableForToday(t, todayType);
      });
    }

    if (filteredTariffs.length === 0) {
      // No tariffs — show unavailable message
      var msg = document.createElement('div');
      msg.className = 'tkt-unavailable';
      msg.setAttribute('data-i18n', 'tickets.unavailable');
      msg.textContent = t('tickets.unavailable');
      rowsContainer.appendChild(msg);
      // Hide pay button
      var payBtn = screen.querySelector('.tkt-pay-btn');
      if (payBtn) payBtn.style.display = 'none';
    } else {
      // Show pay button
      var payBtn = screen.querySelector('.tkt-pay-btn');
      if (payBtn) payBtn.style.display = '';

      filteredTariffs.forEach(function(tariff) {
        var row = document.createElement('div');
        row.className = 'tkt-row';
        row.dataset.price = tariff.price;
        row.dataset.tariffId = tariff.id;
        row.dataset.categoryId = cat.category_id;
        row.dataset.dayType = tariff.day_type || '';
        row.dataset.age = tariff.age || '';
        row.innerHTML =
          '<span class="tkt-pill">' + tariff.name + '</span>' +
          '<span class="tkt-price">' + formatPrice(parseInt(tariff.price)) + ' ₽</span>' +
          '<div class="tkt-counter">' +
            '<button class="tkt-counter-btn tkt-counter-btn--minus" onclick="changeQty(this, -1)">−</button>' +
            '<span class="tkt-counter-val">0</span>' +
            '<button class="tkt-counter-btn tkt-counter-btn--plus" onclick="changeQty(this, 1)">+</button>' +
          '</div>';
        rowsContainer.appendChild(row);
      });
    }
  });

  populateScreenBanners();

  lucide.createIcons();
  // Re-apply translations after dynamic content is rendered
  if (window.i18n) {
    i18n.applyTranslations();
  }
}

function translateApiContent(categories) {
  var lang = window.i18n ? i18n.getCurrentLang() : 'ru';
  if (lang === 'ru') return;

  categories.forEach(function(cat) {
    var screenKey = getScreenKeyForCategory(cat);
    if (!screenKey) return;
    var screen = document.getElementById('screen-' + screenKey);
    if (!screen) return;

    // Collect all texts to translate in one batch: name + tariff names
    // (descriptions handled separately due to length)
    var shortTexts = [];
    var shortTargets = []; // { el, type }

    // Category name
    var titleEl = screen.querySelector('.tkt-title');
    if (titleEl && cat.category_name) {
      shortTexts.push(cat.category_name);
      shortTargets.push({ el: titleEl, type: 'text' });
    }

    // Tariff names (from original API data, not DOM)
    var tariffs = cat.category_tariffs || [];
    var todayType = getTodayDayType();
    var filtered = tariffs;
    if (todayType && tariffs.length > 0) {
      filtered = tariffs.filter(function(t) { return isTariffAvailableForToday(t, todayType); });
    }
    var pills = screen.querySelectorAll('.tkt-row .tkt-pill');
    filtered.forEach(function(tariff, i) {
      if (tariff.name && pills[i]) {
        shortTexts.push(tariff.name);
        shortTargets.push({ el: pills[i], type: 'text' });
      }
    });

    // Batch translate short texts (join with separator, split after)
    if (shortTexts.length > 0) {
      var SEP = ' ||| ';
      var joined = shortTexts.join(SEP);
      translateText(joined, lang, function(translated) {
        var parts = translated.split(/\s*\|\|\|\s*/);
        for (var i = 0; i < shortTargets.length; i++) {
          if (parts[i]) shortTargets[i].el.textContent = parts[i].trim();
        }
      });
    }

    // Translate description separately (can be long)
    var descEl = screen.querySelector('.tkt-description p');
    var description = cat.category_description || cat.description || '';
    if (descEl && description) {
      // Strip \r\n for translation, restore <br> after
      var plain = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      translateText(plain, lang, function(translated) {
        var safe = translated
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
        descEl.innerHTML = safe;
      });
    }
  });
}

// Populate ticket screen carousels from API-provided SCREEN_BANNERS only.
function populateScreenBanners() {
  CATEGORY_SCREEN_SEQUENCE.forEach(function(screenKey) {
    var screenId = 'screen-' + screenKey;
    var screen = document.getElementById(screenId);
    if (!screen) return;
    var carousel = screen.querySelector('.tkt-carousel');
    var track = screen.querySelector('.tkt-carousel-track');
    if (!track) return;
    var banners = SCREEN_BANNERS[screenKey];
    track.innerHTML = '';

    if (!TERMINAL_CAROUSEL_ENABLED || !banners || banners.length === 0) {
      if (carousel) carousel.style.display = 'none';
      return;
    }

    if (carousel) carousel.style.display = '';
    banners.forEach(function(src) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = screenKey;
      img.className = 'tkt-carousel-slide';
      track.appendChild(img);
    });
  });
  initTicketCarousels();
}
// Load categories on startup (banners populated later after all code is defined)
loadCategories();

// Schedule daily reload at 23:55 (update ticket types for next day)
(function scheduleDailyReload() {
  var now = new Date();
  var target = new Date(now);
  target.setHours(23, 55, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);
  var delay = target - now;
  setTimeout(function() {
    console.log('[API] Daily reload at 23:55');
    loadCategories();
    scheduleDailyReload();
  }, delay);
  console.log('[API] Next daily reload in ' + Math.round(delay / 60000) + ' min');
})();

// === Navigation ===
const screenMap = {
  'splash': 'screen-splash',
  'main': 'screen-main',
  'scan-card': 'screen-scan-card',
  'topup': 'screen-topup',
  'tickets': 'screen-tickets',
  'alpaka': 'screen-alpaka',
  'museum': 'screen-museum',
  'skypark': 'screen-skypark',
  'rental': 'screen-rental',
  'visits': 'screen-visits',
  'groups': 'screen-groups',
  'instructors': 'screen-instructors',
  'payment': 'screen-payment',
  'sbp': 'screen-sbp',
  'success': 'screen-success'
};

function navigateTo(screenName) {
  if (!TERMINAL_TICKET_SECTION_ENABLED && isTicketScreen(screenName)) {
    navigateTo('main');
    return;
  }

  const targetId = screenMap[screenName];
  if (!targetId) return;

  document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(targetId);
  if (target) {
    target.classList.add('active');
    target.querySelectorAll('.main-content, .topup-wrap, .tkt-scroll, .tkt-card, .rent-content, .groups-content, .instructors-content, .visits-content')
      .forEach(el => el.scrollTop = 0);
  }

  // Reset ticket/rental counters when navigating to those screens
  if (screenName === 'tickets') resetTickets();
  if (screenName === 'alpaka') resetScreen('screen-alpaka', 'alpaka-total');
  if (screenName === 'museum') resetScreen('screen-museum', 'museum-total');
  if (screenName === 'skypark') resetScreen('screen-skypark', 'skypark-total');
  if (screenName === 'rental') resetRental();
  if (screenName === 'visits') renderVisitSlots();
  if (screenName === 'groups') renderGroups();
  if (screenName === 'instructors') renderInstructors();

  // Reset language to Russian when returning to splash
  if (screenName === 'splash' && window.i18n && i18n.getCurrentLang() !== 'ru') {
    setLanguage('ru');
  }
}

function resetTickets() {
  document.querySelectorAll('#screen-tickets .tkt-row').forEach(function(row) {
    row.classList.remove('tkt-row--selected');
    var val = row.querySelector('.tkt-counter-val');
    if (val) val.textContent = '0';
  });
  var comboVal = document.querySelector('.tkt-combo-counter-val');
  if (comboVal) comboVal.textContent = '0';
  var totalEl = document.getElementById('tickets-total');
  if (totalEl) totalEl.textContent = '0 ₽';
}

function resetRental() {
  document.querySelectorAll('#screen-rental .rent-qty-row').forEach(function(row) {
    row.classList.remove('rent-qty-row--selected');
    var val = row.querySelector('.rent-counter-val');
    if (val) val.textContent = '0';
  });
  var totalEl = document.getElementById('rental-total');
  if (totalEl) totalEl.textContent = '0 ₽';
}

function resetScreen(screenId, totalId) {
  document.querySelectorAll('#' + screenId + ' .tkt-row').forEach(function(row) {
    row.classList.remove('tkt-row--selected');
    var val = row.querySelector('.tkt-counter-val');
    if (val) val.textContent = '0';
  });
  var totalEl = document.getElementById(totalId);
  if (totalEl) totalEl.textContent = '0 ₽';
}

// === Toast/Alert ===
let toastTimer = null;
function showAlert(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

// === Tab switching ===
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  const tabs = tab.parentElement;
  tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
});

// === Price selection (topup) ===
function selectPrice(el, price) {
  const card = el.closest('.topup-card');
  card.querySelectorAll('.topup-price-cell').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
}

// === Ticket quantity ===
function changeQty(btn, delta) {
  const counter = btn.closest('.tkt-counter');
  const valueEl = counter.querySelector('.tkt-counter-val');
  const row = btn.closest('.tkt-row');
  let val = parseInt(valueEl.textContent) + delta;
  if (val < 0) val = 0;
  valueEl.textContent = val;

  if (val > 0) {
    row.classList.add('tkt-row--selected');
  } else {
    row.classList.remove('tkt-row--selected');
  }

  updateTicketsTotal();
}

function updateTicketsTotal() {
  // Find currently active ticket screen
  var screens = [
    { id: 'screen-tickets', totalId: 'tickets-total', hasCombo: true },
    { id: 'screen-alpaka', totalId: 'alpaka-total', hasCombo: false },
    { id: 'screen-museum', totalId: 'museum-total', hasCombo: false },
    { id: 'screen-skypark', totalId: 'skypark-total', hasCombo: false }
  ];

  for (var s = 0; s < screens.length; s++) {
    var screen = document.getElementById(screens[s].id);
    if (!screen || !screen.classList.contains('active')) continue;

    var rows = screen.querySelectorAll('.tkt-row');
    var total = 0;
    rows.forEach(function(row) {
      var price = parseInt(row.dataset.price);
      var qty = parseInt(row.querySelector('.tkt-counter-val').textContent);
      total += price * qty;
    });

    if (screens[s].hasCombo) {
      var comboVal = document.querySelector('.tkt-combo-counter-val');
      if (comboVal) total += parseInt(comboVal.textContent) * 4500;
    }

    var el = document.getElementById(screens[s].totalId);
    if (el) el.textContent = total > 0 ? formatPrice(total) + ' ₽' : '0 ₽';
    break;
  }
}

// === Combo quantity ===
function changeComboQty(btn, delta) {
  const valEl = btn.closest('.tkt-combo-counter').querySelector('.tkt-combo-counter-val');
  let val = parseInt(valEl.textContent) + delta;
  if (val < 0) val = 0;
  valEl.textContent = val;
  updateTicketsTotal();
}

// === Rental quantity ===
function changeRentalQty(btn, delta) {
  const counter = btn.closest('.rent-counter');
  const valueEl = counter.querySelector('.rent-counter-val');
  const row = btn.closest('.rent-qty-row');
  let val = parseInt(valueEl.textContent) + delta;
  if (val < 0) val = 0;
  valueEl.textContent = val;

  if (val > 0) {
    row.classList.add('rent-qty-row--selected');
  } else {
    row.classList.remove('rent-qty-row--selected');
  }

  updateRentalTotal();
}

function updateRentalTotal() {
  const rows = document.querySelectorAll('#screen-rental .rent-qty-row');
  let total = 0;
  rows.forEach(row => {
    const priceText = row.querySelector('.rent-qty-price').textContent;
    const price = parseInt(priceText.replace(/\s/g, '').replace('₽', ''));
    const qty = parseInt(row.querySelector('.rent-counter-val').textContent);
    total += price * qty;
  });
  const el = document.getElementById('rental-total');
  if (el) {
    el.textContent = total > 0 ? formatPrice(total) + ' ₽' : '0 ₽';
  }
}

function formatPrice(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// === Ticket Carousels (with auto-rotation) ===
var tktCarouselTimers = [];

function initTicketCarousels() {
  // Clear previous timers
  tktCarouselTimers.forEach(function(t) { clearInterval(t); });
  tktCarouselTimers = [];

  document.querySelectorAll('[data-carousel]').forEach(function(carousel) {
    var track = carousel.querySelector('.tkt-carousel-track');
    var dotsWrap = carousel.querySelector('.tkt-carousel-dots');
    if (!track || !dotsWrap) return;
    var slides = track.querySelectorAll('.tkt-carousel-slide');
    if (slides.length === 0) return;

    dotsWrap.innerHTML = '';
    var current = 0;

    function goTo(idx) {
      current = idx;
      track.scrollTo({ left: idx * track.offsetWidth, behavior: 'smooth' });
      var allDots = dotsWrap.querySelectorAll('.tkt-carousel-dot');
      allDots.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
    }

    slides.forEach(function(_, i) {
      var dot = document.createElement('button');
      dot.className = 'tkt-carousel-dot' + (i === 0 ? ' active' : '');
      dot.onclick = function() { goTo(i); };
      dotsWrap.appendChild(dot);
    });

    if (slides.length <= 1) { dotsWrap.style.display = 'none'; return; }
    dotsWrap.style.display = '';

    // Sync dots on manual scroll
    track.addEventListener('scroll', function() {
      var idx = Math.round(track.scrollLeft / track.offsetWidth);
      if (idx !== current) {
        current = idx;
        var allDots = dotsWrap.querySelectorAll('.tkt-carousel-dot');
        allDots.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
      }
    });

    // Auto-rotate every 10 seconds
    var timer = setInterval(function() {
      var next = (current + 1) % slides.length;
      goTo(next);
    }, 10000);
    tktCarouselTimers.push(timer);
  });
}
populateScreenBanners();


// === Easter egg (5 taps on weather card) ===
(function() {
  var taps = 0;
  var tapTimer = null;
  var weatherCard = document.getElementById('weather-temp');
  if (!weatherCard) return;
  var card = weatherCard.closest('.info-card');
  if (!card) return;
  card.addEventListener('click', function(e) {
    e.stopPropagation();
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function() { taps = 0; }, 2000);
    if (taps >= 5) {
      taps = 0;
      var egg = document.getElementById('easter-egg');
      if (!egg || egg.classList.contains('visible')) return;
      egg.classList.add('visible');
      setTimeout(function() { egg.classList.remove('visible'); }, 5000);
    }
  });
})();

// === Easter egg: Statham quotes (5 taps on time card) ===
var STATHAM_QUOTES = [
  'Если упал — вставай. Если нет денег — найди деньги.',
  'Работа — не волк. Никто не волк. Только волк — волк.',
  'Запомни: всего одна ошибка — и ты ошибся.',
  'Делай как надо. Как не надо — не делай.',
  'Слово — не воробей. Вообще ничто не воробей, кроме самого воробья.',
  'Если закрыть глаза — становится темно.',
  'В жизни всегда есть две дороги: одна — первая, а другая — вторая.',
  'Кто рано встаёт — тому весь день спать хочется.',
  'Шаг влево, шаг вправо — два шага.',
  'Никогда не сдавайтесь, идите к своей цели! А если будет сложно — сдавайтесь.',
  'Как говорил мой дед: «Я твой дед».',
  'Если тебя незаслуженно обидели — вернись и заслужи.',
  'Жи-ши пиши от души.',
  'Тут — это вам не там.',
  'Марианскую впадину знаешь? Это я упал.',
  'Без подошвы тапочки — это просто тряпочки.',
  'Сила — не в бабках. Ведь бабки — уже старые.',
  'Я живу, как карта ляжет. Ты живёшь, как мамка скажет.',
  'Работа — это не волк. Работа — ворк. А волк — это ходить.',
  'Если в Монголии — монгол, то в Чехии — чехол.',
  'На первый урок можно и опоздать, ведь учиться никогда не поздно.',
  'Если жизнь — это вызов, я перезвоню.',
  'Никогда не откладывай на завтра то, на что можно забить сегодня.',
  'Жизнь — не сахар, в этом вся соль.',
  'Красиво делай — красиво будет.',
  'Единственный, кто тебя поддерживает — твой позвоночник.',
  'Чтобы быть богатым, нужно всего лишь не быть бедным.',
  'Если заблудился в лесу — иди домой.',
  'Я лысый не потому, что у меня нет волос, а потому, что у волос нет меня.',
  'Бессмысленно осмысливать смысл неосмысленными мыслями.',
  'Не спеши, а то успеешь.',
  'Я два раза, два раза не повторяю, повторяю.',
  'Лёг пораньше, встал попозже. Народная мудрость.',
  'Даже если у тебя сейчас в жизни тёмная полоса — помни, что в любой момент она может оказаться взлётной.',
  'Запомните, а то забудете.',
  'Суп из одной рыбы называется уха. А суп из пяти рыб — ухахахахаха.',
  'Тот, кто знает… знает.',
  'Некоторые люди — как муравьи. Всегда какую-то ерунду несут.',
  'Если обидели — не обижайся. Если ударили — не ударяйся.',
  'Иди домой, ты устал.',
  'Если нет — то нет. А если да — то да.',
  'Жизнь нужно прожить так, чтобы голуби, пролетая над твоим памятником, терпели из уважения.',
  'Не рой другому яму — сам упадёшь. Копай бассейн — больше пользы.',
  'Знание — сила. Незнание — тоже сила, но поменьше.',
  'Сколько бы ты ни спал — всё равно хочется.',
  'На вкус и цвет все фломастеры разные.',
  'Лучше синица в руке, чем утка под кроватью.',
  'Тише едешь — меньше ям заметишь.',
  'Не всё то золото, что блестит. Иногда это я.',
  'Молчание — золото. Но попробуй расплатиться им в магазине.',
  'Рыбак рыбака видит издалека. А Стетхэм видит всех.',
  'Один в поле не воин. Но если это я — то воин.'
];
(function() {
  var taps = 0;
  var tapTimer = null;
  var quoteIndex = parseInt(localStorage.getItem('statham_index') || '0');
  var timeCard = document.getElementById('current-time');
  if (!timeCard) return;
  var card = timeCard.closest('.info-card');
  if (!card) return;
  card.addEventListener('click', function(e) {
    e.stopPropagation();
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function() { taps = 0; }, 2000);
    if (taps >= 5) {
      taps = 0;
      var egg = document.getElementById('statham-egg');
      var quoteEl = document.getElementById('statham-egg-quote');
      if (!egg || egg.classList.contains('visible')) return;
      quoteEl.textContent = '«' + STATHAM_QUOTES[quoteIndex % STATHAM_QUOTES.length] + '»';
      quoteIndex++;
      localStorage.setItem('statham_index', String(quoteIndex));
      egg.classList.add('visible');
      setTimeout(function() { egg.classList.remove('visible'); }, 7000);
    }
  });
})();

// === Date & time display (localized) ===
var DATE_LOCALES = { ru: 'ru-RU', en: 'en-US', ar: 'ar-SA', zh: 'zh-CN' };
function updateDateTime() {
  var now = new Date();
  var lang = (window.i18n ? i18n.getCurrentLang() : 'ru');
  var locale = DATE_LOCALES[lang] || 'ru-RU';
  var dateEl = document.getElementById('current-date');
  var weekdayEl = document.getElementById('current-weekday');
  var timeEl = document.getElementById('current-time');
  if (dateEl) dateEl.textContent = now.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  if (weekdayEl) weekdayEl.textContent = now.toLocaleDateString(locale, { weekday: 'long' });
  if (timeEl) timeEl.textContent = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
updateDateTime();
setInterval(updateDateTime, 10000);

// === Weather (Open-Meteo, Воробьёвы горы) ===
function updateWeather() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://api.open-meteo.com/v1/forecast?latitude=55.71&longitude=37.54&current=temperature_2m&timezone=Europe/Moscow', true);
  xhr.timeout = 10000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      var temp = Math.round(data.current.temperature_2m);
      var sign = temp > 0 ? '+' : '';
      var el = document.getElementById('weather-temp');
      if (el) el.textContent = sign + temp + '°C';
      var splashEl = document.getElementById('splash-weather-temp');
      if (splashEl) splashEl.textContent = sign + temp + '°C';
    } catch (e) { console.error('[WEATHER] Parse error:', e); }
  };
  xhr.onerror = function() { console.error('[WEATHER] Network error'); };
  xhr.send();
}

updateWeather();
setInterval(updateWeather, 600000); // обновлять каждые 10 минут

// === Auto-return to splash after inactivity ===
let inactivityTimer = null;
let inactivityCountdownTimer = null;
const INACTIVITY_TIMEOUT = 20000; // 20 seconds before warning
const INACTIVITY_COUNTDOWN = 10;  // 10 second countdown in modal

let paymentInProgress = false;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  clearInterval(inactivityCountdownTimer);
  hideInactivityModal();
  var splashEl = document.getElementById('screen-splash');
  if (splashEl && splashEl.classList.contains('active')) return;
  if (paymentInProgress) return;
  inactivityTimer = setTimeout(showInactivityModal, INACTIVITY_TIMEOUT);
}

function showInactivityModal() {
  var modal = document.getElementById('inactivity-modal');
  var countEl = document.getElementById('inactivity-countdown');
  if (!modal) return;
  var remaining = INACTIVITY_COUNTDOWN;
  if (countEl) countEl.textContent = remaining;
  modal.classList.add('active');

  clearInterval(inactivityCountdownTimer);
  inactivityCountdownTimer = setInterval(function() {
    remaining--;
    if (countEl) countEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(inactivityCountdownTimer);
      hideInactivityModal();
      clearInterval(countdownInterval);
      clearTimeout(successTimer);
      clearInterval(sbpCountdownInterval);
      clearTimeout(sbpTimer);
      navigateTo('splash');
    }
  }, 1000);
}

function hideInactivityModal() {
  var modal = document.getElementById('inactivity-modal');
  if (modal) modal.classList.remove('active');
}

function dismissInactivity() {
  resetInactivityTimer();
}

function goToSplashNow() {
  clearTimeout(inactivityTimer);
  clearInterval(inactivityCountdownTimer);
  hideInactivityModal();
  clearInterval(countdownInterval);
  clearTimeout(successTimer);
  clearInterval(sbpCountdownInterval);
  clearTimeout(sbpTimer);
  navigateTo('splash');
}

var _inactivityJustDismissed = false;
function handleInactivityDismiss(e) {
  var modal = document.getElementById('inactivity-modal');
  if (modal && modal.classList.contains('active')) {
    if (e.target.closest('.inactivity-btn')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    _inactivityJustDismissed = true;
    resetInactivityTimer();
    setTimeout(function() { _inactivityJustDismissed = false; }, 400);
    return;
  }
  // Block any click that happens right after modal dismiss
  if (_inactivityJustDismissed) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  resetInactivityTimer();
}
document.addEventListener('click', handleInactivityDismiss, true);
document.addEventListener('touchstart', handleInactivityDismiss, true);
document.addEventListener('touchend', function(e) {
  if (_inactivityJustDismissed) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);
resetInactivityTimer();

// === Payment Processing ===
let successTimer = null;
let countdownInterval = null;
let sbpTimer = null;
let sbpCountdownInterval = null;
let paymentSourceScreen = null; // 'tickets' or 'rental'
let pendingCartItems = [];
let pendingCartTotal = 0;
let lastPaymentRRN = '';
let lastPaymentAuthCode = '';
let lastPaymentCardNumber = '';
let paymentAbortController = null;

// Collect selected items from any ticket screen
function collectTicketItems(screenId) {
  const items = [];
  document.querySelectorAll('#' + screenId + ' .tkt-row').forEach(row => {
    const qty = parseInt(row.querySelector('.tkt-counter-val').textContent);
    if (qty > 0) {
      const name = row.querySelector('.tkt-pill').textContent.trim();
      const price = parseInt(row.dataset.price);
      const tariffId = row.dataset.tariffId || null;
      const categoryId = row.dataset.categoryId || null;
      const dayType = row.dataset.dayType || '';
      const age = row.dataset.age || '';
      items.push({ name: name, price: price, qty: qty, tariffId: tariffId, categoryId: categoryId, dayType: dayType, age: age });
    }
  });
  // Combo counter (only on tickets screen)
  if (screenId === 'screen-tickets') {
    const comboVal = document.querySelector('.tkt-combo-counter-val');
    if (comboVal) {
      const qty = parseInt(comboVal.textContent);
      if (qty > 0) {
        items.push({ name: 'Комбо: Канатная дорога + Парк Альпак', price: 4500, qty: qty });
      }
    }
  }
  return items;
}

// Collect selected items from rental screen
function collectRentalItems() {
  const items = [];
  document.querySelectorAll('#screen-rental .rent-qty-row').forEach(row => {
    const qty = parseInt(row.querySelector('.rent-counter-val').textContent);
    if (qty > 0) {
      const name = 'Прокат: ' + row.querySelector('.rent-qty-pill').textContent.trim();
      const price = parseInt(row.dataset.price);
      items.push({ name: name, price: price, qty: qty });
    }
  });
  return items;
}

// Calculate total from items
function calculateTotal(items) {
  return items.reduce(function(sum, item) {
    return sum + item.price * item.qty;
  }, 0);
}

// Step 1: User clicks ОПЛАТИТЬ → collect cart, show payment methods
function processPayment() {
  // Determine which screen is active
  var ticketScreens = ['tickets', 'alpaka', 'museum', 'skypark'];
  paymentSourceScreen = null;
  pendingCartItems = [];

  for (var i = 0; i < ticketScreens.length; i++) {
    var sid = 'screen-' + ticketScreens[i];
    var el = document.getElementById(sid);
    if (el && el.classList.contains('active')) {
      paymentSourceScreen = ticketScreens[i];
      pendingCartItems = collectTicketItems(sid);
      break;
    }
  }

  if (!paymentSourceScreen) {
    var rentalScreen = document.getElementById('screen-rental');
    if (rentalScreen && rentalScreen.classList.contains('active')) {
      paymentSourceScreen = 'rental';
      pendingCartItems = collectRentalItems();
    }
  }

  pendingCartTotal = calculateTotal(pendingCartItems);

  if (pendingCartItems.length === 0 || pendingCartTotal === 0) {
    showAlert(t('alerts.select_item'));
    return;
  }

  // Show total on payment screen
  const payTotalEl = document.getElementById('pay-total-value');
  if (payTotalEl) payTotalEl.textContent = formatPrice(pendingCartTotal) + ' ₽';

  // Populate order summary
  const orderItems = document.getElementById('pay-order-items');
  if (orderItems) {
    orderItems.innerHTML = '';
    pendingCartItems.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'pay-order-row';
      row.innerHTML = '<div class="pay-order-row-name"><span class="pay-order-dot"></span><span class="pay-order-row-label">' +
        item.name + ' × ' + item.qty + '</span></div><span class="pay-order-row-price">' +
        formatPrice(item.price * item.qty) + ' ₽</span>';
      orderItems.appendChild(row);
    });
  }

  // Navigate to payment screen then immediately start card payment
  navigateTo('payment');
  payByCard();
}

// Back from payment method screen
function goBackFromPayment() {
  hidePaymentLoader();
  if (paymentSourceScreen === 'rental-order') {
    pendingRentalPaymentOrder = null;
    navigateTo('main');
    return;
  }

  if (paymentSourceScreen === 'group') {
    navigateTo('groups');
    return;
  }

  if (paymentSourceScreen === 'individual-instructor') {
    navigateTo('instructors');
    return;
  }

  if (paymentSourceScreen === 'visit') {
    cancelPendingVisitHold();
    navigateTo('visits');
    loadVisitAvailability();
    return;
  }

  if (paymentSourceScreen) {
    navigateTo(paymentSourceScreen);
  } else {
    navigateTo('main');
  }
}

function showPaymentLoader(text, options) {
  var loader = document.getElementById('payment-loader');
  var cardView = document.getElementById('payment-loader-card');
  var genericView = document.getElementById('payment-loader-generic');

  if (options && options.showCard) {
    // Card payment mode: show amount prominently
    if (cardView) cardView.style.display = '';
    if (genericView) genericView.style.display = 'none';

    var amountEl = document.getElementById('payment-loader-amount');
    if (amountEl) amountEl.textContent = formatPrice(options.amount || 0) + ' \u20BD';
  } else {
    // Generic loader mode
    if (cardView) cardView.style.display = 'none';
    if (genericView) genericView.style.display = '';
    var loaderText = genericView ? genericView.querySelector('.payment-loader-text') : null;
    if (loaderText) loaderText.textContent = text || t('pay.processing');
  }

  if (loader) loader.classList.add('active');
}

function hidePaymentLoader() {
  var loader = document.getElementById('payment-loader');
  if (loader) loader.classList.remove('active');
}


// Step 2a: Pay by card (PAX S300 via INPAS DualConnector)
function payByCard() {
  var amountKopecks = pendingCartTotal * 100;
  var orderId = 'VG-' + Date.now().toString(36).toUpperCase();

  // Pause inactivity timer during payment
  paymentInProgress = true;
  clearTimeout(inactivityTimer);
  clearInterval(inactivityCountdownTimer);
  hideInactivityModal();

  // Update status text on payment screen
  var statusText = document.querySelector('.pay-status-text');
  if (statusText) statusText.textContent = t('pay.card_hint');

  // AbortController for 50s timeout (DC timeout is 45s)
  paymentAbortController = new AbortController();
  var timeoutId = setTimeout(function() {
    paymentAbortController.abort();
  }, 50000);

  fetch('http://localhost:5050/api/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: paymentAbortController.signal,
    body: JSON.stringify({ amount: amountKopecks, order_id: orderId })
  })
  .then(function(response) { return response.json(); })
  .then(function(data) {
    clearTimeout(timeoutId);
    paymentInProgress = false;
    if (data.success) {
      lastPaymentRRN = data.rrn || '';
      lastPaymentAuthCode = data.authorization_code || '';
      lastPaymentCardNumber = data.card_number || '';
      completePayment('Банковская карта');
    } else {
      var errorMsg = data.message || data.error || t('alerts.payment_declined');
      showAlert(errorMsg);
      goBackFromPayment();
    }
  })
  .catch(function(err) {
    clearTimeout(timeoutId);
    paymentInProgress = false;
    if (err.name === 'AbortError') {
      showAlert(t('alerts.payment_timeout'));
    } else {
      console.error('[PAY] Error:', err);
      showAlert(t('alerts.connection_error'));
    }
    goBackFromPayment();
  });
}

// Step 2b: Pay by SBP — show QR code
function payBySBP() {
  // Show amount
  const sbpAmountEl = document.getElementById('sbp-amount-value');
  if (sbpAmountEl) sbpAmountEl.textContent = formatPrice(pendingCartTotal) + ' ₽';

  navigateTo('sbp');
  lucide.createIcons();

  // Generate SBP QR code (simulated payment URL)
  var sbpPaymentId = 'AD' + Date.now().toString(36).toUpperCase();
  var sbpUrl = 'https://qr.nspk.ru/' + sbpPaymentId + '?type=02&bank=&sum=' + (pendingCartTotal * 100) + '&cur=RUB&crc=0000';

  var canvas = document.getElementById('sbp-qr-canvas');
  if (canvas) {
    TicketService.renderQRToCanvas(canvas, sbpUrl, 280);
  }

  // Start SBP countdown (120 seconds)
  var remaining = 120;
  var countdownEl = document.getElementById('sbp-countdown');
  if (countdownEl) countdownEl.textContent = remaining;

  clearInterval(sbpCountdownInterval);
  clearTimeout(sbpTimer);

  sbpCountdownInterval = setInterval(function() {
    remaining--;
    if (countdownEl) countdownEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(sbpCountdownInterval);
      showAlert(t('alerts.sbp_timeout'));
      navigateTo('payment');
    }
  }, 1000);

  // Simulate successful payment after 8 seconds (for demo)
  sbpTimer = setTimeout(function() {
    clearInterval(sbpCountdownInterval);
    completePayment('СБП');
  }, 8000);
}

// Cancel SBP payment
function cancelSBP() {
  clearInterval(sbpCountdownInterval);
  clearTimeout(sbpTimer);
  navigateTo('payment');
}

// Step 2c: Free payment — immediate ticket
function payFree() {
  showPaymentLoader('Оформление билетов...');
  setTimeout(function() {
    hidePaymentLoader();
    completePayment('Без оплаты');
  }, 1500);
}

// Step 3: Complete payment — register in Eskimos, create tickets, print
var pendingTickets = [];
var lastPaymentMethod = '';
var lastPaymentCode = '';

function generatePaymentCode() {
  // UUID v4-like unique payment code
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function registerTicketsInEskimos(paymentCode, callback) {
  // Build tickets array for Eskimos API
  var tickets = [];
  for (var i = 0; i < pendingCartItems.length; i++) {
    var item = pendingCartItems[i];
    for (var q = 0; q < item.qty; q++) {
      tickets.push({
        terminal_id: '1',
        category_id: item.categoryId || '1',
        type_id: item.tariffId || '1',
        price: String(item.price),
        day_type: item.dayType || 'weekday',
        age: item.age || 'adult'
      });
    }
  }

  var requestBody = {
    // terminal_code injected by server.py from .env
    transaction: {
      terminal_order_id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      terminal_payment_code: paymentCode,
      sum: String(pendingCartTotal),
      tickets: tickets
    }
  };

  console.log('[ESKIMOS] Creating tickets:', JSON.stringify(requestBody));

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/tickets/create', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (data.error) {
        console.error('[ESKIMOS] Error:', data.message);
        callback(null, data.message);
      } else {
        console.log('[ESKIMOS] Tickets created:', data);
        // Extract ticket_codes from response
        var ticketCodes = [];
        if (data.transaction && data.transaction.tickets) {
          data.transaction.tickets.forEach(function(t) {
            var code = t.ticket_code || t.ticket_number;
            if (code) ticketCodes.push(code);
          });
        }
        callback(ticketCodes, null);
      }
    } catch (e) {
      console.error('[ESKIMOS] Parse error:', e);
      callback(null, 'Ошибка обработки ответа');
    }
  };
  xhr.onerror = function() {
    console.error('[ESKIMOS] Network error');
    callback(null, 'Ошибка сети');
  };
  xhr.ontimeout = function() {
    console.error('[ESKIMOS] Timeout');
    callback(null, 'Таймаут сервера');
  };
  xhr.send(JSON.stringify(requestBody));
}

function completePayment(paymentMethod) {
  if (paymentSourceScreen === 'rental-order') {
    completeRentalOrderPayment(paymentMethod);
    return;
  }

  if (paymentSourceScreen === 'group') {
    createTerminalGroupBooking(paymentMethod);
    return;
  }

  if (paymentSourceScreen === 'individual-instructor') {
    createTerminalInstructorBooking(paymentMethod);
    return;
  }

  if (paymentSourceScreen === 'visit') {
    createTerminalVisitPayment(paymentMethod);
    return;
  }

  lastPaymentMethod = paymentMethod;
  pendingTickets = [];

  var paymentCode = generatePaymentCode();
  lastPaymentCode = paymentCode;

  showPrintLoader();

  // Register tickets in Eskimos first, then create and print
  registerTicketsInEskimos(paymentCode, function(ticketCodes, error) {
    if (error) {
      console.warn('[ESKIMOS] Registration failed, printing local tickets:', error);
    }

    // Create one ticket per item unit, using Eskimos ticket_codes for QR
    try {
      var codeIndex = 0;
      for (var i = 0; i < pendingCartItems.length; i++) {
        var item = pendingCartItems[i];
        for (var q = 0; q < item.qty; q++) {
          var singleItem = [{ name: item.name, price: item.price, qty: 1 }];
          var ticket = TicketService.createTicket(singleItem, item.price, paymentMethod);
          // Use Eskimos ticket_code for QR if available
          if (ticketCodes && ticketCodes[codeIndex]) {
            ticket.qrCode = ticketCodes[codeIndex];
          }
          codeIndex++;
          pendingTickets.push(ticket);
        }
      }
    } catch (e) {
      console.error('Ticket creation failed:', e);
      hidePrintLoader();
      showAlert(t('alerts.ticket_error'));
      return;
    }

    // Print tickets, then show success screen
    var printDone = false;
    function onPrintFinished() {
      if (printDone) return;
      printDone = true;
      hidePrintLoader();
      navigateTo('success');
      showReceiptInline();
    }

    printAllTickets(onPrintFinished);
    // Safety: if printing hangs, proceed after 8 seconds
    setTimeout(onPrintFinished, 8000);
  });
}

function completeRentalOrderPayment(paymentMethod) {
  lastPaymentMethod = paymentMethod;

  if (!pendingRentalPaymentOrder || !pendingRentalPaymentOrder.order_key) {
    showAlert('Заказ проката не выбран');
    goBackFromPayment();
    return;
  }

  var paymentCode = generatePaymentCode();
  lastPaymentCode = paymentCode;
  showPaymentLoader('Подтверждаем оплату проката...');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/rental/orders/' + encodeURIComponent(pendingRentalPaymentOrder.order_key) + '/pay', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 15000;
  xhr.onload = function() {
    hidePaymentLoader();
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400 || data.status !== 'ok') {
        throw new Error(data.message || 'Не удалось подтвердить оплату проката');
      }

      pendingRentalPaymentOrder = null;
      navigateTo('success');
      showReceiptInline();
    } catch (e) {
      console.error('[RENTAL] Pay confirm failed:', e);
      showAlert(e.message || 'Ошибка подтверждения проката');
      goBackFromPayment();
    }
  };
  xhr.onerror = function() {
    hidePaymentLoader();
    showAlert('Ошибка связи с сервером');
    goBackFromPayment();
  };
  xhr.ontimeout = function() {
    hidePaymentLoader();
    showAlert('Таймаут сервера');
    goBackFromPayment();
  };
  xhr.send(JSON.stringify({
    sum: pendingCartTotal,
    terminal_payment_code: paymentCode
  }));
}

// === Receipt (inline on success card) ===
function showReceiptInline() {
  var question = document.getElementById('success-receipt-question');
  var buttons = document.getElementById('success-receipt-buttons');
  var emailForm = document.getElementById('success-receipt-email');
  var emailInput = document.getElementById('receipt-email-input');

  if (question) question.style.display = '';
  if (buttons) buttons.style.display = 'flex';
  if (emailForm) emailForm.style.display = 'none';
  if (emailInput) emailInput.value = '';

  startSuccessCountdown();
  lucide.createIcons();
}

function receiptYes() {
  document.getElementById('success-receipt-question').style.display = 'none';
  document.getElementById('success-receipt-email').style.display = 'flex';
  document.getElementById('receipt-email-input').value = '';
  // Pause countdown while typing email
  clearInterval(countdownInterval);
  clearTimeout(successTimer);
}

function receiptNo() {
  goToMainFromSuccess();
}

function receiptBackToButtons() {
  document.getElementById('success-receipt-email').style.display = 'none';
  document.getElementById('success-receipt-question').style.display = '';
  startSuccessCountdown();
}

function receiptSendEmail() {
  var email = document.getElementById('receipt-email-input').value.trim();
  if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) {
    showAlert(t('alerts.invalid_email'));
    return;
  }

  // Send receipt via Eskimos API
  var xhr = new XMLHttpRequest();
  xhr.open('POST', LOCAL_SERVER + '/api/tickets/email', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 10000;
  xhr.onload = function() {
    console.log('[EMAIL] Sent to ' + email + ', payment_code=' + lastPaymentCode);
  };
  xhr.onerror = function() { console.error('[EMAIL] Network error'); };
  xhr.send(JSON.stringify({
    terminal_payment_code: lastPaymentCode,
    payers_email: email
  }));

  showAlert(t('alerts.receipt_sent', { email: email }));
  goToMainFromSuccess();
}

function goToMainFromSuccess() {
  clearInterval(countdownInterval);
  clearTimeout(successTimer);
  navigateTo('main');
}

// Print tickets one by one with delay between each
function showPrintLoader() {
  var loader = document.getElementById('print-loader');
  var countEl = document.getElementById('print-loader-count');
  if (countEl) countEl.textContent = '';
  if (loader) loader.classList.add('active');
}

function hidePrintLoader() {
  var loader = document.getElementById('print-loader');
  if (loader) loader.classList.remove('active');
}

function printAllTickets(onAllDone) {
  if (pendingTickets.length === 0) {
    if (onAllDone) onAllDone();
    return;
  }

  var total = pendingTickets.length;
  var countEl = document.getElementById('print-loader-count');

  function printNext(index) {
    if (index >= total) {
      var area = document.getElementById('print-area');
      if (area) area.innerHTML = '';
      if (onAllDone) onAllDone();
      return;
    }
    if (countEl) countEl.textContent = (index + 1) + ' ' + t('print.of') + ' ' + total;
    try {
      TicketService.printTicket(pendingTickets[index], function() {
        printNext(index + 1);
      });
    } catch (e) {
      console.error('Ticket print failed:', e);
      printNext(index + 1);
    }
  }

  setTimeout(function() { printNext(0); }, 500);
}

// Success countdown
function startSuccessCountdown() {
  var remaining = 15;
  var countdownEl = document.getElementById('success-countdown');
  if (countdownEl) countdownEl.textContent = remaining;

  clearInterval(countdownInterval);
  clearTimeout(successTimer);

  countdownInterval = setInterval(function() {
    remaining--;
    if (countdownEl) countdownEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);

  successTimer = setTimeout(function() {
    clearInterval(countdownInterval);
    goToMainFromSuccess();
  }, 15000);
}

// === Virtual Keyboard ===
document.addEventListener('click', function(e) {
  var key = e.target.closest('.vkb-key');
  if (!key) return;

  var input = document.getElementById('receipt-email-input');
  if (!input) return;

  var action = key.getAttribute('data-action');
  if (action === 'backspace') {
    input.value = input.value.slice(0, -1);
  } else {
    var ch = key.getAttribute('data-key');
    if (ch) input.value += ch;
  }
});

// === Main Screen Banner Carousel ===
var mainBannerState = {
  current: 0,
  total: 0,
  autoInterval: null,
  startX: 0,
  startY: 0,
  isDragging: false,
  interactionsInitialized: false
};
var MAIN_BANNER_AUTO_DELAY = 5000;

function stopMainBannerAuto() {
  clearInterval(mainBannerState.autoInterval);
  mainBannerState.autoInterval = null;
}

function goToMainBanner(index) {
  var track = document.getElementById('banner-track');
  var dotsContainer = document.getElementById('banner-dots');
  if (!track || !dotsContainer) return;
  if (mainBannerState.total <= 0) return;

  if (index < 0) index = mainBannerState.total - 1;
  if (index >= mainBannerState.total) index = 0;
  mainBannerState.current = index;
  track.style.transform = 'translateX(-' + (mainBannerState.current * 100) + '%)';
  dotsContainer.querySelectorAll('.banner-dot').forEach(function(dot, i) {
    dot.classList.toggle('active', i === mainBannerState.current);
  });
}

function startMainBannerAuto() {
  stopMainBannerAuto();
  if (mainBannerState.total <= 1) return;
  mainBannerState.autoInterval = setInterval(function() {
    goToMainBanner(mainBannerState.current + 1);
  }, MAIN_BANNER_AUTO_DELAY);
}

function populateMainBannerCarousel() {
  var carousel = document.getElementById('banner-carousel');
  var track = document.getElementById('banner-track');
  var dotsContainer = document.getElementById('banner-dots');
  if (!carousel || !track || !dotsContainer) return;

  stopMainBannerAuto();
  track.innerHTML = '';
  dotsContainer.innerHTML = '';
  track.style.transform = '';
  mainBannerState.current = 0;
  mainBannerState.total = 0;

  if (!TERMINAL_CAROUSEL_ENABLED || TERMINAL_CAROUSEL_IMAGES.length === 0) {
    carousel.style.display = 'none';
    return;
  }

  carousel.style.display = '';
  TERMINAL_CAROUSEL_IMAGES.forEach(function(src, i) {
    var slide = document.createElement('div');
    slide.className = 'banner';
    slide.innerHTML = '<div class="banner-bg" style="background-image:url(\'' + src + '\')"></div>';
    track.appendChild(slide);

    var dot = document.createElement('span');
    dot.className = 'banner-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', function() {
      goToMainBanner(i);
      startMainBannerAuto();
    });
    dotsContainer.appendChild(dot);
  });

  mainBannerState.total = TERMINAL_CAROUSEL_IMAGES.length;
  dotsContainer.style.display = mainBannerState.total > 1 ? '' : 'none';
  startMainBannerAuto();
}

function initMainBannerCarouselInteractions() {
  if (mainBannerState.interactionsInitialized) return;
  mainBannerState.interactionsInitialized = true;

  var track = document.getElementById('banner-track');
  if (!track) return;

  track.addEventListener('touchstart', function(e) {
    if (mainBannerState.total <= 1) return;
    mainBannerState.startX = e.touches[0].clientX;
    mainBannerState.startY = e.touches[0].clientY;
    mainBannerState.isDragging = true;
    stopMainBannerAuto();
  }, { passive: true });

  track.addEventListener('touchmove', function(e) {
    if (!mainBannerState.isDragging) return;
    var dx = e.touches[0].clientX - mainBannerState.startX;
    var dy = e.touches[0].clientY - mainBannerState.startY;
    // Prevent vertical scroll when swiping horizontally
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      e.preventDefault();
    }
  }, { passive: false });

  track.addEventListener('touchend', function(e) {
    if (!mainBannerState.isDragging) return;
    mainBannerState.isDragging = false;
    var dx = e.changedTouches[0].clientX - mainBannerState.startX;
    if (dx < -50) goToMainBanner(mainBannerState.current + 1);   // swipe left
    else if (dx > 50) goToMainBanner(mainBannerState.current - 1); // swipe right
    startMainBannerAuto();
  }, { passive: true });

  // Mouse drag (for desktop testing)
  track.addEventListener('mousedown', function(e) {
    if (mainBannerState.total <= 1) return;
    mainBannerState.startX = e.clientX;
    mainBannerState.isDragging = true;
    stopMainBannerAuto();
    e.preventDefault();
  });

  document.addEventListener('mouseup', function(e) {
    if (!mainBannerState.isDragging) return;
    mainBannerState.isDragging = false;
    var dx = e.clientX - mainBannerState.startX;
    if (dx < -50) goToMainBanner(mainBannerState.current + 1);
    else if (dx > 50) goToMainBanner(mainBannerState.current - 1);
    startMainBannerAuto();
  });
}

// The main carousel starts hidden and is populated only after the backend response.
(function() {
  initMainBannerCarouselInteractions();
  populateMainBannerCarousel();
})();
