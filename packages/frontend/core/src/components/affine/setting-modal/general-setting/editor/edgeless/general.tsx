import { Menu, MenuItem, MenuTrigger } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { menuTrigger } from '../style.css';

type Theme = 'auto' | 'dark' | 'light' | 'specified';

const getThemeOptions = (t: ReturnType<typeof useI18n>) => [
  {
    value: 'specified' as Theme,
    label:
      t[
        'com.affine.settings.editorSettings.page.edgeless-default-theme.specified'
      ](),
  },
  {
    value: 'dark' as Theme,
    label: t['com.affine.themeSettings.dark'](),
  },
  {
    value: 'light' as Theme,
    label: t['com.affine.themeSettings.light'](),
  },
  {
    value: 'auto' as Theme,
    label: t['com.affine.themeSettings.auto'](),
  },
];

const getThemeValue = (theme: string, t: ReturnType<typeof useI18n>) => {
  switch (theme) {
    case 'dark':
      return t['com.affine.themeSettings.dark']();
    case 'light':
      return t['com.affine.themeSettings.light']();
    case 'auto':
      return t['com.affine.themeSettings.auto']();
    default:
      return t[
        'com.affine.settings.editorSettings.page.edgeless-default-theme.specified'
      ]();
  }
};

export const GeneralEdgelessSetting = () => {
  const t = useI18n();
  const editorSetting = useService(EditorSettingService).editorSetting;
  const edgelessDefaultTheme = useLiveData(
    editorSetting.settings$
  ).edgelessDefaultTheme;

  const items = getThemeOptions(t);
  const currentTheme = useMemo(() => {
    return getThemeValue(edgelessDefaultTheme, t);
  }, [edgelessDefaultTheme, t]);

  const menuItems = useMemo(() => {
    return items.map(item => {
      const selected = edgelessDefaultTheme === item.value;
      const onSelect = () => {
        editorSetting.set('edgelessDefaultTheme', item.value);
      };
      return (
        <MenuItem key={item.value} selected={selected} onSelect={onSelect}>
          {item.label}
        </MenuItem>
      );
    });
  }, [editorSetting, items, edgelessDefaultTheme]);

  return (
    <SettingRow
      name={t[
        'com.affine.settings.editorSettings.page.edgeless-default-theme.title'
      ]()}
      desc={t[
        'com.affine.settings.editorSettings.page.edgeless-default-theme.description'
      ]()}
    >
      <Menu
        items={menuItems}
        contentOptions={{
          align: 'end',
          sideOffset: 16,
          style: {
            width: '280px',
          },
        }}
      >
        <MenuTrigger tooltip={currentTheme} className={menuTrigger}>
          {currentTheme}
        </MenuTrigger>
      </Menu>
    </SettingRow>
  );
};
