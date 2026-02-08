(function () {
  const DEBUG = false;
  const logError = (...args) => {
    if (DEBUG && typeof console !== 'undefined' && console.error) {
      console.error(...args);
    }
  };

  const STATE = {
    isEnabled: true,
    earningsEnabled: true,
    fakeMoneyEnabled: false,
    fakeMoneyValue: ''
  };

  const CONFIG = {
    INJECT_ID: 'fh-inject-css',
    OBSERVER_DEBOUNCE: 100,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
  };

  const SELECTORS = {
    BALANCE: '[class*="balance"], [class*="wallet"], [class*="available"], [class*="funds"], [class*="cash"]',
    EARNINGS: '[class*="earning"], [class*="revenue"], [class*="pending"], [class*="Earnings"], [data-testid*="earning"], [class*="amount"], [class*="total"]'
  };

  let observerInstance = null;
  let debounceTimer = null;

  const validateMessage = (request) => {
    if (!request || typeof request !== 'object') return false;
    if (!('action' in request)) return false;

    const validActions = ['toggleBalanceHider', 'toggleEarningsHider', 'toggleFakeMoney', 'getCurrentMoney'];
    if (!validActions.includes(request.action)) return false;

    if (request.action === 'getCurrentMoney') return true;
    if (request.action === 'toggleFakeMoney') {
      return 'enabled' in request && typeof request.enabled === 'boolean';
    }

    return 'enabled' in request && typeof request.enabled === 'boolean';
  };

  const isEarningsPage = () => {
    try {
      const pathname = window.location?.pathname?.toLowerCase?.() || '';
      return ['/earnings', '/dashboard', '/seller'].some(path => pathname.includes(path));
    } catch (e) {
      logError('[FH] Page detection failed:', e);
      return false;
    }
  };

  const shouldHideBalances = () => {
    return STATE.isEnabled === true;
  };

  const shouldHideEarnings = () => {
    return STATE.earningsEnabled === true && isEarningsPage();
  };

  const shouldShowFakeMoney = () => {
    return STATE.fakeMoneyEnabled === true && STATE.fakeMoneyValue && STATE.fakeMoneyValue.length > 0;
  };

  const buildSelectorWithExclusion = (selectorList, excludeClass) => {
    if (!excludeClass || !selectorList) return selectorList;

    return selectorList
      .split(',')
      .map((selector) => {
        const trimmed = selector.trim();
        return trimmed ? `${trimmed}:not(${excludeClass})` : '';
      })
      .filter(Boolean)
      .join(', ');
  };

  const injectFakeMoney = () => {
    try {
      if (shouldShowFakeMoney()) {
        replaceMoney();
      }
    } catch (e) { }
  };

  const replaceMoney = () => {
    try {
      if (!shouldShowFakeMoney()) return;

      const balanceEl = document.querySelector('.user-balance');
      if (balanceEl) {
        balanceEl.textContent = STATE.fakeMoneyValue;
        applyFakeMoneyStyles(balanceEl);
      }
    } catch (e) { }
  };

  const propertyKey = (prop) => {
    return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  };

  const backupAndSetStyle = (element, prop, value, priority = 'important') => {
    if (!element?.dataset) return;

    if (!element.dataset.fhAntiEllipsis) {
      element.dataset.fhAntiEllipsis = '1';
    }

    const key = propertyKey(prop);
    const prevValueKey = `fhPrev${key}`;
    const prevPriorityKey = `fhPrev${key}Priority`;

    if (!(prevValueKey in element.dataset)) {
      element.dataset[prevValueKey] = element.style.getPropertyValue(prop);
      element.dataset[prevPriorityKey] = element.style.getPropertyPriority(prop);
    }

    element.style.setProperty(prop, value, priority);
  };

  const restoreStyle = (element, prop) => {
    if (!element?.dataset) return;

    const key = propertyKey(prop);
    const prevValueKey = `fhPrev${key}`;
    const prevPriorityKey = `fhPrev${key}Priority`;

    if (prevValueKey in element.dataset) {
      const prevValue = element.dataset[prevValueKey];
      const prevPriority = element.dataset[prevPriorityKey] || '';

      if (prevValue) {
        element.style.setProperty(prop, prevValue, prevPriority);
      } else {
        element.style.removeProperty(prop);
      }

      delete element.dataset[prevValueKey];
      delete element.dataset[prevPriorityKey];
    }
  };

  const relaxFakeMoneyAncestors = (element) => {
    try {
      let node = element?.parentElement || null;
      let depth = 0;

      while (node && depth < 4) {
        backupAndSetStyle(node, 'overflow', 'visible');
        backupAndSetStyle(node, 'text-overflow', 'clip');
        backupAndSetStyle(node, 'max-width', 'none');
        node = node.parentElement;
        depth += 1;
      }
    } catch (e) { }
  };

  const resetFakeMoneyAncestors = (element) => {
    try {
      let node = element?.parentElement || null;
      let depth = 0;
      const props = ['overflow', 'text-overflow', 'max-width'];

      while (node && depth < 4) {
        if (node.dataset?.fhAntiEllipsis) {
          props.forEach((prop) => restoreStyle(node, prop));
          delete node.dataset.fhAntiEllipsis;
        }
        node = node.parentElement;
        depth += 1;
      }
    } catch (e) { }
  };

  const isTruncated = (element) => {
    try {
      if (!element) return false;
      return element.scrollWidth > element.clientWidth + 1;
    } catch (e) {
      return false;
    }
  };

  const applyFakeMoneyStyles = (element) => {
    try {
      if (!element) return;

      const computed = window.getComputedStyle?.(element);
      if (computed?.display === 'inline') {
        element.style.setProperty('display', 'inline-block', 'important');
      }

      element.style.setProperty('white-space', 'nowrap', 'important');
      element.style.setProperty('overflow', 'visible', 'important');
      element.style.setProperty('text-overflow', 'clip', 'important');
      element.style.setProperty('max-width', 'none', 'important');
      element.style.setProperty('min-width', 'max-content', 'important');
      element.style.setProperty('width', 'max-content', 'important');
      element.style.setProperty('flex', '0 0 auto', 'important');

      relaxFakeMoneyAncestors(element);

      if (isTruncated(element)) {
        element.style.setProperty('white-space', 'normal', 'important');
        element.style.setProperty('word-break', 'break-word', 'important');
        element.style.setProperty('overflow-wrap', 'anywhere', 'important');
        element.style.setProperty('min-width', '0', 'important');
        element.style.setProperty('width', 'auto', 'important');
      }
    } catch (e) { }
  };

  const resetFakeMoneyStyles = () => {
    try {
      const balanceEl = document.querySelector('.user-balance');
      if (!balanceEl) return;

      resetFakeMoneyAncestors(balanceEl);

      ['max-width', 'min-width', 'width', 'flex', 'white-space', 'word-break', 'overflow-wrap', 'overflow', 'text-overflow', 'display'].forEach((prop) => {
        balanceEl.style.removeProperty(prop);
      });
    } catch (e) { }
  };

  const getHidingCSS = () => {
    let css = '';

    if (shouldHideBalances()) {
      const balanceSelector = shouldShowFakeMoney()
        ? buildSelectorWithExclusion(SELECTORS.BALANCE, '.user-balance')
        : SELECTORS.BALANCE;
      css += `${balanceSelector} { display: none !important; visibility: hidden !important; }`;
    }

    if (shouldHideEarnings()) {
      css += `${SELECTORS.EARNINGS} { display: none !important; visibility: hidden !important; }`;
    }

    return css;
  };

  const updateStyles = () => {
    try {
      const needsHiding = shouldHideBalances() || shouldHideEarnings();
      const injectStyle = document.getElementById(CONFIG.INJECT_ID);
      if (needsHiding) {
        const newCSS = getHidingCSS();
        if (!injectStyle && newCSS) {
          const style = document.createElement('style');
          if (!style) throw new Error('Failed to create style element');

          style.id = CONFIG.INJECT_ID;
          style.type = 'text/css';
          style.textContent = newCSS;

          const inserted = document.documentElement?.insertBefore(style, document.documentElement?.firstChild);
          if (!inserted) throw new Error('Failed to insert style element');
        } else if (injectStyle && newCSS) {
          injectStyle.textContent = newCSS;
        }
      } else {
        if (injectStyle) {
          try {
            injectStyle.remove();
          } catch (e) {
            logError('[FH] Failed to remove inject style:', e);
          }
        }
      }

      if (!shouldShowFakeMoney()) {
        resetFakeMoneyStyles();
      }

      injectFakeMoney();
    } catch (e) {
      logError('[FH] Style update failed:', e);
    }
  };

  const initializeState = (retries = 0) => {
    try {
      if (!chrome?.storage?.local?.get) {
        throw new Error('Chrome storage API not available');
      }

      chrome.storage.local.get(
        {
          balanceHiderEnabled: true,
          earningsHiderEnabled: true,
          fakeMoneyEnabled: false,
          fakeMoneyValue: ''
        },
        (data) => {
          if (chrome.runtime.lastError) {
            if (retries < CONFIG.MAX_RETRIES) {
              setTimeout(() => initializeState(retries + 1), CONFIG.RETRY_DELAY);
            } else {
              logError('[FH] Failed to load settings after retries');
            }
            return;
          }

          try {
            STATE.isEnabled = data?.balanceHiderEnabled === true;
            STATE.earningsEnabled = data?.earningsHiderEnabled === true;
            STATE.fakeMoneyEnabled = data?.fakeMoneyEnabled === true;
            STATE.fakeMoneyValue = data?.fakeMoneyValue || '';
            updateStyles();
          } catch (e) {
            logError('[FH] Failed to update state:', e);
          }
        }
      );
    } catch (e) {
      logError('[FH] State initialization failed:', e);
    }
  };

  const setupMessageListener = () => {
    try {
      if (!chrome?.runtime?.onMessage) {
        throw new Error('Chrome runtime API not available');
      }

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
          if (!validateMessage(request)) {
            sendResponse({ status: 'invalid_message' });
            return;
          }

          if (request.action === 'getCurrentMoney') {
            const balanceEl = document.querySelector('.user-balance');
            const money = balanceEl?.textContent?.trim() || '';
            sendResponse({ money });
            return true;
          }

          if (request.action === 'toggleBalanceHider') {
            STATE.isEnabled = request.enabled === true;
          } else if (request.action === 'toggleEarningsHider') {
            STATE.earningsEnabled = request.enabled === true;
          } else if (request.action === 'toggleFakeMoney') {
            STATE.fakeMoneyEnabled = request.enabled === true;
            STATE.fakeMoneyValue = request.fakeMoneyValue || '';
          }

          updateStyles();
          sendResponse({ status: 'ok' });
        } catch (e) {
          logError('[FH] Message handler error:', e);
          sendResponse({ status: 'error', message: e.message });
        }
        return true;
      });
    } catch (e) {
      logError('[FH] Message listener setup failed:', e);
    }
  };

  const setupObserver = () => {
    try {
      if (!document?.documentElement) {
        logError('[FH] Document element not available');
        return;
      }

      if (observerInstance) {
        try {
          observerInstance.disconnect();
        } catch (e) {
          logError('[FH] Failed to disconnect observer:', e);
        }
      }

      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            updateStyles();
            if (shouldShowFakeMoney()) {
              replaceMoney();
            }
          } catch (e) { }
        }, CONFIG.OBSERVER_DEBOUNCE);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: false,
        attributes: false,
        attributeOldValue: false,
        characterDataOldValue: false
      });

      observerInstance = observer;
    } catch (e) {
      logError('[FH] Observer setup failed:', e);
    }
  };

  const cleanup = () => {
    try {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      if (observerInstance) {
        observerInstance.disconnect();
        observerInstance = null;
      }

    } catch (e) {
      logError('[FH] Cleanup failed:', e);
    }
  };

  const initialize = () => {
    try {
      if (!document) {
        throw new Error('Document not available');
      }

      initializeState();
      setupMessageListener();
      setupObserver();

      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', cleanup, { once: true, passive: true });
      }
    } catch (e) {
      logError('[FH] Initialization failed:', e);
    }
  };

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize, { once: true, passive: true });
    } else {
      initialize();
    }
  } catch (e) {
    logError('[FH] Script execution failed:', e);
  }
})();
