import json
import os
import subprocess
from pathlib import Path

workspace = Path(WORKSPACES[0]) if WORKSPACES else Path.cwd()
ep_rel = args["episode_dir"]
ep_dir = Path(ep_rel)
if not ep_dir.is_absolute():
    ep_dir = (workspace / ep_dir).resolve()

specs_path = Path(args["specs_path"]) if args.get("specs_path") else (ep_dir / "scene-specs.json")
if not specs_path.is_absolute():
    specs_path = (workspace / specs_path).resolve()

model = args.get("model", "flash")
skip_existing = args.get("skip_existing", True)
constraints_path = workspace / ".agents" / "skills" / "produce-episode" / "references" / "scene-constraints.md"


def run_node_npm(cmd_list):
    env = os.environ.copy()
    if os.name == "nt":
        node_dir = r"C:\Program Files\nodejs"
        if node_dir.lower() not in env.get("PATH", "").lower():
            env["PATH"] = f"{node_dir};{env.get('PATH', '')}"
    return subprocess.run(
        cmd_list,
        cwd=str(workspace),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=(os.name == "nt"),
    )


def parse_lint_json(stdout_text, stderr_text):
    for candidate in (stdout_text or "", stderr_text or ""):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except Exception:
                pass
    combined = f"{stdout_text}\n{stderr_text}"
    return {"ok": False, "errorCount": 1, "warningCount": 0, "findings": [], "raw": combined[:600]}


phase("Prepare Specs")
timeline = json.loads((ep_dir / "timeline.json").read_text(encoding="utf-8"))
specs = {}
if specs_path.exists():
    specs = json.loads(specs_path.read_text(encoding="utf-8"))

spec_by_id = {c["id"]: c for c in specs.get("chapters", []) if "id" in c}
theme = timeline.get("meta", {}).get("theme") or specs.get("theme") or "tech-dark"
accent = timeline.get("meta", {}).get("accent_color") or specs.get("accent_color") or "#0284c7"

chapter_jobs = []
for ch in timeline.get("chapters", []):
    ch_id = ch["id"]
    ch_spec = spec_by_id.get(ch_id, {})
    cues_summary = []
    for l in ch.get("lines", []):
        if l.get("cue"):
            cues_summary.append({
                "cue": l["cue"],
                "localStart": round(l["start"], 2),
                "localEnd": round(l["end"], 2),
                "speaker": l["speaker"],
                "mode": l.get("mode", "normal"),
                "caption": l["caption"],
            })
    has_cutin = ch_spec.get("has_tsumugi_cutin", any(l.get("mode") == "cutin" or l.get("speaker") == "tsumugi" for l in ch.get("lines", [])))
    chapter_jobs.append({
        "id": ch_id,
        "title": ch.get("title", ch_id),
        "layout": ch.get("layout") or ch_spec.get("layout") or "default",
        "duration": ch.get("duration"),
        "theme": theme,
        "accent_color": accent,
        "has_tsumugi_cutin": has_cutin,
        "visual_plan": ch_spec.get("visual_plan", "Build clear diagrams synced to all cue timings."),
        "phase_transitions": ch_spec.get("phase_transitions", []),
        "cues": cues_summary,
        "out_file": str(ep_dir / "scenes" / f"{ch_id}.html"),
    })

AUTHOR_SCHEMA = {
    "type": "object",
    "properties": {
        "chapter_id": {"type": "string"},
        "file_path": {"type": "string"},
        "cues_used": {"type": "array", "items": {"type": "string"}},
        "notes": {"type": "string"},
    },
    "required": ["chapter_id", "file_path", "cues_used"],
}

phase("Author Scenes (Parallel)")


