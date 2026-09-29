#!/usr/bin/env python3
"""Generate HPP planning guide pages (static HTML). Content is hand-written and
source-backed; Newton-specific statements mirror data/rules.json and
data/sources.json. Run from the HPP repo root."""
import json, os, html

BASE = "https://home-project-planner-mvp.vercel.app"
SRC = {s["id"]: s for s in json.load(open("data/sources.json"))}

def src(i, label=None):
    s = SRC[i]
    return f'<a href="{s["url"]}" target="_blank" rel="noopener noreferrer">{html.escape(label or s["title"])} ↗</a>'

GUIDES = []
def guide(slug, title, h1, desc, eyebrow, body, sources, related):
    GUIDES.append(dict(slug=slug, title=title, h1=h1, desc=desc, eyebrow=eyebrow, body=body, sources=sources, related=related))

guide(
  "do-i-need-a-permit-for-an-addition",
  "Do I Need a Permit for a Home Addition? | Home Project Planner",
  "Do I need a permit for a home addition?",
  "Almost every home addition needs a building permit and zoning review. Learn what reviews usually apply, what to measure first, and how Newton, MA handles additions.",
  "ADDITIONS",
  f"""
<p class="guide-lede">In nearly every U.S. community, yes. A home addition adds floor area and structure, so it almost always needs a building permit. It usually needs a zoning check too, because it changes how much of the lot is built on and how close the house sits to the property lines.</p>
<h2>Why additions get more review than most projects</h2>
<p>An interior renovation mostly raises building-code questions. An addition raises three kinds at once:</p>
<ul>
<li><strong>Building code.</strong> Structure, foundations, egress, fire safety and energy performance. In Massachusetts the statewide rules are in the {src('ma-building-code')}, and the local building department enforces them.</li>
<li><strong>Zoning.</strong> Whether the new footprint and height fit the district's setbacks, lot coverage, floor area ratio (FAR) and height limits. Zoning is a local ordinance and is separate from the building code.</li>
<li><strong>Site and overlay reviews.</strong> Historic districts, wetlands, floodplains, stormwater, and tree rules can all apply to exterior work, depending on the property.</li>
</ul>
<p>Trade permits (electrical, plumbing, gas, mechanical) are normally separate from the building permit, even when the same contractor does the whole job.</p>
<h2>What to know before you design</h2>
<ol>
<li><strong>Your zoning district.</strong> Setback, coverage and FAR limits depend on it.</li>
<li><strong>Lot area and a current survey or plot plan.</strong> Distances you estimate yourself are not enough to show compliance.</li>
<li><strong>Proposed footprint, number of stories and new floor area.</strong></li>
<li><strong>Building age and historic status.</strong> Older buildings and historic districts can add a review step.</li>
<li><strong>Site conditions.</strong> Nearby wetlands or streams, a mapped floodplain, new paved or roofed area, grading, and trees.</li>
</ol>
<h2>How additions are handled in Newton, Massachusetts</h2>
<p>These points summarize how HPP's source-backed rules treat an addition in Newton. They are planning indications, not City determinations.</p>
<ul>
<li>Building work enters Newton's building-permit workflow through the {src('newton-newgov-portal')}. The exact application type, drawings and calculations depend on the scope.</li>
<li>Any expansion calls for a current zoning and FAR analysis based on the actual project geometry. Newton publishes a {src('newton-far', 'Residential FAR calculator and guidance')}.</li>
<li>The addition's location has to be checked against Newton's setbacks using a current survey or site plan. HPP can compare the side and rear distances you enter with the minimums in {src('newton-zoning-ordinance', 'Newton Zoning Ordinance Sec. 3.1.3')}. It does not calculate front-setback averaging, which needs City confirmation.</li>
<li>Exterior construction triggers a Newton {src('newton-tree', 'Tree Permit')} evaluation, even when no tree will be removed.</li>
<li>Exterior changes to buildings more than 50 years old can fall within Newton's age-based historic review pathway. Properties in a local historic district follow the Historic District review track. See {src('newton-historic')}.</li>
<li>New impervious area of 401–1,000 sq ft falls in Newton's Minor Stormwater category, and more than 1,000 sq ft calls for confirming the Major pathway. Both are subject to the ordinance's exceptions and waivers (see {src('newton-stormwater')}).</li>
</ul>
<h2>Questions worth asking the City early</h2>
<ul>
<li>Which zoning district and dimensional table apply to my lot, and are there existing nonconformities?</li>
<li>How is the front setback determined for my street?</li>
<li>Does my building's age or location trigger historic review before a building permit?</li>
<li>Will the new roof and paved area trigger a stormwater permit?</li>
</ul>
""",
  ["ma-building-code", "newton-newgov-portal", "newton-far", "newton-zoning-ordinance", "newton-tree", "newton-historic", "newton-stormwater"],
  ["how-much-can-i-build-on-my-lot", "building-permit-vs-zoning-approval", "historic-home-renovation"],
)

