
import os
import re
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image, ImageDraw

def create_gradient(width, height, start_color, end_color, is_vertical=True):
    base = Image.new('RGBA', (width, height), start_color)
    top = Image.new('RGBA', (width, height), end_color)
    mask = Image.new('L', (width, height))
    mask_data = []
    
    for y in range(height):
        for x in range(width):
            if is_vertical:
                ratio = y / height
            else:
                ratio = x / width
            mask_data.append(int(255 * ratio))
            
    mask.putdata(mask_data)
    base.paste(top, (0, 0), mask)
    return base

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def convert_with_gradient_fix():
    # Colors from SVG
    # Sidebar: #1e1b4b -> #4c1d95 (Vertical)
    # Header: #9333ea -> #2563eb (Horizontal)
    
    assets = [
        {
            "svg": "installer-sidebar.svg",
            "bmp": "sidebar.bmp",
            "w": 164, "h": 314,
            "c1": "#1e1b4b", "c2": "#4c1d95", "vertical": True,
            "remove_pattern": r'<rect[^>]*fill="url\(#gradSidebar\)"[^>]*/>'
        },
        {
            "svg": "installer-header.svg",
            "bmp": "header.bmp",
            "w": 493, "h": 58,
            "c1": "#9333ea", "c2": "#2563eb", "vertical": False,
            "remove_pattern": r'<rect[^>]*fill="url\(#gradHeader\)"[^>]*/>'
        }
    ]
    
    base_path = "src-tauri/icons"
    
    for asset in assets:
        svg_path = os.path.join(base_path, asset["svg"])
        bmp_path = os.path.join(base_path, asset["bmp"])
        temp_svg = os.path.join(base_path, "temp_" + asset["svg"])
        
        print(f"Processing {asset['svg']}...")
        
        # 1. Read and Remove background rect
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Remove the background rect so it's transparent
        content_clean = re.sub(asset["remove_pattern"], '', content)
        # Fallback for bolt gradient to solid color (Violet)
        content_clean = content_clean.replace('url(#boltGrad)', '#8b5cf6')
        
        # Also remove the gradient defs to avoid warnings/errors? (Optional, svglib might ignore unused defs)
        
        with open(temp_svg, 'w', encoding='utf-8') as f:
            f.write(content_clean)
            
        # 2. Render foreground to PIL
        try:
            drawing = svg2rlg(temp_svg)
            fg_img = renderPM.drawToPIL(drawing)
            
            # Ensure FG is same size (resize if needed)
            if fg_img.size != (asset["w"], asset["h"]):
                 fg_img = fg_img.resize((asset["w"], asset["h"]), Image.Resampling.LANCZOS)
                 
            # 3. Create Background Gradient
            bg_img = create_gradient(
                asset["w"], asset["h"], 
                hex_to_rgb(asset["c1"]), 
                hex_to_rgb(asset["c2"]), 
                asset["vertical"]
            )
            
            # 4. Composite (Alpha Composite)
            # fg_img might not have alpha if rendered as RGB. renderPM usually renders RGBA if transparent.
            # svglib default background is white if not specified? 
            # We need to ensure we treat white as transparent? No, svglib preserves transparency.
            
            final_img = Image.alpha_composite(bg_img.convert('RGBA'), fg_img.convert('RGBA'))
            
            # 5. Save as BMP
            # BMP doesn't support alpha well (ARGB is rare in BMP). NSIS usually wants RGB.
            # Convert to RGB (removing alpha, assuming solid background now)
            final_rgb = final_img.convert('RGB')
            final_rgb.save(bmp_path)
            print(f"Saved {bmp_path}")
            
        except Exception as e:
            print(f"Failed to process {asset['svg']}: {e}")
            
        # Cleanup
        if os.path.exists(temp_svg):
            os.remove(temp_svg)

if __name__ == "__main__":
    convert_with_gradient_fix()
