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
  const configSource = await readFile(
    new URL('../processing/adaptiveThresholdConfig.ts', import.meta.url),
    'utf8'
  );
  const configOutput = ts.transpileModule(configSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const configUrl = toDataUrl(configOutput);

  const featuresSource = await readFile(
    new URL('../processing/adaptiveThresholdFeatures.ts', import.meta.url),
    'utf8'
  );
  const featuresOutput = ts.transpileModule(featuresSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replace(
    "'./adaptiveThresholdConfig'",
    `'${configUrl}'`
  );
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
  }).outputText
    .replace(
      "'./adaptiveThresholdFeatures'",
      `'${featuresUrl}'`
    )
    .replace(
      "'./adaptiveThresholdConfig'",
      `'${configUrl}'`
    );

  return {
    config: await import(configUrl),
    features: await import(featuresUrl),
    controller: await import(toDataUrl(controllerOutput)),
  };
}

export async function loadFeedbackModules() {
  const adaptiveFeedbackSource = await readFile(
    new URL('../processing/adaptiveFeedback.ts', import.meta.url),
    'utf8'
  );
  const adaptiveFeedbackOutput = ts.transpileModule(adaptiveFeedbackSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const adaptiveFeedbackUrl = toDataUrl(adaptiveFeedbackOutput);

  const feedbackSource = await readFile(
    new URL('../processing/feedback.ts', import.meta.url),
    'utf8'
  );
  const feedbackOutput = ts.transpileModule(feedbackSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replace(
    "'./adaptiveFeedback'",
    `'${adaptiveFeedbackUrl}'`
  );

  return {
    adaptiveFeedback: await import(adaptiveFeedbackUrl),
    feedback: await import(toDataUrl(feedbackOutput)),
  };
}