guide(
  "do-i-need-a-permit-for-a-deck",
  "Do I Need a Permit for a Deck? | Home Project Planner",
  "Do I need a permit for a deck?",
  "Most new and rebuilt decks need a building permit, especially raised or attached decks. See what reviewers look at and how deck projects are handled in Newton, MA.",
  "DECKS",
  f"""
<p class="guide-lede">Usually, yes, for a new deck, a rebuilt deck, or a deck attached to the house. Reviewers care most about structure, height, stairs and guards, and where the deck sits on the lot.</p>
<h2>What makes a deck a permit project</h2>
<ul>
<li><strong>Height above grade.</strong> Raised decks need guards and stairs that meet code, and a structure sized for the load.</li>
<li><strong>Attachment to the house.</strong> A ledger connection to the house framing is a structural detail that reviewers check closely.</li>
<li><strong>Footings.</strong> Footing size and depth depend on the design and the site.</li>
<li><strong>Location.</strong> A deck can count toward setbacks or lot coverage under local zoning, and it can affect trees or nearby wetlands.</li>
</ul>
<p>Repairing a few boards is different from replacing the structure. If you are unsure which your project is, describe the actual work to the building department rather than guessing.</p>
<h2>Before you ask for quotes</h2>
<ol>
<li>Approximate deck height at its highest point.</li>
<li>Whether it attaches to the house or changes structural parts of the house.</li>
<li>Whether you are adding stairs, guards, lighting or outlets. Electrical work is a separate permit.</li>
<li>Distance to the property lines, and whether any trees are nearby.</li>
</ol>
<h2>How deck projects are handled in Newton, Massachusetts</h2>
<ul>
<li>Deck height, structure, stairs and guards feed into the building-code review under the {src('ma-building-code')}. Exact guard, stair, structural and foundation requirements depend on the final design. Newton's {src('newton-building-checklist')} lists the application documents.</li>
<li>Building work goes through Newton's building-permit workflow in the {src('newton-newgov-portal')}.</li>
<li>Exterior construction triggers a {src('newton-tree', 'Tree Permit')} evaluation even if no tree is removed.</li>
<li>If the property is in a local historic district, exterior changes follow the {src('newton-historic', 'Historic District review')} track.</li>
<li>Mapped wetlands, streams or floodplain nearby can route the site to {src('newton-conservation', 'Conservation review')}.</li>
</ul>
""",
  ["ma-building-code", "newton-building-checklist", "newton-newgov-portal", "newton-tree", "newton-historic", "newton-conservation"],
  ["do-i-need-a-permit-for-an-addition", "stormwater-and-flood-zone-home-projects", "questions-before-starting-a-home-project"],
)

guide(
  "building-permit-vs-zoning-approval",
  "Building Permit vs. Zoning Approval: What's the Difference? | Home Project Planner",
  "Building permit vs. zoning approval: what's the difference?",
  "A building permit checks how you build; zoning checks what and where you can build. Learn how the two reviews differ, when you need both, and how that works in Newton, MA.",
  "PERMITS AND ZONING",
  f"""
<p class="guide-lede">A building permit asks whether the work is built safely and to code. Zoning asks whether that building is allowed at that size and in that spot on the lot. Many projects need both, and passing one does not mean you pass the other.</p>
<h2>The building permit</h2>
<p>Building permits apply the building code: structure, fire safety, egress, energy performance, and the trade work (electrical, plumbing, gas, mechanical). In Massachusetts, the code is the statewide {src('ma-building-code')}. Local building officials enforce it, review the drawings, and inspect the work while it is built.</p>
<h2>Zoning review</h2>
<p>Zoning is a local ordinance. It controls use (for example, one-family or two-family) and dimensions: setbacks, lot coverage, floor area ratio (FAR), height and stories. Interior work that stays inside the existing building often raises few zoning questions. Anything that expands the footprint, adds height, or adds floor area usually does.</p>
<p>If a design does not meet the zoning dimensions, the options are usually to redesign or to seek zoning relief, such as a variance or special permit. That process has its own timeline and public steps.</p>
<h2>Which comes first?</h2>
<p>Check zoning first on any project that expands the house. A code-compliant set of drawings does not help if the addition sits inside a setback. Knowing the zoning limits early shapes the design.</p>
<h2>How this works in Newton, Massachusetts</h2>
<ul>
<li>Newton's dimensional controls are in the {src('newton-zoning-ordinance')}. Its Inspectional Services Department ({src('newton-isd', 'ISD')}) handles building permits and zoning review for permits.</li>
<li>Planning applications and forms, including those for zoning relief, are published by {src('newton-planning', 'Newton Planning & Development')}.</li>
<li>Existing nonconformities (Sec. 7.8), exceptions and special permits can change a zoning outcome. HPP reports a measurement that falls below a minimum as <em>zoning relief may be needed</em>, never as a final determination.</li>
</ul>
""",
  ["ma-building-code", "newton-zoning-ordinance", "newton-isd", "newton-planning"],
  ["how-much-can-i-build-on-my-lot", "do-i-need-a-permit-for-an-addition", "questions-before-starting-a-home-project"],
)

