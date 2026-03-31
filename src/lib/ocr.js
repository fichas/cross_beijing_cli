/**
 * OCR module - recognizes captcha images using onnxruntime-node + ddddocr model.
 *
 * Digits-only captcha recognition (0-9).
 */

import { InferenceSession, Tensor } from 'onnxruntime-node';
import { Jimp, intToRGBA } from 'jimp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, '..', '..', 'models');

let _session = null;
let _charset = null;

/** Lazy-load ONNX inference session (cached). */
async function getSession() {
  if (!_session) {
    const modelPath = join(MODELS_DIR, 'common_old.onnx');
    _session = await InferenceSession.create(modelPath, {
      logSeverityLevel: 3, // suppress warnings (0=verbose, 1=info, 2=warning, 3=error, 4=fatal)
    });
  }
  return _session;
}

/** Lazy-load charset mapping (cached). */
function getCharset() {
  if (!_charset) {
    const charsetPath = join(MODELS_DIR, 'common_old.json');
    _charset = JSON.parse(readFileSync(charsetPath, 'utf-8'));
  }
  return _charset;
}

/**
 * Recognize text from a captcha image buffer.
 *
 * @param {Buffer} imageBuffer - PNG or JPEG image bytes
 * @returns {Promise<string>} Recognized digits (0-9 only)
 */
export async function recognizeCaptcha(imageBuffer) {
  const session = await getSession();
  const charset = getCharset();

  // 1. Decode image with jimp
  const image = await Jimp.read(imageBuffer);

  // 2. Resize to height=64, maintain aspect ratio
  const targetHeight = 64;
  const targetWidth = Math.round(image.width * (targetHeight / image.height));
  image.resize({ w: targetWidth, h: targetHeight });

  // 3. Convert to grayscale float32 tensor, normalized to [0, 1]
  //    Shape: [1, 1, 64, width]  (batch, channels, height, width)
  const floatData = new Float32Array(targetHeight * targetWidth);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const pixel = intToRGBA(image.getPixelColor(x, y));
      // Standard grayscale: 0.299*R + 0.587*G + 0.114*B
      const gray = (0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b) / 255.0;
      floatData[y * targetWidth + x] = gray;
    }
  }

  const inputTensor = new Tensor('float32', floatData, [1, 1, targetHeight, targetWidth]);

  // 4. Run inference
  const inputName = session.inputNames[0]; // should be 'input1'
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  const output = results[outputName];

  // 5. CTC decode: argmax per timestep, collapse repeats, skip blank (index 0)
  //    Output shape is typically [sequenceLength, 1, numClasses] or [1, sequenceLength, numClasses]
  const dims = output.dims;
  const data = output.data;

  let seqLen, numClasses;
  let getLogit;

  if (dims.length === 3) {
    if (dims[1] === 1) {
      // [seqLen, 1, numClasses]
      seqLen = dims[0];
      numClasses = dims[2];
      getLogit = (t, c) => data[t * numClasses + c];
    } else if (dims[0] === 1) {
      // [1, seqLen, numClasses]
      seqLen = dims[1];
      numClasses = dims[2];
      getLogit = (t, c) => data[t * numClasses + c];
    } else {
      seqLen = dims[1];
      numClasses = dims[2];
      getLogit = (t, c) => data[t * numClasses + c];
    }
  } else {
    // 2D: [seqLen, numClasses]
    seqLen = dims[0];
    numClasses = dims[1];
    getLogit = (t, c) => data[t * numClasses + c];
  }

  // Argmax per timestep
  const indices = [];
  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0;
    let maxVal = getLogit(t, 0);
    for (let c = 1; c < numClasses; c++) {
      const val = getLogit(t, c);
      if (val > maxVal) {
        maxVal = val;
        maxIdx = c;
      }
    }
    indices.push(maxIdx);
  }

  // CTC decode: collapse repeats, skip blank (index 0)
  const decoded = [];
  let prevIdx = -1;
  for (const idx of indices) {
    if (idx !== prevIdx) {
      if (idx !== 0 && idx < charset.length) {
        decoded.push(charset[idx]);
      }
    }
    prevIdx = idx;
  }

  const text = decoded.join('');

  // 6. Filter to digits only
  return text.replace(/[^0-9]/g, '');
}
