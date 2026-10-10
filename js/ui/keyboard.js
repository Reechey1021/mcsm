// ui/keyboard.js
// On phones the on-screen keyboard can cover the field you're typing in (worse with big
// system font sizes). While it's open we hide the tab bar, add room below the form, and keep
// the focused field in the middle of what's still visible.
const FIELDS = /^(INPUT|TEXTAREA|SELECT)$/;
const center = (el) => { if (el && FIELDS.test(el.tagName)) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

export function initKeyboard() {
  const vv = window.visualViewport;
  const update = () => {
    if (!vv) return;
    const open = window.innerHeight - vv.height > 140;
    document.documentElement.classList.toggle('kb-open', open);
    if (open) setTimeout(() => center(document.activeElement), 50);
  };
  if (vv) vv.addEventListener('resize', update);
  document.addEventListener('focusin', (e) => { if (FIELDS.test(e.target.tagName)) setTimeout(() => center(e.target), 320); });
  document.addEventListener('focusout', () => setTimeout(update, 100));
}
