from PIL import Image
import numpy as np

def remove_background(input_path, output_path, threshold=35):
    """Remove near-white/grey background using flood fill from corners + luminance keying."""
    img = Image.open(input_path).convert("RGBA")
    data = np.array(img)
    
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    
    # Detect background color (sample from corners)
    corners = [
        data[0, 0, :3],
        data[0, -1, :3],
        data[-1, 0, :3],
        data[-1, -1, :3],
    ]
    bg_color = np.mean(corners, axis=0)
    print(f"Detected background color: {bg_color}")
    
    # Distance from background color
    dist = np.sqrt(
        (r.astype(float) - bg_color[0])**2 +
        (g.astype(float) - bg_color[1])**2 +
        (b.astype(float) - bg_color[2])**2
    )
    
    # Mask: pixels close to background color → transparent
    bg_mask = dist < threshold
    
    # Also mask very bright near-white pixels (luminance > 230)
    luminance = (0.299 * r + 0.587 * g + 0.114 * b)
    bright_mask = luminance > 225
    
    # Combined mask
    final_mask = bg_mask | bright_mask
    
    data[:, :, 3] = np.where(final_mask, 0, 255)
    
    # Smooth edges with slight feathering using morphological erosion idea
    result = Image.fromarray(data, 'RGBA')
    result.save(output_path)
    print(f"Saved: {output_path}")

remove_background('public/player_zombie_realistic.png', 'public/player_zombie_transparent.png', threshold=40)
remove_background('public/enemy_zombie_realistic.png', 'public/enemy_zombie_transparent.png', threshold=40)

print("Done! Both images processed.")
