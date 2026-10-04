// Execute actual History TSX with lightweight host stubs; native pixels are not tested.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
export { renderSessionUi as renderHistoryUi, textContent } from './renderSessionUi.mjs';
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const react = moduleUrl(`const context = () => globalThis[Symbol.for('pjt-i-session-ui-test-hooks')];
  export const useState = initial => context().useState(initial);
  export const useMemo = (fn, deps) => context().useMemo(fn, deps);
  export const memo = component => component;`);
const jsx = moduleUrl(`export const Fragment = Symbol.for('pjt-i-test-fragment');
  export const jsx = (type, props, key) => ({ type, props, key }); export const jsxs = jsx;`);
const native = moduleUrl(`export const View = 'View', Text = 'Text', Pressable = 'Pressable', ScrollView = 'ScrollView';
  export const StyleSheet = { create: value => value };`);
async function compile(path, imports) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`"${name}"`, `"${url}"`).replaceAll(`'${name}'`, `'${url}'`);
  return moduleUrl(code);
}
const imports = { react, 'react/jsx-runtime': jsx, 'react-native': native,
  '../ui/historyGrouping': new URL('../ui/historyGrouping.ts', import.meta.url).href,
  '../ui/presentation': new URL('../ui/presentation.ts', import.meta.url).href };
const chartUrl = await compile('../components/HistoryAnalyticsChart.tsx', imports);
const dashboardUrl = await compile('../components/HistoricalAnalyticsDashboard.tsx', { ...imports, './HistoryAnalyticsChart': chartUrl });
export const { HistoricalAnalyticsDashboard } = await import(dashboardUrl);
export const { HistoryAnalyticsChart } = await import(chartUrl);
