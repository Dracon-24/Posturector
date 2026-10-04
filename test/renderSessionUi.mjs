// Runs the real TSX functions against host-component stubs. This exercises
// state transitions and rendered content, not native layout or visual pixels.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadAdaptiveThresholdModules } from './loadTypeScriptModule.mjs';

const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hookKey = 'pjt-i-session-ui-test-hooks';
const react = asModule(`
  const context = () => globalThis[Symbol.for('${hookKey}')];
  export const useState = initial => context().useState(initial);
  export const useMemo = (fn, deps) => context().useMemo(fn, deps);
  export const memo = component => component;
`);
const jsx = asModule(`
  export const Fragment = Symbol.for('pjt-i-test-fragment');
  export const jsx = (type, props, key) => ({ type, props, key });
  export const jsxs = jsx;
`);
const native = asModule(`
  export const View = 'View', Text = 'Text', Pressable = 'Pressable';
  export const StyleSheet = { create: value => value, absoluteFill: {} };
`);

async function compile(relativePath, replacements) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  let output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  for (const [name, url] of Object.entries(replacements)) {
    output = output.replaceAll(`"${name}"`, `"${url}"`).replaceAll(`'${name}'`, `'${url}'`);
  }
  return asModule(output);
}

const { config } = await loadAdaptiveThresholdModules();
const shared = {
  react, 'react/jsx-runtime': jsx, 'react-native': native,
  '../ui/sessionAnalytics': new URL('../ui/sessionAnalytics.ts', import.meta.url).href,
  '../ui/presentation': new URL('../ui/presentation.ts', import.meta.url).href,
  '../processing/adaptiveThreshold': asModule(`export const MAX_ADAPTIVE_ADJUSTMENT = ${config.ACTIVE_ADAPTIVE_THRESHOLD_CONFIG.maximumAdaptiveAdjustment};`),
};
const chartsUrl = await compile('../components/SessionAnalyticsCharts.tsx', shared);
const dashboardUrl = await compile('../components/SessionResultsDashboard.tsx', {
  ...shared, './SessionAnalyticsCharts': chartsUrl,
});
export const dashboardModule = await import(dashboardUrl);
export const chartsModule = await import(chartsUrl);

export function renderSessionUi(Component, props) {
  const state = new Map();
  let scope, cursor;
  const hooks = {
    useState(initial) {
      const key = `${scope}:${cursor++}`;
      if (!state.has(key)) state.set(key, typeof initial === 'function' ? initial() : initial);
      return [state.get(key), value => state.set(key, typeof value === 'function' ? value(state.get(key)) : value)];
    },
    useMemo(fn, deps) {
      const key = `${scope}:${cursor++}`;
      const previous = state.get(key);
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        state.set(key, { value: fn(), deps });
      }
      return state.get(key).value;
    },
  };
  function materialize(element, path) {
    if (element == null || typeof element === 'boolean') return null;
    if (Array.isArray(element)) return element.map((item, index) => materialize(item, `${path}/${item?.key ?? index}`));
    if (typeof element !== 'object') return element;
    if (typeof element.type === 'function') {
      scope = `${path}/${element.type.name}`;
      cursor = 0;
      return materialize(element.type(element.props), `${path}/content`);
    }
    return { ...element, props: { ...element.props, children: materialize(element.props.children, `${path}/children`) } };
  }
  const ui = {
    tree: null,
    render() {
      globalThis[Symbol.for(hookKey)] = hooks;
      ui.tree = materialize({ type: Component, props }, 'root');
      return ui;
    },
    nodes() {
      const nodes = [];
      function visit(element) {
        if (Array.isArray(element)) element.forEach(visit);
        else if (element && typeof element === 'object') { nodes.push(element); visit(element.props.children); }
      }
      visit(ui.tree);
      return nodes;
    },
    text() { return textContent(ui.tree); },
    press(label) {
      const node = ui.nodes().find(item => item.type === 'Pressable' && textContent(item) === label);
      if (!node) throw new Error(`No control: ${label}`);
      if (!node.props.disabled) node.props.onPress();
      return ui.render();
    },
  };
  return ui.render();
}

export function textContent(element) {
  if (element == null || typeof element === 'boolean') return '';
  if (Array.isArray(element)) return element.map(textContent).join('');
  if (typeof element === 'object') return textContent(element.props.children);
  return String(element);
}
