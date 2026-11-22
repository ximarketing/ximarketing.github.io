// Compatibility entry for pages cached before the game script had a versioned name.
const url = new URL(location.href);
const build = '151684baf69d';
if (url.searchParams.get('v') !== build) {
  url.searchParams.set('v', build);
  location.replace(url.href);
} else {
  const status = document.createElement('p');
  status.setAttribute('role','alert');
  const link = document.createElement('a');
  url.searchParams.set('retry', String(Date.now()));
  link.href = url.href;
  link.textContent = '重新加载游戏 / Reload game';
  status.append(link);
  (document.querySelector('.setup-body') || document.body).append(status);
}
