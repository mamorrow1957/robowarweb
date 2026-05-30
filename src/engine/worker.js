import { compile, getDefines } from './compiler.js';
import { CombatEngine } from './combat.js';

self.onmessage = (e) => {
  const { type, config } = e.data;

  if (type !== 'RUN_BATTLE') return;

  const robots = config.robots.map(r => {
    const { bytecode, errors } = compile(r.program || '');
    const varNames = getDefines(r.program || '');
    return { ...r, bytecode, varNames, compileErrors: errors };
  });

  const compileErrors = robots.flatMap(r =>
    r.compileErrors.map(err => `${r.name}: ${err}`)
  );

  if (compileErrors.length > 0) {
    self.postMessage({ type: 'COMPILE_ERROR', errors: compileErrors });
    return;
  }

  try {
    const engine = new CombatEngine({ ...config, robots });
    const { frames, result } = engine.simulate();
    self.postMessage({ type: 'BATTLE_COMPLETE', frames, result });
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message });
  }
};
