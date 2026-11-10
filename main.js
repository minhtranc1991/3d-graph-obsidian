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
const { Plugin, ItemView, getAllTags, Notice, debounce } = require("obsidian");

const VIEW_TYPE = "3d-graph";
const DEFAULTS = {
	filter: '-path:"06 - People/supreme-intelligence"',
	depth: 0,
	layers: true,
	spread: 1,
	orphans: true,
	spin: true,
};
const PURPLE = "#a855f7"; // active note, its neighbors and the links between them
const TILT = 0.41; // globe-like axis tilt (~23.5 degrees)
const SPIN_SPEED = 0.1; // rad/s, clockwise seen from above (~1 turn per minute)
// Plane order, top to bottom. Unknown keys fall into "other".
const PLANE_ORDER = ["source", "concept", "model", "strategy", "execution", "person", "framework", "case-study", "news", "other"];

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
		const k = L * L * 0.9;
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
			const f = ((d - L) / d) * (0.7 / Math.min(deg[i], deg[j])) * a;
			vx[i] += dx * f;
			vy[i] += dy * f;
			vz[i] += dz * f;
			vx[j] -= dx * f;
			vy[j] -= dy * f;
			vz[j] -= dz * f;
		}
		for (let i = 0; i < n; i++) {
			vx[i] -= px[i] * 0.02 * a;
			vy[i] -= py[i] * 0.02 * a;
			if (zt) vz[i] += (zt[i] - pz[i]) * 0.5 * a;
			else vz[i] -= pz[i] * 0.02 * a;
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
		const bar = root.createDiv({ cls: "qg3d-bar" });

		const search = bar.createEl("input", { type: "text", cls: "qg3d-search" });
		search.placeholder = 'path:"02 - Concepts"  tag:#status/needs-review  ["layer":concept]';
		search.value = s.filter;
		search.addEventListener(
			"input",
			debounce(() => {
				s.filter = search.value;
				this.plugin.saveSettings();
				this.apply();
			}, 300)
		);

		const depth = bar.createEl("select", { cls: "qg3d-select", attr: { "aria-label": "Local depth around the active note" } });
		[["0", "Whole vault"], ["1", "Local: 1 hop"], ["2", "Local: 2 hops"], ["3", "Local: 3 hops"]].forEach(([v, t]) => depth.createEl("option", { value: v, text: t }));
		depth.value = String(s.depth);
		depth.addEventListener("change", () => {
			s.depth = Number(depth.value);
			this.plugin.saveSettings();
			this.rootPath = this.app.workspace.getActiveFile()?.path ?? this.rootPath;
			this.apply();
		});

		const mkToggle = (label, prop, tip, rebuild = true) => {
			const l = bar.createEl("label", { cls: "qg3d-toggle", attr: { "aria-label": tip } });
			const c = l.createEl("input", { type: "checkbox" });
			c.checked = !!s[prop];
			l.createSpan({ text: label });
			c.addEventListener("change", () => {
				s[prop] = c.checked;
				this.plugin.saveSettings();
				if (rebuild) this.apply();
				else (this.kick(), (this.dirty = true));
			});
		};
		mkToggle("Layers", "layers", "Stack source / concept / model / strategy / execution as floors of a tower");
		mkToggle("Orphans", "orphans", "Show notes with no visible links");
		mkToggle("Spin", "spin", "Turn like a globe (clockwise, tilted axis); pauses while the pointer is over the graph", false);

		const spread = bar.createEl("input", { type: "range", cls: "qg3d-range", attr: { "aria-label": "Spread (smaller = more compact)" } });
		spread.min = "0.4";
		spread.max = "2.5";
		spread.step = "0.1";
		spread.value = String(s.spread);
		spread.addEventListener("change", () => {
			s.spread = Number(spread.value);
			this.plugin.saveSettings();
			this.pos.clear();
			this.apply();
		});

		const reset = bar.createEl("button", { text: "Reset view", cls: "qg3d-btn" });
		reset.addEventListener("click", () => {
			this.yaw = 0.6;
			this.pitch = -0.35;
			this.panX = this.panY = 0;
			this.autoFit = true;
			this.dirty = true;
			this.kick();
		});
		const relayout = bar.createEl("button", { text: "Re-layout", cls: "qg3d-btn" });
		relayout.addEventListener("click", () => {
			this.pos.clear();
			this.apply();
		});
		const colors = bar.createEl("button", { text: "Reload colors", cls: "qg3d-btn" });
		colors.addEventListener("click", async () => {
			await this.loadColorGroups();
			this.dirty = true;
			this.kick();
		});

		this.status = bar.createSpan({ cls: "qg3d-status" });
		this.canvas = root.createEl("canvas", { cls: "qg3d-canvas" });
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
					this.apply();
				}, 2000, true)
			)
		);

		this.rootPath = this.activePath = this.app.workspace.getActiveFile()?.path ?? null;
		await this.loadColorGroups();
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
				return { test: compileQuery(g.query), css: `rgb(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255})` };
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
	apply() {
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
		this.build(sel, edges);
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
		if (s.layers) {
			const present = new Set(sel.map((x) => planeKey(x.fm)));
			const keys = PLANE_ORDER.filter((k) => present.has(k));
			const gap = L * 3.5;
			this.planes = keys.map((k, r) => ({ key: k, z: (r - (keys.length - 1) / 2) * gap }));
			const zOf = new Map(this.planes.map((p) => [p.key, p.z]));
			zt = new Float64Array(n);
			sel.forEach((x, i) => (zt[i] = zOf.get(planeKey(x.fm))));
		}
		const sim = new Sim(n, Int32Array.from(pairs), degForce, L, zt);
		const rad = L * Math.cbrt(Math.max(n, 1)) * 0.6;
		for (let i = 0; i < n; i++) {
			const p = this.pos.get(sel[i].path);
			if (p) {
				sim.px[i] = p[0];
				sim.py[i] = p[1];
				sim.pz[i] = p[2];
			} else {
				sim.px[i] = (Math.random() - 0.5) * 2 * rad;
				sim.py[i] = (Math.random() - 0.5) * 2 * rad;
				sim.pz[i] = zt ? zt[i] + (Math.random() - 0.5) * L : (Math.random() - 0.5) * 2 * rad;
			}
		}
		this.sim = sim;
		this.nodes = sel;
		this.deg = deg;
		this.edgeCount = pairs.length / 2;
		this.updateActive();
		this.colorOf = sel.map((x) => {
			for (const g of this.groups) if (g.test(x)) return g.css;
			return null;
		});
		this.sx = new Float32Array(n);
		this.sy = new Float32Array(n);
		this.sz = new Float32Array(n);
		this.sr = new Float32Array(n);
		this.order = new Uint32Array(n);
		this.hover = -1;
		this.autoFit = true;
		this.dirty = true;
		this.kick();
	}

	/* ---- camera + draw ---- */

	resize() {
		if (!this.canvas) return;
		const w = this.contentEl.win ?? window;
		const dpr = w.devicePixelRatio || 1;
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
		for (let i = 0; i < s.n; i++) r = Math.max(r, Math.hypot(s.px[i], s.py[i], s.pz[i]));
		this.R = r;
		let rxy = 1;
		for (let i = 0; i < s.n; i++) rxy = Math.max(rxy, Math.hypot(s.px[i], s.py[i]));
		this.Rxy = rxy;
		this.fitZoom = (0.46 * Math.min(this.W, this.H)) / r;
		this.zoom = this.fitZoom;
	}

	project(x, y, z, out) {
		// The sim's z is the layer axis; show it as the vertical one (floors of a tower).
		// Then: spin around that axis (clockwise from above), tilt the axis like a globe,
		// then the user's camera yaw / pitch.
		const cs = Math.cos(this.spin);
		const ss = Math.sin(this.spin);
		const xs = x * cs + y * ss;
		const zs = -x * ss + y * cs;
		const ct = Math.cos(TILT);
		const st = Math.sin(TILT);
		const xt = xs * ct - z * st;
		const yt = xs * st + z * ct;
		const cy = Math.cos(this.yaw);
		const sy = Math.sin(this.yaw);
		const cp = Math.cos(this.pitch);
		const sp = Math.sin(this.pitch);
		const x1 = xt * cy + zs * sy;
		const z1 = -xt * sy + zs * cy;
		const y2 = yt * cp - z1 * sp;
		const z2 = yt * sp + z1 * cp;
		const D = this.R * 4;
		const sc = D / Math.max(D + z2, 1);
		out[0] = this.W / 2 + this.panX + x1 * sc * this.zoom;
		out[1] = this.H / 2 + this.panY + y2 * sc * this.zoom;
		out[2] = z2;
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
		const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 0.016;
		this.lastT = now;
		const spinning = !!(this.plugin.settings.spin && sim && sim.n > 0 && !this.inside && !this.dragging);
		if (spinning) this.spin += dt * SPIN_SPEED;
		const shown = this.contentEl.isShown ? this.contentEl.isShown() : true;
		if (shown && (busy || spinning || this.dirty)) this.draw();
		this.dirty = false;
		if (busy || spinning) this.kick();
		else this.lastT = 0;
	}

	draw() {
		const ctx = this.ctx;
		const sim = this.sim;
		if (!ctx || !sim) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.W, this.H);
		const cs = getComputedStyle(this.contentEl);
		const muted = cs.getPropertyValue("--text-muted").trim() || "#888";
		const accent = cs.getPropertyValue("--interactive-accent").trim() || "#7c3aed";
		const normal = cs.getPropertyValue("--text-normal").trim() || "#ddd";
		const bg = cs.getPropertyValue("--background-primary").trim() || "#1e1e1e";
		const n = sim.n;
		const R = this.R;
		const out = [0, 0, 0, 1];
		const nodeScale = Math.max(0.7, Math.min(3, Math.sqrt(this.zoom / (this.fitZoom || 1))));
		for (let i = 0; i < n; i++) {
			this.project(sim.px[i], sim.py[i], sim.pz[i], out);
			this.sx[i] = out[0];
			this.sy[i] = out[1];
			this.sz[i] = out[2];
			this.sr[i] = (1.8 + Math.sqrt(this.deg[i]) * 0.9) * out[3] * nodeScale;
		}

		// plane frames
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
		ctx.lineWidth = 1;
		ctx.strokeStyle = muted;
		ctx.globalAlpha = this.edgeCount > 4000 ? 0.1 : 0.22;
		ctx.beginPath();
		const act = this.activeIdx;
		const nb = this.activeNb;
		for (let e = 0; e < E.length; e += 2) {
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
			ctx.lineWidth = 2;
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
			ctx.lineWidth = 1;
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

		// nodes, far to near
		const ord = this.order;
		for (let i = 0; i < n; i++) ord[i] = i;
		ord.sort((a, b) => this.sz[b] - this.sz[a]);
		const fallback = muted;
		for (let k = 0; k < n; k++) {
			const i = ord[k];
			const fog = Math.min(1, Math.max(0, (this.sz[i] + R) / (2 * R)));
			const lit = i === act || nb.has(i);
			ctx.globalAlpha = (1 - 0.6 * fog) * (act >= 0 && !lit ? 0.55 : 1);
			ctx.fillStyle = this.colorOf[i] || fallback;
			ctx.beginPath();
			ctx.arc(this.sx[i], this.sy[i], Math.max(1, this.sr[i]) * (i === act ? 1.6 : 1), 0, 6.2832);
			ctx.fill();
			if (lit) {
				ctx.globalAlpha = 1;
				ctx.strokeStyle = PURPLE;
				ctx.lineWidth = i === act ? 2.5 : 1.5;
				ctx.stroke();
			}
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
		ctx.font = "12px var(--font-interface, sans-serif)";
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
						const ty = this.sy[i] + dir * r * 14;
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
			ctx.fillStyle = kind === "hover" ? accent : kind === "active" || kind === "nb" ? PURPLE : normal;
			ctx.fillText(text, x, y);
		}
		const actTxt = act >= 0 ? ` · ${this.nodes[act].name}: ${nb.size} links` : "";
		this.status.setText(`${n} notes · ${this.edgeCount} links${actTxt}${sim.settled ? "" : " · laying out…"}`);
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
			drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button === 2 || e.button === 1, button: e.button };
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
