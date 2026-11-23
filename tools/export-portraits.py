import io
import os
import zipfile
from pathlib import Path
from PIL import Image, ImageFilter
from psd_tools import PSDImage

ROOT_DIR = Path(__file__).resolve().parent.parent
CHAR_DIR = ROOT_DIR / "assets" / "characters"
OUT_DIR = CHAR_DIR / "exported"

TARGET_HEIGHT = 640
OUTLINE_RADIUS = 4
PADDING = 14


def open_psd_from_zip(zip_path: Path, psd_suffix: str) -> PSDImage:
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            name = info.filename
            if not (info.flag_bits & 0x800):
                try:
                    name = name.encode("cp437").decode("cp932")
                except Exception:
                    pass
            if name.lower().endswith(psd_suffix.lower()):
                data = zf.read(info)
                return PSDImage.open(io.BytesIO(data))
    raise FileNotFoundError(f"PSD matching '{psd_suffix}' not found in {zip_path}")


def set_layer_visibility(layer, visible: bool):
    layer.visible = visible
    if hasattr(layer, "_record") and hasattr(layer._record, "flags"):
        layer._record.flags.visible = visible


def build_path_map(psd: PSDImage):
    """Map stripped slash-joined layer paths to Layer objects."""
    mapping = {}

    def walk(container, prefix):
        for layer in container:
            clean_name = layer.name.strip()
            path = f"{prefix}/{clean_name}" if prefix else clean_name
            mapping[path] = layer
            if layer.is_group():
                walk(layer, path)

    walk(psd, "")
    return mapping


def apply_whitelist(psd: PSDImage, path_map: dict, active_paths: list[str]):
    def hide_all(container):
        for layer in container:
            set_layer_visibility(layer, False)
            if layer.is_group():
                hide_all(layer)

    hide_all(psd)

    for target_path in active_paths:
        if target_path not in path_map:
            available = "\n  ".join(sorted(path_map.keys()))
            raise KeyError(f"Layer path '{target_path}' not found.\nAvailable:\n  {available}")
        parts = target_path.split("/")
        for i in range(1, len(parts) + 1):
            ancestor = "/".join(parts[:i])
            set_layer_visibility(path_map[ancestor], True)


def add_white_outline(img: Image.Image, radius: int = OUTLINE_RADIUS) -> Image.Image:
    r, g, b, a = img.split()
    size = radius * 2 + 1
    dilated_a = a.filter(ImageFilter.MaxFilter(size))
    # Smooth outer edge slightly for crisp anti-aliased border
    smooth_a = dilated_a.filter(ImageFilter.GaussianBlur(0.6))
    # Keep solid white behind original alpha
    outline_a = Image.composite(dilated_a, smooth_a, dilated_a)
    white_bg = Image.new("RGBA", img.size, (255, 255, 255, 0))
    white_bg.putalpha(outline_a)
    return Image.alpha_composite(white_bg, img)


