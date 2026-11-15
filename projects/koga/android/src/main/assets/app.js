const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const series = trail => trail.segments.flat();
const validPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
  Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;
const read = (name, fallback) => {
  try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch { return fallback; }
};
const write = (name, value) => {
  try { localStorage.setItem(name, JSON.stringify(value)); return true; } catch { return false; }
};
const normalize = text => text.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[\s\u200c\u200d]+/g, ' ').trim().toLowerCase();
const storageName = 'koga.last-trail';
let config = read('koga.settings', {});
if (!config || typeof config !== 'object') config = {};
let restored = read(storageName, null);
if (!restored || !Array.isArray(restored.segments) || !restored.segments.length ||
  !restored.segments.every(s => Array.isArray(s) && s.length > 1 && s.every(validPoint))) restored = null;
let currentTrail = restored;
let imported = restored && restored.id === 'imported' ? restored : null;
let currentPlace = null;
let origin = null;
let mode = 'car';
let road = null;
let geoSearch = 0;
let routeRequest = 0;
let shownPlaces = SUGGESTED.map(id => PLACES.find(p => p.id === id));
const greens = '#276047';
const bronze = '#a34327';

const map = new KogaMap($('map'), status => {
  $('map-status').textContent = {
    online: 'نقشهٔ آنلاین', live: 'نقشهٔ آنلاین', partial: 'نقشه در حال بارگیری',
    pending: 'نمای ساده · نقشهٔ آنلاین در دسترس نیست یا در حال بارگیری است', offline: 'نقشهٔ پایهٔ ساده'
  }[status];
  $('osm-credit').hidden = !map.online && !road && !(mode === 'hike' && currentTrail?.ways);
  $('outline-credit').hidden = status === 'live';
});
const showNotice = message => {
  $('notice').textContent = message || '';
  $('notice').hidden = !message;
};
const setMapLabel = label => { $('map-label').textContent = label; };
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
function node(tag, css, value) {
  const el = document.createElement(tag);
  if (css) el.className = css;
  if (value !== undefined) el.textContent = value;
  return el;
}
function row(label, info, name, selected, action) {
  const button = node('button', 'row');
  button.type = 'button';
  if (selected) button.setAttribute('aria-current', 'true');
  const image = node('span', 'row-icon' + (name === 'mountain' ? ' hike' : ''));
  image.append(icon(name));
  const copy = node('span', 'row-copy');
  copy.append(node('strong', '', label), node('small', '', info));
  button.append(image, copy, icon('arrow'));
  button.addEventListener('click', action);
  return button;
}
function setStats(id, values) {
  $(id).replaceChildren(...values.map(([value, label]) => {
    const stat = node('span', 'stat');
    stat.append(node('strong', '', value), document.createTextNode(label));
    return stat;
  }));
  $(id).hidden = !values.length;
}
function renderPlaces() {
  $('places').replaceChildren(...shownPlaces.map(p => row(p.name, p.info, 'pin', currentPlace?.id === p.id, () => selectPlace(p))));
}
function renderTrails() {
  const entries = imported ? [...TRAILS, imported] : TRAILS;
  $('trail-list').replaceChildren(...entries.map(trail => row(trail.name, trail.area, 'mountain', currentTrail?.id === trail.id, () => selectTrail(trail))));
}
function mapRoad(fit = true) {
  const demo = road?.demo;
  const start = demo ? road.points[0] : origin?.point;
  map.lines = road ? [{ points: road.points, color: greens, dashed: demo }] : [];
  map.markers = [
    ...(start ? [{ point: start, color: greens, hollow: true }] : []),
    ...(currentPlace ? [{ point: currentPlace.point, color: greens }] : [])
  ];
  if (road && fit) map.fit(road.points.concat(currentPlace ? [currentPlace.point] : []));
  else if (currentPlace && fit) map.fit([currentPlace.point], 13);
  else map.render();
}
function stopPicking() {
  map.onPick = null;
  $('map').classList.remove('picking');
  $('pick-map').setAttribute('aria-pressed', 'false');
}
function resetMap() {
  stopPicking();
  ++routeRequest;
  $('route').disabled = false;
  currentPlace = null;
  road = null;
  $('destination-card').hidden = true;
  setStats('road-stats', []);
  renderPlaces();
  mapRoad(false);
  map.fit(IRAN_FRAME, 6);
  setMapLabel('نمای ایران');
  showNotice('');
}
function selectPlace(place) {
  stopPicking();
  if (mode !== 'car') switchMode('car', false);
  ++routeRequest;
  $('route').disabled = false;
  currentPlace = place;
  road = null;
  $('destination-card').hidden = false;
  $('destination-name').textContent = place.name;
  $('destination-info').textContent = origin ? 'مبدأ: ' + origin.name : place.info;
  setStats('road-stats', []);
  setMapLabel(place.name);
  showNotice('');
  renderPlaces();
  mapRoad();
}
function distance(a, b) {
  const rad = Math.PI / 180;
  const p = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) *
    Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, p)));
}
function routeStats(segments) {
  const hasElevation = segments.every(s => s.every(p => Number.isFinite(p[2])));
  let length = 0;
  let gain = 0;
  for (const s of segments) {
    for (let i = 1; i < s.length; i++) {
      length += distance(s[i - 1], s[i]);
      if (hasElevation) gain += Math.max(0, s[i][2] - s[i - 1][2]);
    }
  }
  return { length, gain: hasElevation ? Math.round(gain) : null };
}
function renderProfile(trail) {
  const canvas = $('profile');
  const track = trail.segments;
  canvas.hidden = !track.every(s => s.every(p => Number.isFinite(p[2])));
  if (canvas.hidden) return;
  const length = routeStats(track).length;
  const values = series(trail).map(p => p[2]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = canvas.clientWidth || 260;
  const height = 46;
  const ctx = map.getContext(canvas, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = bronze;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let elapsed = 0;
  for (const s of track) {
    s.forEach((p, i) => {
      if (i) elapsed += distance(s[i - 1], p);
      const x = 2 + (width - 4) * elapsed / Math.max(length, 1);
      const y = 43 - 40 * (p[2] - min) / Math.max(max - min, 1);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
  }
  ctx.stroke();
}
function selectTrail(trail, persist = true) {
  currentTrail = trail;
  $('trail-detail').hidden = false;
  $('trail-title').textContent = trail.name;
  const source = $('trail-source');
  source.replaceChildren();
  if (trail.ways) {
    source.append(document.createTextNode('قطعهٔ ثبت‌شده · '));
    trail.ways.forEach((id, i) => {
      if (i) source.append(document.createTextNode('، '));
      const link = node('a', '', 'OpenStreetMap');
      link.href = 'https://www.openstreetmap.org/way/' + Number(id);
      link.target = '_blank';
      link.rel = 'noopener';
      source.append(link);
    });
  } else source.textContent = 'فایل شخصی GPX';
  const stats = routeStats(trail.segments);
  setStats('trail-stats', [[number.format(stats.length / 1000), 'کیلومتر'],
    stats.gain === null ? ['—', 'دادهٔ ارتفاع موجود نیست'] : [number.format(stats.gain), 'متر ارتفاع‌گیری']]);
  renderProfile(trail);
  const points = series(trail);
  map.lines = trail.segments.map(points => ({ points, color: bronze }));
  map.markers = [{ point: points[0], color: bronze, hollow: true }, { point: points.at(-1), color: bronze }];
  map.fit(points, 16);
  setMapLabel(trail.area);
  showNotice(persist && !write(storageName, trail) ? 'مسیر نمایش داده شد، اما امکان ذخیره روی این دستگاه وجود ندارد.' : '');
  renderTrails();
}
function switchMode(next, loadDefault = true) {
  mode = next;
  stopPicking();
  ++routeRequest;
  $('route').disabled = false;
  $('car-mode').setAttribute('aria-pressed', String(next === 'car'));
  $('hike-mode').setAttribute('aria-pressed', String(next === 'hike'));
  $('car-panel').hidden = next !== 'car';
  $('hike-panel').hidden = next !== 'hike';
  $('panel-title').textContent = next === 'car' ? 'کجا می‌ریم؟' : 'به دل کوه';
  $('panel-subtitle').textContent = next === 'car' ? 'مقصدت رو پیدا کن و مسیرت رو روی نقشه ببین.' : 'پاکوب رو بررسی کن یا فایل مسیر خودت رو باز کن.';
  showNotice('');
  if (!loadDefault) return;
  if (next === 'hike') selectTrail(currentTrail || TRAILS[0]);
  else if (currentPlace) { mapRoad(); setMapLabel(currentPlace.name); }
  else resetMap();
}
async function graph(path, params) {
  const url = new URL('https://graphhopper.com/api/1/' + path);
  for (const [key, value] of params) url.searchParams.append(key, value);
  url.searchParams.set('key', config.key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12500);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw Error('GraphHopper ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}
$('search-form').addEventListener('submit', async event => {
  event.preventDefault();
  const request = ++geoSearch;
  const value = $('query').value.trim();
  const query = normalize(value);
  $('places-title').textContent = query ? 'نتیجهٔ جست‌وجو' : 'مقصدهای پیشنهادی';
  shownPlaces = query
    ? PLACES.filter(p => normalize(p.name + ' ' + (p.alt || '')).includes(query))
    : SUGGESTED.map(id => PLACES.find(p => p.id === id));
  renderPlaces();
  $('search-status').textContent = query && !shownPlaces.length ? 'در فهرست داخلی نتیجه‌ای پیدا نشد.' : '';
  if (!query || !config.key) return;
  $('search-status').textContent = 'جست‌وجوی آنلاین…';
  try {
    const payload = await graph('geocode', [['q', value], ['locale', 'fa'], ['limit', '8']]);
    if (request !== geoSearch) return;
    const live = (payload.hits || []).filter(hit => hit.countrycode?.toUpperCase() === 'IR' || hit.country_code?.toUpperCase() === 'IR')
      .map((hit, i) => ({
        id: 'live-' + i, name: hit.name || value, info: [hit.street, hit.city, hit.state].filter(Boolean).join('، ') || 'ایران',
        point: [hit.point?.lng, hit.point?.lat]
      })).filter(item => validPoint(item.point));
    shownPlaces = [...live, ...shownPlaces.filter(place => !live.some(l => distance(l.point, place.point) < 90))];
    renderPlaces();
    $('search-status').textContent = shownPlaces.length ? '' : 'برای این عبارت در ایران نتیجه‌ای پیدا نشد.';
  } catch {
    if (request === geoSearch) $('search-status').textContent = 'جست‌وجوی آنلاین در دسترس نیست. کلید و اتصال را بررسی کن.';
  }
});
async function drawRoad() {
  const place = currentPlace;
  if (!place || mode !== 'car') return;
  const request = ++routeRequest;
  road = null;
  setStats('road-stats', []);
  mapRoad(false);
  showNotice('');
  if (!origin && DEMO_ROADS[place.id]) {
    road = { ...DEMO_ROADS[place.id], demo: true };
    showNotice('مسیر ثبت‌شدهٔ نمونه از میدان آزادی تهران · OSRM / FOSSGIS. برای مسیر شخصی، مبدأ و کلید سرویس را وارد کن.');
  } else if (!origin) {
    showNotice('اول «موقعیت من» را بزن یا یکی از مکان‌ها را به‌عنوان مبدأ انتخاب کن.');
  } else if (!config.key) {
    showNotice('برای ساخت مسیر آنلاین، کلید GraphHopper را در تنظیمات وارد کن.');
  } else if (distance(origin.point, place.point) < 10) {
    showNotice('مبدأ و مقصد تقریباً یک نقطه‌اند.');
  } else {
    $('route').disabled = true;
    showNotice('در حال محاسبهٔ مسیر…');
    try {
      const query = [origin.point, place.point].map(([lon, lat]) => ['point', lat + ',' + lon]);
      query.push(['profile', 'car'], ['points_encoded', 'false'], ['instructions', 'false']);
      const payload = await graph('route', query);
      if (request !== routeRequest) return;
      const path = payload.paths?.[0];
      const points = path?.points?.coordinates;
      if (!Array.isArray(points) || points.length < 2 || !points.every(validPoint) || !Number.isFinite(path.distance) || !Number.isFinite(path.time)) throw Error('invalid route');
      road = { points, meters: path.distance, seconds: path.time / 1000 };
      showNotice('');
    } catch {
      if (request === routeRequest) showNotice('مسیر قابل محاسبه نبود. پوشش مسیر، کلید و اتصال را بررسی کن.');
    } finally {
      if (request === routeRequest) $('route').disabled = false;
    }
  }
  if (road && request === routeRequest) {
    setStats('road-stats', [[number.format(road.meters / 1000), 'کیلومتر'],
      [number.format(Math.max(1, Math.round(road.seconds / 60))), 'دقیقهٔ تخمینی']]);
    mapRoad();
  }
}
function useLocation(point) {
  if (!validPoint(point)) { showNotice('موقعیت معتبر دریافت نشد.'); return; }
  origin = { name: 'موقعیت من', point };
  ++routeRequest;
  $('route').disabled = false;
  road = null;
  setStats('road-stats', []);
  if (currentPlace) $('destination-info').textContent = 'مبدأ: موقعیت من';
  if (mode === 'hike') {
    const markers = map.markers.slice(0, 2);
    map.markers = [...markers, { point, color: greens, hollow: true }];
    map.fit([point], 13);
    setMapLabel('موقعیت من');
    showNotice('موقعیت فعلی برای مسیر خودرو به‌عنوان مبدأ انتخاب شد.');
    return;
  }
  mapRoad(false);
  map.fit([point], 13);
  setMapLabel('موقعیت من');
  showNotice('موقعیت فعلی به‌عنوان مبدأ انتخاب شد.');
}
function parseGpx(xml, filename) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('unsafe XML declaration');
  const root = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  if (root.localName !== 'gpx') throw Error('invalid GPX');
  const children = (element, name) => [...element.children].filter(child => child.localName === name);
  const track = children(root, 'trk')[0];
  const route = children(root, 'rte')[0];
  const pointLists = track ? children(track, 'trkseg').map(segment => children(segment, 'trkpt')) : route ? [children(route, 'rtept')] : [];
  if (pointLists.reduce((total, points) => total + points.length, 0) > 8000) throw Error('too many points');
  const segments = pointLists.map(points => points.map(point => {
    const lon = point.getAttribute('lon');
    const lat = point.getAttribute('lat');
    const location = [Number(lon), Number(lat)];
    if (!lon?.trim() || !lat?.trim() || !validPoint(location)) throw Error('invalid coordinates');
    const ele = children(point, 'ele')[0]?.textContent.trim();
    if (ele && Number.isFinite(Number(ele))) location.push(Number(ele));
    return location;
  })).filter(points => points.length > 1);
  if (!segments.length) throw Error('empty track');
  const item = track || route;
  const name = (children(item, 'name')[0]?.textContent.trim() || filename.replace(/\.gpx$/i, '') || 'مسیر واردشده').slice(0, 110);
  return { id: 'imported', name, area: 'مسیر شخصی', segments };
}
$('gpx').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw Error('too large');
    imported = parseGpx(await file.text(), file.name);
    if (mode !== 'hike') switchMode('hike', false);
    selectTrail(imported);
  } catch { showNotice('فایل GPX معتبر نیست یا از ۲ مگابایت یا ۸۰۰۰ نقطه بزرگ‌تر است.'); }
});
$('import-gpx').onclick = () => $('gpx').click();
$('trail-start').onclick = () => {
  const trail = currentTrail;
  selectPlace({ id: 'access-' + trail.id, name: 'نزدیکی شروع ' + trail.name, info: trail.access ? 'نقطهٔ دسترسی خودرو' : 'نزدیک‌ترین نقطهٔ قابل محاسبه با خودرو', point: trail.access || trail.segments[0][0] });
  drawRoad();
};
$('car-mode').onclick = () => switchMode('car');
$('hike-mode').onclick = () => switchMode('hike');
$('reset-map').onclick = resetMap;
$('pick-map').onclick = () => {
  if (map.onPick) { stopPicking(); setMapLabel(currentPlace?.name || 'نمای ایران'); showNotice(''); return; }
  $('pick-map').setAttribute('aria-pressed', 'true');
  $('map').classList.add('picking');
  setMapLabel('یک نقطه انتخاب کن');
  map.onPick = point => selectPlace({
    id: 'map-point', name: 'نقطهٔ انتخابی روی نقشه', point,
    info: number.format(point[1]) + '، ' + number.format(point[0])
  });
  $('map').focus();
};
$('zoom-in').onclick = () => map.zoomBy(1);
$('zoom-out').onclick = () => map.zoomBy(-1);
$('route').onclick = drawRoad;
$('set-origin').onclick = () => {
  if (!currentPlace) return;
  origin = { name: currentPlace.name, point: currentPlace.point };
  selectPlace(currentPlace);
  showNotice('«' + origin.name + '» به‌عنوان مبدأ ثبت شد. حالا مقصد را انتخاب کن.');
  $('query').focus();
};
$('gps').onclick = () => {
  if (!navigator.geolocation) { showNotice('موقعیت مکانی در این محیط در دسترس نیست.'); return; }
  showNotice('در حال دریافت موقعیت…');
  navigator.geolocation.getCurrentPosition(
    position => useLocation([position.coords.longitude, position.coords.latitude]),
    () => showNotice('موقعیت در دسترس نیست. اجازهٔ مکان را بررسی کن یا مبدأ را دستی انتخاب کن.'),
    { timeout: 12000, maximumAge: 30000 }
  );
};
const settings = $('settings');
$('open-settings').onclick = () => {
  $('api-key').value = config.key || '';
  $('online-map').checked = config.online !== false;
  settings.showModal();
};
$('close-settings').onclick = () => settings.close();
$('settings-form').onsubmit = event => {
  event.preventDefault();
  config = { key: $('api-key').value.trim(), online: $('online-map').checked };
  ++geoSearch;
  ++routeRequest;
  $('route').disabled = false;
  $('search-status').textContent = '';
  map.setOnline(config.online);
  settings.close();
  showNotice(write('koga.settings', config) ? 'تنظیمات ذخیره شد.' : 'تنظیمات فعلی اعمال شد و پس از بستن برنامه باقی نمی‌ماند.');
};
renderPlaces();
renderTrails();
map.setOnline(config.online !== false);
resetMap();
document.fonts?.ready.then(() => map.render());
