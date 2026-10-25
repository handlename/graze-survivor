export interface PermissionTarget {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export async function requestSensorPermissions(
  motionTarget?: PermissionTarget,
  orientationTarget?: PermissionTarget
): Promise<boolean> {
  if (motionTarget && typeof motionTarget.requestPermission === 'function') {
    try {
      // Must call directly on motionTarget receiver so WebKit does not throw Illegal invocation
      return (await motionTarget.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  if (orientationTarget && typeof orientationTarget.requestPermission === 'function') {
    try {
      return (await orientationTarget.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}
