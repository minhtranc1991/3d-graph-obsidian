# 3D-Graph

**A 3D graph view for Obsidian that sorts a large vault into layers.**

English | [Tiếng Việt](README.vi.md)

![The vault as a tower of layers: source, concept, model, strategy, person, framework, case-study, tag, other](docs/images/layers-view.png)

*796 notes, 187 tags and 4,529 links, drawn as a tower. Each floor is one kind of note. The purple notes and links belong to the note that is open in the main window.*

3D-Graph is a personal [Obsidian](https://obsidian.md) plugin. It keeps the core **Graph view** ideas (notes are nodes, links are edges, color groups and search filters come from your own `graph.json`) and adds two things the core graph does not have: a software 3D camera and a **Layers view** that stacks your notes by type. No build step, no runtime dependencies: `main.js` is plain JavaScript.

## The problem: graph views stop helping at around 1,000 notes

The screenshots come from the author's vault. It is a knowledge graph with an explicit structure: `Concept → Model → Strategy → Execution`, plus Sources, People, Frameworks and Case Studies. At about 800 notes it already had 4,500 links and 187 tags, and it keeps growing past 1,000. That is where graph views stop answering the one question a structured vault needs answered: **how do my notes connect across layers?**

1. **The core Graph view is too basic at this size.** It is a flat 2D force layout. Thousands of nodes and links collapse into a hairball. Color groups and filters help you find a note, but not see the structure: every note is the same kind of dot, there is no depth, and a source note sits in the same cloud as the concept it feeds.
2. **Other graph views go the other way: too flashy.** Glow, neon, particles and animated "galaxy" palettes look striking in a demo, but they replace the colors you chose with decoration, and they cost frame rate and attention exactly when you are trying to work. Color and position stop carrying information.
3. **None of them separates notes by layer.** As far as I could find, no graph view stacks notes by their type. A layered vault is naturally a tower, yet every graph draws it as one cloud, so you cannot see how links climb from sources through concepts and models to strategies.

So the author built 3D-Graph to fix exactly this: stay as calm and as faithful to the core Graph view as possible, and add only what a large, layered vault needs.

## How 3D-Graph handles it

| Problem at 1,000+ notes | What 3D-Graph does |
|---|---|
| A flat hairball with no room for structure | A **3D camera**: the vault becomes one compact object you can turn. It spins slowly like a globe (clockwise, tilted axis) and pauses while your pointer is over it. |
| You cannot see the structure | **Layers view** stacks notes as floors of a tower by their `layer` or `type` frontmatter: source, concept, model, strategy, person, framework, case-study, tag, other. |
| Too basic, or too decorative | The **same look as the core Graph view**: color groups (with their alpha) are read from `.obsidian/graph.json`, other notes use `--graph-node`, links use `--graph-line`, and tags are green. No glow, no effects. |
| Hard to see where one note sits | The note open in any window gets a purple ring. Its linked notes and the links between them turn purple too, and every linked note is **labeled** (labels are moved so they do not overlap). |
| Too many nodes at once | Core-style **search** (`path:`, `file:`, `tag:#x`, `["layer":concept]`, `-`, `OR`), a **local graph** of 1-3 hops, and a toggle for tags and orphans. |
| A big graph never fits the screen | **Auto-scale**: the graph is fitted to the canvas (97% of the half-canvas by default, adjustable), measured over a full turn so it never clips while spinning, and re-fitted whenever you switch 3D, Layers view or 2D. |

### The whole vault as one object

![The vault as one 3D object, with the open note and everything linked to it in purple](docs/images/3d-view.png)

*The same 796 notes without layers. The note "Binh pháp Tôn Tử" is open in the main window: it and every note linked to it are purple and labeled, and the rest of the vault is drawn in your own color groups.*

### The vault as a tower

The Layers view is the same graph, but each kind of note gets its own floor (the dashed discs). In the first screenshot the floors run from `source` at the top to `other` at the bottom. Links from the open note climb through the floors, so you can read the structure at a glance: which concepts a source feeds, which models formalize them, and which strategies use those models. Layers are about 30% wider and the gap between floors about 10% smaller than the base layout, so the tower stays compact; both are adjustable.

## Try it: the demo vault

`demo-vault/` is a small vault cloned from the author's vault: **one note per layer**. The tag floor is made of the tags those notes carry.

| Floor | Demo note |
|---|---|
| source | `Binh pháp Tôn Tử` |
| concept | `C - Information Asymmetry` |
| model | `M - Game Theory Model` |
| strategy | `S - Premortem` |
| person | `P - Charles Ponzi` |
| framework | `C - Thế bất khả chiến bại` |
| case-study | `CS - Cambridge Analytica` |
| other | `CH01 - Kế (Laying Plans)` |
| tag | 15 tags from the notes above |

The notes are trimmed copies, and their links were rewired to point at each other. The text is Vietnamese, as in the original vault. To open it:

1. In Obsidian choose **Open folder as vault** and pick `demo-vault`.
2. Copy `main.js`, `manifest.json` and `styles.css` into `demo-vault/.obsidian/plugins/3d-graph/`.
3. Enable **3D-Graph** under Settings, Community plugins, then open it from the ribbon icon.
4. Open any note in the main window and watch it light up in purple. Press the layers button to see the nine floors.

`demo-vault/.obsidian/graph.json` carries the author's color groups, so the demo looks like the screenshots.

## Features

- **3D camera, no dependencies.** Drag on empty space to rotate, `Shift`+drag or right-drag to pan, wheel to zoom, click a note to open it (`Ctrl`/`Cmd`+click for a new tab).
- **Spins like a globe**, with adjustable speed, direction and axis tilt.
- **Layers view** for the ontology: `source`, `concept`, `model`, `strategy`, `execution`, `person`, `framework`, `case-study`, `news`, `tag`, `other`.
- **Active-note highlight** with labels for every linked note.
- **Tags as nodes.** Green nodes linked to the notes that carry them; click a tag to filter by it.
- **Core-style search and color groups.**
- **Local graph** around the active note, 1-3 hops.
- **Flat 2D mode** like the core Graph view, with the tower turned off.
- **Pointer capture on the canvas**, so dragging works in popout windows and on any monitor.

## Controls

A single gear icon sits in the top-right corner. Click it to reveal four buttons:

| Button | What it does |
|---|---|
| Settings | Opens the settings menu (top right, every group collapsed). |
| Layers view | Turns the tower on or off. |
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

## Install

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/minhtranc1991/3d-graph-obsidian/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/3d-graph/`.
3. Reload Obsidian and enable **3D-Graph** under Settings, Community plugins.
4. Open it from the ribbon icon (orbit) or the command **Open 3D-Graph**.

Requires Obsidian 1.4.0 or newer, desktop only.

## Notes on performance

Rendering is a single canvas pass: nodes are batched by color and depth, edges are one path, and the projection is a cached 3x3 matrix. While spinning, if drawing is slow the plugin draws a fixed subset of edges and shows `fps` and the draw time in the bottom-left status line. The layout is a grid-limited 3D force simulation, and metadata events only rebuild it when the visible notes, links or layers really change.

## Development

```bash
npm install
npm test
```

`test/smoke.cjs` loads `main.js` against a stubbed Obsidian API and a jsdom DOM (no Obsidian needed). It checks the query parser, the layout, rotation and input, the active-note highlight, tags, colors, the settings menu, 2D mode and the auto-fit bounds.

## Limitations

- The canvas and the Obsidian API are only stubbed in the tests, so the plugin has not been verified against every theme.
- Search matches names, paths, tags and frontmatter, not note content.
- Single nodes cannot be dragged.
- The comparison with other graph views reflects the author's own search and experience, not a complete survey.

## License

[MIT](LICENSE)
