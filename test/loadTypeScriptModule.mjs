import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

export async function loadTypeScriptModule(relativePath, parentUrl = import.meta.url) {
  const source = await readFile(new URL(relativePath, parentUrl), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(toDataUrl(output));
}

export async function loadAdaptiveThresholdModules() {
  const featuresSource = await readFile(
    new URL('../processing/adaptiveThresholdFeatures.ts', import.meta.url),
    'utf8'
  );
  const featuresOutput = ts.transpileModule(featuresSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const featuresUrl = toDataUrl(featuresOutput);

  const controllerSource = await readFile(
    new URL('../processing/adaptiveThreshold.ts', import.meta.url),
    'utf8'
  );
  const controllerOutput = ts.transpileModule(controllerSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replace(
    "'./adaptiveThresholdFeatures'",
    `'${featuresUrl}'`
  );

  return {
    features: await import(featuresUrl),
    controller: await import(toDataUrl(controllerOutput)),
  };
}
