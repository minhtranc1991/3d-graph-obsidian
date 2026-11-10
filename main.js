"use strict";
/*
 * 3D-Graph — personal plugin, no build step, no dependencies.
 * Same idea as the core Graph view (nodes = notes, edges = links, color groups
 * and search filters from graph.json), drawn on a 2D canvas with a software
 * 3D camera. "Layers" mode stacks the ontology (source / concept / model /
 * strategy / execution / ...) as planes so a big vault reads as a compact tower.
 *
 * All pointer input uses setPointerCapture on the canvas itself, so it works in
 * popout windows and on any monitor (no global window listeners).
 */
const { Plugin, ItemView, getAllTags, Notice, debounce, setIcon } = require("obsidian");

const VIEW_TYPE = "3d-graph";
const DEFAULTS = {
	filter: '-path:"06 - People/supreme-intelligence"',
	depth: 0,
	layers: true,
	spread: 1,
	orphans: true,
	spin: true,
	tags: true,
	menuOpen: false, // the gear's button stack
	settingsOpen: false, // the settings menu
	view3d: true, // false = flat 2D like the core Graph view
	// display
	nodeSize: 1,
	nodeOpacity: 1,
	depthFade: 0.15, // how much far nodes fade (0 = none)
	dimOthers: 0.85, // opacity of notes unrelated to the active one
	linkThickness: 1,
	linkOpacity: 0.22,
	activeLinkWidth: 1.8, // purple links of the active note
	labelSize: 12,
	// spin
	tilt: 23.5, // degrees
	clockwise: true,
	// forces
	center: 0.02,
	repel: 1,
	linkForce: 1,
	// layers
	layerWidth: 1.3, // width inside one layer (x1.3 = +30%)
	layerGap: 0.9, // distance between layers (x0.9 = -10%)
	spinSpeed: 0.35, // rad/s, clockwise seen from above (~18 s per turn)
};
const TAG_KEY = "@tag"; // palette marker: tag nodes use the theme green unless a graph.json group matches them
const PURPLE = "#a855f7"; // active note, its neighbors and the links between them
// Plane order, top to bottom. Unknown keys fall into "other".
const PLANE_ORDER = ["source", "concept", "model", "strategy", "execution", "person", "framework", "case-study", "news", "tag", "other"];

/* ------------------------------------------------------------------ query */

function unquote(s) {
	s = s.trim();
	return s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"' ? s.slice(1, -1) : s;
}

function tokenTest(body) {
	const low = (s) => String(s).toLowerCase();
	if (body[0] === "[" && body[body.length - 1] === "]") {
		const inner = body.slice(1, -1);
		const i = inner.indexOf(":");
		const key = unquote(i < 0 ? inner : inner.slice(0, i));
		const val = i < 0 ? "" : unquote(inner.slice(i + 1));
		return (n) => {
			const v = n.fm[key];
			if (v === undefined || v === null) return false;
			if (val === "") return true;
			return (Array.isArray(v) ? v : [v]).some((x) => low(x) === low(val));
		};
	}
	const m = /^([A-Za-z]+):(.*)$/.exec(body);
	if (m) {
		const kind = m[1].toLowerCase();
		const val = low(unquote(m[2]));
		if (kind === "path") return (n) => low(n.path).includes(val);
		if (kind === "file") return (n) => low(n.name).includes(val);
		if (kind === "tag") {
			const t = val.startsWith("#") ? val : "#" + val;
			return (n) => n.tags.some((x) => x.startsWith(t));
		}
	}
	const val = low(unquote(body));
	return (n) => low(n.name).includes(val) || low(n.path).includes(val);
}

/** Core-graph-like query: terms ANDed, `OR` splits groups, `-` negates; supports path: file: tag: ["prop":value]. */
function compileQuery(q) {
	const groups = [[]];
	const re = /(-?)(\[[^\]]*\]|[A-Za-z]+:"[^"]*"|[A-Za-z]+:\S+|"[^"]*"|\S+)/g;
	let m;
	while ((m = re.exec(q || ""))) {
		if (m[2] === "OR" && !m[1]) {
			groups.push([]);
			continue;
		}
		groups[groups.length - 1].push({ neg: m[1] === "-", test: tokenTest(m[2]) });
	}
	const used = groups.filter((g) => g.length);
	if (!used.length) return () => true;
	return (n) => used.some((g) => g.every((t) => t.test(n) !== t.neg));
}

function planeKey(fm) {
	const k = String((fm && (fm.layer || fm.type)) || "other").toLowerCase();
	return PLANE_ORDER.includes(k) ? k : "other";
}

/* ------------------------------------------------------------------- sim */

/** 3D force layout: grid-limited repulsion, degree-weighted springs, gravity (compactness), optional z planes. */
class Sim {
	constructor(n, edges, deg, L, zt) {
		this.n = n;
		this.edges = edges; // Int32Array pairs
		this.deg = deg;
		this.L = L;
		this.zt = zt; // Float64Array | null
		this.p = { center: 0.02, repel: 1, link: 1 }; // live force parameters
		this.flat = false; // 2D mode: keep z = 0
		this.px = new Float64Array(n);
		this.py = new Float64Array(n);
		this.pz = new Float64Array(n);
		this.vx = new Float64Array(n);
		this.vy = new Float64Array(n);
		this.vz = new Float64Array(n);
		this.alpha = 1;
	}

