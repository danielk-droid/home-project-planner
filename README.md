# Newton Home Project Planner — Core MVP

A standalone, dependency-free MVP for the Newton, Massachusetts Home Project Planner.

## What it does

1. Normalizes a homeowner's project goal into one of four V1 project types.
2. Resolves a Newton address against the City's official GIS address/parcel layers.
3. Derives property facts from official GIS layers where supported.
4. Asks only project questions that can change the plan.
5. Evaluates deterministic, source-backed rules.
6. Builds a dependency-aware project plan.
7. Displays evidence, uncertainty, and unresolved questions.

The browser calls Newton's official ArcGIS REST services directly. No API key is embedded and no private credentials are required.

## Safety model

The planner does not claim permit approval, code compliance, or legal eligibility from incomplete data. Missing property data or unresolved conditions produce `needs_confirmation` rather than a reassuring answer.

## Current V1 project types

- Basement / interior alteration
- Bathroom renovation
- Deck / exterior platform
- Residential addition

## Run locally

Because this is a static application, any static HTTP server can serve the directory. For example:

`python -m http.server 8000`

Then open `http://localhost:8000`.


## Regulatory monitoring

HPP now includes a conservative official-source monitoring layer. See docs/regulatory-monitoring.md. It is review-gated and does not silently rewrite the planner.
