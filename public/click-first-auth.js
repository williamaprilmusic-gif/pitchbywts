(() => {
  'use strict';

  const USER_KEY = 'pitchline.auth.user';
  let open = false;

  const css = `
    .pitch-auth-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(3,10,7,.72);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
    .pitch-auth-modal{width:min(440px,100%);background:#101a15;border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.42);padding:24px;color:#fff}
    .pitch-auth-modal h2{margin:0 0 6px;font-size:22px}.pitch-auth-modal p{margin:0 0 18px;color:#aebbb5;font-size:14px;line-height:1.45}
    .pitch-auth-field{display:grid;gap:7px;margin:12px 0}.pitch-auth-field label{font-size:12px;color:#aebbb5;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .pitch-auth-field input{width:100%;box-sizing:border-box;min-height:48px;border:1px solid rgba(255,255,255,.12);background:#0b130f;color:#fff;border-radius:12px;padding:0 14px;font:inherit;outline:none}
    .pitch-auth-field input:focus{border-color:#6de39f;box-shadow:0 0 0 3px rgba(109,227,159,.12)}
    .pitch-auth-actions{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:18px}.pitch-auth-actions button{min-height:48px;border-radius:12px;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}
    .pitch-auth-submit{border:1px solid #65d995;background:#65d995;color:#07110b}.pitch-auth-cancel{border:1px solid rgba(255,255,255,.14);background:transparent;color:#fff}
    .pitch-auth-status{min-height:20px;margin-top:12px;font-size:13px;color:#ffb3b3}.pitch-auth-status.ok{color:#9df0b8}
  `;

  function ensureStyle() {
    if (document.getElementById('pitch-first-auth-style')) return;
    const style = document.createElement('style');
    style.id = 'pitch-first-auth-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function saveUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
  }

  function closeModal() {
    document.querySelector('.pitch-auth-backdrop')?.remove();
    open = false;
  }

  function showModal() {
    if (open) return;
    open = true;
    ensureStyle();
    const backdrop = document.createElement('div');
    backdrop.className = 'pitch-auth-backdrop';
    backdrop.innerHTML = `
      <div class="pitch-auth-modal" role="dialog" aria-modal="true" aria-labelledby="pitch-auth-title">
        <h2 id="pitch-auth-title">Sign in to Pitchline</h2>
        <p>Enter your Pitchline account details. Your session stays in a secure HttpOnly cookie; this form does not store the password.</p>
        <div class="pitch-auth-field"><label for="pitch-auth-email">Email</label><input id="pitch-auth-email" type="email" autocomplete="username" placeholder="name@example.com"></div>
        <div class="pitch-auth-field"><label for="pitch-auth-password">Password</label><input id="pitch-auth-password" type="password" autocomplete="current-password" placeholder="Your password"></div>
        <div class="pitch-auth-status" aria-live="polite"></div>
        <div class="pitch-auth-actions"><button class="pitch-auth-cancel" type="button">Cancel</button><button class="pitch-auth-submit" type="button">Sign in</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    const modal = backdrop.querySelector('.pitch-auth-modal');
    const email = backdrop.querySelector('#pitch-auth-email');
    const password = backdrop.querySelector('#pitch-auth-password');
    const status = backdrop.querySelector('.pitch-auth-status');
    const cancel = backdrop.querySelector('.pitch-auth-cancel');
    const submit = backdrop.querySelector('.pitch-auth-submit');
    email.focus();

    cancel.addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    const run = async () => {
      const emailValue = String(email.value || '').trim().toLowerCase();
      const passwordValue = String(password.value || '');
      status.className = 'pitch-auth-status';
      status.textContent = '';
      if (!emailValue || !passwordValue) { status.textContent = 'Email and password are required.'; return; }
      submit.disabled = true;
      submit.textContent = 'Signing in…';
      try {
        const response = await fetch('/api/auth/sign-in', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailValue, password: passwordValue }),
        });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (!response.ok) {
          const message = String(data?.message || data?.error || `Sign-in failed (${response.status}).`);
          throw new Error(message);
        }
        if (!data?.user?.userId) throw new Error('The server did not return a valid user session.');
        saveUser(data.user);
        status.className = 'pitch-auth-status ok';
        status.textContent = 'Signed in. Loading your workspace…';
        setTimeout(() => window.location.reload(), 150);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Sign-in failed.';
        submit.disabled = false;
        submit.textContent = 'Sign in';
      }
    };

    submit.addEventListener('click', run);
    password.addEventListener('keydown', e => { if (e.key === 'Enter') void run(); });
  }

  function intercept(event) {
    const button = event.target?.closest?.('button');
    if (!button) return;
    const text = String(button.innerText || button.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!/^sign in$/.test(text)) return;
    const sidebarOrTopbar = button.closest('.top-actions, .portal-hero, .pitch-auth-modal');
    if (!sidebarOrTopbar || button.closest('.pitch-auth-modal')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showModal();
  }

  document.addEventListener('click', intercept, true);
})();