guide(
  "how-much-can-i-build-on-my-lot",
  "How Much Can I Build on My Lot? Setbacks, Lot Coverage & FAR | Home Project Planner",
  "How much can I build on my lot?",
  "Setbacks, lot coverage, floor area ratio (FAR) and height limits decide how much you can build. Learn how each works and how HPP screens them for Newton, MA properties.",
  "SETBACKS, COVERAGE AND FAR",
  f"""
<p class="guide-lede">Four zoning limits usually decide it: setbacks, lot coverage, floor area ratio (FAR), and height or stories. Each is set by your zoning district, and a project has to meet all of them.</p>
<h2>Setbacks</h2>
<p>A setback is the minimum distance between a building and a property line: front, side and rear. Some communities calculate the front setback from neighboring houses rather than using a single fixed number. Setbacks need accurate measurements from a survey or plot plan, not estimates.</p>
<h2>Lot coverage</h2>
<p>Lot coverage limits how much of the lot the buildings can cover, usually as a percentage of lot area. Local definitions decide what counts.</p>
<h2>Floor area ratio (FAR)</h2>
<p>FAR compares a building's floor area to the lot area. A 0.40 FAR on a 10,000 sq ft lot, for example, allows about 4,000 sq ft under that jurisdiction's definition of floor area. Definitions differ, especially for basements, attics and garages, so use the local method.</p>
<h2>Height and stories</h2>
<p>Height limits cap building height, and some districts also cap the number of stories. How height is measured, and what counts as a half story, is defined locally.</p>
<h2>How HPP screens these for Newton properties</h2>
<p>For supported Newton zoning districts, HPP compares the measurements you enter with the dimensional limits in {src('newton-zoning-ordinance', 'Newton Zoning Ordinance Secs. 1.5, 3.1.3 and 3.1.9')}:</p>
<ul>
<li>Side and rear setbacks against the minimum principal-building setback.</li>
<li>Proposed lot coverage, FAR and building height against the district maximums.</li>
</ul>
<p>What HPP deliberately does <strong>not</strong> estimate:</p>
<ul>
<li>Front-setback averaging, usable open space, the 2.5-story determination, facade build-out, and existing nonconformities or easements. These are left for City confirmation.</li>
<li>Any result when the zoning district, lot area or a needed measurement is missing or unsupported. HPP reports the check as incomplete rather than guessing.</li>
</ul>
<p>A result showing no exceedance screens only the numbers you entered. It is not a zoning determination. Newton also publishes a {src('newton-far', 'Residential FAR calculator')} for its own method.</p>
""",
  ["newton-zoning-ordinance", "newton-far", "newton-parcels", "newton-zoning"],
  ["do-i-need-a-permit-for-an-addition", "building-permit-vs-zoning-approval", "questions-before-starting-a-home-project"],
)

