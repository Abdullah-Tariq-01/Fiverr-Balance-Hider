(function () {
  try {
    const createAndInjectCSS = () => {
      if (!document || !document.documentElement) return;
      if (!chrome?.storage?.local?.get) return;

      chrome.storage.local.get(
        {
          balanceHiderEnabled: true,
          earningsHiderEnabled: true
        },
        (data) => {
          if (chrome.runtime.lastError) return;
          const existingStyle = document.getElementById('fh-inject-css');
          if (existingStyle) existingStyle.remove();

          let css = '';

          if (data.balanceHiderEnabled !== false) {
            css += `[class*="balance"],[class*="wallet"],[class*="available"],[class*="funds"],[class*="cash"]{display:none!important;visibility:hidden!important;}`;
          }

          if (data.earningsHiderEnabled !== false) {
            css += `[class*="earning"],[class*="revenue"],[class*="pending"],[class*="Earnings"],[data-testid*="earning"],[class*="amount"],[class*="total"]{display:none!important;visibility:hidden!important;}`;
          }

          if (css) {
            const style = document.createElement('style');
            style.id = 'fh-inject-css';
            style.textContent = css;
            document.documentElement.insertBefore(style, document.documentElement.firstChild);
          }
        }
      );
    };

    createAndInjectCSS();
  } catch (error) { }
})();
