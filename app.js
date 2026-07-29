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
var TERMINAL_RENTAL_SECTION_ENABLED = false;
var TERMINAL_RENTAL_SECTION_TITLE = 'Прокат';
var TERMINAL_RENTAL_CREATE_ENABLED = false;
var TERMINAL_RENTAL_PAYMENT_ENABLED = false;
var pendingRentalPaymentOrder = null;
var TERMINAL_GROUP_SECTION_ENABLED = false;
var TERMINAL_GROUP_SECTION_TITLE = 'Групповые занятия';
var TERMINAL_GROUP_PAYMENT_ENABLED = true;
var TERMINAL_GROUP_FREE_BOOKING_ENABLED = true;
var loadedGroups = [];
var selectedGroupDate = '';
var pendingGroupBooking = null;
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

function applyGroupSectionSettings() {
  var section = document.getElementById('terminal-group-section');
  var title = document.getElementById('terminal-group-title');
  var screenTitle = document.getElementById('groups-screen-title');

  if (title) {
    title.textContent = TERMINAL_GROUP_SECTION_TITLE || 'Групповые занятия';
  }

  if (screenTitle) {
    screenTitle.textContent = TERMINAL_GROUP_SECTION_TITLE || 'Групповые занятия';
  }

  if (section) {
    section.style.display = TERMINAL_GROUP_SECTION_ENABLED ? '' : 'none';
  }
}

function handleGroupSectionClick() {
  if (!TERMINAL_GROUP_SECTION_ENABLED) {
    showAlert('Групповые занятия отключены');
    return;
  }

  navigateTo('groups');
  loadTerminalGroups();
}

function handleRentalCreateClick() {
  if (!TERMINAL_RENTAL_CREATE_ENABLED) {
    showAlert('Создание проката отключено');
    return;
  }

  openRentalClientForm();
}

function openRentalClientForm() {
  var modal = document.getElementById('rental-client-modal');
  var nameInput = document.getElementById('rental-client-name');
  var phoneInput = document.getElementById('rental-client-phone');
  var errorEl = document.getElementById('rental-client-error');

  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (errorEl) errorEl.textContent = '';
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
  var clientName = nameInput ? nameInput.value.trim() : '';
  var clientPhone = phoneInput ? phoneInput.value.trim() : '';

  if (!clientName || !clientPhone) {
    if (errorEl) errorEl.textContent = 'Укажите имя и телефон клиента';
    return;
  }

  closeRentalClientForm();
  createRentalOrderForClient(clientName, clientPhone);
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

      TERMINAL_GROUP_SECTION_ENABLED = data.enabled === true || data.group_section_enabled === true;
      TERMINAL_GROUP_SECTION_TITLE = data.title || data.group_section_title || TERMINAL_GROUP_SECTION_TITLE;
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
    btn.textContent = formatGroupDate(date);
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
      TERMINAL_RENTAL_SECTION_ENABLED = data.rental_section_enabled === true;
      TERMINAL_RENTAL_SECTION_TITLE = (typeof data.rental_section_title === 'string' && data.rental_section_title.trim())
        ? data.rental_section_title.trim()
        : 'Прокат';
      TERMINAL_RENTAL_CREATE_ENABLED = data.rental_create_enabled === true;
      TERMINAL_RENTAL_PAYMENT_ENABLED = data.rental_payment_enabled === true;
      TERMINAL_GROUP_SECTION_ENABLED = data.group_section_enabled === true;
      TERMINAL_GROUP_SECTION_TITLE = (typeof data.group_section_title === 'string' && data.group_section_title.trim())
        ? data.group_section_title.trim()
        : 'Групповые занятия';
      TERMINAL_GROUP_PAYMENT_ENABLED = data.group_payment_enabled !== false;
      TERMINAL_GROUP_FREE_BOOKING_ENABLED = data.group_free_booking_enabled !== false;
      applyTicketSectionSettings();
      applyRentalSectionSettings();
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
    target.querySelectorAll('.main-content, .topup-wrap, .tkt-scroll, .tkt-card, .rent-content, .groups-content, .instructors-content')
      .forEach(el => el.scrollTop = 0);
  }

  // Reset ticket/rental counters when navigating to those screens
  if (screenName === 'tickets') resetTickets();
  if (screenName === 'alpaka') resetScreen('screen-alpaka', 'alpaka-total');
  if (screenName === 'museum') resetScreen('screen-museum', 'museum-total');
  if (screenName === 'skypark') resetScreen('screen-skypark', 'skypark-total');
  if (screenName === 'rental') resetRental();
  if (screenName === 'groups') renderGroups();

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
