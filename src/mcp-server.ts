#!/usr/bin/env node
import readline from 'node:readline';
import { VERSION } from './core-version.js';
import { analyzeBinary } from './analysis-binary.js';import { analyzeSource } from './analysis-source.js';import { analyzeDependencies } from './analysis-dependencies.js';import { listProcesses,inspectProcess,getProcessMetrics,getProcessTree,analyzeMemory,analyzeCpu,analyzeIo } from './process-inspector.js';import { profileProcess,monitorProcess,detectResourceAnomalies } from './profiling-profiler.js';import { runBenchmark,compareBenchmarks } from './benchmark-engine.js';import { validateBehavior } from './benchmark-validation.js';import { EvidenceEngine } from './evidence-engine.js';import { listProviders } from './providers-registry.js';import { getResourceControlStatus } from './process-safety.js';
/** A failure that must be reported as a JSON-RPC protocol error (not as a tool execution error). */
class ProtocolError extends Error { constructor(readonly code:number,message:string){super(message);} }
const tools=[
{name:'inspect_target',description:'Inspect a file or source directory and return its basic classification and metadata.',inputSchema:{type:'object',properties:{target:{type:'string'}},required:['target']}},
{name:'analyze_binary',description:'Inspect ELF, PE or Mach-O headers. This is not disassembly or decompilation.',inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
{name:'analyze_source',description:'Inventory source files and textual external imports in a directory.',inputSchema:{type:'object',properties:{directory:{type:'string'}},required:['directory']}},
{name:'analyze_dependencies',description:'Read direct dependencies from a package.json manifest.',inputSchema:{type:'object',properties:{directory:{type:'string'}},required:['directory']}},
{name:'get_inventory',description:'List visible local processes.',inputSchema:{type:'object',properties:{limit:{type:'number'}}}},
{name:'inspect_process',description:'Inspect one process visible to the current user.',inputSchema:{type:'object',properties:{pid:{type:'number'}},required:['pid']}},
{name:'profile_process',description:'Sample process CPU/RSS over a bounded interval.',inputSchema:{type:'object',properties:{pid:{type:'number'},durationMs:{type:'number'},intervalMs:{type:'number'}},required:['pid']}},
{name:'list_processes',description:'List visible processes with OS-provided resource metadata.',inputSchema:{type:'object',properties:{limit:{type:'number'}}}},
{name:'monitor_process',description:'Observe process metrics over a bounded interval and persist a time series.',inputSchema:{type:'object',properties:{pid:{type:'number'},durationMs:{type:'number'},intervalMs:{type:'number'},mode:{type:'string',enum:['Snapshot','Monitor','Diagnostic','Compare']}},required:['pid']}},
{name:'get_process_metrics',description:'Get current process resource metrics.',inputSchema:{type:'object',properties:{pid:{type:'number'}},required:['pid']}},
{name:'get_process_tree',description:'Get the visible descendant process tree.',inputSchema:{type:'object',properties:{pid:{type:'number'}},required:['pid']}},
{name:'analyze_memory',description:'Return current process memory metrics.',inputSchema:{type:'object',properties:{pid:{type:'number'}},required:['pid']}},
{name:'analyze_cpu',description:'Return current process CPU metrics.',inputSchema:{type:'object',properties:{pid:{type:'number'}},required:['pid']}},
{name:'analyze_io',description:'Return current process disk I/O counters where available.',inputSchema:{type:'object',properties:{pid:{type:'number'}},required:['pid']}},
{name:'detect_resource_anomalies',description:'Detect high CPU and growing memory in supplied profile series.',inputSchema:{type:'object',properties:{series:{type:'array',items:{type:'object'}}},required:['series']}},
{name:'get_resource_control_status',description:'Report whether enforceable OS resource controls are available; does not change a process.',inputSchema:{type:'object',properties:{}}},
{name:'capture_baseline',description:'Capture a named baseline by running a command repeatedly and persisting the benchmark artifact.' ,inputSchema:{type:'object',properties:{command:{type:'string'},args:{type:'array',items:{type:'string'}},cwd:{type:'string'},timeoutMs:{type:'number'},repetitions:{type:'number'},label:{type:'string'}},required:['command']}},
{name:'run_benchmark',description:'Run a command repeatedly without a shell and measure wall-clock duration.',inputSchema:{type:'object',properties:{command:{type:'string'},args:{type:'array',items:{type:'string'}},cwd:{type:'string'},timeoutMs:{type:'number'},repetitions:{type:'number'},label:{type:'string'}},required:['command']}},
{name:'compare_results',description:'Compare two Reverse benchmark result objects.',inputSchema:{type:'object',properties:{before:{type:'object'},after:{type:'object'}},required:['before','after']}},
{name:'validate_changes',description:'Check caller-provided expected stdout/stderr and exit code for a command.',inputSchema:{type:'object',properties:{command:{type:'string'},args:{type:'array',items:{type:'string'}},cwd:{type:'string'},timeoutMs:{type:'number'},expected:{type:'object'},repetitions:{type:'number'}},required:['command','expected']}},
{name:'get_evidence',description:'Find a persisted evidence record by ID.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']}},
{name:'list_analyzers',description:'List implemented capabilities and external analyzer extension points.',inputSchema:{type:'object',properties:{}}}
];
async function call(name:string,a:any,signal?:AbortSignal){switch(name){case'inspect_target':{const fs=await import('node:fs/promises');const s=await fs.stat(a.target);return s.isDirectory()?await analyzeSource(a.target):await analyzeBinary(a.target);}case'analyze_binary':return analyzeBinary(a.file);case'analyze_source':return analyzeSource(a.directory);case'analyze_dependencies':return analyzeDependencies(a.directory);case'get_inventory':case'list_processes':return listProcesses(a.limit);case'monitor_process':return monitorProcess(a.pid,{...a,signal});case'get_process_metrics':return getProcessMetrics(a.pid);case'get_process_tree':return getProcessTree(a.pid);case'analyze_memory':return analyzeMemory(a.pid);case'analyze_cpu':return analyzeCpu(a.pid);case'analyze_io':return analyzeIo(a.pid);case'detect_resource_anomalies':return detectResourceAnomalies(a.series);case'get_resource_control_status':return getResourceControlStatus();case'inspect_process':return inspectProcess(a.pid);case'profile_process':return profileProcess(a.pid,a.durationMs,a.intervalMs,undefined,{signal});case'capture_baseline':return runBenchmark({...a,label:a.label??'baseline'});case'run_benchmark':return runBenchmark(a);case'compare_results':return compareBenchmarks(a.before,a.after);case'validate_changes':return validateBehavior(a,a.expected,a.repetitions);case'get_evidence':{const p=await new EvidenceEngine().get(a.id);if(!p)return {found:false,id:a.id};return {found:true,path:p,record:JSON.parse(await (await import('node:fs/promises')).readFile(p,'utf8'))};}case'list_analyzers':return listProviders();default:throw new ProtocolError(-32602,`Unknown tool: ${name}`);}}
// Versions whose tools/call result shape this server satisfies. A client asking for one of them gets it back; otherwise the newest is offered.
const SUPPORTED_PROTOCOLS=['2024-11-05','2025-03-26','2025-06-18'];
function send(message:any){process.stdout.write(JSON.stringify(message)+'\n');}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
const activeCalls=new Map<string|number,AbortController>();
const sendError=(id:unknown,code:number,message:string)=>send({jsonrpc:'2.0',id:id??null,error:{code,message}});
const messageOf=(e:unknown)=>e instanceof Error?e.message:String(e);

