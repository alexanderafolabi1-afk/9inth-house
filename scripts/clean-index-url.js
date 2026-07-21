if (location.pathname.endsWith('/index.html')) {
  history.replaceState(null, '', location.pathname.replace(/index\.html$/, '') + location.search + location.hash);
}
