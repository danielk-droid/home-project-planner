"""Render HPP guide pages from tools/guides/content/*.json.
Every fact/answer must carry a source id that exists in SOURCES; build fails otherwise."""
import json, html, pathlib, sys, re
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = "https://home-project-planner-mvp.vercel.app"
OUT = ROOT / "public/hpp/guides"
CONTENT = pathlib.Path(__file__).parent / "content"
e = html.escape

def link(src, label=None):
    return f'<a href="{e(src["url"])}" target="_blank" rel="noopener noreferrer">{e(label or src["title"])} ↗</a>'

def fail(msg):
    print("GUIDE BUILD ERROR:", msg); sys.exit(1)

def render(g, sources, all_guides):
    slug, url = g["slug"], f'{BASE}/guides/{g["slug"]}/'
    def S(i):
        if i not in sources: fail(f'{slug}: unknown source {i}')
        return sources[i]
    for k in ("title","h1","description","short_answer","short_answer_sources","qa","eyebrow"):
        if not g.get(k): fail(f"{slug}: missing {k}")
    if len(g["description"]) > 170: fail(f"{slug}: description too long")
    used = []
    def use(i):
        s = S(i)
        if i not in used: used.append(i)
        return s
    sa_links = " ".join(link(use(i)) for i in g["short_answer_sources"])
    body = [f'<div class="eyebrow">{e(g["eyebrow"])}</div><h1>{e(g["h1"])}</h1>',
            f'<section class="guide-answer" aria-label="Short answer"><div class="eyebrow">SHORT ANSWER</div><p class="guide-lede">{e(g["short_answer"])}</p><p class="small">Official source: {sa_links}</p></section>']
    for sec in g.get("sections", []):
        body.append(f'<h2>{e(sec["heading"])}</h2><ul>')
        for f in sec["facts"]:
            if not f.get("sources"): fail(f'{slug}: fact without source: {f["text"][:60]}')
            body.append(f'<li>{e(f["text"])} <span class="small">({", ".join(link(use(i), S(i).get("short", "Source")) for i in f["sources"])})</span></li>')
        body.append('</ul>')
    body.append('<h2>Questions and answers</h2><dl class="guide-qa">')
    for q in g["qa"]:
        if not q.get("sources"): fail(f'{slug}: answer without source: {q["q"]}')
        body.append(f'<dt>{e(q["q"])}</dt><dd>{e(q["a"])} <span class="small">Source: {", ".join(link(use(i)) for i in q["sources"])}</span></dd>')
    body.append('</dl>')
    if g.get("confirm"):
        off = S(g["confirm"]["office"]); use(g["confirm"]["office"])
        body.append('<h2>What to confirm with the City</h2><ul>' + "".join(f"<li>{e(x)}</li>" for x in g["confirm"]["items"]) + f'</ul><p>Contact: {link(off)}</p>')
    body.append('<aside class="guide-cta"><div class="eyebrow">FOR NEWTON, MA PROPERTIES</div><h2>Check this for your own Newton property.</h2><p>HPP looks up the property through City of Newton GIS, asks only the questions that can change your project, and separates what applies from what still needs City confirmation. It\'s free and needs no account, and your answers stay in your browser.</p><a class="primary-link" href="/#plan">Start a project <span>→</span></a></aside>')
    body.append('<section class="guide-sources"><h2>Sources</h2><ul>' + "".join(f"<li>{link(sources[i])} <span class=\"small\">checked {e(sources[i]['checked'])}</span></li>" for i in used) + '</ul></section>')
    rel = [r for r in g.get("related", []) if r in all_guides]
    if rel:
        body.append('<section class="guide-related"><h2>Related guides</h2><ul>' + "".join(f'<li><a href="/guides/{r}/">{e(all_guides[r])}</a></li>' for r in rel) + '</ul></section>')
    body.append('<p class="guide-note">HPP is an independent planning tool. It is not affiliated with, endorsed by, or a service of the City of Newton. This guide is general planning information, not legal, zoning or permitting advice. Confirm requirements with the City of Newton before starting work.</p>')
    ld = {"@context":"https://schema.org","@graph":[
        {"@type":"Article","headline":g["h1"],"description":g["description"],"url":url,"dateModified":g["date"],
         "isPartOf":{"@type":"WebSite","name":"Home Project Planner","url":BASE+"/"},"publisher":{"@type":"Organization","name":"Home Project Planner"},
         "citation":[sources[i]["url"] for i in used]},
        {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":q["q"],"acceptedAnswer":{"@type":"Answer","text":q["a"]}} for q in g["qa"]]},
        {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":BASE+"/"},{"@type":"ListItem","position":2,"name":"Planning guides","item":BASE+"/guides/"},{"@type":"ListItem","position":3,"name":g["h1"],"item":url}]}]}
    t, d = e(g["title"] + " | Home Project Planner"), e(g["description"])
    tpl = (OUT / "do-i-need-a-permit-for-a-deck/index.html").read_text()
    header = tpl[tpl.index('<body'):tpl.index('<main id="main">')]
    footer = tpl[tpl.index('</main>'):]
    head = f'''<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title><meta name="description" content="{d}"><link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Home Project Planner"><meta property="og:title" content="{t}"><meta property="og:description" content="{d}"><meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="{t}"><meta name="twitter:description" content="{d}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</","<\\/")}</script>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/experiment.css"><link rel="stylesheet" href="/guides.css"><link rel="stylesheet" href="/studio.css"><script src="/ui-theme.js"></script><script src="/analytics.js" defer></script>
</head>'''
    main = f'<main id="main"><article class="guide"><nav class="guide-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/guides/">Planning guides</a></nav>{"".join(body)}</article>'
    return head + header + main + footer

def main():
    sources = json.loads((CONTENT / "_sources.json").read_text())
    guides = [json.loads(p.read_text()) for p in sorted(CONTENT.glob("[!_]*.json"))]
    names = {g["slug"]: g["h1"] for g in guides}
    existing = {d.name: re.search(r"<h1>(.*?)</h1>", (d/"index.html").read_text()).group(1) for d in OUT.iterdir() if d.is_dir() and d.name not in names and (d/"index.html").exists()}
    count = len(names); names.update({k: html.unescape(v) for k,v in existing.items()})
    if count != len(guides): fail("duplicate slug")
    titles = [g["title"] for g in guides]
    if len(set(titles)) != len(titles): fail("duplicate title")
    for g in guides:
        if not re.fullmatch(r"[a-z0-9-]+", g["slug"]): fail("bad slug " + g["slug"])
        d = OUT / g["slug"]; d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(render(g, sources, names))
    (CONTENT.parent / "manifest.json").write_text(json.dumps([{"slug":g["slug"],"h1":g["h1"],"cluster":g["cluster"],"description":g["description"]} for g in guides], indent=1))
    print(f"built {len(guides)} guides")
main()

def update_index():
    man = json.loads((CONTENT.parent / "manifest.json").read_text())
    idx = OUT / "index.html"; s = idx.read_text()
    s = re.sub(r"<!--LIB-->.*?<!--/LIB-->", "", s, flags=re.S)
    order = []
    for g in man:
        if g["cluster"] not in order: order.append(g["cluster"])
    parts = ['<!--LIB--><h2 id="library">Guide library by topic</h2>']
    for c in order:
        parts.append(f'<h3 class="eyebrow">{e(c.upper())}</h3><ul class="guide-list">')
        parts += [f'<li><a href="/guides/{g["slug"]}/"><strong>{e(g["h1"])}</strong><span>{e(g["description"])}</span></a></li>' for g in man if g["cluster"] == c]
        parts.append('</ul>')
    parts.append('<!--/LIB-->')
    s = s.replace('</ul><aside class="guide-cta">', '</ul>' + "".join(parts) + '<aside class="guide-cta">', 1)
    idx.write_text(s)
    urls = "".join(f"  <url><loc>{BASE}/guides/{g['slug']}/</loc><lastmod>2026-11-13</lastmod></url>\n" for g in man)
    (CONTENT.parent / "sitemap-additions.xml").write_text(urls)
    (CONTENT.parent / "llms-additions.md").write_text("".join(f"- [{g['h1']}]({BASE}/guides/{g['slug']}/): {g['description']}\n" for g in man))
update_index()
