class KogaMap {
  constructor(element, onChange) {
    this.element = element;
    this.base = document.getElementById('base');
    this.overlay = document.getElementById('overlay');
    this.tiles = document.getElementById('tiles');
    this.onChange = onChange;
    this.center = [53.1, 32.2];
    this.zoom = 5;
    this.online = false;
    this.lines = [];
    this.markers = [];
    this.images = new Map();
    this.pointer = null;
    this.tileTimer = 0;
    new ResizeObserver(() => this.render()).observe(element);
    element.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointer) return;
      element.setPointerCapture(event.pointerId);
      this.pointer = [event.pointerId, event.clientX, event.clientY];
      this.down = this.pointer;
    });
    element.addEventListener('pointermove', event => {
      if (!this.pointer || event.pointerId !== this.pointer[0]) return;
      if (Math.hypot(this.down[1] - event.clientX, this.down[2] - event.clientY) < 6 && this.pointer === this.down) return;
      this.pan(this.pointer[1] - event.clientX, this.pointer[2] - event.clientY);
      this.pointer = [event.pointerId, event.clientX, event.clientY];
    });
    element.addEventListener('pointerup', event => {
      if (!this.pointer || event.pointerId !== this.pointer[0] || this.pointer !== this.down) return;
      const bounds = element.getBoundingClientRect();
      const [left, top] = this.origin();
      this.onPick?.(this.unproject([left + event.clientX - bounds.left, top + event.clientY - bounds.top]));
    });
    window.addEventListener('online', () => {
      for (const [key, image] of this.images) {
        if (!image.complete || image.naturalWidth) continue;
        image.remove();
        this.images.delete(key);
      }
      this.render();
    });
    element.addEventListener('lostpointercapture', () => { this.pointer = null; });
    element.addEventListener('wheel', event => {
      event.preventDefault();
      const now = Date.now();
      if (now - (this.lastWheel || 0) < 95) return;
      this.lastWheel = now;
      const bounds = element.getBoundingClientRect();
      this.zoomBy(event.deltaY < 0 ? 1 : -1, [event.clientX - bounds.left, event.clientY - bounds.top]);
    }, { passive: false });
    element.addEventListener('keydown', event => {
      const directions = { ArrowLeft: [-65,0], ArrowRight: [65,0], ArrowUp: [0,-65], ArrowDown: [0,65] };
      if (directions[event.key]) this.pan(...directions[event.key]);
      else if (event.key === '+' || event.key === '=') this.zoomBy(1);
      else if (event.key === '-') this.zoomBy(-1);
      else if (event.key === 'Enter' && this.onPick) this.onPick([...this.center]);
      else return;
      event.preventDefault();
    });
  }

  project([lon, lat], zoom = this.zoom) {
    const size = 256 * 2 ** zoom;
    const sine = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180);
    return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size];
  }

  unproject([x, y], zoom = this.zoom) {
    const size = 256 * 2 ** zoom;
    return [Math.max(-179.99, Math.min(179.99, x / size * 360 - 180)),
      Math.max(-85, Math.min(85, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI))];
  }

  origin() {
    const [x, y] = this.project(this.center);
    return [x - this.element.clientWidth / 2, y - this.element.clientHeight / 2];
  }

  pan(dx, dy) {
    const [x, y] = this.project(this.center);
    this.center = this.unproject([x + dx, y + dy]);
    this.render();
  }

  zoomBy(delta, point) {
    const next = Math.max(3, Math.min(18, this.zoom + delta));
    if (next === this.zoom) return;
    if (point) {
      const [left, top] = this.origin();
      const fixed = this.unproject([left + point[0], top + point[1]]);
      const [x, y] = this.project(fixed, next);
      this.center = this.unproject([x - point[0] + this.element.clientWidth / 2,
        y - point[1] + this.element.clientHeight / 2], next);
    }
    this.zoom = next;
    this.render();
  }

  fit(points, maxZoom = 15) {
    if (!points.length) return;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const point of points) {
      const [x, y] = this.project(point, 0);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const width = Math.max(100, this.element.clientWidth - 88);
    const height = Math.max(95, this.element.clientHeight - 88);
    this.zoom = Math.max(3, Math.min(maxZoom, Math.floor(Math.log2(Math.min(
      width / Math.max(1e-9, right - left), height / Math.max(1e-9, bottom - top)
    )))));
    this.center = this.unproject([(left + right) / 2, (top + bottom) / 2], 0);
    this.render();
  }

  setOnline(enabled) {
    this.online = enabled;
    this.render();
  }

  getContext(canvas, width, height) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const scaledWidth = Math.round(width * ratio);
    const scaledHeight = Math.round(height * ratio);
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  }

  render() {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (!width || !height) return;
    const [left, top] = this.origin();
    const at = point => {
      const [x, y] = this.project(point);
      return [x - left, y - top];
    };
    const base = this.getContext(this.base, width, height);
    base.fillStyle = '#dce8e8';
    base.fillRect(0, 0, width, height);
    for (const [isIran, rings] of OUTLINES) {
      base.beginPath();
      for (const ring of rings) {
        ring.forEach((point, index) => index ? base.lineTo(...at(point)) : base.moveTo(...at(point)));
        base.closePath();
      }
      base.fillStyle = isIran ? '#e5ecda' : '#eef0e4';
      base.strokeStyle = isIran ? '#92a88c' : '#c3cebf';
      base.lineWidth = 1;
      base.fill('evenodd');
      base.stroke();
    }
    base.strokeStyle = '#647e6c22';
    base.lineWidth = 1;
    base.beginPath();
    for (let x = (-left % 48 + 48) % 48; x < width; x += 48) { base.moveTo(x, 0); base.lineTo(x, height); }
    for (let y = (-top % 48 + 48) % 48; y < height; y += 48) { base.moveTo(0, y); base.lineTo(width, y); }
    base.stroke();
    if (this.zoom <= 7) {
      base.font = '12px Koga, sans-serif';
      base.textAlign = 'center';
      const cities = PLACES.filter(place => place.type === 'city');
      const priority = ['tehran','mashhad','tabriz','isfahan','shiraz','abbas','zahedan','ahvaz'];
      const ordered = priority.map(id => cities.find(city => city.id === id))
        .concat(cities.filter(city => !priority.includes(city.id)));
      const labels = [];
      base.fillStyle = '#456653';
      for (const city of ordered) {
        const [x, y] = at(city.point);
        if (x < 10 || x > width - 10 || y < 20 || y > height - 42) continue;
        const half = base.measureText(city.name).width / 2 + 4;
        const box = [x - half, y - 20, x + half, y + 3];
        if (labels.some(b => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
        labels.push(box);
        base.beginPath(); base.arc(x, y, 2.5, 0, Math.PI * 2); base.fill();
        base.fillText(city.name, x, y - 7);
      }
    }
    this.renderTiles(left, top, width, height);
    const context = this.getContext(this.overlay, width, height);
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const line of this.lines) {
      context.beginPath();
      line.points.forEach((point, index) => index ? context.lineTo(...at(point)) : context.moveTo(...at(point)));
      context.strokeStyle = '#fff';
      context.lineWidth = 7;
      context.stroke();
      context.strokeStyle = line.color;
      context.lineWidth = 4;
      if (line.dashed) context.setLineDash([7, 5]);
      context.stroke();
      context.setLineDash([]);
    }
    for (const marker of this.markers) {
      const [x, y] = at(marker.point);
      context.beginPath(); context.arc(x, y, marker.hollow ? 5 : 7, 0, Math.PI * 2);
      context.fillStyle = marker.hollow ? '#fff' : marker.color;
      context.strokeStyle = marker.hollow ? marker.color : '#fff';
      context.lineWidth = 2.5;
      context.fill(); context.stroke();
    }
  }

  renderTiles(left, top, width, height) {
    const desired = new Map();
    const count = 2 ** this.zoom;
    if (this.online) {
      for (let x = Math.floor(left / 256); x <= Math.floor((left + width - 1) / 256); x++) {
        for (let y = Math.floor(top / 256); y <= Math.floor((top + height - 1) / 256); y++) {
          if (x < 0 || y < 0 || x >= count || y >= count) continue;
          desired.set([this.zoom, x, y].join('/'), [x * 256 - left, y * 256 - top]);
        }
      }
    }
    const position = (img, xy) => { img.style.transform = 'translate(' + Math.round(xy[0]) + 'px,' + Math.round(xy[1]) + 'px)'; };
    for (const [key, img] of this.images) {
      if (!desired.has(key)) { img.remove(); this.images.delete(key); }
      else position(img, desired.get(key));
    }
    const updateStatus = () => {
      const loaded = [...this.images.values()].filter(image => image.naturalWidth > 0).length;
      const status = !this.online ? 'offline' : !loaded ? 'pending' : loaded === desired.size ? 'live' : 'partial';
      this.onChange(status);
    };
    clearTimeout(this.tileTimer);
    updateStatus();
    this.tileTimer = setTimeout(() => {
      for (const [key, xy] of desired) {
        if (this.images.has(key)) continue;
        const img = new Image(256, 256);
        img.alt = '';
        img.onload = img.onerror = updateStatus;
        position(img, xy);
        this.images.set(key, img);
        this.tiles.append(img);
        img.src = 'https://tile.openstreetmap.org/' + key + '.png';
      }
    }, 160);
  }
}
