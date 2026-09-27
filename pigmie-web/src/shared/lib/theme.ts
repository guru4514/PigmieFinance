type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  return (localStorage.getItem('pigmie-theme') as Theme) || 'dark';
}

export function setTheme(theme: Theme) {
  localStorage.setItem('pigmie-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

export function toggleTheme(): Theme {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function initTheme() {
  setTheme(getTheme());
}
