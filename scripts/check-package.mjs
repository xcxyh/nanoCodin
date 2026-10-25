import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url));
const cwd = await mkdtemp(path.join(os.tmpdir(), 'nanocodin-consumer-'));
function exec(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result;
}
const metadata = JSON.parse(exec('npm', ['pack', '--ignore-scripts', '--json', '--cache', path.join(cwd, 'npm-cache'), '--pack-destination', cwd], { cwd: repo }).stdout)[0];
if (metadata.files.some(file => /agentGraph|memoryManager|dist\/prompts\/system\.md$/.test(file.path))) throw new Error('Stale module in package');
const destination = path.join(cwd, 'node_modules', 'nano-codin');
await mkdir(destination, { recursive: true });
exec('tar', ['-xzf', path.join(cwd, metadata.filename), '-C', destination, '--strip-components=1']);
await symlink(path.join(repo, 'node_modules'), path.join(destination, 'node_modules'));
await symlink(path.join(repo, 'node_modules', 'zod'), path.join(cwd, 'node_modules', 'zod'));
await writeFile(path.join(cwd, 'package.json'), '{"type":"module"}');
await writeFile(path.join(cwd, 'consumer.mjs'), `
import { createAgent, defineTool } from 'nano-codin';
import { z } from 'zod';
let first = true;
const tool = defineTool({ name:'add', description:'add', schema:z.object({a:z.number(),b:z.number()}), async execute({a,b}) { return {ok:true,output:String(a+b)}; } });
const agent = createAgent({model:{async generate(messages) { if(first) { first=false; return {text:'',toolCalls:[{name:'add',input:{a:2,b:3}}]}; } return {text:messages.at(-1).content.includes('OK: 5')?'embedded:5':'bad'}; }},tools:[tool]});
const result = await agent.run('calculate');
if(result.answer!=='embedded:5') throw new Error('bad answer');
console.log(result.answer);
`);
const embedded = exec(process.execPath, ['consumer.mjs'], { env: { ...process.env, MODEL_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', NANOCODIN_HOME: path.join(cwd, 'unused-home'), NODE_DEBUG: 'esm' } });
if (/node_modules\/(?:ink|ai|execa|handlebars)\//.test(embedded.stderr)) throw new Error('Core loaded a CLI/model/tool dependency');
await writeFile(path.join(cwd, 'consumer.ts'), `
import { createAgent, defineTool } from 'nano-codin';
import { z } from 'zod';
const tool = defineTool({ name:'typed', description:'typed', schema:z.object({value:z.number()}), async execute(input) {
  const value:number = input.value;
  // @ts-expect-error Tool input is inferred as a number, not any.
  const bad:string = input.value;
  return {ok:true,output:String(value)};
}});
// @ts-expect-error Callers cannot pass the wrong tool input type.
tool.execute({value:'wrong'},{cwd:'.'});
const agent = createAgent({ model: { async generate() { return {text:'done'}; } }, tools: [tool] });
void agent;
`);
exec(process.execPath, [path.join(repo, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'consumer.ts']);
exec(process.execPath, ['--input-type=module', '-e', `
  import { createTemplateRenderer, createTemplateInstructions } from 'nano-codin/templates';
  const render = createTemplateRenderer();
  if (render('{{#each values}}{{this}}{{/each}}', {values:['<a>', '&b']}) !== '<a>&b') throw new Error('Template renderer failed');
  const instructions = createTemplateInstructions({file:new URL('./node_modules/nano-codin/dist/prompts/system.hbs', import.meta.url)});
  if (!(await instructions('task', {version:1,id:'test',cwd:process.cwd(),createdAt:1,events:[]})).includes('nano codin')) throw new Error('Bundled prompt unavailable');
`]);
const help = exec(process.execPath, [path.join(destination, 'dist/index.js'), '--help']);
if (!help.stdout.includes('--print')) throw new Error('Missing CLI help');
exec(process.execPath, ['--input-type=module', '-e', "await Promise.all(['nano-codin/models','nano-codin/tools','nano-codin/session','nano-codin/context','nano-codin/templates'].map(name => import(name))); console.log('adapters:ok')"]);
console.log(JSON.stringify({ result: embedded.stdout.trim(), declarations: 'passed', entrypoints: 'core + 5 adapters + CLI', coreDependencies: 'no Ink / AI SDK / execa / Handlebars', packedBytes: metadata.size }));
await rm(cwd, { recursive: true, force: true });
