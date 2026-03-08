// fix_glb_png_to_jpeg.mjs
// Scans public/models/zombie_*/zombie_*.glb, finds embedded PNG textures,
// converts them to JPEG (quality 90), and rewrites the GLB.
// Reason: iOS Safari fails to decode large PNGs (5-7MB) to WebGL GPU -> black textures.

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const MODELS_DIR = 'd:/GlobalGanLan/public/models';
const JPEG_QUALITY = 90;

async function processGlb(glbPath) {
  const buf = fs.readFileSync(glbPath);
  
  // Parse GLB header
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) { // 'glTF'
    console.log(`  Skip: not a valid GLB`);
    return false;
  }
  
  const jsonLen = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16);
  const jsonBuf = buf.slice(20, 20 + jsonLen);
  const json = JSON.parse(jsonBuf.toString('utf8'));
  
  const binChunkOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binChunkOffset);
  const binChunkType = buf.readUInt32LE(binChunkOffset + 4);
  const binStart = binChunkOffset + 8;
  const binBuf = Buffer.from(buf.slice(binStart, binStart + binLen));
  
  const images = json.images || [];
  let pngCount = 0;
  const conversions = [];
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.mimeType === 'image/png') {
      const bv = json.bufferViews[img.bufferView];
      const pngData = binBuf.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
      const sizeMB = (bv.byteLength / 1024 / 1024).toFixed(1);
      console.log(`  [${i}] PNG "${img.name || '?'}" ${sizeMB}MB → converting to JPEG...`);
      
      // Convert PNG to JPEG using sharp
      const jpegData = await sharp(pngData)
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      
      const newSizeMB = (jpegData.length / 1024 / 1024).toFixed(1);
      console.log(`       → JPEG ${newSizeMB}MB (saved ${(((bv.byteLength - jpegData.length) / bv.byteLength) * 100).toFixed(0)}%)`);
      
      conversions.push({
        imageIndex: i,
        bufferViewIndex: img.bufferView,
        oldOffset: bv.byteOffset,
        oldLength: bv.byteLength,
        newData: jpegData,
      });
      pngCount++;
    }
  }
  
  if (pngCount === 0) {
    console.log(`  No PNG textures found, skipping.`);
    return false;
  }
  
  // Rebuild the binary buffer with replaced textures
  // Sort conversions by offset to process in order
  conversions.sort((a, b) => a.oldOffset - b.oldOffset);
  
  // Build new binary buffer
  const chunks = [];
  let cursor = 0;
  
  for (const conv of conversions) {
    // Copy data before this texture
    if (conv.oldOffset > cursor) {
      chunks.push(binBuf.slice(cursor, conv.oldOffset));
    }
    // Insert new JPEG data
    chunks.push(conv.newData);
    cursor = conv.oldOffset + conv.oldLength;
  }
  // Copy remaining data after last texture 
  if (cursor < binBuf.length) {
    chunks.push(binBuf.slice(cursor));
  }
  
  const newBinBuf = Buffer.concat(chunks);
  
  // Update JSON: fix bufferView offsets and lengths, image mimeTypes
  // First, calculate offset shifts
  let offsetShift = 0;
  const shifts = []; // { startOffset, shift }
  
  for (const conv of conversions) {
    const sizeDiff = conv.newData.length - conv.oldLength;
    // Update the bufferView for this image
    const bv = json.bufferViews[conv.bufferViewIndex];
    bv.byteOffset = bv.byteOffset + offsetShift;
    bv.byteLength = conv.newData.length;
    
    // Update image mimeType
    json.images[conv.imageIndex].mimeType = 'image/jpeg';
    
    shifts.push({ afterOffset: conv.oldOffset + conv.oldLength, shift: sizeDiff });
    offsetShift += sizeDiff;
  }
  
  // Update all OTHER bufferViews that come after modified ones
  for (let i = 0; i < json.bufferViews.length; i++) {
    const bv = json.bufferViews[i];
    // Skip bufferViews we already updated
    if (conversions.some(c => c.bufferViewIndex === i)) continue;
    
    // Calculate total shift for this bufferView's offset
    let totalShift = 0;
    for (const s of shifts) {
      if (bv.byteOffset >= s.afterOffset) {
        totalShift += s.shift;
      }
    }
    if (totalShift !== 0) {
      bv.byteOffset += totalShift;
    }
  }
  
  // Update buffer size
  if (json.buffers && json.buffers[0]) {
    json.buffers[0].byteLength = newBinBuf.length;
  }
  
  // Rebuild GLB
  const newJsonStr = JSON.stringify(json);
  // JSON chunk must be padded to 4-byte alignment with spaces (0x20)
  const jsonPadding = (4 - (newJsonStr.length % 4)) % 4;
  const paddedJsonLen = newJsonStr.length + jsonPadding;
  const paddedJsonBuf = Buffer.alloc(paddedJsonLen, 0x20); // space padding
  Buffer.from(newJsonStr, 'utf8').copy(paddedJsonBuf);
  
  // Bin chunk must be padded to 4-byte alignment with zeros
  const binPadding = (4 - (newBinBuf.length % 4)) % 4;
  const paddedBinLen = newBinBuf.length + binPadding;
  const paddedBinBuf = Buffer.alloc(paddedBinLen, 0);
  newBinBuf.copy(paddedBinBuf);
  
  // GLB header (12) + JSON chunk header (8) + JSON data + BIN chunk header (8) + BIN data
  const totalLength = 12 + 8 + paddedJsonLen + 8 + paddedBinLen;
  
  const outBuf = Buffer.alloc(totalLength);
  let pos = 0;
  
  // GLB header
  outBuf.writeUInt32LE(0x46546C67, pos); pos += 4; // magic 'glTF'
  outBuf.writeUInt32LE(2, pos); pos += 4;           // version
  outBuf.writeUInt32LE(totalLength, pos); pos += 4;  // total length
  
  // JSON chunk
  outBuf.writeUInt32LE(paddedJsonLen, pos); pos += 4;    // chunk length
  outBuf.writeUInt32LE(0x4E4F534A, pos); pos += 4;       // chunk type 'JSON'
  paddedJsonBuf.copy(outBuf, pos); pos += paddedJsonLen;
  
  // BIN chunk  
  outBuf.writeUInt32LE(paddedBinLen, pos); pos += 4;     // chunk length
  outBuf.writeUInt32LE(0x004E4942, pos); pos += 4;       // chunk type 'BIN\0'
  paddedBinBuf.copy(outBuf, pos);
  
  // Backup original
  const backupPath = glbPath + '.png-backup';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(glbPath, backupPath);
    console.log(`  Backup: ${path.basename(backupPath)}`);
  }
  
  fs.writeFileSync(glbPath, outBuf);
  const oldSize = (buf.length / 1024 / 1024).toFixed(1);
  const newSize = (outBuf.length / 1024 / 1024).toFixed(1);
  console.log(`  ✅ Wrote ${path.basename(glbPath)}: ${oldSize}MB → ${newSize}MB`);
  return true;
}

async function main() {
  const dirs = fs.readdirSync(MODELS_DIR)
    .filter(d => d.startsWith('zombie_'))
    .sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));
  
  let fixed = 0;
  for (const d of dirs) {
    const glbPath = path.join(MODELS_DIR, d, d + '.glb');
    if (!fs.existsSync(glbPath)) continue;
    console.log(`\n--- ${d} ---`);
    const changed = await processGlb(glbPath);
    if (changed) fixed++;
  }
  
  console.log(`\n=== Done: ${fixed} GLB files fixed ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
