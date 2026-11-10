# 3D-Graph

A personal [Obsidian](https://obsidian.md) plugin: the core **Graph view** idea (notes are nodes, links are edges, color groups and search filters from `graph.json`), drawn on a 2D canvas with a software 3D camera, so a large vault (thousands of notes) reads as one compact, rotating object instead of a hairball.

No build step and no runtime dependencies: `main.js` is plain JavaScript.

## Features

- **3D camera, no dependencies.** Drag on empty space to rotate, `Shift`+drag or right-drag to pan, wheel to zoom, click a note to open it (`Ctrl`/`Cmd`+click for a new tab).
- **Spins like a globe.** Clockwise seen from above, on an axis tilted like a globe. It pauses while the pointer is over the graph, the controls or the menu.
- **Layers view.** Stacks the ontology (`source`, `concept`, `model`, `strategy`, `execution`, `person`, `framework`, `case-study`, `news`, `tag`, `other`) as floors of a tower, using the `layer` or `type` frontmatter property.
- **Active-note highlight.** The note open in any window gets a purple ring. Notes linked to or from it, and the links between them, are purple too, and every linked note is labeled (labels are moved so they do not overlap).
- **Tags as nodes.** Tags are green nodes linked to the notes that carry them. Click a tag to filter the graph by it.
- **Same look as the core Graph view.** Color groups (with their alpha) are read from `.obsidian/graph.json`. Notes with no group use `--graph-node`; links use `--graph-line`; labels use `--graph-text`.
- **Core-style search.** `path:`, `file:`, `tag:#x`, `["property":value]`, `-` to exclude and `OR`.
- **Local graph.** Limit the view to 1-3 hops around the active note.
- **Flat 2D mode** like the core Graph view, with the tower turned off.
- **Auto-scale.** The graph is fitted to the canvas (default 97% of the half-canvas, checked over a full turn so it never clips while spinning). It re-fits whenever you switch 3D, Layers view or 2D.
- **Pointer capture on the canvas.** Dragging works in popout windows and on any monitor.

## Controls

A single gear icon sits in the top-right corner. Click it to reveal four buttons:

| Button | What it does |
|---|---|
| Settings | Opens the settings menu (top right, every group collapsed). |
| Layers view | Turns the layers tower on or off. |
| 3D view | Switches between 3D and a flat 2D view. |
| Reset | Resets the camera and fits the graph again. |

### Settings menu

| Group | Options |
|---|---|
| Filters | Search, local depth, Tags, Orphans |
| Groups | The color groups read from `graph.json`, Reload colors |
| Display | Node size and opacity, fade with depth, dim unrelated notes, link thickness and opacity, active-note link width, label size, auto-fit fill |
| Spin | On/off, clockwise, speed, axis tilt |
| Forces | Center, repel and link force, link distance |
| Layers | Width inside a layer, distance between layers |

Defaults worth knowing: active-note links are 1.8 px wide, a layer is 30% wider and the gap between layers 10% smaller than the base layout, and the graph fills 97% of the half-canvas.

## Install

1. Copy `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/3d-graph/`.
2. Reload Obsidian and enable **3D-Graph** under Settings, Community plugins.
3. Open it from the ribbon icon (orbit) or the command **Open 3D-Graph**.

Requires Obsidian 1.4.0 or newer, desktop only.

## Notes on performance

Rendering is a single canvas pass: nodes are batched by color and depth, edges are one path, and the projection is a cached 3x3 matrix. While spinning, if drawing is slow the plugin draws a fixed subset of edges and shows `fps` and the draw time in the bottom-left status line. The layout is a grid-limited 3D force simulation; metadata events only rebuild it when the visible notes, links or layers really change.

## Development

```bash
npm install
npm test
```

`test/smoke.cjs` loads `main.js` against a stubbed Obsidian API and a jsdom DOM (no Obsidian needed) and checks the query parser, the layout, rotation and input, the active-note highlight, tags, colors, the settings menu, 2D mode, and the auto-fit bounds.

## Limitations

- The canvas and the Obsidian API are only stubbed in the tests, so the plugin has not been verified against every theme.
- Search matches names, paths, tags and frontmatter, not note content.
- Single nodes cannot be dragged.