async function handleToolCall(req:any){
  const name=req.params?.name;
  if(typeof name!=='string'||!name){sendError(req.id,-32602,'tools/call requires params.name (string).');return;}
  const controller=new AbortController();
  if(req.id!==undefined)activeCalls.set(req.id,controller);
  try{
    const value=await call(name,req.params.arguments??{},controller.signal);
    send({jsonrpc:'2.0',id:req.id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:Array.isArray(value)?{items:value}:value,isError:false}});
  }catch(e){
    // Protocol problems are JSON-RPC errors; a failing tool is a normal result with isError, so the model can read it and react.
    if(e instanceof ProtocolError)sendError(req.id,e.code,e.message);
    else send({jsonrpc:'2.0',id:req.id,result:{content:[{type:'text',text:messageOf(e)}],isError:true}});
  }finally{if(req.id!==undefined)activeCalls.delete(req.id);}
}

async function handleLine(line:string){
  if(!line.trim())return;
  let req:any;
  try{req=JSON.parse(line);}catch{sendError(null,-32700,'Parse error: the line is not valid JSON.');return;}
  if(!req||typeof req!=='object'||Array.isArray(req)||typeof req.method!=='string'){sendError(req&&typeof req==='object'?req.id:null,-32600,'Invalid request.');return;}
  switch(req.method){
    case'initialize':
      send({jsonrpc:'2.0',id:req.id,result:{protocolVersion:SUPPORTED_PROTOCOLS.includes(req.params?.protocolVersion)?req.params.protocolVersion:SUPPORTED_PROTOCOLS[SUPPORTED_PROTOCOLS.length-1],capabilities:{tools:{}},serverInfo:{name:'reverse',version:VERSION}}});return;
    case'notifications/initialized':return;
    case'notifications/cancelled':activeCalls.get(req.params?.requestId)?.abort();return;
    case'ping':send({jsonrpc:'2.0',id:req.id,result:{}});return;
    case'tools/list':send({jsonrpc:'2.0',id:req.id,result:{tools}});return;
    case'tools/call':await handleToolCall(req);return;
    default:if(req.id!==undefined)sendError(req.id,-32601,`Method not found: ${req.method}`);
  }
}
rl.on('line',line=>{handleLine(line).catch(e=>sendError(null,-32603,`Internal error: ${messageOf(e)}`));});
