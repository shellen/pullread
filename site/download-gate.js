// ABOUTME: Download gate that collects emails before delivering DMG downloads.
// ABOUTME: Also handles standalone newsletter signup form submissions.

(function () {
  'use strict';

  var API = 'https://pullread.com/api/subscribe';

  // ── Inject modal HTML ──────────────────────────────────

  var overlay = document.createElement('div');
  overlay.className = 'dl-modal-overlay';
  overlay.innerHTML =
    '<div class="dl-modal">' +
      '<button class="dl-modal-close" aria-label="Close">&times;</button>' +
      '<h3>Get Pull Read</h3>' +
      '<p>Enter your email and the download starts automatically.</p>' +
      '<form id="dl-gate-form">' +
        '<input type="email" id="dl-gate-email" placeholder="you@example.com" required autocomplete="email">' +
        '<label class="checkbox-row">' +
          '<input type="checkbox" id="dl-gate-newsletter">' +
          'Send me product updates' +
        '</label>' +
        '<button type="submit" class="btn btn-accent">Download</button>' +
        '<div id="dl-gate-error" class="error" hidden></div>' +
        '<div id="dl-gate-success" class="success" hidden></div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(overlay);

  var form = document.getElementById('dl-gate-form');
  var emailInput = document.getElementById('dl-gate-email');
  var newsletterCheck = document.getElementById('dl-gate-newsletter');
  var errorEl = document.getElementById('dl-gate-error');
  var successEl = document.getElementById('dl-gate-success');
  var currentPlatform = '';
  var currentDownloadUrl = '';

  // ── Modal open/close ───────────────────────────────────

  function openModal(platform, downloadUrl) {
    currentPlatform = platform;
    currentDownloadUrl = downloadUrl;
    errorEl.hidden = true;
    successEl.hidden = true;
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Download';
    emailInput.hidden = false;
    emailInput.value = '';
    form.querySelector('.checkbox-row').hidden = false;
    newsletterCheck.checked = false;
    overlay.classList.add('active');
    emailInput.focus();
  }

  function closeModal() {
    overlay.classList.remove('active');
  }

  overlay.querySelector('.dl-modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // ── Intercept download links ───────────────────────────

  var links = document.querySelectorAll(
    'a[href*="releases/download/latest/PullRead"]'
  );

  links.forEach(function (link) {
    var href = link.href;
    var platform = href.indexOf('_Intel.dmg') !== -1 ? 'intel' : 'apple_silicon';
    link.setAttribute('data-download-url', href);
    link.setAttribute('data-platform', platform);
    link.href = '#';
    link.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(platform, href);
    });
  });

  // ── Form submit ────────────────────────────────────────

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = emailInput.value.trim();
    if (!email) return;

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting\u2026';
    errorEl.hidden = true;

    try {
      var res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          source: 'download',
          platform: currentPlatform,
        }),
      });

      if (!res.ok) {
        var data = await res.json().catch(function () { return {}; });
        throw new Error(data.error || 'Something went wrong');
      }

      var result = await res.json();

      // Newsletter opt-in as separate request
      if (newsletterCheck.checked) {
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'newsletter' }),
        });
      }

      // Trigger download
      var downloadUrl = result.download_url || currentDownloadUrl;
      var a = document.createElement('a');
      a.href = downloadUrl;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Show success
      form.querySelector('button[type="submit"]').hidden = true;
      emailInput.hidden = true;
      form.querySelector('.checkbox-row').hidden = true;
      successEl.innerHTML =
        'Downloading\u2026 If it doesn\u2019t start, ' +
        '<a href="' + downloadUrl + '">click here</a>.';
      successEl.hidden = false;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Download';
    }
  });

  // ── Newsletter standalone form ─────────────────────────

  var nlForm = document.getElementById('newsletter-form');
  if (nlForm) {
    nlForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var input = nlForm.querySelector('input[type="email"]');
      var email = input.value.trim();
      if (!email) return;

      var btn = nlForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Subscribing\u2026';

      // Remove any previous message
      var prev = nlForm.querySelector('.newsletter-msg');
      if (prev) prev.remove();

      try {
        var res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'newsletter' }),
        });

        if (!res.ok) {
          var data = await res.json().catch(function () { return {}; });
          throw new Error(data.error || 'Something went wrong');
        }

        input.value = '';
        btn.textContent = 'Subscribed!';
        var msg = document.createElement('p');
        msg.className = 'newsletter-msg';
        msg.style.color = 'var(--ink-secondary)';
        msg.textContent = 'Thanks! You\u2019ll hear from us soon.';
        nlForm.appendChild(msg);
      } catch (err) {
        var errMsg = document.createElement('p');
        errMsg.className = 'newsletter-msg';
        errMsg.style.color = '#c0392b';
        errMsg.textContent = err.message;
        nlForm.appendChild(errMsg);
        btn.disabled = false;
        btn.textContent = 'Subscribe';
      }
    });
  }
})();
