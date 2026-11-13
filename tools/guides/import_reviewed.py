"""Import machine-verified, editor-reviewed guide drafts into content/*.json.

Usage: python3 tools/guides/import_reviewed.py <dir-of-verified-json> [cache-index.tsv]
Each draft cites sources by URL with verbatim evidence quotes. This script maps URLs to
stable source ids in content/_sources.json and writes one content file per guide.
It never invents content: fields are copied; only ids/titles are normalised."""
import json, sys, re, pathlib, urllib.parse
HERE = pathlib.Path(__file__).resolve().parent
CONTENT = HERE / "content"
SRC_DIR = pathlib.Path(sys.argv[1])
CHECKED = "Nov 13, 2026"
sources = json.loads((CONTENT / "_sources.json").read_text())
by_url = {v["url"]: k for k, v in sources.items()}

def make_id(url):
    u = urllib.parse.urlparse(url); host = u.netloc.replace("www.", ""); path = u.path.strip("/")
    m = re.search(r"showpublisheddocument/(\d+)", path)
    if m: base = "nwt-doc-" + m.group(1)
    elif host == "malegislature.gov":
        m = re.search(r"Chapter(\w+)/Section(\w+)", path)
        base = f"mgl-{m.group(1).lower()}-{m.group(2).lower()}" if m else "mgl-" + path.split("/")[-1].lower()
    else:
        pre = {"newtonma.gov": "nwt", "mass.gov": "ma", "codes.iccsafe.org": "icc", "apps2.newtonma.gov": "nwt-app"}.get(host, host.split(".")[0])
        segs = [s for s in path.split("/") if s and s not in ("info-details", "doc", "download", "government", "how-to", "orgs", "content")]
        base = pre + "-" + "-".join(segs[-2:]).lower() if segs else pre
    base = re.sub(r"[^a-z0-9-]+", "-", base)[:60].strip("-")
    i, k = 1, base
    while k in sources and sources[k]["url"] != url: i += 1; k = f"{base}-{i}"
    return k

def sid(url, meta):
    if url in by_url: return by_url[url]
    k = make_id(url); info = meta.get(url, {})
    title = (info.get("title") or "").strip() or url
    sources[k] = {"title": title, "url": url, "short": (info.get("short") or title)[:40], "checked": CHECKED}
    by_url[url] = k; return k

def conv_ev(lst, meta):
    out, ids = [], []
    for e in lst or []:
        k = sid(e["url"], meta); out.append({"source": k, "quote": e["quote"]})
        if k not in ids: ids.append(k)
    return ids, out

n = 0
for p in sorted(SRC_DIR.glob("*.json")):
    g = json.loads(p.read_text()); meta = g.get("sources") or {}
    sa_ids, sa_ev = conv_ev(g["short_answer_evidence"], meta)
    secs = []
    for s in g["sections"]:
        facts = []
        for f in s["facts"]:
            ids, ev = conv_ev(f["evidence"], meta); facts.append({"text": f["text"], "sources": ids, "evidence": ev})
        secs.append({"heading": s["heading"], "facts": facts})
    qa = []
    for q in g["qa"]:
        ids, ev = conv_ev(q["evidence"], meta); qa.append({"q": q["q"], "a": q["a"], "sources": ids, "evidence": ev})
    conf = g.get("confirm") or {}
    office = None
    if conf.get("office_url"):
        office = sid(conf["office_url"], {conf["office_url"]: {"title": conf.get("office_title"), "short": conf.get("office_title")}})
    out = {k: g[k] for k in ("slug", "cluster", "eyebrow", "h1", "title", "description", "short_answer")}
    out.update({"short_answer_sources": sa_ids, "short_answer_evidence": sa_ev, "sections": secs, "qa": qa,
                "confirm": {"items": conf.get("items", []), "office": office} if conf.get("items") else None,
                "related": g.get("related", []), "date": "2026-11-13"})
    if out["confirm"] is None: del out["confirm"]
    (CONTENT / f"{g['slug']}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n"); n += 1
(CONTENT / "_sources.json").write_text(json.dumps(sources, indent=1, ensure_ascii=False) + "\n")
print(f"imported {n} guides; {len(sources)} sources")
