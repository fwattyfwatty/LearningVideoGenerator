import json
import os
import re
import subprocess
from pathlib import Path

workspace = Path(WORKSPACES[0]) if WORKSPACES else Path.cwd()
ep_rel = args["episode_dir"]
ep_dir = Path(ep_rel)
if not ep_dir.is_absolute():
    ep_dir = (workspace / ep_dir).resolve()

chapter_frames = args["chapter_frames"]
model = args.get("model", "flash")
auto_fix = args.get("auto_fix", True)
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


AUDIT_SCHEMA = {
    "type": "object",
    "properties": {
        "chapter_id": {"type": "string"},
        "ok": {"type": "boolean"},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "frame": {"type": "string"},
                    "severity": {"type": "string", "enum": ["critical", "minor"]},
                    "detail": {"type": "string"},
                    "fix_suggestion": {"type": "string"},
                },
                "required": ["frame", "severity", "detail", "fix_suggestion"],
            },
        },
    },
    "required": ["chapter_id", "ok", "issues"],
}

FIX_SCHEMA = {
    "type": "object",
    "properties": {
        "chapter_id": {"type": "string"},
        "summary": {"type": "string"},
    },
    "required": ["chapter_id", "summary"],
}


def build_audit_prompt(item):
    frames_list = "\n".join(f"- `{p}`" for p in item["frames"])
    return (
        f"Visual layout audit for chapter `{item['chapter_id']}`.\n"
        f"Read `{constraints_path}` and inspect ONLY these snapshot PNG files via read_file:\n{frames_list}\n\n"
        f"Check strictly:\n"
        f"1. No overlap between diagram content/cards/borders and Metan (bottom-left), Zundamon (bottom-right), caption dock (bottom-center), or Tsumugi cut-in (top-right, if visible).\n"
        f"2. No diagram blank gaps during Phase transitions or hidden elements stuck at opacity 0.\n"
        f"3. Text contrast & readability, no SVG text overflowing its box or awkward orphan line breaks.\n"
        f"Do NOT run any shell commands; only read the constraints file and your assigned PNGs via read_file, then call finish.\n"
        f"Return ok=true ONLY if zero overlaps/clipping/readability issues remain."
    )


phase("Visual Audit (Parallel)")
audits = await parallel(
    chapter_frames,
    lambda item: agent(
        build_audit_prompt(item),
        schema=AUDIT_SCHEMA,
        role=f"Audit {item['chapter_id']}",
        model=model,
    ),
)

failing = [a for a in audits if not a.get("ok") and a.get("issues")]
log(f"Audited {len(audits)} chapters: {len(failing)} need layout adjustments.")

fixed = []
lint_result = None
recheck_frames = []

if auto_fix and failing:
    phase("Apply Layout Fixes (Parallel)")
    frame_lookup = {c["chapter_id"]: c["frames"] for c in chapter_frames}

    def build_fix_prompt(audit_res):
        ch_id = audit_res["chapter_id"]
        scene_file = ep_dir / "scenes" / f"{ch_id}.html"
        return (
            f"Fix verified visual layout issues in `{scene_file}`.\n"
            f"Read `{constraints_path}` and `{scene_file}` first, then edit only what is needed to fix:\n"
            f"{json.dumps(audit_res['issues'], ensure_ascii=False, indent=2)}\n"
            f"Keep edits strictly HyperFrames lint compliant (no #root.<class>, no CSS transform on GSAP targets).\n"
            f"Do NOT run npm run episode:build, episode:lint, episode:verify, or snapshot yourself; only edit your assigned scene HTML file. The parent workflow runs a single consolidated rebuild & lint after all parallel fixes finish."
        )

    fixed = await parallel(
        failing,
        lambda a: agent(
            build_fix_prompt(a),
            schema=FIX_SCHEMA,
            role=f"Fix {a['chapter_id']}",
            model=model,
        ),
    )

    for a in failing:
        recheck_frames.extend(frame_lookup.get(a["chapter_id"], []))

    phase("Rebuild & Re-lint")
    build_res = run_node_npm(["npm", "run", "episode:build", "--", str(ep_rel)])
    if build_res.returncode != 0:
        raise RuntimeError(f"episode:build failed after fixes:\n{build_res.stdout}\n{build_res.stderr}")
    lint_res = run_node_npm(["npm", "run", "episode:lint", "--", str(ep_rel), "--json"])
    for candidate in (lint_res.stdout or "", lint_res.stderr or ""):
        idx = candidate.find("{")
        end = candidate.rfind("}")
        if idx >= 0 and end > idx:
            try:
                lint_result = json.loads(candidate[idx : end + 1])
                log(f"Post-fix lint: ok={lint_result.get('ok')} errors={lint_result.get('errorCount')} warnings={lint_result.get('warningCount')}")
                break
            except Exception:
                pass

recheck_times = sorted(
    {
        m.group(1)
        for p in recheck_frames
        for m in [re.search(r"frame-\d+-at-([\d.]+)s\.png$", Path(p).name)]
        if m
    },
    key=float,
)

print(json.dumps({
    "audits": audits,
    "fixed": fixed,
    "recheck_frames": recheck_frames,
    "recheck_times": recheck_times,
    "recheck_at_csv": ",".join(recheck_times),
    "lint": lint_result,
}, ensure_ascii=False, indent=2))
