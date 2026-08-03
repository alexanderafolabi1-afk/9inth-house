/* Ninth House Analytics
   GA4 Measurement ID: G-JN7VX1GFL0
   Google Consent Mode v2 -- cookies and data are withheld until the visitor
   grants consent via the cookie banner below. Reject is genuine: no cookies,
   no data, no pings.

   EVENTS TRACKED
   - page_view (automatic via GA4 config)
   - audit_request_submitted
   - concierge_opened
   - concierge_message_sent
   - journal_article_opened
   - partner_card_opened
   - payment_link_clicked   (param: offer_name)
   - outbound_whatsapp_click

   SELF-EXCLUSION
   Set localStorage.nhInternal = '1' to exclude your own traffic.
*/

(function () {
  'use strict';

  var GA_ID = 'G-JN7VX1GFL0';
  var CONSENT_KEY = 'nh_consent';
  var INTERNAL_KEY = 'nhInternal';

  /* ---- Self-exclusion ---- */
  function isInternal () {
    try {
      return localStorage.getItem(INTERNAL_KEY) === '1';
    } catch (e) { return false; }
  }

  /* ---- Consent helpers ---- */
  function storedConsent () {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function saveConsent (val) {
    try { localStorage.setItem(CONSENT_KEY, val); } catch (e) {}
  }

  /* ---- Consent Mode v2 defaults (all denied until granted) ---- */
  window.dataLayer = window.dataLayer || [];
  function gtag () { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
  gtag('js', new Date());
  gtag('config', GA_ID, {
    send_page_view: false,
    anonymize_ip: true
  });

  /* ---- Load gtag.js (deferred until DOMContentLoaded so it never blocks render) ---- */
  function loadGtag () {
    if (document.getElementById('nh-gtag-script')) return;
    var s = document.createElement('script');
    s.id = 'nh-gtag-script';
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  /* ---- Apply consent and optionally send page_view ---- */
  function applyConsent (granted) {
    if (granted) {
      gtag('consent', 'update', {
        ad_storage: 'denied',       /* We do not run ads; keep ad storage denied */
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted'
      });
      if (!isInternal()) {
        gtag('event', 'page_view');
      }
    } else {
      gtag('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied'
      });
    }
  }

  /* ---- Public event API ---- */
  function nhEvent (name, params) {
    if (isInternal()) return;
    if (storedConsent() !== 'granted') return;
    gtag('event', name, params || {});
  }

  window.nhTrack = {
    auditRequestSubmitted: function () {
      nhEvent('audit_request_submitted');
    },
    conciergeOpened: function () {
      nhEvent('concierge_opened');
    },
    conciergeMsgSent: function () {
      nhEvent('concierge_message_sent');
    },
    journalArticleOpened: function (title) {
      nhEvent('journal_article_opened', { article_title: title });
    },
    partnerCardOpened: function (partner) {
      nhEvent('partner_card_opened', { partner_name: partner });
    },
    paymentLinkClicked: function (offerName) {
      nhEvent('payment_link_clicked', { offer_name: offerName });
    },
    outboundWhatsapp: function () {
      nhEvent('outbound_whatsapp_click');
    }
  };

  /* ---- Banner DOM ---- */
  function buildBanner () {
    if (document.getElementById('nh-consent-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'nh-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<p class="nh-cb-text">We use analytics cookies to understand how visitors use this site. ' +
      'No advertising cookies are set. ' +
      '<a href="/privacy.html" class="nh-cb-link">Privacy policy</a></p>' +
      '<div class="nh-cb-btns">' +
      '<button id="nh-consent-accept" type="button" class="nh-cb-btn nh-cb-accept">Accept analytics</button>' +
      '<button id="nh-consent-reject" type="button" class="nh-cb-btn nh-cb-reject">Reject</button>' +
      '</div>';

    var style = document.createElement('style');
    style.textContent = [
      '#nh-consent-banner{',
        'position:fixed;bottom:80px;left:16px;right:16px;max-width:480px;',
        'background:#FFFDF8;border:1px solid #C9A557;border-radius:16px;',
        'padding:18px 18px 14px;',
        'box-shadow:0 8px 28px rgba(28,33,40,.18),inset 0 0 0 1px rgba(169,127,47,.14);',
        'z-index:1200;',
        'display:flex;flex-direction:column;gap:12px;',
        'font-family:"Albert Sans",system-ui,sans-serif;font-size:13.5px;color:#3A4048;',
        'animation:nhCbIn .22s ease;',
      '}',
      '@keyframes nhCbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
      '.nh-cb-text{margin:0;line-height:1.55}',
      '.nh-cb-link{color:#A97F2F;font-weight:600}',
      '.nh-cb-btns{display:flex;gap:9px;flex-wrap:wrap}',
      '.nh-cb-btn{',
        'border:none;border-radius:10px;padding:10px 18px;',
        'font-family:"Albert Sans",system-ui,sans-serif;font-size:13px;font-weight:700;',
        'cursor:pointer;min-height:44px;',
      '}',
      '.nh-cb-accept{background:#A97F2F;color:#FFFDF8}',
      '.nh-cb-accept:hover{background:#8F7434}',
      '.nh-cb-reject{background:#F4EDDC;color:#3A4048;border:1px solid #E4DCC6}',
      '.nh-cb-reject:hover{background:#E4DCC6}',
      '@media(max-width:480px){',
        '#nh-consent-banner{bottom:72px;left:12px;right:12px}',
        '.nh-cb-btn{flex:1;min-width:0}',
      '}'
    ].join('');
    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById('nh-consent-accept').addEventListener('click', function () {
      saveConsent('granted');
      applyConsent(true);
      hideBanner();
    });
    document.getElementById('nh-consent-reject').addEventListener('click', function () {
      saveConsent('rejected');
      applyConsent(false);
      hideBanner();
    });
  }

  function hideBanner () {
    var b = document.getElementById('nh-consent-banner');
    if (b) {
      b.style.transition = 'opacity .2s ease, transform .2s ease';
      b.style.opacity = '0';
      b.style.transform = 'translateY(10px)';
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 220);
    }
  }

  /* ---- Initialise ---- */
  function init () {
    loadGtag();
    var existing = storedConsent();
    if (existing === 'granted') {
      applyConsent(true);
    } else if (existing === 'rejected') {
      applyConsent(false);
    } else {
      /* No prior choice: show banner (do not fire page_view yet) */
      buildBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
