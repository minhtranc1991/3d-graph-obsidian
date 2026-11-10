const Module = require("module");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.getComputedStyle = window.getComputedStyle.bind(window);
global.ResizeObserver = class { observe() {} disconnect() {} };
const P = window.HTMLElement.prototype;
P.createEl = function (tag, o = {}) {
	const e = this.ownerDocument.createElement(tag);
	if (o.cls) e.className = o.cls;
	if (o.text) e.textContent = o.text;
	if (o.type) e.type = o.type;
	if (o.value !== undefined) e.value = o.value;
	if (o.attr) for (const k in o.attr) e.setAttribute(k, o.attr[k]);
	this.appendChild(e);
	return e;
};
P.createDiv = function (o = {}) { return this.createEl("div", o); };
P.createSpan = function (o = {}) { return this.createEl("span", o); };
P.empty = function () { this.innerHTML = ""; };
P.addClass = function (c) { this.classList.add(c); };
P.setText = function (t) { this.textContent = t; };
P.getBoundingClientRect = function () { return { left: 0, top: 0, width: 900, height: 700 }; };
Object.defineProperty(P, "win", { get() { return window; } });
const log = { texts: [], strokes: new Set(), fills: new Set(), widths: new Set(), alphas: new Set() };
const ctxStub = new Proxy({}, {
	get: (t, k) => (k === "measureText" ? () => ({ width: 40 }) : k === "fillText" ? (s) => log.texts.push(s) : k in t ? t[k] : () => {}),
	set: (t, k, v) => { if (k === "strokeStyle") log.strokes.add(v); if (k === "fillStyle") log.fills.add(v); if (k === "lineWidth") log.widths.add(v); if (k === "globalAlpha") log.alphas.add(+v.toFixed(3)); t[k] = v; return true; },
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.HTMLCanvasElement.prototype.setPointerCapture = function () {};
window.HTMLCanvasElement.prototype.releasePointerCapture = function () {};

class ItemView {
	constructor(leaf) {
		this.leaf = leaf;
		this.app = leaf.app;
		this.contentEl = document.createElement("div");
		document.body.appendChild(this.contentEl);
	}
	registerEvent() {}
}
class Plugin {}
const icons = []; const obs = { Plugin, ItemView, getAllTags: (c) => c.tags || [], Notice: class {}, setIcon: (el, n) => { icons.push(n); el.dataset.icon = n; }, debounce: (f) => (...a) => f(...a) };
const orig = Module._load;
Module._load = function (req, ...r) { return req === "obsidian" ? obs : orig.call(this, req, ...r); };
const mod = require(require("path").join(__dirname, "..", "main.js"));
const { compileQuery, planeKey, Sim } = mod._internal;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// ---- query
const N = (path, fm = {}, tags = []) => ({ path, name: path.split("/").pop().replace(/\.md$/, ""), fm, tags });
const c1 = N("02 - Concepts/C - Foo.md", { layer: "concept", domain: ["finance", "x"], score: 8 }, ["#status/needs-review"]);
const m1 = N("06 - People/supreme-intelligence/a.md");
ok(compileQuery('["layer":concept]')(c1), "prop match");
ok(!compileQuery('["layer":model]')(c1), "prop mismatch");
ok(compileQuery('["domain":finance]')(c1), "list prop");
ok(compileQuery('["score":8]')(c1), "numeric prop");
ok(compileQuery("tag:#status/needs-review")(c1) && compileQuery("tag:#status")(c1), "tag prefix");
ok(compileQuery('path:"02 - Concepts"')(c1), "quoted path");
ok(!compileQuery('-path:"06 - People/supreme-intelligence"')(m1) && compileQuery('-path:"06 - People/supreme-intelligence"')(c1), "negated path");
ok(compileQuery('["layer":model] OR file:foo')(c1), "OR");
ok(compileQuery("")(c1) && compileQuery("   ")(c1), "empty query = all");
ok(compileQuery("foo")(c1), "bare word");
ok(planeKey({ layer: "Concept" }) === "concept" && planeKey({ type: "source" }) === "source" && planeKey({}) === "other" && planeKey({ type: "weird" }) === "other", "planeKey");

// ---- sim
const n = 600, edges = [], deg = new Int32Array(n).fill(1), L = 40;
for (let i = 1; i < n; i++) edges.push(i, Math.floor(Math.random() * i));
const zt = new Float64Array(n);
for (let i = 0; i < n; i++) zt[i] = ((i % 4) - 1.5) * L * 3.5;
for (let i = 0; i < edges.length; i += 2) { deg[edges[i]]++; deg[edges[i + 1]]++; }
const sim = new Sim(n, Int32Array.from(edges), deg, L, zt);
for (let i = 0; i < n; i++) { sim.px[i] = (Math.random() - 0.5) * 400; sim.py[i] = (Math.random() - 0.5) * 400; sim.pz[i] = (Math.random() - 0.5) * 400; }
const t0 = Date.now();
let steps = 0;
while (!sim.settled && steps < 2000) { sim.step(); steps++; }
const fin = [...sim.px, ...sim.py, ...sim.pz].every(Number.isFinite);
let zerr = 0;
for (let i = 0; i < n; i++) zerr += Math.abs(sim.pz[i] - zt[i]);
zerr /= n;
ok(fin, `sim finite after ${steps} steps (${Date.now() - t0} ms)`);
ok(zerr < L * 1.5, `mean |z - plane| = ${zerr.toFixed(1)} (< ${L * 1.5})`);

// ---- view smoke
(async () => {
	const files = [], cacheMap = new Map(), rl = {};
	const layers = ["concept", "model", "strategy", "execution", "source"];
	for (let i = 0; i < 500; i++) {
		const p = `0${i % 5} - X/note${i}.md`;
		files.push({ path: p, basename: "note" + i, extension: "md" });
		cacheMap.set(p, { frontmatter: { layer: layers[i % 5] }, tags: ["#t" + (i % 3)] });
	}
	const si = "06 - People/supreme-intelligence/z.md";
	files.push({ path: si, basename: "z", extension: "md" });
	cacheMap.set(si, { frontmatter: {} });
	for (let i = 1; i < 500; i++) rl[files[i].path] = { [files[Math.floor(Math.random() * i)].path]: 1, [files[Math.floor(Math.random() * i)].path]: 1 };
	const opened = [];
	const app = {
		vault: {
			getMarkdownFiles: () => files,
			configDir: ".obsidian",
			adapter: { read: async () => JSON.stringify({ colorGroups: [{ query: '["layer":concept]', color: { a: 1, rgb: 162559 } }, { query: '["layer":model]', color: { a: 1, rgb: 16423373 } }] }) },
			getAbstractFileByPath: (p) => files.find((f) => f.path === p),
		},
		metadataCache: { getFileCache: (f) => cacheMap.get(f.path), resolvedLinks: rl, on: () => ({}) },
		workspace: { on: () => ({}), getActiveFile: () => files[10], getLeavesOfType: () => [], getLeaf: () => ({ openFile: (f) => opened.push(f.path) }) },
	};
	let factory;
	const plug = new mod();
	plug.app = app;
	plug.registerView = (t, f) => (factory = f);
	plug.addRibbonIcon = () => {};
	plug.addCommand = () => {};
	plug.loadData = async () => ({});
	plug.saveData = async () => {};
	await plug.onload();
	const view = factory({ app });
	await view.onOpen();
	ok(view.nodes.length === 503 && view.tagCount === 3, `supreme-intelligence excluded; 500 notes + 3 tag nodes (${view.nodes.length} nodes)`);
	ok(view.nodes.filter((x) => x.isTag).every((x) => x.name.startsWith("#t")), "tag nodes named #tag");
	ok(view.nodes.slice(0, 500).every((x) => !x.isTag), "notes first, tags after");
	ok(view.planes.length === 6 && view.planes[5].key === "tag", `6 planes incl. tag (${view.planes.map((p) => p.key).join(",")})`);
	ok([...view.colorIdx].filter(Boolean).length === 203, "color groups: concept+model (200) + tag nodes (3)");
	let guard = 0;
	while (!view.sim.settled && guard++ < 3000) view.frame();
	view.draw();
	ok(view.status.textContent.includes("500 notes · 3 tags"), "status: " + view.status.textContent);
	const y0 = view.yaw, p0 = view.pitch;
	const ev = (type, x, y, extra = {}) => { const e = new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...extra }); e.pointerId = 1; return e; };
	view.canvas.dispatchEvent(ev("pointerdown", 100, 100, { button: 0 }));
	view.canvas.dispatchEvent(ev("pointermove", 160, 130));
	view.canvas.dispatchEvent(ev("pointerup", 160, 130));
	ok(Math.abs(view.yaw - y0) > 0.3 && view.pitch !== p0 && view.autoFit === false, `drag rotates: yaw ${y0.toFixed(2)} -> ${view.yaw.toFixed(2)}, pitch ${p0.toFixed(2)} -> ${view.pitch.toFixed(2)}`);
	const z0 = view.zoom;
	view.canvas.dispatchEvent(new window.WheelEvent("wheel", { deltaY: -200, cancelable: true }));
	ok(view.zoom > z0, "wheel zooms in");
	view.draw();
	const i = 37, hx = view.sx[i], hy = view.sy[i];
	view.canvas.dispatchEvent(ev("pointermove", hx, hy));
	ok(view.hover >= 0, "hover picks a node at its screen position");
	const hv = view.hover;
	view.canvas.dispatchEvent(ev("pointerdown", hx, hy, { button: 0 }));
	view.canvas.dispatchEvent(ev("pointerup", hx, hy));
	ok(opened.length === 1 && opened[0] === view.nodes[hv].path, "click opens hovered note: " + opened[0]);
	view.draw();
	const s = plug.settings;
	s.depth = 1; view.rootPath = files[10].path; view.apply();
	ok(view.nodes.length > 1 && view.nodes.length < 500, `local depth 1 -> ${view.nodes.length} nodes (tags do not widen it)`);
	s.depth = 0; s.layers = false; view.apply();
	ok(view.planes.length === 0 && view.nodes.length === 503, "layers off -> free 3D");
	s.filter = '["layer":concept]'; view.apply();
	ok(view.nodes.length === 103, "filter concept -> 100 notes + 3 tags = " + view.nodes.length);
	let g2 = 0;
	while (!view.sim.settled && g2++ < 3000) view.frame();
	view.draw();

	// ---- active note highlight (back to whole vault, layers on)
	s.filter = '-path:"06 - People/supreme-intelligence"'; s.layers = true; view.apply();
	let g3 = 0;
	while (!view.sim.settled && g3++ < 3000) view.frame();
	ok(view.activeIdx >= 0 && view.nodes[view.activeIdx].path === files[10].path, "active note found from workspace.getActiveFile()");
	let hub = 0;
	for (let k = 0; k < 500; k++) if (view.deg[k] > view.deg[hub]) hub = k; // notes only (tag hubs have 100+ links)
	view.onActiveFile(view.nodes[hub].path);
	const E = view.sim.edges;
	let expectNb = new Set();
	for (let e = 0; e < E.length; e += 2) { if (E[e] === hub) expectNb.add(E[e + 1]); else if (E[e + 1] === hub) expectNb.add(E[e]); }
	ok(view.activeIdx === hub && view.activeNb.size === expectNb.size && view.activeNb.size > 2, `hub ${view.nodes[hub].name}: ${view.activeNb.size} linked notes (in+out) highlighted`);
	log.texts.length = 0; log.strokes.clear();
	view.draw();
	const names = new Set(log.texts);
	const shownNb = [...view.activeNb].filter((i) => names.has(view.nodes[i].name)).length;
	ok(names.has(view.nodes[hub].name), "active note label drawn");
	ok(shownNb >= Math.ceil(view.activeNb.size / 2), `neighbor labels drawn: ${shownNb}/${view.activeNb.size} (overlapping ones skipped)`);
	ok(log.strokes.has("#a855f7"), "purple used for links/rings");
	view.onActiveFile(files[20].path);
	ok(view.activeIdx >= 0 && view.nodes[view.activeIdx].path === files[20].path, "switching note in main window moves the highlight");

	// ---- spin: clockwise from above, tilted axis, stops under the pointer
	view.yaw = 0; view.pitch = 0;
	const o0 = [0, 0, 0, 1], o1 = [0, 0, 0, 1];
	view.spin = 0; view.project(0, -1, 0, o0);
	view.spin = 0.1; view.project(0, -1, 0, o1);
	ok(o1[0] < o0[0], `near side moves left (clockwise seen from above): x ${o0[0].toFixed(2)} -> ${o1[0].toFixed(2)}`);
	view.spin = 0; view.project(0, 0, -100, o0); // top of the axis (sim z negative = up)
	ok(o0[1] < view.H / 2 && o0[0] > view.W / 2, "axis tilted like a globe: top leans right of center");
	view.inside = false; view.dragging = false; plug.settings.spin = true;
	const sp0 = view.spin; for (let k = 0; k < 5; k++) view.frame();
	ok(view.spin > sp0, "spins when pointer is outside");
	view.canvas.dispatchEvent(ev("pointerenter", 10, 10));
	const sp1 = view.spin; for (let k = 0; k < 5; k++) view.frame();
	ok(view.spin === sp1, "stops while pointer is over the graph");
	view.canvas.dispatchEvent(ev("pointerleave", 10, 10));
	const sp2 = view.spin; for (let k = 0; k < 5; k++) view.frame();
	ok(view.spin > sp2, "resumes after the pointer leaves");
	plug.settings.spin = false;
	const sp3 = view.spin; for (let k = 0; k < 5; k++) view.frame();
	ok(view.spin === sp3, "Spin toggle off disables it");
	// ---- tags as linked nodes
	plug.settings.tags = true; plug.settings.layers = true; plug.settings.depth = 0; plug.settings.filter = '-path:"06 - People/supreme-intelligence"'; view.apply();
	view.onActiveFile(files[10].path);
	const tagIdx = view.nodes.findIndex((x) => x.isTag && x.name === "#t" + (10 % 3));
	ok(tagIdx >= 0 && view.activeNb.has(tagIdx), "active note's tag node is in its highlighted neighbors");
	log.texts.length = 0; view.draw();
	ok(log.texts.includes("#t" + (10 % 3)), "tag name label drawn for the active note");
	view.openNode(tagIdx, false);
	ok(plug.settings.filter === "tag:#t1" && view.nodes.filter((x) => !x.isTag).length === files.slice(0, 500).filter((f, k) => k % 3 === 1).length, "click tag filters by it: " + plug.settings.filter);
	plug.settings.tags = false; plug.settings.filter = ''; view.apply();
	ok(view.tagCount === 0 && view.nodes.every((x) => !x.isTag), "Tags toggle off hides tag nodes");
	// ---- colors copied from the core graph
	view.contentEl.style.setProperty("--color-green", "#44cf6e");
	view.contentEl.style.setProperty("--graph-node", "#999999");
	view.contentEl.style.setProperty("--graph-line", "#cccccc");
	view._themeT = 0; plug.settings.tags = true; plug.settings.filter = ""; view.apply();
	log.fills.clear(); log.strokes.clear(); view.draw();
	console.log("   theme:", JSON.stringify(view._theme));
	ok(view._theme.tag === "rgb(68, 207, 110)", "tag nodes use the theme green: " + view._theme.tag);
	ok(log.fills.has("rgb(68, 207, 110)"), "tag nodes drawn green");
	ok(log.fills.has("rgba(2,122,255,1)"), "color group from graph.json copied (concept = rgba(2,122,255,1))");
	ok(view._theme.node === "rgb(153, 153, 153)" && log.fills.has("rgb(153, 153, 153)"), "default nodes use --graph-node");
	ok(log.strokes.has("rgb(204, 204, 204)"), "edges use --graph-line");
	// ---- settings panel + requested tweaks
	const S = plug.settings;
	ok(S.activeLinkWidth === 1.8 && S.layerWidth === 1.3 && S.layerGap === 0.9, "defaults: active link 1.8 (was 2), layer width x1.3, layer gap x0.9");
	S.tags = false; S.layers = true; S.filter = ""; S.depth = 0; S.nodeOpacity = 1; view.apply();
	view.onActiveFile(files[10].path);
	log.widths.clear(); log.alphas.clear(); view.draw();
	ok(log.widths.has(1.8) && !log.widths.has(2), "purple links of the active note drawn at width 1.8, normal links stay at 1");
	ok(log.widths.has(1), "other links keep their width (1)");
	ok([...log.alphas].some((x) => x >= 0.8 && x < 1), "notes are brighter (unrelated notes at 0.85 x fog, was 0.55): " + [...log.alphas].filter((x) => x >= 0.7).join(","));
	view.yaw = 0; view.pitch = 0; view.spin = 0; S.layerWidth = 1; view.syncCam(); view.project(100, 0, 0, o0);
	S.layerWidth = 1.3; view.syncCam(); view.project(100, 0, 0, o1);
	const cx = view.W / 2 + view.panX;
	ok(Math.abs((o1[0] - cx) / (o0[0] - cx) - 1.3) < 1e-6, `layer width +30%: ${((o1[0] - cx) / (o0[0] - cx)).toFixed(3)}x`);
	S.layerGap = 1; view.apply(); const gapA = view.planes[1].z - view.planes[0].z;
	S.layerGap = 0.9; view.apply(); const gapB = view.planes[1].z - view.planes[0].z;
	ok(Math.abs(gapB / gapA - 0.9) < 1e-9, `distance between layers -10%: ${(gapB / gapA).toFixed(3)}x`);
	S.repel = 2; view.applyForces(); ok(view.sim.p.repel === 2 && view.sim.alpha >= 0.5, "Forces panel values reach the running layout and reheat it");
	const sections = [...view.panel.querySelectorAll("summary")].map((x) => x.textContent);
	ok(["Filters", "Groups", "Display", "Spin", "Forces", "Layers"].every((n) => sections.includes(n)), "panel sections: " + sections.join(", "));
	ok(view.panel.querySelectorAll(".qg3d-group").length === 2, "panel lists the graph.json color groups");
	const rows = [...view.panel.querySelectorAll(".qg3d-slider")];
	const row = rows.find((r) => r.textContent.startsWith("Node size"));
	const rng = row.querySelector("input"); rng.value = "2"; rng.dispatchEvent(new window.Event("input"));
	ok(S.nodeSize === 2 && row.querySelector(".qg3d-val").textContent === "2", "slider updates the setting and its value label");
	view.btnMenu.dispatchEvent(new window.Event("click")); const open0 = view.panel.classList.contains("is-open"); view.btnSettings.dispatchEvent(new window.Event("click"));
	ok(view.panel.classList.contains("is-open") !== open0, "Settings button toggles the menu");
	[...view.panel.querySelectorAll("button")].find((b) => b.textContent === "Reset settings").dispatchEvent(new window.Event("click"));
	ok(S.nodeSize === 1 && S.repel === 1 && S.activeLinkWidth === 1.8, "Reset settings restores defaults");
	// ---- new layout: one gear icon -> Settings / Layers view / 3D view / Reset; menu top-right, groups collapsed
	const fresh = factory({ app });
	plug.settings.menuOpen = false; plug.settings.settingsOpen = false; plug.settings.view3d = true; plug.settings.layers = true; plug.settings.tags = false; plug.settings.filter = "";
	await fresh.onOpen();
	ok(!fresh.contentEl.querySelector(".qg3d-bar"), "no toolbar any more");
	ok(fresh.stack.classList.contains("is-open") === false && fresh.panel.classList.contains("is-open") === false, "initially only the gear icon is visible");
	ok(fresh.btnMenu.dataset.icon === "settings", "single gear icon");
	fresh.btnMenu.dispatchEvent(new window.Event("click"));
	ok(fresh.stack.classList.contains("is-open"), "gear reveals the buttons");
	ok([...fresh.stack.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")).join("|") === "Settings|Layers view|3D view|Reset", "buttons: Settings, Layers view, 3D view, Reset");
	ok(!fresh.panel.classList.contains("is-open"), "menu closed until Settings is pressed");
	fresh.btnSettings.dispatchEvent(new window.Event("click"));
	ok(fresh.panel.classList.contains("is-open"), "Settings opens the menu");
	const dets = [...fresh.panel.querySelectorAll("details")];
	ok(dets.length === 6 && dets.every((d) => !d.open), "all 6 groups collapsed by default");
	ok(fresh.panel.querySelector(".qg3d-search") && fresh.panel.querySelector("details .qg3d-search"), "search lives in Filters");
	dets[2].open = true; fresh.buildPanel();
	const dets2 = [...fresh.panel.querySelectorAll("details")];
	ok(dets2[2].open && dets2.filter((d) => d.open).length === 1, "a group you opened stays open after the menu rebuilds");
	// Layers view button
	await new Promise((r) => setTimeout(r, 0));
	let g4 = 0; while (!fresh.sim.settled && g4++ < 3000) fresh.frame();
	ok(fresh.planes.length === 6 && fresh.btnLayers.classList.contains("is-active"), "Layers view on: tower planes present");
	fresh.btnLayers.dispatchEvent(new window.Event("click"));
	ok(fresh.planes.length === 0 && !fresh.btnLayers.classList.contains("is-active") && plug.settings.layers === false, "Layers view off: planes gone");
	fresh.btnLayers.dispatchEvent(new window.Event("click"));
	ok(fresh.planes.length === 6, "Layers view back on");
	// 3D view button -> flat 2D
	fresh.btn3d.dispatchEvent(new window.Event("click"));
	let g5 = 0; while (!fresh.sim.settled && g5++ < 3000) fresh.frame();
	ok(plug.settings.view3d === false && fresh.planes.length === 0, "3D view off: no tower");
	ok([...fresh.sim.pz].every((z) => z === 0), "2D: all nodes flat (z = 0)");
	fresh.spin = 0; fresh.inside = false; fresh.dragging = false;
	for (let k = 0; k < 5; k++) fresh.frame();
	ok(fresh.spin === 0, "2D: no spinning");
	fresh.syncCam(); fresh.project(10, 20, 0, o0);
	ok(Math.abs(o0[0] - (fresh.W / 2 + fresh.panX + 10 * fresh.zoom)) < 1e-6 && Math.abs(o0[1] - (fresh.H / 2 + fresh.panY + 20 * fresh.zoom)) < 1e-6, "2D: screen x/y = layout x/y");
	const px0 = fresh.panX;
	const evf = (type, x, y, extra = {}) => { const e = new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...extra }); e.pointerId = 1; return e; };
	fresh.canvas.dispatchEvent(evf("pointerdown", 100, 100, { button: 0 })); fresh.canvas.dispatchEvent(evf("pointermove", 140, 100)); fresh.canvas.dispatchEvent(evf("pointerup", 140, 100));
	ok(fresh.panX - px0 === 40 && fresh.yaw === 0.6, "2D: dragging pans instead of rotating");
	fresh.btn3d.dispatchEvent(new window.Event("click"));
	let g6 = 0; while (!fresh.sim.settled && g6++ < 3000) fresh.frame();
	ok(plug.settings.view3d === true && fresh.planes.length === 6 && fresh.sim.pz.some((z) => z !== 0), "3D view on again: tower and depth are back");
	fresh.yaw = 2; fresh.pitch = 1; fresh.btnReset.dispatchEvent(new window.Event("click"));
	ok(fresh.yaw === 0.6 && fresh.pitch === -0.35, "Reset restores the camera");
	// ---- auto-scale when switching Layers view / 3D view
	const bound = (v) => { // worst offset of any node, as a fraction of the half-canvas, over a full turn
		let worst = 0;
		for (let a = 0; a < 6.3; a += Math.PI / 4) {
			v.spin = a; v.draw();
			for (let i = 0; i < v.sim.n; i++) worst = Math.max(worst, Math.abs(v.sx[i] - v.W / 2 - v.panX) / (v.W / 2), Math.abs(v.sy[i] - v.H / 2 - v.panY) / (v.H / 2));
		}
		return worst;
	};
	const settle = (v) => { let g = 0; while (!v.sim.settled && g++ < 3000) v.frame(); v.draw(); };
	fresh.spin = 0; fresh.inside = true; // no spinning during measurement
	plug.settings.layers = true; plug.settings.view3d = true; fresh.syncButtons(); fresh.apply(); settle(fresh);
	const fz3 = fresh.zoom;
	// user zooms way in and pans away: a mode switch must still re-fit
	fresh.zoom *= 5; fresh.panX = 300; fresh.userMoved = true; fresh.autoFit = false;
	fresh.btnLayers.dispatchEvent(new window.Event("click")); settle(fresh); // layers off
	const b3 = bound(fresh);
	ok(fresh.panX === 0 && fresh.autoFit === true && Math.abs(fresh.zoom - fresh.fitZoom) < 1e-9, "switching Layers view re-fits (manual zoom/pan dropped)");
	ok(b3 <= 1 && b3 >= 0.88, `3D without layers: fills ${(b3 * 100).toFixed(0)}% of the half-canvas over a full turn (target 90-95%)`);
	fresh.btnLayers.dispatchEvent(new window.Event("click")); settle(fresh); // layers on
	const bL = bound(fresh);
	ok(bL <= 1 && bL >= 0.88, `Layers view: fills ${(bL * 100).toFixed(0)}% over a full turn`);
	ok(bL <= 0.97, `...without overflowing (${(bL * 100).toFixed(0)}% <= 97%)`);
	const zl = fresh.zoom;
	fresh.btn3d.dispatchEvent(new window.Event("click")); settle(fresh); // flat
	const b2 = bound(fresh);
	ok(b2 <= 1 && b2 >= 0.88, `2D fills ${(b2 * 100).toFixed(0)}%`);
	fresh.btn3d.dispatchEvent(new window.Event("click")); settle(fresh); // back to 3D+layers
	const bBack = bound(fresh);
	ok(bBack <= 1 && bBack >= 0.88 && Math.abs(fresh.zoom - zl) / zl < 0.25, `back to 3D layers: ${bBack.toFixed(2)} (zoom ${fresh.zoom.toFixed(2)} vs ${zl.toFixed(2)} before)`);
	// ---- Auto-fit fill option
	ok(plug.settings.fitFill === 0.97, "default Auto-fit fill is 97%");
	fresh.btnMenu.dispatchEvent(new window.Event("click")); // make sure the menu is built/visible state irrelevant for DOM test
	const fillRow = [...fresh.panel.querySelectorAll(".qg3d-slider")].find((r) => r.textContent.startsWith("Auto-fit fill"));
	ok(!!fillRow && fillRow.querySelector(".qg3d-val").textContent === "97%", "Display has an Auto-fit fill slider showing a percentage");
	const rf = fillRow.querySelector("input"); rf.value = "0.8"; rf.dispatchEvent(new window.Event("input"));
	fresh.inside = true; fresh.spin = 0;
	const b80 = bound(fresh);
	ok(plug.settings.fitFill === 0.8 && fillRow.querySelector(".qg3d-val").textContent === "80%" && b80 > 0.74 && b80 < 0.83, `fill 80% -> graph reaches ${(b80 * 100).toFixed(0)}% of the half-canvas`);
	rf.value = "0.95"; rf.dispatchEvent(new window.Event("input")); const b95 = bound(fresh);
	ok(b95 > 0.9 && b95 <= 0.97, `fill 95% -> ${(b95 * 100).toFixed(0)}%`);
	await fresh.onClose();
	await view.onClose();
	console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
	process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(2); });
