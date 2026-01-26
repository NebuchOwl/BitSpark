
import os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image

def convert_svg_to_bmp(svg_path, bmp_path, width, height):
    print(f"Converting {svg_path} to {bmp_path}...")
    try:
        drawing = svg2rlg(svg_path)
        # Check if drawing was loaded
        if not drawing:
            print("Failed to load SVG.")
            return

        # Render to PIL Image
        # fmt='PNG' is default for drawToPIL
        pil_image = renderPM.drawToPIL(drawing)
        
        # Resize to ensuring exact dimensions if necessary, but SVG should match.
        # NSIS usually requires specific sizes, so let's force resize to match the SVG's intended ViewBox if it differs,
        # or just trust the render. The user's SVG has explicit width/height.
        if pil_image.size != (width, height):
            print(f"Resizing from {pil_image.size} to ({width}, {height})")
            pil_image = pil_image.resize((width, height), Image.Resampling.LANCZOS)
            
        pil_image.save(bmp_path, "BMP")
        print("Success.")
    except Exception as e:
        print(f"Error converting {svg_path}: {e}")

base_path = "src-tauri/icons"
sidebar_svg = os.path.join(base_path, "installer-sidebar.svg")
sidebar_bmp = os.path.join(base_path, "sidebar.bmp")

header_svg = os.path.join(base_path, "installer-header.svg")
header_bmp = os.path.join(base_path, "header.bmp")

# SVG dimensions as read from files
convert_svg_to_bmp(sidebar_svg, sidebar_bmp, 164, 314)
convert_svg_to_bmp(header_svg, header_bmp, 493, 58)
