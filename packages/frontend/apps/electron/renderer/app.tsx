import { AffineContext } from '@affine/component/context';
import { GlobalLoading } from '@affine/component/global-loading';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { Telemetry } from '@affine/core/components/telemetry';
import { router } from '@affine/core/desktop/router';
import { configureCommonModules } from '@affine/core/modules';
import { configureAppTabsHeaderModule } from '@affine/core/modules/app-tabs-header';
import { ValidatorProvider } from '@affine/core/modules/cloud';
import { I18nProvider } from '@affine/core/modules/i18n';
import { configureElectronStateStorageImpls } from '@affine/core/modules/storage';
import { CustomThemeModifier } from '@affine/core/modules/theme-editor';
import {
  ClientSchemaProvider,
  PopupWindowProvider,
} from '@affine/core/modules/url';
import { configureSqliteUserspaceStorageProvider } from '@affine/core/modules/userspace';
import { configureDesktopWorkbenchModule } from '@affine/core/modules/workbench';
import {
  configureBrowserWorkspaceFlavours,
  configureSqliteWorkspaceEngineStorageProvider,
} from '@affine/core/modules/workspace-engine';
import createEmotionCache from '@affine/core/utils/create-emotion-cache';
import { apis, appInfo } from '@affine/electron-api';
import { CacheProvider } from '@emotion/react';
import {
  Framework,
  FrameworkRoot,
  getCurrentStore,
  LifecycleService,
} from '@toeverything/infra';
import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

const desktopWhiteList = [
  '/open-app/signin-redirect',
  '/open-app/url',
  '/upgrade-success',
  '/ai-upgrade-success',
  '/share',
  '/oauth',
  '/magic-link',
];
if (
  !BUILD_CONFIG.isElectron &&
  BUILD_CONFIG.debug &&
  desktopWhiteList.every(path => !location.pathname.startsWith(path))
) {
  document.body.innerHTML = `<h1 style="color:red;font-size:5rem;text-align:center;">Don't run electron entry in browser.</h1>`;
  throw new Error('Wrong distribution');
}

const cache = createEmotionCache();

const future = {
  v7_startTransition: true,
} as const;

const framework = new Framework();
configureCommonModules(framework);
configureElectronStateStorageImpls(framework);
configureBrowserWorkspaceFlavours(framework);
configureSqliteWorkspaceEngineStorageProvider(framework);
configureSqliteUserspaceStorageProvider(framework);
configureDesktopWorkbenchModule(framework);
configureAppTabsHeaderModule(framework);
framework.impl(PopupWindowProvider, {
  open: (url: string) => {
    apis?.ui.openExternal(url).catch(e => {
      console.error('Failed to open external URL', e);
    });
  },
});
framework.impl(ClientSchemaProvider, {
  getClientSchema() {
    return appInfo?.schema;
  },
});
framework.impl(ValidatorProvider, {
  async validate(_challenge, resource) {
    const token = await apis?.ui?.getChallengeResponse(resource);
    if (!token) {
      throw new Error('Challenge failed');
    }
    return token;
  },
});
const frameworkProvider = framework.provider();

// setup application lifecycle events, and emit application start event
window.addEventListener('focus', () => {
  frameworkProvider.get(LifecycleService).applicationFocus();
});
frameworkProvider.get(LifecycleService).applicationStart();

export function App() {
  return (
    <Suspense>
      <FrameworkRoot framework={frameworkProvider}>
        <CacheProvider value={cache}>
          <I18nProvider>
            <AffineContext store={getCurrentStore()}>
              <Telemetry />
              <CustomThemeModifier />
              <GlobalLoading />
              <RouterProvider
                fallbackElement={<AppFallback />}
                router={router}
                future={future}
              />
              {environment.isWindows && (
                <div style={{ position: 'fixed', right: 0, top: 0, zIndex: 5 }}>
                  <WindowsAppControls />
                </div>
              )}
            </AffineContext>
          </I18nProvider>
        </CacheProvider>
      </FrameworkRoot>
    </Suspense>
  );
}
