# Brain texture generator

Regenerates `public/brain.webp` (the hero brain) and the spark positions used in
`src/components/HeroBackground.tsx`.

```bash
cd tools/brain-texture
node export.js '{"K":4,"f":0.036,"s0":0.035,"s1":0.18,"dens":0.3,"n":1400000,"base":0.62,"hot":0.02,"vein":0.09,"transparent":true}'
# writes brain.png and hot.json; convert to webp (1440×1080, quality ~72)
```

Requires Playwright (Chromium). `consts.js` holds the brain outlines; `design.js`
shades the gyri, sulci, cerebellum and orange veins and stipples them into dots.
Paste the contents of `hot.json` into `BRAIN_SPARKS` in HeroBackground.tsx.