	step() {
		const { n, px, py, pz, vx, vy, vz, L, zt, edges, deg } = this;
		const a = this.alpha;
		const cell = L * 2.2;
		const R2 = cell * cell;
		const k = L * L * 0.9 * this.p.repel;
		const grid = new Map();
		const key = (ix, iy, iz) => (ix + 4096) * 67108864 + (iy + 4096) * 8192 + (iz + 4096);
		const cx = new Int32Array(n);
		const cy = new Int32Array(n);
		const cz = new Int32Array(n);
		for (let i = 0; i < n; i++) {
			cx[i] = Math.floor(px[i] / cell);
			cy[i] = Math.floor(py[i] / cell);
			cz[i] = Math.floor(pz[i] / cell);
			const kk = key(cx[i], cy[i], cz[i]);
			const l = grid.get(kk);
			if (l) l.push(i);
			else grid.set(kk, [i]);
		}
		const minD2 = L * L * 0.01;
		for (let i = 0; i < n; i++) {
			for (let ox = -1; ox <= 1; ox++)
				for (let oy = -1; oy <= 1; oy++)
					for (let oz = -1; oz <= 1; oz++) {
						const l = grid.get(key(cx[i] + ox, cy[i] + oy, cz[i] + oz));
						if (!l) continue;
						for (let t = 0; t < l.length; t++) {
							const j = l[t];
							if (j <= i) continue;
							let dx = px[i] - px[j];
							let dy = py[i] - py[j];
							let dz = pz[i] - pz[j];
							let d2 = dx * dx + dy * dy + dz * dz;
							if (d2 > R2) continue;
							if (d2 < 1e-9) {
								dx = Math.random() - 0.5;
								dy = Math.random() - 0.5;
								dz = Math.random() - 0.5;
								d2 = dx * dx + dy * dy + dz * dz;
							}
							if (d2 < minD2) d2 = minD2;
							const f = (k / d2) * a;
							vx[i] += dx * f;
							vy[i] += dy * f;
							vz[i] += dz * f;
							vx[j] -= dx * f;
							vy[j] -= dy * f;
							vz[j] -= dz * f;
						}
					}
		}
		for (let e = 0; e < edges.length; e += 2) {
			const i = edges[e];
			const j = edges[e + 1];
			const dx = px[j] - px[i];
			const dy = py[j] - py[i];
			// With planes, links act in x/y only: cross-layer links must not drag nodes off their plane.
			const dz = zt ? 0 : pz[j] - pz[i];
			const d = Math.hypot(dx, dy, dz) || 1e-6;
			const f = ((d - L) / d) * ((0.7 * this.p.link) / Math.min(deg[i], deg[j])) * a;
			vx[i] += dx * f;
			vy[i] += dy * f;
			vz[i] += dz * f;
			vx[j] -= dx * f;
			vy[j] -= dy * f;
			vz[j] -= dz * f;
		}
		for (let i = 0; i < n; i++) {
			vx[i] -= px[i] * this.p.center * a;
			vy[i] -= py[i] * this.p.center * a;
			if (zt) vz[i] += (zt[i] - pz[i]) * 0.5 * a;
			else vz[i] -= pz[i] * this.p.center * a;
			vx[i] *= 0.55;
			vy[i] *= 0.55;
			vz[i] *= 0.55;
			const sp = Math.hypot(vx[i], vy[i], vz[i]);
			if (sp > L) {
				const c = L / sp;
				vx[i] *= c;
				vy[i] *= c;
				vz[i] *= c;
			}
			px[i] += vx[i];
			py[i] += vy[i];
			pz[i] += vz[i];
			if (this.flat) {
				pz[i] = 0;
				vz[i] = 0;
			}
		}
		this.alpha = Math.max(0, a * 0.985);
	}

	get settled() {
		return this.alpha < 0.03;
	}
}

/* ------------------------------------------------------------------ view */

