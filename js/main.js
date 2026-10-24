/* Elephant Shoez — pixel-dissolve video hero + dissolving background.
   Ported from the David Asher Music particle field, reworked so the
   source can be a playing <video> instead of a still image. */
(function () {
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const params = new URLSearchParams(location.search);

  let gateDone = false;
  try {
    gateDone = sessionStorage.getItem("es-entered") === "1";
  } catch {}
  // Phones open on a full-screen wipe. Reduced motion skips it so Enter is never trapped.
  const showGate = !finePointer && !gateDone && !reduceMotion && params.get("gate") !== "off";
  root.classList.add(finePointer ? "is-mouse" : "is-touch");
  if (reduceMotion) root.classList.add("is-reduced");
  if (!finePointer) root.classList.add(showGate ? "is-gate" : "is-entered");

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  /* =========================================================
     Pixel field
     The source (image or video) is painted to the canvas, cut into a
     grid of cells. Cells near the pointer get pushed off their home
     spot, leaving a hole, and spring back. Only moving cells are drawn
     one by one, so a full-screen video stays cheap.
     ========================================================= */
  function createPixelField(canvas, opts) {
    const cfg = Object.assign(
      {
        cell: 7,
        radius: 140,
        force: 7,
        jitter: 1.6,
        spring: 0.045,
        drag: 0.86,
        look: "crisp", // "crisp" = real video at rest, "pixels" = mosaic at rest
        opacity: 1,
        globalPointer: false,
        interactive: true,
        stick: false,
        stickDist: 16,
        ring: false,
        focusY: 0.5,
      },
      opts
    );

    const ctx = canvas.getContext("2d");
    const off = document.createElement("canvas");
    const octx = off.getContext("2d", { willReadFrequently: true });

    let sources = cfg.sources;
    let srcIndex = 0;
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let dx, dy, vx, vy, flags; // flags: 1 = moving, 2 = stuck (gate)
    let active = [];
    let crop = null;
    let cropKey = "";
    let pixels = null;
    let canRead = true;
    let lastSampleTime = -1;
    let lastSrc = null;
    let everReady = false;
    let mx = -1e4;
    let my = -1e4;
    let down = false;
    let visible = true;
    let revealTick = 0;
    let revealed = false;

    function srcSize(src) {
      if (src instanceof HTMLVideoElement) {
        return src.readyState >= 2 && src.videoWidth ? [src.videoWidth, src.videoHeight] : null;
      }
      return src.complete && src.naturalWidth ? [src.naturalWidth, src.naturalHeight] : null;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (w < 2 || h < 2) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / cfg.cell);
      rows = Math.ceil(h / cfg.cell);
      const n = cols * rows;
      dx = new Float32Array(n);
      dy = new Float32Array(n);
      vx = new Float32Array(n);
      vy = new Float32Array(n);
      flags = new Uint8Array(n);
      active = [];
      off.width = cols;
      off.height = rows;
      crop = null;
      cropKey = "";
      pixels = null;
    }

    // Cover-fit the source over the whole grid.
    function fit(size) {
      const key = size.join("x");
      if (crop && key === cropKey) return;
      cropKey = key;
      const [sw0, sh0] = size;
      const gw = cols * cfg.cell;
      const gh = rows * cfg.cell;
      const scale = Math.max(gw / sw0, gh / sh0);
      const sw = gw / scale;
      const sh = gh / scale;
      crop = { sx: (sw0 - sw) / 2, sy: (sh0 - sh) * cfg.focusY, sw, sh };
      pixels = null;
    }

    function sample(src) {
      octx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows);
      if (!canRead) return;
      try {
        pixels = octx.getImageData(0, 0, cols, rows).data;
      } catch {
        // file:// pages can't read video pixels; moving cells fall back to grey.
        canRead = false;
        pixels = null;
        console.warn("Pixel colours unavailable. Serve the site over http (see README).");
      }
    }

    function wake(i) {
      if (!(flags[i] & 1)) {
        flags[i] |= 1;
        active.push(i);
      }
    }

    function push() {
      if (mx < -1000 || !cfg.interactive) return;
      const R = down ? cfg.radius * 1.35 : cfg.radius;
      const force = down ? cfg.force * 1.5 : cfg.force;
      const cell = cfg.cell;
      const c0 = Math.max(0, Math.floor((mx - R) / cell));
      const c1 = Math.min(cols - 1, Math.floor((mx + R) / cell));
      const r0 = Math.max(0, Math.floor((my - R) / cell));
      const r1 = Math.min(rows - 1, Math.floor((my + R) / cell));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const i = r * cols + c;
          const px = c * cell + cell / 2 + dx[i] - mx;
          const py = r * cell + cell / 2 + dy[i] - my;
          const d2 = px * px + py * py;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * force;
          vx[i] += (px / d) * f + (Math.random() - 0.5) * cfg.jitter;
          vy[i] += (py / d) * f + (Math.random() - 0.5) * cfg.jitter;
          wake(i);
        }
      }
    }

    function step() {
      const stick2 = cfg.stickDist * cfg.stickDist;
      for (let k = active.length - 1; k >= 0; k--) {
        const i = active[k];
        if (flags[i] & 2) {
          vx[i] *= 0.86;
          vy[i] *= 0.86;
        } else {
          vx[i] = (vx[i] - dx[i] * cfg.spring) * cfg.drag;
          vy[i] = (vy[i] - dy[i] * cfg.spring) * cfg.drag;
        }
        dx[i] += vx[i];
        dy[i] += vy[i];
        if (cfg.stick && !(flags[i] & 2) && dx[i] * dx[i] + dy[i] * dy[i] > stick2) {
          flags[i] |= 2;
        }
        if (
          !(flags[i] & 2) &&
          Math.abs(dx[i]) < 0.3 && Math.abs(dy[i]) < 0.3 &&
          Math.abs(vx[i]) < 0.05 && Math.abs(vy[i]) < 0.05
        ) {
          dx[i] = dy[i] = vx[i] = vy[i] = 0;
          flags[i] = 0;
          active[k] = active[active.length - 1];
          active.pop();
        }
      }
    }

    function draw(src) {
      ctx.clearRect(0, 0, w, h);
      if (!crop) return;
      const cell = cfg.cell;
      const gw = cols * cell;
      const gh = rows * cell;
      ctx.globalAlpha = cfg.opacity;
      if (cfg.look === "pixels") {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, cols, rows, 0, 0, gw, gh);
      } else {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, gw, gh);
      }

      // Holes where cells have left home.
      for (let k = 0; k < active.length; k++) {
        const i = active[k];
        ctx.clearRect((i % cols) * cell, ((i / cols) | 0) * cell, cell, cell);
      }
      // The cells themselves, in flight.
      const s = cell * 0.9;
      for (let k = 0; k < active.length; k++) {
        const i = active[k];
        const p = i * 4;
        ctx.fillStyle = pixels ? `rgb(${pixels[p]},${pixels[p + 1]},${pixels[p + 2]})` : "#77756c";
        ctx.fillRect((i % cols) * cell + dx[i], ((i / cols) | 0) * cell + dy[i], s, s);
      }
      ctx.globalAlpha = 1;

      if (cfg.ring && mx > -1000) {
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = "rgba(242,238,229,0.75)";
        ctx.beginPath();
        ctx.arc(mx, my, down ? 26 : 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(170,140,193,0.7)";
        ctx.beginPath();
        ctx.arc(mx, my, down ? 46 : 34, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Gate: once enough of the Enter button is wiped bare, unlock it.
    function checkReveal() {
      if (revealed || !cfg.revealTarget || !cfg.onReveal) return;
      revealTick = (revealTick + 1) % 8;
      if (revealTick) return;
      const t = cfg.revealTarget();
      if (!t || t.w <= 0) return;
      const cell = cfg.cell;
      const c0 = Math.max(0, Math.floor(t.x / cell));
      const c1 = Math.min(cols - 1, Math.floor((t.x + t.w) / cell));
      const r0 = Math.max(0, Math.floor(t.y / cell));
      const r1 = Math.min(rows - 1, Math.floor((t.y + t.h) / cell));
      let total = 0;
      let open = 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          total++;
          if (flags[r * cols + c] & 2) open++;
        }
      }
      if (total && open / total >= 0.22) {
        revealed = true;
        cfg.onReveal();
      }
    }

    function frame() {
      requestAnimationFrame(frame);
      if (!visible || document.hidden || !cols) return;
      let src = sources[srcIndex];
      let size = srcSize(src);
      // Until the video's first frame, paint its poster so the stage is never empty.
      // Between clips, just hold the last frame.
      if (size) everReady = true;
      else if (cfg.poster && !everReady) {
        src = cfg.poster;
        size = srcSize(src);
      }
      if (!size) return;
      if (src !== lastSrc) {
        lastSrc = src;
        pixels = null;
      }
      fit(size);
      const isVideo = src instanceof HTMLVideoElement;
      if (!pixels || (isVideo && src.currentTime !== lastSampleTime)) {
        sample(src);
        lastSampleTime = isVideo ? src.currentTime : 0;
      }
      push();
      step();
      draw(src);
      checkReveal();
      if (cfg.onFirstDraw) {
        cfg.onFirstDraw();
        cfg.onFirstDraw = null;
      }
    }

    /* ——— Input ——— */
    function setPointer(x, y) {
      const rect = canvas.getBoundingClientRect();
      if (!cfg.globalPointer && (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)) {
        mx = my = -1e4;
        return;
      }
      mx = x - rect.left;
      my = y - rect.top;
      if (cfg.onTouch) cfg.onTouch();
    }
    const target = cfg.globalPointer ? window : canvas;
    target.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") setPointer(e.clientX, e.clientY);
    }, { passive: true });
    target.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") down = true;
    }, { passive: true });
    window.addEventListener("pointerup", () => (down = false));
    if (!cfg.globalPointer) {
      canvas.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "touch") mx = my = -1e4;
      });
    }
    // Touch events keep firing while the page scrolls, so a scrolling finger still pushes pixels.
    const onTouch = (e) => {
      const t = e.touches[0];
      if (t) setPointer(t.clientX, t.clientY);
    };
    target.addEventListener("touchstart", onTouch, { passive: true });
    target.addEventListener("touchmove", onTouch, { passive: true });
    target.addEventListener("touchend", () => (mx = my = -1e4), { passive: true });
    target.addEventListener("touchcancel", () => (mx = my = -1e4), { passive: true });

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (cfg.onVisible) cfg.onVisible(visible);
    }).observe(canvas);

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });
    resize();
    requestAnimationFrame(frame);

    return {
      // Scatter a share of all cells at once, used as a transition.
      scramble(share = 0.3, power = 9) {
        const n = cols * rows;
        const count = Math.floor(n * share);
        for (let k = 0; k < count; k++) {
          const i = (Math.random() * n) | 0;
          const a = Math.random() * Math.PI * 2;
          const p = power * (0.3 + Math.random());
          vx[i] += Math.cos(a) * p;
          vy[i] += Math.sin(a) * p;
          wake(i);
        }
      },
      setSource(idx) {
        if (idx === srcIndex) return;
        srcIndex = idx;
        crop = null;
        pixels = null;
        this.scramble(0.35, 10);
      },
      // Let stuck cells (from the gate) fly home.
      release() {
        cfg.stick = false;
        for (const i of active) flags[i] &= ~2;
      },
      set(key, value) {
        cfg[key] = value;
      },
    };
  }

  /* =========================================================
     Hero reel
     ========================================================= */
  const heroVideo = document.querySelector("#hero-video");
  const heroCanvas = document.querySelector("#hero-canvas");
  const heroStage = document.querySelector(".hero__stage");
  const enterBtn = document.querySelector("#hero-enter");

  function startReel(video) {
    video.loop = true;
    video.muted = true;
    video.src = video.dataset.src;
    video.play().catch(() => {});
  }

  if (heroVideo instanceof HTMLVideoElement) {
    if (reduceMotion) {
      heroVideo.removeAttribute("autoplay");
      heroVideo.preload = "none";
    } else {
      startReel(heroVideo);
    }
  }

  if (!reduceMotion && heroVideo && heroCanvas instanceof HTMLCanvasElement) {
    const look = params.get("look") === "pixels" ? "pixels" : "crisp";
    const revealTarget = () => {
      const box = heroCanvas.getBoundingClientRect();
      const b = enterBtn.getBoundingClientRect();
      return { x: b.left - box.left, y: b.top - box.top, w: b.width, h: b.height };
    };
    const poster = new Image();
    poster.src = heroVideo.getAttribute("poster");
    const heroField = createPixelField(heroCanvas, {
      sources: [heroVideo],
      poster,
      look,
      cell: finePointer ? 7 : 8,
      radius: finePointer ? 140 : 46,
      force: finePointer ? 7 : 5,
      jitter: finePointer ? 1.6 : 0.6,
      spring: finePointer ? 0.04 : 0.05,
      drag: finePointer ? 0.85 : 0.78,
      ring: finePointer,
      // Phones only play with the reel on the entry screen; after that a finger just scrolls.
      interactive: finePointer || showGate,
      stick: showGate,
      revealTarget: showGate ? revealTarget : null,
      onReveal: () => root.classList.add("is-gate-ready"),
      onTouch: () => heroStage.classList.add("is-touched"),
      onFirstDraw: () => heroStage.classList.add("is-reel-ready"),
      onVisible: (on) => {
        if (on) heroVideo.play().catch(() => {});
        else heroVideo.pause();
      },
    });
    if (showGate) {
      document.querySelector(".hero__hint").textContent = "Wipe the reel to find Enter";
    }

    enterBtn.addEventListener("click", () => {
      root.classList.remove("is-gate", "is-gate-ready");
      root.classList.add("is-entered");
      try {
        sessionStorage.setItem("es-entered", "1");
      } catch {}
      heroField.release();
      heroField.set("interactive", false);
      window.scrollTo(0, 0);
    });
  }

  /* =========================================================
     Background: stills from the work, one per stretch of the page
     ========================================================= */
  const bgCanvas = document.querySelector("#bg-canvas");
  if (!reduceMotion && bgCanvas instanceof HTMLCanvasElement) {
    const stills = ["bg-1", "bg-2", "bg-3", "bg-4", "bg-5"].map((name) => {
      const img = new Image();
      img.src = `assets/img/bg/${name}.jpg`;
      return img;
    });
    const bgField = createPixelField(bgCanvas, {
      sources: stills,
      look: "pixels",
      cell: finePointer ? 9 : 10,
      radius: finePointer ? 170 : 70,
      force: finePointer ? 6 : 4,
      jitter: 1.2,
      spring: 0.03,
      drag: 0.88,
      opacity: 0.85,
      globalPointer: true,
    });
    let lastBg = 0;
    window.addEventListener("scroll", () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const t = max > 0 ? scrollY / max : 0;
      const idx = Math.min(stills.length - 1, Math.floor(t * stills.length));
      if (idx !== lastBg) {
        lastBg = idx;
        bgField.setSource(idx);
      }
    }, { passive: true });
  }

  /* =========================================================
     Page chrome
     ========================================================= */
  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const toggle = document.querySelector(".nav-toggle");
  const drawer = document.querySelector("#nav-drawer");
  if (toggle && drawer) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      drawer.classList.toggle("is-open", open);
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  }

  const reveals = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    // Replays every time: blocks fade out when they leave the screen and
    // rise back in from whichever edge they re-enter.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const el = e.target;
        if (e.isIntersecting) {
          el.classList.add("is-in");
        } else {
          el.dataset.from = e.boundingClientRect.top < 0 ? "above" : "below";
          el.classList.remove("is-in");
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  // Only one work video plays at a time.
  const workVideos = document.querySelectorAll(".video-card video");
  workVideos.forEach((v) => {
    v.addEventListener("play", () => {
      workVideos.forEach((o) => o !== v && o.pause());
    });
  });

  /* ——— Inquiry form: composes an email ——— */
  const form = document.querySelector("#inquiry-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const get = (k) => String(data.get(k) || "").trim();
      const status = form.querySelector(".form-status");
      if (!get("name") || !get("email") || !get("message")) {
        status.textContent = "Please add your name, email, and idea.";
        return;
      }
      const subject = encodeURIComponent(`Music video project: ${get("artist") || get("name")}`);
      const lines = [`Name: ${get("name")}`, `Email: ${get("email")}`];
      if (get("artist")) lines.push(`Artist / project: ${get("artist")}`);
      if (get("track")) lines.push(`Track: ${get("track")}`);
      lines.push("", get("message"));
      const body = encodeURIComponent(lines.join("\n"));
      status.textContent = "Opening your email app…";
      location.href = `mailto:${form.dataset.email}?subject=${subject}&body=${body}`;
    });
  }
})();
