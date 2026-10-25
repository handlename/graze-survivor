import { describe, expect, it } from 'vitest';
import { requestSensorPermissions } from '../../src/shell/permissions';

describe('iOS WebKit sensor permission receiver preservation', () => {
  it('calls requestPermission directly on the constructor receiver without detaching this', async () => {
    const motionConstructor = {
      secretReceiverToken: 'webkit-ok',
      async requestPermission(this: { secretReceiverToken?: string }) {
        if (this?.secretReceiverToken !== 'webkit-ok') {
          throw new TypeError('Illegal invocation');
        }
        return 'granted' as const;
      },
    };
    expect(await requestSensorPermissions(motionConstructor)).toBe(true);
  });
});