guide(
  "historic-home-renovation",
  "Renovating a Historic Home or a House in a Historic District | Home Project Planner",
  "Renovating a historic home or a house in a historic district",
  "Historic districts, landmarks and building age can add review before exterior work or demolition. Learn what triggers historic review and how it applies in Newton, MA.",
  "HISTORIC REVIEW",
  f"""
<p class="guide-lede">Historic review usually applies to <em>exterior</em> changes and demolition, not interior renovations. Whether it applies depends on the property's historic status and, in some communities, the building's age.</p>
<h2>What can trigger historic review</h2>
<ul>
<li><strong>Local historic district.</strong> Exterior changes visible from a public way often need a certificate or approval from a local commission before a building permit.</li>
<li><strong>Individual landmark designation or a preservation restriction.</strong> These can require their own review.</li>
<li><strong>Building age.</strong> Some communities review demolition, or certain exterior changes, for buildings over a set age.</li>
<li><strong>National Register listing.</strong> This mostly matters when federal or state funding or permits are involved, but check locally.</li>
</ul>
<h2>Plan ahead</h2>
<p>Historic review can add meeting dates and design changes to your schedule. Confirm the property's status before finalizing exterior designs, window replacements, siding, or any partial demolition.</p>
<h2>How historic review applies in Newton, Massachusetts</h2>
<ul>
<li>Exterior changes to a property in a Newton local historic district require the applicable Historic District review track. HPP reads the mapped {src('newton-historic-districts')}.</li>
<li>For buildings more than 50 years old, exterior alterations, including additions, fall within Newton's age-based historic review pathway. Building age alone does not mean a Newton Historical Commission hearing or approval is required. Confirm with {src('newton-historic', 'Newton Historic Preservation')}.</li>
<li>Partial or total demolition of a building at least 50 years old enters Newton's Historical Review pathway. Significance and any demolition delay are decided through that process ({src('newton-historic-applications', 'submit an application')}).</li>
<li>If HPP cannot establish the building's age or historic status from the property record, it asks the City to confirm rather than assuming no review applies.</li>
</ul>
""",
  ["newton-historic-districts", "newton-historic", "newton-historic-applications", "newton-parcels"],
  ["do-i-need-a-permit-for-an-addition", "questions-before-starting-a-home-project", "stormwater-and-flood-zone-home-projects"],
)

guide(
  "stormwater-and-flood-zone-home-projects",
  "Stormwater, Wetlands & Flood Zones for Home Projects | Home Project Planner",
  "Stormwater, wetlands and flood zones for home projects",
  "New paving, roofs, grading and nearby wetlands or floodplains can trigger extra permits. Learn what to measure and the stormwater thresholds HPP applies in Newton, MA.",
  "SITE CONDITIONS",
  f"""
<p class="guide-lede">Projects that add roof or paved area, move soil, or sit near water often need reviews beyond the building permit. The key facts are how much new impervious area you add, how much land you disturb, and whether the site is near mapped wetlands, streams or floodplain.</p>
<h2>Stormwater</h2>
<p>Impervious surfaces such as roofs, driveways and patios send rainwater off the site instead of letting it soak in. Many communities require a stormwater permit above a size threshold, and some also require one for retaining walls or excavation dewatering. To answer the question, measure:</p>
<ul>
<li>New impervious area in square feet (additions, garages, driveways, patios).</li>
<li>Total land disturbed during construction.</li>
<li>Whether you need a new retaining wall because of a grade change, or will pump water out of trenches.</li>
</ul>
<h2>Wetlands, streams and floodplains</h2>
<p>Work in or near wetland resource areas and their buffer zones is regulated under state and local wetlands law, usually through the local conservation commission. Mapped floodplains can add construction requirements and review. A map layer showing nothing is useful, but a layer that fails to load tells you nothing. Confirm when in doubt.</p>
<h2>What HPP applies in Newton, Massachusetts</h2>
<ul>
<li>Disturbing more than 5,000 sq ft of land requires a stormwater management and erosion control permit under Newton's ordinance, subject to its exceptions and waivers ({src('newton-stormwater')}).</li>
<li>New impervious area of 401–1,000 sq ft is Newton's Minor Stormwater category. More than 1,000 sq ft calls for confirming the Major pathway.</li>
<li>A new retaining wall needed because of a grade change, and trench dewatering, are also Minor Stormwater categories.</li>
<li>If the property touches mapped wetlands, streams or floodplain, HPP routes exterior work to {src('newton-conservation', 'Conservation review')}. It reads the {src('newton-floodplain')}, {src('newton-wetlands')} and {src('newton-streams')}.</li>
<li>If the measurements are unknown, HPP lists stormwater as <em>needs confirmation</em> instead of assuming no permit applies.</li>
</ul>
""",
  ["newton-stormwater", "newton-conservation", "newton-floodplain", "newton-wetlands", "newton-streams"],
  ["do-i-need-a-permit-for-an-addition", "do-i-need-a-permit-for-a-deck", "questions-before-starting-a-home-project"],
)

