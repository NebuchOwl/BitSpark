from PIL import Image
import os

base_path = r"g:\Proje Dosyaları\3 Portfolio\Yazılım\Nebula Coding\Code Space\Video Optimizer 2.0\src-tauri\icons"

def convert_to_bmp(input_name, output_name):
    try:
        img_path = os.path.join(base_path, input_name)
        out_path = os.path.join(base_path, output_name)
        
        with Image.open(img_path) as img:
            # Ensure RGB
            img = img.convert("RGB")
            # Save as BMP (standard uncompressed usually)
            img.save(out_path, "BMP")
            print(f"Converted {input_name} to {output_name}. Size: {img.size}")
            
    except Exception as e:
        print(f"Error converting {input_name}: {e}")

convert_to_bmp("temp-header.png", "installer-header.bmp")
convert_to_bmp("temp-sidebar.png", "installer-sidebar.bmp")
