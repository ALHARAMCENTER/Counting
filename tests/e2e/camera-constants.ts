import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** FAKE label shown by the test camera. */
export const CAMERA_TEXT = '0000000007CAM00';
export const CAMERA_FILE = resolve(fileURLToPath(new URL('.', import.meta.url)), '.generated/camera.y4m');