CHARACTER_SPECS = [
    {
        "id": "metan",
        "zip": "のんたお式四国めたん立ち絵.zip",
        "psd_suffix": ".psd",
        "flip_x": True,
        "base": ["!体/通常服", "!頭"],
        "emotions": {
            "normal": {
                "common": ["!眉/*通常", "!目/*通常", "!腕/*下ろす"],
                "closed": ["!口/*閉じる"],
                "open": ["!口/*開ける"],
            },
            "explain": {
                "common": ["!眉/*通常", "!目/*通常", "!腕/*右手あげ"],
                "closed": ["!口/*閉じる"],
                "open": ["!口/*開ける"],
            },
            "smile": {
                "common": ["!眉/*通常", "!目/*ニコニコ", "!腕/*上げる", "!顔色/ほっぺ"],
                "closed": ["!口/*閉じる"],
                "open": ["!口/*開ける"],
            },
            "surprise": {
                "common": ["!眉/*通常", "!目/*通常", "!顔色/目の中星", "!腕/*上げる"],
                "closed": ["!口/*ぽかん"],
                "open": ["!口/*開ける"],
            },
            "serious": {
                "common": ["!眉/*ひそめる", "!目/*ジト目", "!腕/*右手あげ"],
                "closed": ["!口/*へ"],
                "open": ["!口/*△"],
            },
            "worry": {
                "common": ["!眉/*悲しむ", "!目/*通常", "!顔色/汗", "!腕/*下ろす"],
                "closed": ["!口/*へ"],
                "open": ["!口/*△"],
            },
        },
    },
    {
        "id": "zundamon",
        "zip": "のんたお式ずんだもん_立ち絵_ver.2.0.zip",
        "psd_suffix": ".psd",
        "flip_x": False,
        "base": ["!服装/*通常", "!輪郭", "!耳/*耳通常"],
        "emotions": {
            "normal": {
                "common": ["!眉/*眉通常", "!目/*目通常", "!腕/*腕両下"],
                "closed": ["!口/*口閉じる"],
                "open": ["!口/*口開ける"],
            },
            "question": {
                "common": ["!眉/*眉疑い", "!目/*目通常", "!腕/*腕右上"],
                "closed": ["!口/*口三角"],
                "open": ["!口/*口開ける"],
            },
            "smile": {
                "common": ["!眉/*眉キリッ", "!目/*目通常", "!顔色/目の中星", "!顔色/ほっぺ", "!腕/*腕両上"],
                "closed": ["!口/*口閉じる"],
                "open": ["!口/*口開ける"],
            },
            "surprise": {
                "common": ["!眉/*眉キリッ", "!目/*目通常", "!顔色/目の中星", "!腕/*腕両上"],
                "closed": ["!口/*口開ける"],
                "open": ["!口/*口開大"],
            },
            "worry": {
                "common": ["!輪郭", "!服装/*通常", "!耳/*耳下げる", "!眉/*眉悲", "!目/*目うるうる", "!顔色/汗", "!顔色/涙", "!腕/*腕両下"],
                "override_base": True,
                "closed": ["!口/*口閉じる"],
                "open": ["!口/*口あわわ"],
            },
            "serious": {
                "common": ["!眉/*眉不満", "!目/*目ジト目", "!腕/*腕両下"],
                "closed": ["!口/*口ムッ"],
                "open": ["!口/*口三角"],
            },
        },
    },
    {
        "id": "tsumugi",
        "zip": "のんたお式春日部つむぎ立ち絵.zip",
        "psd_suffix": ".psd",
        "flip_x": False,
        "base": ["!体/*通常服"],
        "emotions": {
            "normal": {
                "common": ["!眉/*通常", "!目/*通常"],
                "closed": ["!口/*閉じる"],
                "open": ["!口/*開ける"],
            },
            "sharp": {
                "common": ["!眉/*キリッ", "!目/*通常"],
                "closed": ["!口/*へ"],
                "open": ["!口/*開ける"],
            },
            "smile": {
                "common": ["!眉/*通常", "!目/*ニコニコ"],
                "closed": ["!口/*閉じる"],
                "open": ["!口/*ω開ける"],
            },
            "surprise": {
                "common": ["!眉/*通常", "!目/*通常", "顔色/目の中星"],
                "closed": ["!口/*○"],
                "open": ["!口/*□"],
            },
            "worry": {
                "common": ["!眉/*ひそめる", "!目/*ジト目", "顔色/汗"],
                "closed": ["!口/*へ"],
                "open": ["!口/*○"],
            },
        },
    },
]


def export_character(spec: dict):
    zip_path = CHAR_DIR / spec["zip"]
    psd = open_psd_from_zip(zip_path, spec["psd_suffix"])
    path_map = build_path_map(psd)

    rendered = {}
    union_bbox = None

    for emotion, cfg in spec["emotions"].items():
        base_layers = [] if cfg.get("override_base") else list(spec["base"])
        for mouth_state in ("closed", "open"):
            active = base_layers + cfg["common"] + cfg[mouth_state]
            apply_whitelist(psd, path_map, active)
            img = psd.composite(force=True).convert("RGBA")
            bbox = img.getbbox()
            if bbox:
                if union_bbox is None:
                    union_bbox = bbox
                else:
                    union_bbox = (
                        min(union_bbox[0], bbox[0]),
                        min(union_bbox[1], bbox[1]),
                        max(union_bbox[2], bbox[2]),
                        max(union_bbox[3], bbox[3]),
                    )
            rendered[f"{emotion}_{mouth_state}"] = img

    if union_bbox is None:
        raise RuntimeError(f"All composites empty for {spec['id']}")

    w, h = psd.size
    crop_box = (
        max(0, union_bbox[0] - PADDING),
        max(0, union_bbox[1] - PADDING),
        min(w, union_bbox[2] + PADDING),
        min(h, union_bbox[3] + PADDING),
    )

    crop_w = crop_box[2] - crop_box[0]
    crop_h = crop_box[3] - crop_box[1]
    scale = TARGET_HEIGHT / crop_h
    out_w = max(1, round(crop_w * scale))
    out_h = TARGET_HEIGHT

    char_out_dir = OUT_DIR / spec["id"]
    char_out_dir.mkdir(parents=True, exist_ok=True)

    for key, raw_img in rendered.items():
        cropped = raw_img.crop(crop_box)
        resized = cropped.resize((out_w, out_h), Image.Resampling.LANCZOS)
        outlined = add_white_outline(resized, OUTLINE_RADIUS)
        if spec["flip_x"]:
            outlined = outlined.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        out_path = char_out_dir / f"{key}.png"
        outlined.save(out_path, format="PNG")

    print(
        f"[OK] {spec['id']}: exported {len(rendered)} PNGs ({out_w}x{out_h}, flip_x={spec['flip_x']}) -> {char_out_dir.relative_to(ROOT_DIR)}"
    )


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for spec in CHARACTER_SPECS:
        export_character(spec)


if __name__ == "__main__":
    main()
