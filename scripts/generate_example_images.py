"""Draw the synthetic example images of examples/display/example-images.ttl (#142) and image-properties.ttl (#143).

Each image is a flat colour with a large number and the term's name, so the order and the rotation of the tooltip's
preview are easy to see. They are committed; rerun this only to change them:

    uv run --no-project --with pillow python scripts/generate_example_images.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DISPLAY = Path(__file__).resolve().parent.parent / "examples" / "display"
COLOURS = ["#2e86c1", "#28b463", "#d68910", "#8e44ad"]
# (file stem, number shown, size): landscape and portrait, so the fixed box's fit is visible.
IMAGES = [
    ("Widget_01", 1, (480, 320)),
    ("Widget_02", 2, (480, 320)),
    ("Widget_03", 3, (320, 480)),
    ("Gadget_01", 1, (480, 320)),
    ("Sprocket_01", 1, (480, 320)),
    ("Sprocket_02", 2, (480, 320)),
    ("hasPart_01", 1, (480, 320)),
    ("hasPart_02", 2, (480, 320)),
    ("weight_01", 1, (480, 320)),
]
# image-properties.ttl: one image per supported property, named after the term and the property.
IMAGE_PROPERTY_IMAGES = [
    ("Gear_depiction_01", 1, (480, 320)),
    ("Gear_depiction_02", 2, (480, 320)),
    ("Bolt_schema", 1, (480, 320)),
    ("Nut_schema_object", 1, (480, 320)),
    ("Washer_photo", 1, (480, 320)),
    ("Spring_depiction", 1, (480, 320)),
    ("Spring_schema", 2, (480, 320)),
    ("meshesWith_depiction", 1, (480, 320)),
]


def draw(out, stem, number, size):
    term = stem.split("_", 1)[0]
    img = Image.new("RGB", size, COLOURS[(number - 1) % len(COLOURS)])
    d = ImageDraw.Draw(img)
    w, h = size
    big = ImageFont.load_default(size=h // 2)
    small = ImageFont.load_default(size=max(16, h // 12))
    d.text((w / 2, h * 0.42), str(number), font=big, fill="white", anchor="mm")
    # A name after the term (e.g. Gear_depiction_01) names the property the image is linked by.
    label = stem.split("_", 1)[1].rstrip("_0123456789").replace("_", " ") if "_" in stem else ""
    d.text((w / 2, h * (0.72 if label else 0.78)), term, font=small, fill="white", anchor="mm")
    if label:
        d.text((w / 2, h * 0.81), label, font=ImageFont.load_default(size=max(12, h // 18)), fill="white", anchor="mm")
    d.text((w / 2, h * 0.9), "synthetic example", font=ImageFont.load_default(size=max(12, h // 20)), fill="#ffffffaa", anchor="mm")
    img.quantize(colors=16).save(out / f"{stem}.png", optimize=True)


if __name__ == "__main__":
    for folder, images in (("exampleImage", IMAGES), ("images", IMAGE_PROPERTY_IMAGES)):
        out = DISPLAY / folder
        out.mkdir(parents=True, exist_ok=True)
        for stem, number, size in images:
            draw(out, stem, number, size)
            print(f"wrote {folder}/{stem}.png")
