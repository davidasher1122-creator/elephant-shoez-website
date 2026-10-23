# Elephant Shoez

Rebuild of **https://elephantshoez.spandax.site**: AI music video production.
The hero and background use the pixel-dissolve effect from
[david-asher-music-website](https://github.com/davidasher1122-creator/david-asher-music-website),
reworked so the pixels come from a playing video.

Single page: `index.html`, `css/styles.css`, `js/main.js`. No build step.

## Preview

The pixel effect reads video frames, which browsers only allow over http (not `file://`).

```bash
cd ~/elephant-shoez-website
python3 -m http.server 5174
```

Open http://localhost:5174

- `?look=pixels` shows the hero as a mosaic at rest instead of the clean video.
- `?gate=off` skips the phone "wipe to find Enter" screen while testing.

## Swap in the silent reel

Export the compilation as **H.264 MP4, no audio track, 1920×1080 or 1280×720, under ~25 MB**
and save it as:

```
assets/video/hero-reel.mp4
```

It loops automatically. Until that file exists, the hero cuts between the four work videos
as a stand-in. Update the `poster` on `#hero-video` in `index.html` with a still from the reel.

## Where things are

| What | Where |
|------|-------|
| Hero reel | `assets/video/hero-reel.mp4` |
| Work videos | `assets/video/*.mp4` (posters in `assets/img/posters/`) |
| Background stills (change as you scroll) | `assets/img/bg/bg-1.jpg` … `bg-5.jpg` |
| Effect tuning (cell size, radius, force) | `js/main.js`, the `createPixelField(heroCanvas, …)` and `createPixelField(bgCanvas, …)` calls |
| Contact email | `index.html`, `#inquiry-form` `data-email` and the contact links |
