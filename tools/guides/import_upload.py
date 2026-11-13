"""Import an uploaded batch (URLs cited directly) into content/*.json with stable source ids.
Fields are copied verbatim; nothing is invented. Usage: python3 tools/guides/import_upload.py <file.json>"""
import json, sys, pathlib, importlib.util
HERE = pathlib.Path(__file__).resolve().parent; CONTENT = HERE / "content"
sources = json.loads((CONTENT / "_sources.json").read_text()); by_url = {v["url"]: k for k, v in sources.items()}
spec = importlib.util.spec_from_file_location("ir", HERE / "import_reviewed.py")
src = (HERE / "import_reviewed.py").read_text(); ns = {"sources": sources}
exec(src[src.index("def make_id"):src.index("def sid")], {"re": __import__("re"), "urllib": __import__("urllib.parse"), "sources": sources}, ns)
make_id = ns["make_id"]; existing = {p.stem for p in CONTENT.glob("*.json")}
def sid(url, meta):
    url = url.strip()
    if url in by_url: return by_url[url]
    k = make_id(url); t = (meta.get(url, {}).get("title") or url).strip()
    sources[k] = {"title": t, "url": url, "short": t[:40], "checked": "Nov 13, 2026"}; by_url[url] = k; return k
n, skipped = 0, []
for g in json.loads(pathlib.Path(sys.argv[1]).read_text()):
    if g["slug"] in existing: skipped.append(g["slug"]); continue
    meta = g.get("sources") or {}; ids = lambda l: list(dict.fromkeys(sid(u, meta) for u in l))
    secs = [{"heading": s["heading"], "facts": [{"text": f["text"], "sources": ids(f["sources"])} for f in s["facts"] if f.get("sources")]} for s in g["sections"]]
    out = {k: g[k] for k in ("slug", "cluster", "eyebrow", "h1", "title", "description", "short_answer")}
    out.update({"short_answer_sources": ids(g["short_answer_sources"]), "sections": [s for s in secs if s["facts"]],
                "qa": [{"q": q["q"], "a": q["a"], "sources": ids(q["sources"])} for q in g["qa"] if q.get("sources")],
                "related": g.get("related", []), "date": "2026-11-13"})
    c = g.get("confirm") or {}
    if c.get("items"):
        out["confirm"] = {"items": c["items"], "office": sid(c["office_url"], {c["office_url"]: {"title": c.get("office")}}) if c.get("office_url") else None}
    (CONTENT / f"{g['slug']}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n"); n += 1
(CONTENT / "_sources.json").write_text(json.dumps(sources, indent=1, ensure_ascii=False) + "\n")
print(f"imported {n}; skipped existing {skipped}; sources {len(sources)}")
