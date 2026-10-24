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

## Hero reel

The pixel effect needs a video file on the site. YouTube cannot feed it.
`assets/video/hero-reel.mp4` is a silent 1080p loop, about 14 MB, under
Cloudflare's 25 MB file cap. It is seven seconds from each of the four
local films, with the sound removed.

To replace it, export **H.264 MP4, no audio, 1920×1080, under 25 MB**
to that same path.

## Selected work

The four cards link out to StoryLlne Records on YouTube. Posters stay
in `assets/img/posters/`. The full films are not hosted here.

## Where things are

| What | Where |
|------|-------|
| Hero reel | `assets/video/hero-reel.mp4` |
| Work posters | `assets/img/posters/` |
| YouTube links | `index.html`, the `#work` cards |
| StoryLlne channel | https://www.youtube.com/@StoryLlneRecords |
| Background stills (change as you scroll) | `assets/img/bg/bg-1.jpg` … `bg-5.jpg` |
| Effect tuning (cell size, radius, force) | `js/main.js`, the `createPixelField(heroCanvas, …)` and `createPixelField(bgCanvas, …)` calls |
| Contact email | `index.html`, `#inquiry-form` `data-email` and the contact links |