class GraphView3D extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.all = []; // every candidate node {path,name,fm,tags}
		this.edgesAll = []; // [pathA, pathB]
		this.sim = null;
		this.nodes = []; // visible nodes (index-aligned with sim)
		this.pos = new Map(); // path -> [x,y,z] remembered across rebuilds
		this.groups = []; // color groups from graph.json
		this.yaw = 0.6;
		this.pitch = -0.35;
		this.zoom = 1;
		this.fitZoom = 1;
		this.panX = 0;
		this.panY = 0;
		this.R = 100;
		this.autoFit = true;
		this.hover = -1;
		this.rootPath = null;
		this.raf = 0;
		this.dirty = true;
		this.planes = [];
		this.Rxy = 100;
		this.activePath = null; // note open in the main window
		this.activeIdx = -1;
		this.activeNb = new Set(); // indices linked to/from the active note
		this.spin = 0;
		this.inside = false; // pointer over the canvas: the globe stops turning
		this.dragging = false;
		this.lastT = 0;
		this.palette = [null]; // css colors from graph.json groups; index 0 = default
		this.colorIdx = new Uint16Array(0);
		this.drawMs = 0;
		this.fps = 60;
		this.lastDrawT = 0;
		this.lite = 1;
		this.wasSpinning = false;
		this._statusT = 0;
		this.userMoved = false;
		this.edgesSel = [];
		this.tagNodes = new Map(); // "#tag" -> node
		this.tagCount = 0;
		this.searchEl = null;
		this._prevN = 0;
		this.tiltDeg = 23.5;
		this.wScale = 1;
		this.is3d = true;
		this.panel = null;
	}

	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return "3D-Graph";
	}
	getIcon() {
		return "orbit";
	}

	async onOpen() {
		const s = this.plugin.settings;
		const root = this.contentEl;
		root.empty();
		root.addClass("qg3d-root");
		this.canvas = root.createEl("canvas", { cls: "qg3d-canvas" });
		this.status = root.createDiv({ cls: "qg3d-status" });

		// One gear icon, top right (like the core Graph view); it reveals the buttons.
		const ctl = root.createDiv({ cls: "qg3d-controls" });
		const mk = (parent, icon, tip) => {
			const b = parent.createEl("button", { cls: "qg3d-ibtn", attr: { "aria-label": tip } });
			setIcon(b, icon);
			return b;
		};
		this.btnMenu = mk(ctl, "settings", "Graph controls");
		this.stack = ctl.createDiv({ cls: "qg3d-stack" });
		this.btnSettings = mk(this.stack, "sliders-horizontal", "Settings");
		this.btnLayers = mk(this.stack, "layers", "Layers view");
		this.btn3d = mk(this.stack, "box", "3D view");
		this.btnReset = mk(this.stack, "rotate-ccw", "Reset");
		const save = () => this.plugin.saveSettings();
		this.btnMenu.addEventListener("click", () => {
			s.menuOpen = !s.menuOpen;
			save();
			this.syncButtons();
		});
		this.btnSettings.addEventListener("click", () => {
			s.settingsOpen = !s.settingsOpen;
			save();
			this.syncButtons();
		});
		this.btnLayers.addEventListener("click", () => {
			s.layers = !s.layers;
			save();
			this.syncButtons();
			this.apply();
		});
		this.btn3d.addEventListener("click", () => {
			s.view3d = !s.view3d;
			save();
			this.syncButtons();
			this.autoFit = !this.userMoved;
			this.apply();
		});
		this.btnReset.addEventListener("click", () => this.resetView());

		this.panel = root.createDiv({ cls: "qg3d-panel" });
		// the globe stops turning while the pointer is over the controls or the settings menu
		for (const el of [ctl, this.panel]) {
			el.addEventListener("pointerenter", () => (this.inside = true));
			el.addEventListener("pointerleave", () => {
				this.inside = false;
				this.kick();
			});
		}
		this.buildPanel();
		this.syncButtons();
		this.ctx = this.canvas.getContext("2d");
		this.bindPointer();

		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(root);

		this.registerEvent(
			this.app.workspace.on("file-open", (f) => {
				if (f && f.extension === "md") this.onActiveFile(f.path);
			})
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				const f = leaf && leaf.view && leaf.view.file;
				if (f && f.extension === "md") this.onActiveFile(f.path);
			})
		);
		this.registerEvent(
			this.app.metadataCache.on(
				"resolved",
				debounce(() => {
					this.collect();
					this.apply(false);
				}, 2000, true)
			)
		);

		this.rootPath = this.activePath = this.app.workspace.getActiveFile()?.path ?? null;
		await this.loadColorGroups();
		this.buildPanel();
		this.collect();
		this.resize();
		this.apply();
	}

	/** A note became active in any window: re-root (local mode) or just re-highlight. */
	onActiveFile(path) {
		if (path === this.activePath) return;
		this.activePath = path;
		if (this.plugin.settings.depth > 0 && path !== this.rootPath) {
			this.rootPath = path;
			this.apply();
			return;
		}
		this.updateActive();
		this.dirty = true;
		this.kick();
	}

	/** Palette index per visible node from the graph.json color groups (first match wins). */
	recolor() {
		const n = this.nodes.length;
		this.palette = [null];
		this.colorIdx = new Uint16Array(n);
		const seen = new Map();
		this.nodes.forEach((x, i) => {
			for (const g of this.groups) {
				if (!g.test(x)) continue;
				let k = seen.get(g.css);
				if (k === undefined) {
					k = this.palette.length;
					seen.set(g.css, k);
					this.palette.push(g.css);
				}
				this.colorIdx[i] = k;
				break;
			}
			if (x.isTag && !this.colorIdx[i]) {
				let k = seen.get(TAG_KEY);
				if (k === undefined) {
					k = this.palette.length;
					seen.set(TAG_KEY, k);
					this.palette.push(TAG_KEY);
				}
				this.colorIdx[i] = k;
			}
		});
	}

	/** Index of the active note among visible nodes, plus every note linked to or from it. */
	updateActive() {
		this.activeIdx = this.activePath ? this.nodes.findIndex((x) => x.path === this.activePath) : -1;
		this.activeNb = new Set();
		if (this.activeIdx < 0 || !this.sim) return;
		const E = this.sim.edges;
		for (let e = 0; e < E.length; e += 2) {
			if (E[e] === this.activeIdx) this.activeNb.add(E[e + 1]);
			else if (E[e + 1] === this.activeIdx) this.activeNb.add(E[e]);
		}
	}

	/** Show/hide the button stack and the settings menu; mark the toggles that are on. */
	syncButtons() {
		const s = this.plugin.settings;
		this.stack.classList.toggle("is-open", !!s.menuOpen);
		this.panel.classList.toggle("is-open", !!(s.menuOpen && s.settingsOpen));
		this.btnMenu.classList.toggle("is-active", !!s.menuOpen);
		this.btnSettings.classList.toggle("is-active", !!s.settingsOpen);
		this.btnLayers.classList.toggle("is-active", !!s.layers && !!s.view3d);
		this.btnLayers.classList.toggle("is-disabled", !s.view3d);
		this.btn3d.classList.toggle("is-active", !!s.view3d);
	}

	resetView() {
		this.yaw = 0.6;
		this.pitch = -0.35;
		this.panX = this.panY = 0;
		this.userMoved = false;
		this.autoFit = true;
		this.dirty = true;
		this.kick();
	}

	/** Live force parameters for the layout (Graph view "Forces"). */
	forceParams() {
		const s = this.plugin.settings;
		return { center: s.center, repel: s.repel, link: s.linkForce };
	}

	/** Push new force values into the running layout and let it settle again. */
	applyForces() {
		if (!this.sim) return;
		this.sim.p = this.forceParams();
		this.sim.alpha = Math.max(this.sim.alpha, 0.5);
		this.kick();
	}

	/** Copy camera-related settings (tilt, layer width) into fields the projection reads. */
	syncCam() {
		const s = this.plugin.settings;
		this.is3d = s.view3d;
		this.tiltDeg = s.tilt;
		this.wScale = s.layers && s.view3d ? s.layerWidth : 1;
	}

	/** Settings panel, laid out like the core Graph view: Filters / Groups / Display / Spin / Forces / Layers. */
	buildPanel() {
		const s = this.plugin.settings;
		const p = this.panel;
		const wasOpen = new Set([...p.querySelectorAll("details")].filter((d) => d.open).map((d) => d.querySelector("summary").textContent));
		p.empty();
		const save = () => this.plugin.saveSettings();
		const redraw = () => {
			this.dirty = true;
			this.kick();
		};
		// every group starts collapsed; groups you opened stay open when the menu is rebuilt
		const section = (title) => {
			const d = p.createEl("details");
			if (wasOpen.has(title)) d.open = true;
			d.createEl("summary", { text: title });
			return d.createDiv({ cls: "qg3d-sec" });
		};
		const toggle = (parent, label, key, onChange) => {
			const row = parent.createEl("label", { cls: "qg3d-row qg3d-check" });
			row.createSpan({ text: label });
			const c = row.createEl("input", { type: "checkbox" });
			c.checked = !!s[key];
			c.addEventListener("change", () => {
				s[key] = c.checked;
				save();
				onChange();
			});
		};
		// onChange runs while dragging, or only on release when commit=true (for rebuilds)
		const slider = (parent, label, key, min, max, step, onChange, commit = false) => {
			const row = parent.createDiv({ cls: "qg3d-row qg3d-slider" });
			const head = row.createDiv({ cls: "qg3d-rowhead" });
			head.createSpan({ text: label });
			const val = head.createSpan({ cls: "qg3d-val", text: String(s[key]) });
			const r = row.createEl("input", { type: "range" });
			r.min = String(min);
			r.max = String(max);
			r.step = String(step);
			r.value = String(s[key]);
			r.addEventListener("input", () => {
				s[key] = Number(r.value);
				val.setText(String(s[key]));
				if (!commit) onChange();
			});
			r.addEventListener("change", () => {
				save();
				if (commit) onChange();
			});
		};

		const filters = section("Filters");
		const search = filters.createEl("input", { type: "text", cls: "qg3d-search" });
		search.placeholder = 'Search: path:"02 - Concepts"  tag:#x  ["layer":concept]';
		search.value = s.filter;
		this.searchEl = search;
		search.addEventListener(
			"input",
			debounce(() => {
				s.filter = search.value;
				save();
				this.apply();
			}, 300)
		);
		const depth = filters.createEl("select", { cls: "qg3d-select", attr: { "aria-label": "Local depth around the active note" } });
		[["0", "Whole vault"], ["1", "Local: 1 hop"], ["2", "Local: 2 hops"], ["3", "Local: 3 hops"]].forEach(([v, tx]) => depth.createEl("option", { value: v, text: tx }));
		depth.value = String(s.depth);
		depth.addEventListener("change", () => {
			s.depth = Number(depth.value);
			save();
			this.rootPath = this.app.workspace.getActiveFile()?.path ?? this.rootPath;
			this.apply();
		});
		toggle(filters, "Tags", "tags", () => this.apply());
		toggle(filters, "Orphans", "orphans", () => this.apply());

		const groups = section("Groups");
		if (!this.groups.length) groups.createDiv({ cls: "qg3d-note", text: "No color groups in graph.json" });
		for (const g of this.groups) {
			const row = groups.createDiv({ cls: "qg3d-group" });
			const sw = row.createSpan({ cls: "qg3d-swatch" });
			sw.style.background = g.css;
			row.createSpan({ text: g.query || "(empty query)" });
		}
		groups.createDiv({ cls: "qg3d-note", text: "Read from the core Graph view (graph.json). Other notes use the theme's node color; tags are green." });
		groups.createEl("button", { text: "Reload colors", cls: "qg3d-btn" }).addEventListener("click", async () => {
			await this.loadColorGroups();
			this.recolor();
			this.buildPanel();
			redraw();
		});

		const display = section("Display");
		slider(display, "Node size", "nodeSize", 0.3, 3, 0.1, redraw);
		slider(display, "Node opacity", "nodeOpacity", 0.3, 1, 0.05, redraw);
		slider(display, "Fade with depth", "depthFade", 0, 1, 0.05, redraw);
		slider(display, "Dim unrelated notes", "dimOthers", 0.2, 1, 0.05, redraw);
		slider(display, "Link thickness", "linkThickness", 0.3, 3, 0.1, redraw);
		slider(display, "Link opacity", "linkOpacity", 0.05, 1, 0.01, redraw);
		slider(display, "Active note link width", "activeLinkWidth", 0.5, 4, 0.1, redraw);
		slider(display, "Label size", "labelSize", 9, 20, 1, redraw);

		const spin = section("Spin");
		toggle(spin, "Spin", "spin", redraw);
		toggle(spin, "Clockwise (seen from above)", "clockwise", redraw);
		slider(spin, "Speed", "spinSpeed", 0.05, 1.5, 0.05, redraw);
		slider(spin, "Axis tilt (degrees)", "tilt", 0, 45, 0.5, redraw);

		const forces = section("Forces");
		slider(forces, "Center force", "center", 0, 0.1, 0.005, () => this.applyForces());
		slider(forces, "Repel force", "repel", 0.2, 3, 0.1, () => this.applyForces());
		slider(forces, "Link force", "linkForce", 0.1, 2, 0.1, () => this.applyForces());
		slider(forces, "Link distance", "spread", 0.4, 2.5, 0.1, () => {
			this.pos.clear();
			this.apply();
		}, true);

		const layers = section("Layers");
		layers.createDiv({ cls: "qg3d-note", text: "Turn the tower on or off with the Layers view button." });
		slider(layers, "Width inside a layer", "layerWidth", 0.5, 2.5, 0.05, () => {
			this.syncCam();
			if (!this.userMoved) this.fit();
			redraw();
		});
		slider(layers, "Distance between layers", "layerGap", 0.3, 2, 0.05, () => this.apply(), true);

		const actions = p.createDiv({ cls: "qg3d-actions" });
		actions.createEl("button", { text: "Re-layout", cls: "qg3d-btn" }).addEventListener("click", () => {
			this.pos.clear();
			this.apply();
		});
		actions.createEl("button", { text: "Reset settings", cls: "qg3d-btn" }).addEventListener("click", () => {
			const keep = { filter: s.filter, depth: s.depth, menuOpen: s.menuOpen, settingsOpen: s.settingsOpen };
			Object.assign(s, DEFAULTS, keep);
			save();
			this.buildPanel();
			this.syncButtons();
			this.pos.clear();
			this.apply();
		});
	}

	async onClose() {
		this.ro?.disconnect();
		const w = this.contentEl.win ?? window;
		if (this.raf) w.cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.sim = null;
	}

	/* ---- data ---- */

	async loadColorGroups() {
		try {
			const raw = await this.app.vault.adapter.read(this.app.vault.configDir + "/graph.json");
			const cg = JSON.parse(raw).colorGroups || [];
			this.groups = cg.map((g) => {
				const rgb = g.color && typeof g.color.rgb === "number" ? g.color.rgb : 0x888888;
				const al = g.color && typeof g.color.a === "number" ? g.color.a : 1;
				return { query: g.query, test: compileQuery(g.query), css: `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${al})` };
			});
		} catch (e) {
			this.groups = [];
		}
	}

	collect() {
		const mc = this.app.metadataCache;
		const files = this.app.vault.getMarkdownFiles();
		const set = new Map();
		this.all = [];
		for (const f of files) {
			const cache = mc.getFileCache(f);
			const node = {
				path: f.path,
				name: f.basename,
				fm: (cache && cache.frontmatter) || {},
				tags: ((cache && getAllTags(cache)) || []).map((t) => t.toLowerCase()),
			};
			set.set(f.path, node);
			this.all.push(node);
		}
		const seen = new Set();
		this.edgesAll = [];
		const rl = mc.resolvedLinks || {};
		for (const src of Object.keys(rl)) {
			if (!set.has(src)) continue;
			for (const dst of Object.keys(rl[src])) {
				if (dst === src || !set.has(dst)) continue;
				const k = src < dst ? src + "\n" + dst : dst + "\n" + src;
				if (seen.has(k)) continue;
				seen.add(k);
				this.edgesAll.push([src, dst]);
			}
		}
	}

	/** Filter + local-depth selection, then rebuild the simulation. */
	/** force=false (metadata events): keep the layout when the visible notes, links and planes are unchanged. */
	apply(force = true) {
		if (!this.canvas) return;
		const s = this.plugin.settings;
		if (this.sim) this.nodes.forEach((n, i) => this.pos.set(n.path, [this.sim.px[i], this.sim.py[i], this.sim.pz[i]]));

		const q = compileQuery(s.filter);
		let sel = this.all.filter(q);
		let ok = new Set(sel.map((n) => n.path));
		let edges = this.edgesAll.filter(([a, b]) => ok.has(a) && ok.has(b));

		if (s.depth > 0 && this.rootPath && ok.has(this.rootPath)) {
			const adj = new Map();
			for (const [a, b] of edges) {
				if (!adj.has(a)) adj.set(a, []);
				if (!adj.has(b)) adj.set(b, []);
				adj.get(a).push(b);
				adj.get(b).push(a);
			}
			const dist = new Map([[this.rootPath, 0]]);
			const queue = [this.rootPath];
			for (let h = 0; h < queue.length; h++) {
				const u = queue[h];
				if (dist.get(u) >= s.depth) continue;
				for (const v of adj.get(u) || []) if (!dist.has(v)) (dist.set(v, dist.get(u) + 1), queue.push(v));
			}
			sel = sel.filter((n) => dist.has(n.path));
			ok = new Set(sel.map((n) => n.path));
			edges = edges.filter(([a, b]) => ok.has(a) && ok.has(b));
		}
		if (!s.orphans) {
			const linked = new Set();
			for (const [a, b] of edges) (linked.add(a), linked.add(b));
			sel = sel.filter((n) => linked.has(n.path));
		}
		this.tagCount = 0;
		if (s.tags) {
			const used = new Map();
			for (const x of sel) {
				for (const tg of new Set(x.tags)) {
					let tn = this.tagNodes.get(tg);
					if (!tn) {
						tn = { path: tg, name: tg, fm: { type: "tag" }, tags: [tg], isTag: true };
						this.tagNodes.set(tg, tn);
					}
					used.set(tg, tn);
					edges.push([x.path, tg]);
				}
			}
			sel = sel.concat([...used.values()]);
			this.tagCount = used.size;
		}
		if (!force && this.sim && this.sameSelection(sel, edges)) {
			this.nodes = sel;
			this.recolor();
			this.updateActive();
			this.dirty = true;
			this.kick();
			return;
		}
		this.edgesSel = edges;
		this.build(sel, edges);
	}

	sameSelection(sel, edges) {
		const layers = this.plugin.settings.layers;
		if (sel.length !== this.nodes.length || edges.length !== this.edgesSel.length) return false;
		for (let i = 0; i < sel.length; i++) {
			if (sel[i].path !== this.nodes[i].path) return false;
			if (layers && planeKey(sel[i].fm) !== planeKey(this.nodes[i].fm)) return false;
		}
		for (let i = 0; i < edges.length; i++) if (edges[i][0] !== this.edgesSel[i][0] || edges[i][1] !== this.edgesSel[i][1]) return false;
		return true;
	}

	build(sel, edgesP) {
		const s = this.plugin.settings;
		const n = sel.length;
		const idx = new Map(sel.map((x, i) => [x.path, i]));
		const pairs = [];
		const deg = new Int32Array(n).fill(0);
		for (const [a, b] of edgesP) {
			const i = idx.get(a);
			const j = idx.get(b);
			if (i === undefined || j === undefined) continue;
			pairs.push(i, j);
			deg[i]++;
			deg[j]++;
		}
		const degForce = deg.map((d) => Math.max(1, d));
		const L = 40 * s.spread;
		let zt = null;
		this.planes = [];
		if (s.layers && s.view3d) {
			const present = new Set(sel.map((x) => planeKey(x.fm)));
			const keys = PLANE_ORDER.filter((k) => present.has(k));
			const gap = L * 3.5 * s.layerGap;
			this.planes = keys.map((k, r) => ({ key: k, z: (r - (keys.length - 1) / 2) * gap }));
			const zOf = new Map(this.planes.map((p) => [p.key, p.z]));
			zt = new Float64Array(n);
			sel.forEach((x, i) => (zt[i] = zOf.get(planeKey(x.fm))));
		}
		const sim = new Sim(n, Int32Array.from(pairs), degForce, L, zt);
		sim.p = this.forceParams();
		const rad = L * Math.cbrt(Math.max(n, 1)) * 0.6;
		const flat = !s.view3d;
		sim.flat = flat;
		for (let i = 0; i < n; i++) {
			const p = this.pos.get(sel[i].path);
			if (p) {
				sim.px[i] = p[0];
				sim.py[i] = p[1];
				sim.pz[i] = flat ? 0 : p[2] || (Math.random() - 0.5) * L;
			} else {
				sim.px[i] = (Math.random() - 0.5) * 2 * rad;
				sim.py[i] = (Math.random() - 0.5) * 2 * rad;
				sim.pz[i] = flat ? 0 : zt ? zt[i] + (Math.random() - 0.5) * L : (Math.random() - 0.5) * 2 * rad;
			}
		}
		this.sim = sim;
		this.nodes = sel;
		this.deg = deg;
		this.edgeCount = pairs.length / 2;
		this.updateActive();
		this.recolor();
		this.sx = new Float32Array(n);
		this.sy = new Float32Array(n);
		this.sz = new Float32Array(n);
		this.sr = new Float32Array(n);
		this.order = new Uint32Array(n);
		this.hover = -1;
		this.autoFit = !this.userMoved || Math.abs(n - this._prevN) > 0.3 * Math.max(n, this._prevN, 1);
		this._prevN = n;
		this.dirty = true;
		this.kick();
	}

	/* ---- camera + draw ---- */

	resize() {
		if (!this.canvas) return;
		const w = this.contentEl.win ?? window;
		const dpr = Math.min(2, w.devicePixelRatio || 1);
		const r = this.contentEl.getBoundingClientRect();
		const bar = this.contentEl.querySelector(".qg3d-bar");
		const h = Math.max(50, r.height - (bar ? bar.getBoundingClientRect().height : 0));
		this.W = Math.max(50, r.width);
		this.H = h;
		this.canvas.style.width = this.W + "px";
		this.canvas.style.height = this.H + "px";
		this.canvas.width = Math.round(this.W * dpr);
		this.canvas.height = Math.round(this.H * dpr);
		this.dpr = dpr;
		this.dirty = true;
		this.kick();
	}

	fit() {
		const s = this.sim;
		if (!s || !s.n) return;
		let r = 1;
		this.syncCam();
		const w = this.wScale;
		for (let i = 0; i < s.n; i++) r = Math.max(r, Math.hypot(s.px[i] * w, s.py[i] * w, s.pz[i]));
		this.R = r;
		let rxy = 1;
		for (let i = 0; i < s.n; i++) rxy = Math.max(rxy, Math.hypot(s.px[i], s.py[i]));
		this.Rxy = rxy;
		this.fitZoom = (0.46 * Math.min(this.W, this.H)) / r;
		this.zoom = this.fitZoom;
	}

	/** Rotation + perspective as one cached 3x3 matrix (rebuilt only when spin / yaw / pitch change). */
	buildMatrix() {
		if (!this.is3d) {
			// flat 2D: sim x / y are screen x / y, no rotation
			this._m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
			this._ms = this.spin;
			this._my = this.yaw;
			this._mp = this.pitch;
			this._mt = this.tiltDeg;
			this._mw = this.wScale;
			this._m3 = false;
			return;
		}
		const cs = Math.cos(this.spin);
		const ss = Math.sin(this.spin);
		const tilt = (this.tiltDeg * Math.PI) / 180;
		const ct = Math.cos(tilt);
		const st = Math.sin(tilt);
		const w = this.wScale; // layer width (x/y stretch)
		const cy = Math.cos(this.yaw);
		const sy = Math.sin(this.yaw);
		const cp = Math.cos(this.pitch);
		const sp = Math.sin(this.pitch);
		// The sim's z is the layer axis; show it as the vertical one (floors of a tower).
		// Pipeline: spin around that axis (clockwise from above), tilt the axis like a globe,
		// then the user's camera yaw / pitch. Linear, so push the basis vectors through it.
		const f = (x, y, z) => {
			x *= w;
			y *= w;
			const xs = x * cs + y * ss;
			const zs = -x * ss + y * cs;
			const xt = xs * ct - z * st;
			const yt = xs * st + z * ct;
			const x1 = xt * cy + zs * sy;
			const z1 = -xt * sy + zs * cy;
			return [x1, yt * cp - z1 * sp, yt * sp + z1 * cp];
		};
		const a = f(1, 0, 0);
		const b = f(0, 1, 0);
		const c = f(0, 0, 1);
		this._m = [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
		this._ms = this.spin;
		this._my = this.yaw;
		this._mp = this.pitch;
		this._mt = this.tiltDeg;
		this._mw = this.wScale;
		this._m3 = true;
	}

	project(x, y, z, out) {
		if (this._ms !== this.spin || this._my !== this.yaw || this._mp !== this.pitch || this._mt !== this.tiltDeg || this._mw !== this.wScale || this._m3 !== this.is3d) this.buildMatrix();
		const m = this._m;
		const X = m[0] * x + m[1] * y + m[2] * z;
		const Y = m[3] * x + m[4] * y + m[5] * z;
		const Z = m[6] * x + m[7] * y + m[8] * z;
		const D = this.R * 4;
		const sc = D / Math.max(D + Z, 1);
		out[0] = this.W / 2 + this.panX + X * sc * this.zoom;
		out[1] = this.H / 2 + this.panY + Y * sc * this.zoom;
		out[2] = Z;
		out[3] = sc;
		return out;
	}

	kick() {
		if (this.raf || !this.canvas) return;
		const w = this.contentEl.win ?? window;
		this.raf = w.requestAnimationFrame(() => {
			this.raf = 0;
			this.frame();
		});
	}

	frame() {
		const sim = this.sim;
		let busy = false;
		if (sim && !sim.settled) {
			const t0 = performance.now();
			do sim.step();
			while (!sim.settled && performance.now() - t0 < 10);
			busy = !sim.settled;
			if (this.autoFit) this.fit();
		}
		const now = performance.now();
		const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0.016;
		this.lastT = now;
		const s = this.plugin.settings;
		const spinning = !!(s.spin && s.view3d && sim && sim.n > 0 && !this.inside && !this.dragging);
		if (spinning) this.spin += dt * (s.spinSpeed || DEFAULTS.spinSpeed) * (s.clockwise ? 1 : -1);
		if (this.wasSpinning && !spinning) this.dirty = true; // one full-quality redraw when it stops
		this.wasSpinning = spinning;
		// Adaptive quality while turning: thin out edges (a fixed subset, so no flicker) if drawing is slow.
		if (!spinning) this.lite = 1;
		else if (this.drawMs > 45) this.lite = 4;
		else if (this.drawMs > 28) this.lite = 2;
		else if (this.drawMs < 14) this.lite = 1;
		const shown = this.contentEl.isShown ? this.contentEl.isShown() : true;
		if (shown && (busy || spinning || this.dirty)) this.draw();
		this.dirty = false;
		if (busy || spinning) this.kick();
		else this.lastT = 0;
	}

	/** Theme colors, re-read at most every 1.5 s (getComputedStyle every frame is slow). */
	theme() {
		const now = performance.now();
		if (!this._theme || now - this._themeT > 1500) {
			const el = this.contentEl;
			const cs = getComputedStyle(el);
			// Resolve any CSS color (hsl(var(...)), named, ...) to a concrete rgb() the canvas always accepts.
			const probe = el.createDiv();
			const col = (names, d) => {
				for (const nme of names) {
					const v = cs.getPropertyValue(nme).trim();
					if (!v) continue;
					probe.style.color = v;
					const c = getComputedStyle(probe).color;
					if (c) return c;
				}
				return d;
			};
			// Same variables the core Graph view uses, so the look follows the theme.
			this._theme = {
				muted: col(["--text-muted"], "#888"),
				accent: col(["--interactive-accent"], "#7c3aed"),
				normal: col(["--text-normal"], "#ddd"),
				bg: col(["--background-primary"], "#1e1e1e"),
				node: col(["--graph-node", "--text-muted"], "#888"),
				line: col(["--graph-line", "--background-modifier-border"], "#888"),
				text: col(["--graph-text", "--text-normal"], "#ddd"),
				tag: col(["--color-green"], "#44cf6e"),
			};
			probe.remove();
			this._themeT = now;
		}
		return this._theme;
	}

	draw() {
		const ctx = this.ctx;
		const sim = this.sim;
		if (!ctx || !sim) return;
		const t0 = performance.now();
		if (this.lastDrawT && t0 - this.lastDrawT < 500) this.fps = this.fps * 0.9 + (1000 / Math.max(1, t0 - this.lastDrawT)) * 0.1;
		this.lastDrawT = t0;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.W, this.H);
		const th = this.theme();
		const { muted, accent, bg } = th;
		const s = this.plugin.settings;
		this.syncCam();
		const n = sim.n;
		const R = this.R;
		const out = [0, 0, 0, 1];
		const nodeScale = Math.max(0.7, Math.min(3, Math.sqrt(this.zoom / (this.fitZoom || 1))));
		for (let i = 0; i < n; i++) {
			this.project(sim.px[i], sim.py[i], sim.pz[i], out);
			this.sx[i] = out[0];
			this.sy[i] = out[1];
			this.sz[i] = out[2];
			this.sr[i] = (1.8 + Math.sqrt(this.deg[i]) * 0.9) * out[3] * nodeScale * s.nodeSize;
		}

		// plane frames (floors of the tower)
		if (this.planes.length) {
			ctx.save();
			ctx.setLineDash([4, 4]);
			ctx.lineWidth = 1;
			ctx.font = "11px var(--font-interface, sans-serif)";
			const q = this.Rxy * 1.05;
			for (const p of this.planes) {
				ctx.strokeStyle = muted;
				ctx.globalAlpha = 0.35;
				const c = [];
				for (let k = 0; k < 48; k++) {
					const a = (k / 48) * 6.2832;
					c.push(this.project(Math.cos(a) * q, Math.sin(a) * q, p.z, [0, 0, 0, 1]).slice());
				}
				ctx.beginPath();
				c.forEach((pt, k) => (k ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
				ctx.closePath();
				ctx.stroke();
				ctx.globalAlpha = 0.8;
				ctx.fillStyle = muted;
				ctx.fillText(p.key, c[0][0] + 4, c[0][1] + 12);
			}
			ctx.restore();
		}

		// edges
		const E = sim.edges;
		const act = this.activeIdx;
		const nb = this.activeNb;
		const step = this.lite;
		ctx.lineWidth = s.linkThickness;
		ctx.strokeStyle = th.line;
		ctx.globalAlpha = (this.edgeCount > 4000 ? 0.45 : 1) * s.linkOpacity;
		ctx.beginPath();
		for (let e = 0; e < E.length; e += 2) {
			if (step > 1 && (e >> 1) % step !== 0) continue;
			const i = E[e];
			const j = E[e + 1];
			if (i === this.hover || j === this.hover || i === act || j === act) continue;
			ctx.moveTo(this.sx[i], this.sy[i]);
			ctx.lineTo(this.sx[j], this.sy[j]);
		}
		ctx.stroke();
		if (act >= 0) {
			// links to and from the note open in the main window: purple
			ctx.strokeStyle = PURPLE;
			ctx.lineWidth = s.activeLinkWidth;
			ctx.globalAlpha = 0.95;
			ctx.beginPath();
			for (let e = 0; e < E.length; e += 2) {
				const i = E[e];
				const j = E[e + 1];
				if (i !== act && j !== act) continue;
				ctx.moveTo(this.sx[i], this.sy[i]);
				ctx.lineTo(this.sx[j], this.sy[j]);
			}
			ctx.stroke();
			ctx.lineWidth = Math.max(1, s.linkThickness * 1.5);
		}
		if (this.hover >= 0) {
			ctx.strokeStyle = accent;
			ctx.globalAlpha = 0.9;
			ctx.beginPath();
			for (let e = 0; e < E.length; e += 2) {
				const i = E[e];
				const j = E[e + 1];
				if (i !== this.hover && j !== this.hover) continue;
				ctx.moveTo(this.sx[i], this.sy[i]);
				ctx.lineTo(this.sx[j], this.sy[j]);
			}
			ctx.stroke();
		}

		// nodes: batched by (color, depth fog level, dimmed) so each batch is one path and one fill
		const pal = this.palette;
		const size = pal.length * 8;
		if (!this._bk || this._bk.length !== size) this._bk = Array.from({ length: size }, () => []);
		else for (const b of this._bk) b.length = 0;
		const lit = [];
		for (let i = 0; i < n; i++) {
			if (i === act || nb.has(i)) {
				lit.push(i);
				continue;
			}
			const fog = Math.min(1, Math.max(0, (this.sz[i] + R) / (2 * R)));
			const fl = Math.min(3, Math.floor(fog * 4));
			this._bk[(this.colorIdx[i] * 4 + fl) * 2 + (act >= 0 ? 1 : 0)].push(i);
		}
		for (let fl = 3; fl >= 0; fl--) {
			for (let ci = 0; ci < pal.length; ci++) {
				for (let dim = 0; dim < 2; dim++) {
					const b = this._bk[(ci * 4 + fl) * 2 + dim];
					if (!b.length) continue;
					ctx.globalAlpha = (1 - (s.depthFade * (fl + 0.5)) / 4) * (dim ? s.dimOthers : 1) * s.nodeOpacity;
					ctx.fillStyle = ci === 0 ? th.node : pal[ci] === TAG_KEY ? th.tag : pal[ci];
					ctx.beginPath();
					for (let k = 0; k < b.length; k++) {
						const i = b[k];
						const r = Math.max(1, this.sr[i]);
						ctx.moveTo(this.sx[i] + r, this.sy[i]);
						ctx.arc(this.sx[i], this.sy[i], r, 0, 6.2832);
					}
					ctx.fill();
				}
			}
		}
		// active note and its neighbors on top, with purple rings
		for (const i of lit) {
			const fog = Math.min(1, Math.max(0, (this.sz[i] + R) / (2 * R)));
			ctx.globalAlpha = 1 - s.depthFade * fog;
			ctx.fillStyle = !this.colorIdx[i] ? th.node : pal[this.colorIdx[i]] === TAG_KEY ? th.tag : pal[this.colorIdx[i]];
			ctx.beginPath();
			ctx.arc(this.sx[i], this.sy[i], Math.max(1, this.sr[i]) * (i === act ? 1.6 : 1), 0, 6.2832);
			ctx.fill();
			ctx.globalAlpha = 1;
			ctx.strokeStyle = PURPLE;
			ctx.lineWidth = i === act ? 2.5 : 1.5;
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		ctx.lineWidth = 1;

		// labels, in priority order: hovered, active note, notes linked to/from it, hovered note's neighbors
		const order = [];
		const queued = new Set();
		const push = (i, kind) => {
			if (queued.has(i)) return;
			queued.add(i);
			order.push([i, kind]);
		};
		if (this.hover >= 0) push(this.hover, "hover");
		if (act >= 0) {
			push(act, "active");
			for (const i of nb) push(i, "nb");
		}
		if (this.hover >= 0) {
			for (let e = 0; e < E.length; e += 2) {
				if (E[e] === this.hover) push(E[e + 1], "hovernb");
				else if (E[e + 1] === this.hover) push(E[e], "hovernb");
			}
		}
		ctx.font = `${s.labelSize}px var(--font-interface, sans-serif)`;
		ctx.textBaseline = "middle";
		const boxes = [];
		for (const [i, kind] of order) {
			if (boxes.length >= 160) break;
			const text = this.nodes[i].name;
			const w = ctx.measureText(text).width;
			const rad = Math.max(1, this.sr[i]) + 4;
			const hit = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
			// Try beside the node, then nudge up/down in rows and to the other side, so crowded
			// neighborhoods still show every name instead of hiding the overlapping ones.
			let x = 0;
			let y = 0;
			let box = null;
			const strong = kind === "hover" || kind === "active";
			search: for (let r = 0; r < 12; r++) {
				for (const dir of r === 0 ? [0] : [1, -1]) {
					for (const side of [1, -1]) {
						const tx = side === 1 ? this.sx[i] + rad : this.sx[i] - rad - w;
						const ty = this.sy[i] + dir * r * (s.labelSize + 3);
						const b = [tx - 2, ty - 8, tx + w + 2, ty + 8];
						if (strong || !hit(b)) {
							x = tx;
							y = ty;
							box = b;
							break search;
						}
					}
				}
			}
			if (!box) continue;
			boxes.push(box);
			ctx.globalAlpha = 0.85;
			ctx.fillStyle = bg;
			ctx.fillRect(box[0], box[1], w + 4, 16);
			ctx.globalAlpha = 1;
			ctx.fillStyle = kind === "hover" ? accent : kind === "active" || kind === "nb" ? PURPLE : th.text;
			ctx.fillText(text, x, y);
		}

		this.drawMs = this.drawMs * 0.8 + (performance.now() - t0) * 0.2;
		if (t0 - this._statusT > 400) {
			this._statusT = t0;
			const actTxt = act >= 0 ? ` · ${this.nodes[act].name}: ${nb.size} links` : "";
			const perf = this.wasSpinning ? ` · ${Math.round(this.fps)} fps · ${this.drawMs.toFixed(0)} ms${this.lite > 1 ? " (lite edges)" : ""}` : "";
			this.status.setText(`${n - this.tagCount} notes${this.tagCount ? ` · ${this.tagCount} tags` : ""} · ${this.edgeCount} links${actTxt}${sim.settled ? "" : " · laying out…"}${perf}`);
		}
	}

	/* ---- input ---- */

	bindPointer() {
		const c = this.canvas;
		let drag = null;
		c.addEventListener("contextmenu", (e) => e.preventDefault());
		// The globe stops turning while the pointer is over the graph and resumes when it leaves.
		c.addEventListener("pointerenter", () => (this.inside = true));
		c.addEventListener("pointerleave", () => {
			this.inside = false;
			if (this.hover !== -1) this.hover = -1;
			this.dirty = true;
			this.kick();
		});
		c.addEventListener("pointerdown", (e) => {
			c.setPointerCapture(e.pointerId);
			this.dragging = true;
			drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button === 2 || e.button === 1 || !this.plugin.settings.view3d, button: e.button };
		});
		c.addEventListener("pointermove", (e) => {
			if (drag) {
				const dx = e.clientX - drag.x;
				const dy = e.clientY - drag.y;
				if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
				drag.x = e.clientX;
				drag.y = e.clientY;
				if (drag.pan) {
					this.panX += dx;
					this.panY += dy;
				} else {
					this.yaw += dx * 0.006;
					this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + dy * 0.006));
				}
				this.autoFit = false;
				this.userMoved = true;
				this.dirty = true;
				this.kick();
				return;
			}
			const r = c.getBoundingClientRect();
			const h = this.pick(e.clientX - r.left, e.clientY - r.top);
			if (h !== this.hover) {
				this.hover = h;
				c.style.cursor = h >= 0 ? "pointer" : "grab";
				this.dirty = true;
				this.kick();
			}
		});
		const end = (e) => {
			if (!drag) return;
			const wasClick = !drag.moved && drag.button === 0;
			drag = null;
			this.dragging = false;
			try {
				c.releasePointerCapture(e.pointerId);
			} catch (_) {}
			if (wasClick && this.hover >= 0) this.openNode(this.hover, e.ctrlKey || e.metaKey);
		};
		c.addEventListener("pointerup", end);
		c.addEventListener("pointercancel", end);
		c.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault();
				this.zoom *= Math.exp(-e.deltaY * 0.0012);
				this.zoom = Math.max(this.fitZoom * 0.2, Math.min(this.fitZoom * 40, this.zoom));
				this.autoFit = false;
				this.userMoved = true;
				this.dirty = true;
				this.kick();
			},
			{ passive: false }
		);
	}

	pick(mx, my) {
		const sim = this.sim;
		if (!sim) return -1;
		let best = -1;
		let bd = 1e9;
		for (let i = 0; i < sim.n; i++) {
			const d = Math.hypot(this.sx[i] - mx, this.sy[i] - my);
			const lim = Math.max(6, this.sr[i] + 3);
			// nearer-to-camera nodes win ties
			if (d <= lim && (d < bd - 0.5 || (Math.abs(d - bd) <= 0.5 && this.sz[i] < this.sz[best]))) {
				bd = d;
				best = i;
			}
		}
		return best;
	}

	openNode(i, newTab) {
		const node = this.nodes[i];
		if (node.isTag) {
			// a tag node has no file: clicking it filters the graph by that tag
			this.plugin.settings.filter = `tag:${node.path}`;
			if (this.searchEl) this.searchEl.value = this.plugin.settings.filter;
			this.plugin.saveSettings();
			this.apply();
			return;
		}
		const f = this.app.vault.getAbstractFileByPath(this.nodes[i].path);
		if (!f) return;
		const md = this.app.workspace.getLeavesOfType("markdown")[0];
		const leaf = newTab || !md ? this.app.workspace.getLeaf("tab") : md;
		leaf.openFile(f);
	}
}

/* ---------------------------------------------------------------- plugin */

class QuantGraph3D extends Plugin {
	async onload() {
		this.settings = Object.assign({}, DEFAULTS, await this.loadData());
		this.registerView(VIEW_TYPE, (leaf) => new GraphView3D(leaf, this));
		this.addRibbonIcon("orbit", "3D-Graph", () => this.activate());
		this.addCommand({ id: "open", name: "Open 3D-Graph", callback: () => this.activate() });
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}
	async activate() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		const leaf = existing || this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE);
	}
}

module.exports = QuantGraph3D;
module.exports.default = QuantGraph3D;
module.exports._internal = { compileQuery, planeKey, Sim };
