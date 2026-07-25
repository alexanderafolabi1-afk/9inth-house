if (location.pathname.endsWith('/index.html')) {
  try {
    history.replaceState(null, '', location.pathname.replace(/index\.html$/, '') + location.search + location.hash);
  } catch (e) {}
}
