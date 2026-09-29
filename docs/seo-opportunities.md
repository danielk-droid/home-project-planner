# SEO scope (2026-09-29)

Public, indexable: `/` and `/guides/` (7 guides). Everything user-specific (projects, answers, addresses, results, saved projects) lives in the browser only and sits behind hash routes, so crawlers never see it; `/api/` returns `X-Robots-Tag: noindex` and is disallowed in robots.txt.

Broader intents targeted (general answer first, then Newton via HPP): permit for an addition; permit for a deck; building permit vs zoning; how much can I build (setbacks, lot coverage, FAR, height); historic home / historic district renovation; stormwater, wetlands and flood zones; what approvals to get and what to ask before renovating.

Deliberately not added: ADU, garage, kitchen/bathroom and roofing pages (HPP handles these through its general flow with no dedicated rules to explain), FAQPage schema, city-by-city pages, and nationwide claims.