guide(
  "questions-before-starting-a-home-project",
  "What Approvals Do I Need Before Renovating? Questions to Ask First | Home Project Planner",
  "What approvals do I need before renovating?",
  "A practical checklist of what to check and what to ask the building and planning departments before you renovate, add on, or change your site, with Newton, MA resources.",
  "BEFORE YOU START",
  f"""
<p class="guide-lede">The approvals depend on two things: what the work physically changes, and the property it happens on. Answer those first. Then call the right office with specific questions rather than a general "do I need a permit?"</p>
<h2>1. Describe the work precisely</h2>
<ul>
<li>Does it change structure, add floor area, or change the footprint or height?</li>
<li>Does it involve electrical, plumbing, gas, ventilation or mechanical work?</li>
<li>Does it change windows, doors, siding, the roof, or anything else on the exterior?</li>
<li>Does it add paved or roofed area, move soil, or affect trees?</li>
<li>Does it demolish all or part of a building?</li>
</ul>
<h2>2. Know the property</h2>
<ul>
<li>Zoning district, lot area and a current plot plan or survey.</li>
<li>Year built and any historic district or landmark status.</li>
<li>Mapped wetlands, streams or floodplain on or near the lot.</li>
<li>Open or unclosed permits from past work. These can hold up new permits.</li>
<li>For condominiums: association approval requirements.</li>
</ul>
<h2>3. Questions to ask the building and planning departments</h2>
<ol>
<li>Which permits apply to this exact scope, and can they be filed together?</li>
<li>Does this project need zoning review, and which dimensional limits apply to my lot?</li>
<li>Is historic, conservation or stormwater review needed before the building permit?</li>
<li>What drawings, calculations or surveys are required with the application?</li>
<li>Are there open permits on the property I need to close first?</li>
<li>Which inspections will be required, and what is needed for final sign-off?</li>
</ol>
<h2>Newton, Massachusetts resources</h2>
<ul>
<li>Building, trade and zoning permits: {src('newton-isd', 'Newton Inspectional Services')} and the {src('newton-newgov-portal')}.</li>
<li>Required application documents: {src('newton-building-checklist')}.</li>
<li>Zoning relief and planning applications: {src('newton-planning', 'Planning & Development')}.</li>
<li>Historic review: {src('newton-historic', 'Historic Preservation')}. Wetlands: {src('newton-conservation', 'Conservation Office')}. Stormwater: {src('newton-stormwater', 'Engineering')}.</li>
<li>Past work: {src('newton-closeout')}.</li>
</ul>
<p>HPP asks these questions in order for a specific Newton address and project, then separates what applies from what the City still needs to confirm.</p>
""",
  ["newton-isd", "newton-newgov-portal", "newton-building-checklist", "newton-planning", "newton-historic", "newton-conservation", "newton-stormwater", "newton-closeout"],
  ["building-permit-vs-zoning-approval", "do-i-need-a-permit-for-an-addition", "how-much-can-i-build-on-my-lot"],
)

BY = {g["slug"]: g for g in GUIDES}

HEADER = """<header class="site-header"><div class="site-header-inner">
<a class="brand" href="/" aria-label="Home Project Planner home"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 52 52"><path d="M8 23 26 8l18 15v18a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3Z"/><path d="M17 44V27h18v17M21 32h10M26 8v8"/></svg></span><span class="brand-copy"><strong>Home Project Planner</strong><span>Newton, Massachusetts</span></span></a>
<nav class="guide-nav" aria-label="Guide navigation"><a href="/guides/">Guides</a><a class="guide-nav-cta" href="/#plan">Start a project</a></nav>
<button id="themeToggle" class="theme-toggle" type="button" aria-label="Switch appearance"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor"/></svg></button>
</div></header>"""

FOOTER = """<footer><div class="footer-brand">Home Project Planner</div><div class="footer-meta"><span>Newton, Massachusetts</span><span><a href="/guides/">Planning guides</a></span><span><a href="/#privacy">Privacy</a></span><span><a href="/#terms">Terms</a></span><span>Independent from the City of Newton</span><span class="footer-legal">Informational planning tool. Not a permitting authority, approval system, legal advice, or substitute for qualified professionals.</span></div></footer>"""

