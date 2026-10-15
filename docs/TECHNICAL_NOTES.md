# Emile photographic depth study

The application runs from a local `file://` URL with classic JavaScript and
embedded data URLs. It does not fetch assets, load a CDN, install a service
worker or start a local server. `START_EMILE.cmd` opens the local index in the
default Windows browser without elevated privileges or policy changes.

## Rendering

- Three authentic source views are retained at 2338×1501, 2349×3000 and
  2000×2226 pixels. Textures are not generatively edited.
- Depth Anything V2 Small, ONNX quantized variant, was run locally with CPU
  inference. Maps are normalized relative inverse depth, white = near. Raw
  normalized 16-bit maps and smoothed display maps are both included.
- A dense perspective-compensated surface starts exactly aligned with each
  photograph at the neutral camera position. Real perspective projection,
  rather than CSS image translation, generates the motion.
- Three disjoint depth bands share that surface. Shader reveals use depth
  rank; temporary layer offsets and small group rotations make the scene
  transitions spatial. No disoccluded background is synthesized.
- Hover and drag are bounded. This remains a single-image optical effect;
  it cannot reveal a true new camera viewpoint or hidden furniture surfaces.
- Architectural object regions are manually traced and labelled. Their
  clickable SVG outlines and pins are projected through the same depth
  coordinates and camera as the photographic surface. Masks in assets/masks
  record the analytical regions and three depth bands separately.
- Draws and overlay updates stop once the camera settles. The rendering
  pixel ratio is capped; GPU resources are reused between transitions.

## Academic evidence

The text separates specified furniture names, observed physical features,
plan counts and interpretive design principles. In particular, the garden
chair and table names in the project factsheet are not falsely matched to
ambiguous photographic evidence. The floor-plan overlays do not claim exact
fixture locations, clearances, current capacity or a reflected-ceiling plan.

The small side-panel diagrams explain principles. They are not measured
drawings or product geometry. The site records the published 2017 design;
it is not a survey of the restaurant's present-day arrangement.

## Source files

- index.html, style.css: presentation structure and responsive styling.
- app.js: Three.js rendering, scene transitions, controls and overlays.
- content.js: all educational text, source links and normalized object regions.
- scene-math.js: depth sampling and projection calculations.
- assets.bundle.js: embedded offline copies of runtime images and font.
- assets/: photographs, depth maps, segmentation masks and local font.
- source/: preparation scripts and a JSON copy of the analytical content.
- vendor/: Three.js and third-party licence notices.

Preparation scripts describe the build used here and refer to the original
working asset paths. Running the finished experience does not require them
or the model weights. See validation.json for the checks actually performed.

## Verification boundary

The package is checked with JavaScript syntax/data checks, DOM interaction
tests and offscreen OpenGL shader rendering. The available environment does
not supply the required browser-control capability, so an actual Windows
browser launch and browser visual QA cannot be claimed. The launcher itself
is a transparent local `start` command, and needs no installed developer tools.
