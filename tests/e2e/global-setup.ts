import { CAMERA_FILE, CAMERA_TEXT } from './camera-constants';
import { writeFakeCameraFile } from './fake-camera';

export default async function globalSetup() {
  await writeFakeCameraFile(CAMERA_FILE, CAMERA_TEXT);
}