def head(title, desc, path, ogtype, ld):
    url = BASE + path
    t = html.escape(title); d = html.escape(desc)
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{ogtype}"><meta property="og:site_name" content="Home Project Planner">
<meta property="og:title" content="{t}"><meta property="og:description" content="{d}"><meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="{t}"><meta name="twitter:description" content="{d}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">{json.dumps(ld, separators=(',', ':'))}</script>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/experiment.css"><link rel="stylesheet" href="/guides.css"><script src="/ui-theme.js"></script>
</head><body class="guide-page">{HEADER}<main id="main">"""

CTA = """<aside class="guide-cta"><div class="eyebrow">FOR NEWTON, MA PROPERTIES</div><h2>Check this for your own Newton property.</h2><p>HPP looks up the property through City of Newton GIS, asks only the questions that can change your project, and separates what applies from what still needs City confirmation. It's free and needs no account, and your answers stay in your browser.</p><a class="primary-link" href="/#plan">Start a project <span>→</span></a></aside>"""

NOTE = """<p class="guide-note">HPP is an independent planning tool. It is not affiliated with, endorsed by, or a service of the City of Newton. This guide is general planning information, not legal, zoning or permitting advice. Rules outside Newton vary; confirm with your local building and planning departments.</p>"""

def page(g):
    path = f"/guides/{g['slug']}/"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": g["h1"], "description": g["desc"], "url": BASE + path,
         "isPartOf": {"@type": "WebSite", "name": "Home Project Planner", "url": BASE + "/"},
         "publisher": {"@type": "Organization", "name": "Home Project Planner"}, "dateModified": "2026-09-29"},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Planning guides", "item": BASE + "/guides/"},
            {"@type": "ListItem", "position": 3, "name": g["h1"], "item": BASE + path}]}]}
    rel = "".join(f'<li><a href="/guides/{r}/">{html.escape(BY[r]["h1"])}</a></li>' for r in g["related"])
    srcs = "".join(f'<li>{src(s)}</li>' for s in g["sources"])
    return (head(g["title"], g["desc"], path, "article", ld) +
        f"""<article class="guide"><nav class="guide-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/guides/">Planning guides</a></nav>
<div class="eyebrow">{g['eyebrow']}</div><h1>{html.escape(g['h1'])}</h1>{g['body']}{CTA}
<section class="guide-sources"><h2>Sources</h2><ul>{srcs}</ul><p class="small">Newton sources last verified September 19, 2026.</p></section>
<section class="guide-related"><h2>Related guides</h2><ul>{rel}</ul></section>{NOTE}</article></main>{FOOTER}</body></html>
""")

def index():
    path = "/guides/"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "name": "Home project planning guides", "url": BASE + path, "description": "Guides to permits, zoning, historic review and site conditions for residential projects."},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Planning guides", "item": BASE + path}]}]}
    cards = "".join(f'<li><a href="/guides/{g["slug"]}/"><span class="eyebrow">{g["eyebrow"]}</span><strong>{html.escape(g["h1"])}</strong><span>{html.escape(g["desc"])}</span></a></li>' for g in GUIDES)
    return (head("Home Project Planning Guides: Permits, Zoning & Approvals | Home Project Planner",
                 "Plain-language guides to permits, zoning, setbacks, FAR, historic review and stormwater for home projects, with Newton, MA specifics.",
                 path, "website", ld) +
        f"""<article class="guide guide-index"><nav class="guide-crumbs" aria-label="Breadcrumb"><a href="/">Home</a></nav>
<div class="eyebrow">PLANNING GUIDES</div><h1>Plan a home project before you design it.</h1>
<p class="guide-lede">Answers to the questions homeowners ask before an addition, deck, renovation or site project: which permits apply, how zoning limits what you can build, and when historic or stormwater review comes in. Each guide explains the general question first, then how it works in Newton, Massachusetts, where HPP can check it for a specific property.</p>
<ul class="guide-list">{cards}</ul>{CTA}{NOTE}</article></main>{FOOTER}</body></html>
""")

os.makedirs("guides", exist_ok=True)
open("guides/index.html", "w").write(index())
for g in GUIDES:
    os.makedirs(f"guides/{g['slug']}", exist_ok=True)
    open(f"guides/{g['slug']}/index.html", "w").write(page(g))

urls = ["/", "/guides/"] + [f"/guides/{g['slug']}/" for g in GUIDES]
open("sitemap.xml", "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{BASE}{u}</loc><lastmod>2026-09-29</lastmod></url>\n" for u in urls) + "</urlset>\n")
print("\n".join(urls))
