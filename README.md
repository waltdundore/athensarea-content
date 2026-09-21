# athensarea-content

## Ahab tier-1 relationship — expected vs. actual

Contract: `ahab@prod` `BLUEPRINT.md` § Portability Contract — a tier-2 module
contributes ONLY inventory + role assignment (+ vars) + vault references; all
machinery lives once in ahab; a module carrying its own copy of a
role/script/template/Makefile is a defect.

| Expected per contract | Actual (measured 2026-09-21) | Closed by |
|---|---|---|
| A tier-2 `athensarea` module repo (inventory + manifest + vault refs) plus tier-3 content — ahab BLUEPRINT L43: "ahab + athensarea = athensarea.net" | **no tier-2 module repo exists** (measured 2026-09-21, `gh repo list` waltdundore: only `athensarea-content`). This repo is tier-3 content (static site: html/css/js + nginx + docker-compose); zero ahab references; no `.ahab/` deploy manifest | M5 (not started) |
