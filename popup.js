(function () {
  const DEBUG = false;
  const logError = (...args) => {
    if (DEBUG && typeof console !== 'undefined' && console.error) {
      console.error(...args);
    }
  };

  const UI = {
    toggleSwitch: null,
    earningsToggle: null,
    fakeMoneyToggle: null,
    fakeMoneySection: null,
    fakeMoneyInput: null,
    saveFakeMoneyBtn: null,
    resetFakeMoneyBtn: null,
    fakeMoneyError: null,
    siteNotice: null,
    controls: null
  };

  const CONFIG = {
    STORAGE_KEYS: {
      BALANCE: 'balanceHiderEnabled',
      EARNINGS: 'earningsHiderEnabled',
      FAKE_MONEY_ENABLED: 'fakeMoneyEnabled',
      FAKE_MONEY_VALUE: 'fakeMoneyValue'
    },
    ACTIONS: {
      BALANCE: 'toggleBalanceHider',
      EARNINGS: 'toggleEarningsHider',
      FAKE_MONEY: 'toggleFakeMoney'
    },
    MAX_INPUT_LENGTH: 200
  };

  const initializeUI = () => {
    try {
      UI.toggleSwitch = document.getElementById('toggleSwitch');
      UI.earningsToggle = document.getElementById('earningsToggle');
      UI.fakeMoneyToggle = document.getElementById('fakeMoneyToggle');
      UI.fakeMoneySection = document.getElementById('fakeMoneySection');
      UI.fakeMoneyInput = document.getElementById('fakeMoneyInput');
      UI.saveFakeMoneyBtn = document.getElementById('saveFakeMoneyBtn');
      UI.resetFakeMoneyBtn = document.getElementById('resetFakeMoneyBtn');
      UI.fakeMoneyError = document.getElementById('fakeMoneyError');
      UI.siteNotice = document.getElementById('siteNotice');
      UI.controls = document.getElementById('controls');

      if (!UI.siteNotice || !UI.controls) {
        throw new Error('Required UI elements not found');
      }

      if (!UI.toggleSwitch || !UI.earningsToggle || !UI.fakeMoneyToggle) {
        throw new Error('Required UI elements not found');
      }
    } catch (e) {
      logError('[FH] UI initialization failed:', e);
      return false;
    }
    return true;
  };

  const isFiverrUrl = (url) => {
    if (typeof url !== 'string') return false;
    return /^https?:\/\/(www\.)?fiverr\.com\//i.test(url);
  };

  const setFiverrContext = (isFiverr) => {
    if (UI.siteNotice) {
      UI.siteNotice.style.display = isFiverr ? 'none' : 'block';
    }
    if (UI.controls) {
      UI.controls.style.display = isFiverr ? 'block' : 'none';
    }
  };

  const detectActiveTab = (callback) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          callback(false);
          return;
        }

        const url = tabs[0].url || '';
        callback(isFiverrUrl(url));
      });
    } catch (e) {
      logError('[FH] Active tab detection failed:', e);
      callback(false);
    }
  };

  const loadInitialState = () => {
    try {
      if (!chrome?.storage?.local?.get) {
        throw new Error('Chrome storage API not available');
      }

      const keys = [
        CONFIG.STORAGE_KEYS.BALANCE,
        CONFIG.STORAGE_KEYS.EARNINGS,
        CONFIG.STORAGE_KEYS.FAKE_MONEY_ENABLED,
        CONFIG.STORAGE_KEYS.FAKE_MONEY_VALUE
      ];

      chrome.storage.local.get(keys, (data) => {
        try {
          if (chrome.runtime.lastError) {
            throw new Error('Failed to retrieve settings: ' + chrome.runtime.lastError.message);
          }

          const balanceEnabled = data[CONFIG.STORAGE_KEYS.BALANCE] !== false;
          const fakeMoneyEnabled = data[CONFIG.STORAGE_KEYS.FAKE_MONEY_ENABLED] === true;
          const earningsEnabled = data[CONFIG.STORAGE_KEYS.EARNINGS] !== false;
          const fakeMoneyValue = data[CONFIG.STORAGE_KEYS.FAKE_MONEY_VALUE] || '';

          let finalBalanceEnabled = balanceEnabled;
          let finalFakeMoneyEnabled = fakeMoneyEnabled;

          if (finalBalanceEnabled && finalFakeMoneyEnabled) {
            finalFakeMoneyEnabled = false;
            chrome.storage.local.set(
              { [CONFIG.STORAGE_KEYS.FAKE_MONEY_ENABLED]: false },
              () => {
                if (chrome.runtime.lastError) {
                  logError('[FH] Failed to enforce exclusivity:', chrome.runtime.lastError.message);
                  return;
                }

                notifyTabsWithData(CONFIG.ACTIONS.FAKE_MONEY, {
                  enabled: false,
                  fakeMoneyValue
                });
              }
            );
          }

          UI.toggleSwitch.checked = finalBalanceEnabled;
          UI.earningsToggle.checked = earningsEnabled;
          UI.fakeMoneyToggle.checked = finalFakeMoneyEnabled;

          if (UI.fakeMoneyInput) {
            UI.fakeMoneyInput.value = fakeMoneyValue;
            if (!fakeMoneyValue) fetchCurrentMoney();
          }

          updateFakeMoneyVisibility();
        } catch (e) {
          logError('[FH] Failed to update UI state:', e);
        }
      });
    } catch (e) {
      logError('[FH] Failed to load initial state:', e);
    }
  };

  const notifyTabs = (action, enabled) => {
    try {
      if (!chrome?.tabs?.query) {
        throw new Error('Chrome tabs API not available');
      }

      if (typeof action !== 'string' || typeof enabled !== 'boolean') {
        throw new Error('Invalid arguments to notifyTabs');
      }

      chrome.tabs.query({ url: '*://*.fiverr.com/*' }, (tabs) => {
        if (chrome.runtime.lastError) {
          logError('[FH] Failed to query tabs:', chrome.runtime.lastError.message);
          return;
        }

        if (!Array.isArray(tabs)) {
          logError('[FH] Invalid tabs response');
          return;
        }

        tabs.forEach((tab) => {
          if (typeof tab.id !== 'number') return;

          try {
            chrome.tabs.sendMessage(
              tab.id,
              { action, enabled },
              { frameId: 0 }
            ).catch((error) => {
              if (error.message && !error.message.includes('Could not establish connection')) {
                logError('[FH] Failed to notify tab:', error);
              }
            });
          } catch (e) {
            logError('[FH] Message send failed:', e);
          }
        });
      });
    } catch (e) {
      logError('[FH] notifyTabs failed:', e);
    }
  };

  const notifyTabsWithData = (action, data) => {
    try {
      if (!chrome?.tabs?.query) {
        throw new Error('Chrome tabs API not available');
      }

      if (typeof action !== 'string' || !data) {
        throw new Error('Invalid arguments to notifyTabsWithData');
      }

      chrome.tabs.query({ url: '*://*.fiverr.com/*' }, (tabs) => {
        if (chrome.runtime.lastError) {
          logError('[FH] Failed to query tabs:', chrome.runtime.lastError.message);
          return;
        }

        if (!Array.isArray(tabs)) {
          logError('[FH] Invalid tabs response');
          return;
        }

        tabs.forEach((tab) => {
          if (typeof tab.id !== 'number') return;

          try {
            chrome.tabs.sendMessage(
              tab.id,
              { action, ...data },
              { frameId: 0 }
            ).catch((error) => {
              if (error.message && !error.message.includes('Could not establish connection')) {
                logError('[FH] Failed to notify tab:', error);
              }
            });
          } catch (e) {
            logError('[FH] Message send failed:', e);
          }
        });
      });
    } catch (e) {
      logError('[FH] notifyTabsWithData failed:', e);
    }
  };

  const validateMoneyInput = (input) => {
    if (typeof input !== 'string') return false;
    if (input.trim().length === 0) return true;
    if (input.length > CONFIG.MAX_INPUT_LENGTH) return false;

    const validPattern = /^[A-Z]{0,3}\$?\d+[,.]?\d*(\s*to\s*[A-Z]{0,3}\$?\d+[,.]?\d*)?$/i;
    return validPattern.test(input.trim());
  };

  const updateFakeMoneyVisibility = () => {
    try {
      if (UI.fakeMoneySection && UI.fakeMoneyToggle) {
        UI.fakeMoneySection.style.display = UI.fakeMoneyToggle.checked ? 'block' : 'none';
      }
    } catch (e) {
      logError('[FH] Failed to update fake money visibility:', e);
    }
  };

  const clearFakeMoneyError = () => {
    try {
      if (UI.fakeMoneyError) {
        UI.fakeMoneyError.textContent = '';
        UI.fakeMoneyError.style.display = 'none';
      }
    } catch (e) {
      logError('[FH] Failed to clear error:', e);
    }
  };

  const showFakeMoneyError = (message) => {
    try {
      if (UI.fakeMoneyError) {
        UI.fakeMoneyError.textContent = message;
        UI.fakeMoneyError.style.display = 'block';
      }
    } catch (e) {
      logError('[FH] Failed to show error:', e);
    }
  };

  const handleBalanceToggleChange = (toggle) => {
    try {
      if (!toggle || typeof toggle.checked !== 'boolean') {
        throw new Error('Invalid toggle element');
      }

      if (!chrome?.storage?.local?.set) {
        throw new Error('Chrome storage API not available');
      }

      const isEnabled = toggle.checked === true;
      const updates = { [CONFIG.STORAGE_KEYS.BALANCE]: isEnabled };

      if (isEnabled) {
        updates[CONFIG.STORAGE_KEYS.FAKE_MONEY_ENABLED] = false;
      }

      chrome.storage.local.set(updates, () => {
        if (chrome.runtime.lastError) {
          logError('[FH] Failed to save balance setting:', chrome.runtime.lastError.message);
          return;
        }

        notifyTabs(CONFIG.ACTIONS.BALANCE, isEnabled);

        if (isEnabled) {
          if (UI.fakeMoneyToggle) {
            UI.fakeMoneyToggle.checked = false;
          }
          updateFakeMoneyVisibility();
          notifyTabsWithData(CONFIG.ACTIONS.FAKE_MONEY, {
            enabled: false,
            fakeMoneyValue: UI.fakeMoneyInput?.value?.trim() || ''
          });
        }
      });
    } catch (e) {
      logError('[FH] Balance toggle handler failed:', e);
    }
  };

  const saveFakeMoney = () => {
    try {
      if (!UI.fakeMoneyInput) {
        throw new Error('Fake money input not initialized');
      }

      const inputValue = UI.fakeMoneyInput.value.trim();

      if (inputValue.length === 0) {
        showFakeMoneyError('Please enter a fake money value');
        return;
      }

      if (!validateMoneyInput(inputValue)) {
        showFakeMoneyError('Invalid format. Use: "US$1850000" or "US$185 to US$10,000"');
        return;
      }

      if (!chrome?.storage?.local?.set) {
        throw new Error('Chrome storage API not available');
      }

      chrome.storage.local.set(
        {
          [CONFIG.STORAGE_KEYS.FAKE_MONEY_VALUE]: inputValue,
          [CONFIG.STORAGE_KEYS.FAKE_MONEY_ENABLED]: true,
          [CONFIG.STORAGE_KEYS.BALANCE]: false
        },
        () => {
          if (chrome.runtime.lastError) {
            logError('[FH] Failed to save fake money:', chrome.runtime.lastError.message);
            showFakeMoneyError('Failed to save settings');
            return;
          }

          clearFakeMoneyError();
          if (UI.toggleSwitch) {
            UI.toggleSwitch.checked = false;
          }
          if (UI.fakeMoneyToggle) {
            UI.fakeMoneyToggle.checked = true;
          }
          updateFakeMoneyVisibility();

          notifyTabs(CONFIG.ACTIONS.BALANCE, false);
          notifyTabsWithData(CONFIG.ACTIONS.FAKE_MONEY, {
            enabled: true,
            fakeMoneyValue: inputValue
          });
        }
      );
    } catch (e) {
      logError('[FH] Save fake money failed:', e);
      showFakeMoneyError('Error saving fake money');
    }
  };

  const fetchCurrentMoney = () => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.fiverr.com/*' }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;

        chrome.tabs.sendMessage(tabs[0].id, { action: 'getCurrentMoney' }, (response) => {
          if (chrome.runtime.lastError || !response?.money) return;

          if (UI.fakeMoneyInput && !UI.fakeMoneyInput.value) {
            UI.fakeMoneyInput.setAttribute('placeholder', response.money);
          }
        });
      });
    } catch (e) { }
  };

  const resetFakeMoney = () => {
    try {
      if (!chrome?.storage?.local?.set) {
        throw new Error('Chrome storage API not available');
      }

      chrome.storage.local.set(
        {
          [CONFIG.STORAGE_KEYS.FAKE_MONEY_ENABLED]: false,
          [CONFIG.STORAGE_KEYS.FAKE_MONEY_VALUE]: ''
        },
        () => {
          if (chrome.runtime.lastError) {
            logError('[FH] Failed to reset fake money:', chrome.runtime.lastError.message);
            return;
          }

          UI.fakeMoneyToggle.checked = false;
          if (UI.fakeMoneyInput) {
            UI.fakeMoneyInput.value = '';
          }
          clearFakeMoneyError();
          updateFakeMoneyVisibility();

          notifyTabsWithData(CONFIG.ACTIONS.FAKE_MONEY, {
            enabled: false,
            fakeMoneyValue: ''
          });
        }
      );
    } catch (e) {
      logError('[FH] Reset fake money failed:', e);
    }
  };

  const handleToggleChange = (toggle, storageKey, action) => {
    try {
      if (!toggle || typeof toggle.checked !== 'boolean') {
        throw new Error('Invalid toggle element');
      }

      if (!chrome?.storage?.local?.set) {
        throw new Error('Chrome storage API not available');
      }

      const isEnabled = toggle.checked === true;

      chrome.storage.local.set({ [storageKey]: isEnabled }, () => {
        if (chrome.runtime.lastError) {
          logError('[FH] Failed to save setting:', chrome.runtime.lastError.message);
          return;
        }

        notifyTabs(action, isEnabled);
      });
    } catch (e) {
      logError('[FH] Toggle change handler failed:', e);
    }
  };

  const setupEventListeners = () => {
    try {
      if (!UI.toggleSwitch || !UI.earningsToggle || !UI.fakeMoneyToggle) {
        throw new Error('UI elements not initialized');
      }

      UI.toggleSwitch.addEventListener('change', (e) => {
        try {
          if (e?.target) {
            handleBalanceToggleChange(e.target);
          }
        } catch (error) {
          logError('[FH] Toggle switch handler error:', error);
        }
      });

      UI.earningsToggle.addEventListener('change', (e) => {
        try {
          if (e?.target) {
            handleToggleChange(
              e.target,
              CONFIG.STORAGE_KEYS.EARNINGS,
              CONFIG.ACTIONS.EARNINGS
            );
          }
        } catch (error) {
          logError('[FH] Earnings toggle handler error:', error);
        }
      });

      UI.fakeMoneyToggle.addEventListener('change', (e) => {
        try {
          clearFakeMoneyError();
          updateFakeMoneyVisibility();

          if (e?.target && UI.fakeMoneyInput) {
            if (e.target.checked && !UI.fakeMoneyInput.value) {
              UI.fakeMoneyInput.focus();
            }
          }

          if (e?.target?.checked === true) {
            if (!chrome?.storage?.local?.set) {
              throw new Error('Chrome storage API not available');
            }

            chrome.storage.local.set(
              { [CONFIG.STORAGE_KEYS.BALANCE]: false },
              () => {
                if (chrome.runtime.lastError) {
                  logError('[FH] Failed to disable balance setting:', chrome.runtime.lastError.message);
                  return;
                }

                if (UI.toggleSwitch) {
                  UI.toggleSwitch.checked = false;
                }
                notifyTabs(CONFIG.ACTIONS.BALANCE, false);
              }
            );
          }
        } catch (error) {
          logError('[FH] Fake money toggle handler error:', error);
        }
      });

      if (UI.saveFakeMoneyBtn) {
        UI.saveFakeMoneyBtn.addEventListener('click', saveFakeMoney);
      }

      if (UI.resetFakeMoneyBtn) {
        UI.resetFakeMoneyBtn.addEventListener('click', resetFakeMoney);
      }

      if (UI.fakeMoneyInput) {
        UI.fakeMoneyInput.addEventListener('keypress', (e) => {
          try {
            if (e?.key === 'Enter') {
              saveFakeMoney();
            }
          } catch (error) {
            logError('[FH] Input keypress handler error:', error);
          }
        });

        UI.fakeMoneyInput.addEventListener('focus', clearFakeMoneyError);
      }
    } catch (e) {
      logError('[FH] Event listener setup failed:', e);
    }
  };

  const initialize = () => {
    try {
      if (!initializeUI()) {
        throw new Error('UI initialization failed');
      }

      detectActiveTab((isFiverr) => {
        setFiverrContext(isFiverr);
        if (!isFiverr) return;

        loadInitialState();
        setupEventListeners();
      });
    } catch (e) {
      logError('[FH] Popup initialization failed:', e);
    }
  };

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize, { once: true, passive: true });
    } else {
      initialize();
    }
  } catch (e) {
    logError('[FH] Popup script execution failed:', e);
  }
})();


