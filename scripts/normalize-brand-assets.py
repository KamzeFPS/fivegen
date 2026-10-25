"""Normalize the creator-supplied FiveGen mark; never redraw its geometry.

Run with Python and Pillow. The source in assets/brand is kept byte-for-byte.
Only transparent margins, output sizes and lettering colour are normalized.
"""
from base64 import b64encode
from hashlib import sha256
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/brand/fivegen-sparkle-source.png"
OUT = ROOT / "public/brand"
source = Image.open(SOURCE).convert("RGBA")
# The upload contains nearly invisible alpha-1 dust outside the actual lockup.
# Locate the artwork using alpha > 5, but retain the original alpha in the crop.
bounds = source.getchannel("A").point(lambda alpha: 255 if alpha > 5 else 0).getbbox()
assert bounds == (243, 231, 1737, 561), "Review changed source geometry before normalizing."
lockup = source.crop(bounds)
dark_lockup = lockup.copy()
# The clear space between mark and lettering is x=554..620 in source pixels.
# Recolour lettering for dark backgrounds without changing the supplied alpha.
lettering = dark_lockup.crop((350, 0, dark_lockup.width, dark_lockup.height))
lettering_white = Image.new("RGBA", lettering.size, (246, 243, 239, 0))
lettering_white.putalpha(lettering.getchannel("A"))
dark_lockup.paste(lettering_white, (350, 0))

OUT.mkdir(parents=True, exist_ok=True)
for tone, image in [("light", lockup), ("dark", dark_lockup)]:
    image.save(OUT / f"fivegen-sparkle-{tone}.webp", lossless=True, method=6)
    image.save(OUT / f"fivegen-sparkle-{tone}.png", optimize=True)

mark = source.crop((243, 231, 555, 561))


def square_mark(size, padding_ratio=0.0625, background=(0, 0, 0, 0)):
    image = Image.new("RGBA", (size, size), background)
    art = mark.copy()
    inner = round(size * (1 - padding_ratio * 2))
    art.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    image.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return image


for name, size, background in [
    ("fivegen-sparkle-mark.png", 512, (0, 0, 0, 0)),
    ("fivegen-sparkle-favicon-96.png", 96, (0, 0, 0, 0)),
    ("fivegen-sparkle-apple-180.png", 180, (14, 14, 14, 255)),
    ("fivegen-sparkle-social.png", 512, (14, 14, 14, 255)),
]:
    square_mark(size, background=background).save(OUT / name, optimize=True)

# Previously published URLs remain usable by bookmarks, integrations and caches.
dark_lockup.save(OUT / "fivegen-logo.webp", lossless=True, method=6)
square_mark(512).save(OUT / "fivegen-transparent.webp", lossless=True, method=6)
square_mark(512).save(OUT / "fivegen-mark.png", optimize=True)
square_mark(96).save(OUT / "favicon-96.png", optimize=True)
square_mark(180, background=(14, 14, 14, 255)).save(OUT / "apple-touch-icon.png", optimize=True)
square_mark(64).save(ROOT / "public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
png = b64encode((OUT / "fivegen-sparkle-favicon-96.png").read_bytes()).decode()
(ROOT / "public/favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
    '<image width="96" height="96" href="data:image/png;base64,' + png + '"/></svg>\n'
)
print("Normalized supplied FiveGen artwork:", bounds)
print("Source SHA-256:", sha256(SOURCE.read_bytes()).hexdigest())
