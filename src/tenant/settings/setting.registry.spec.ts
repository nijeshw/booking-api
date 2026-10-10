import {
  publicSettings,
  resolveSettings,
  settingCatalog,
  SETTING_DEFINITIONS,
} from './setting.registry';

describe('setting registry', () => {
  it('uses defaults when nothing is stored', () => {
    expect(resolveSettings({})).toEqual({
      'booking.showPrice': true,
      'booking.showDuration': true,
      'booking.showStaffName': true,
    });
  });

  it('keeps a stored value and ignores unknown or invalid keys', () => {
    expect(
      resolveSettings({
        'booking.showPrice': false,
        'booking.showDuration': 'yes',
        'booking.future': true,
      }),
    ).toMatchObject({
      'booking.showPrice': false,
      'booking.showDuration': true,
    });
  });

  it('only publishes settings marked for the public page', () => {
    const stored = { 'booking.showStaffName': false };
    const page = publicSettings(stored);
    expect(page['booking.showStaffName']).toBe(false);
    expect(Object.keys(page)).toEqual(
      SETTING_DEFINITIONS.filter((item) => item.public).map((item) => item.key),
    );
  });

  it('groups the catalog so a new definition appears without a new screen', () => {
    const groups = settingCatalog({ 'booking.showPrice': false });
    expect(groups).toEqual([
      {
        label: 'Public booking page',
        items: [
          expect.objectContaining({ key: 'booking.showPrice', value: false }),
          expect.objectContaining({ key: 'booking.showDuration', value: true }),
          expect.objectContaining({ key: 'booking.showStaffName', value: true }),
        ],
      },
    ]);
  });
});
