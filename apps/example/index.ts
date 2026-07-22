import { registerRootComponent } from 'expo';

import App from './App';
import CorpusSmokeApp from './CorpusSmokeApp';
import PerformanceSmokeApp from './PerformanceSmokeApp';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(
  process.env.EXPO_PUBLIC_PERFORMANCE_SMOKE === '1'
    ? PerformanceSmokeApp
    : process.env.EXPO_PUBLIC_CORPUS_SMOKE === '1'
      ? CorpusSmokeApp
      : App
);