def build_author_prompt(job):
    return (
        f"Author HyperFrames diagram scene for chapter `{job['id']}`.\n"
        f"First read `{constraints_path}` for canvas safe zones, theme colors, and lint rules.\n"
        f"Optionally read `templates/diagram-kit.css` (first 100 lines) if you want shared helper classes.\n\n"
        f"Target file to write (use write_file with Overwrite=true): `{job['out_file']}`\n"
        f"Chapter metadata:\n{json.dumps(job, ensure_ascii=False, indent=2)}\n\n"
        f"Requirements:\n"
        f"- Output ONLY `<style>...</style>`, scene root `<div>...</div>`, and `<script>...</script>`.\n"
        f"- Register `window.__diagramBuilders[\"{job['id']}\"] = function (tl, cues) {{ ... }}` syncing every cue in cues list.\n"
        f"- Avoid ALL character/caption safe zones (`y >= 805` corners, `y >= 880` dock, top-right cut-in if `has_tsumugi_cutin` is true).\n"
        f"- Keep the HTML markup between </style> and <script> compact (under 180 lines) so dist/compositions/<id>.html stays under HyperFrames' 300-line structural limit.\n"
        f"- Keep GSAP transforms free of CSS `transform` rules, avoid `gsap.from()` and `autoAlpha`.\n"
        f"- Do NOT run npm run episode:build, episode:lint, episode:verify, or snapshot yourself; only write your assigned scene file. The parent workflow runs a single consolidated build & lint after all parallel workers finish.\n"
        f"- Return chapter_id, file_path, and cues_used via finish."
    )


def is_complete_scene(path_str):
    p = Path(path_str)
    if not p.exists():
        return False
    text = p.read_text(encoding="utf-8", errors="replace")
    return "</script>" in text and "__diagramBuilders" in text


pending_jobs = []
skipped_ids = []
for job in chapter_jobs:
    if skip_existing and is_complete_scene(job["out_file"]):
        skipped_ids.append(job["id"])
    else:
        pending_jobs.append(job)

if skipped_ids:
    log(f"Skipped {len(skipped_ids)} existing scenes: {skipped_ids}")

authored = []
if pending_jobs:
    authored = await parallel(
        pending_jobs,
        lambda job: agent(
            build_author_prompt(job),
            schema=AUTHOR_SCHEMA,
            role=f"Author {job['id']}",
            model=model,
        ),
    )
log(f"Authored {len(authored)} scene files (skipped {len(skipped_ids)}).")

phase("Build & Lint")
build_res = run_node_npm(["npm", "run", "episode:build", "--", str(ep_rel)])
if build_res.returncode != 0:
    raise RuntimeError(f"episode:build failed:\n{build_res.stdout}\n{build_res.stderr}")

lint_res = run_node_npm(["npm", "run", "episode:lint", "--", str(ep_rel), "--json"])
lint_data = parse_lint_json(lint_res.stdout, lint_res.stderr)
log(f"Initial lint: ok={lint_data.get('ok')} errors={lint_data.get('errorCount')} warnings={lint_data.get('warningCount')}")

if not lint_data.get("ok") or lint_data.get("errorCount", 0) > 0 or lint_data.get("warningCount", 0) > 0:
    phase("Targeted Lint Fix (Parallel)")
    by_ch = {}
    for f in lint_data.get("findings", []):
        fname = Path(f.get("file", "")).stem
        if fname:
            by_ch.setdefault(fname, []).append(f)

    fix_items = [
        {"chapter_id": ch_id, "scene_file": str(ep_dir / "scenes" / f"{ch_id}.html"), "findings": fs}
        for ch_id, fs in by_ch.items()
        if (ep_dir / "scenes" / f"{ch_id}.html").exists()
    ]

    if fix_items:
        await parallel(
            fix_items,
            lambda item: agent(
                (
                    f"Fix HyperFrames lint findings in `{item['scene_file']}`.\n"
                    f"Read `{constraints_path}` and `{item['scene_file']}`, resolve ALL findings below, and edit cleanly.\n"
                    f"Do NOT run episode:build or episode:lint yourself; only edit this scene file and call finish. The workflow rebuilds and re-lints once after all parallel fixes finish.\n"
                    f"{json.dumps(item['findings'], ensure_ascii=False, indent=2)}"
                ),
                schema={"type": "string"},
                role=f"Fix lint {item['chapter_id']}",
                model=model,
            ),
        )
        build_res = run_node_npm(["npm", "run", "episode:build", "--", str(ep_rel)])
        lint_res = run_node_npm(["npm", "run", "episode:lint", "--", str(ep_rel), "--json"])
        lint_data = parse_lint_json(lint_res.stdout, lint_res.stderr)
        log(f"Post-fix lint: ok={lint_data.get('ok')} errors={lint_data.get('errorCount')} warnings={lint_data.get('warningCount')}")

print(json.dumps({"authored": authored, "lint": lint_data}, ensure_ascii=False, indent=2))
