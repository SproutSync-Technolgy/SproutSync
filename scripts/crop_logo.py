from PIL import Image

paths = ["frontend/dashboard/src/assets/logo.png", "docs/assets/logo.png"]
for p in paths:
    try:
        im = Image.open(p)
        bbox = im.split()[-1].getbbox()
        print(f"Original {p}: {im.size}, bbox: {bbox}")
        if bbox:
            left = max(0, bbox[0] - 8)
            upper = max(0, bbox[1] - 8)
            right = min(im.width, bbox[2] + 8)
            lower = min(im.height, bbox[3] + 8)
            cropped = im.crop((left, upper, right, lower))
            cropped.save(p, format="PNG")
            print(f"Cropped {p} to: {cropped.size}")
    except Exception as e:
        print(f"Error processing {p}: {e}")
