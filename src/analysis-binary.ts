import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { fileEvidence } from './core-util.js';

export interface BinaryFinding { format:string; architecture:string; bitness:number|null; endian:string|null; fileSize:number; entryPoint?:string; sections?:unknown[]; imports?:string[]; }
const u16=(b:Buffer,o:number,le=true)=>le?b.readUInt16LE(o):b.readUInt16BE(o);
const u32=(b:Buffer,o:number,le=true)=>le?b.readUInt32LE(o):b.readUInt32BE(o);
export async function analyzeBinary(file:string){
 const abs=path.resolve(file), s=await stat(abs), h=await open(abs,'r'); const b=Buffer.alloc(Math.min(s.size,65536)); try{await h.read(b,0,b.length,0);}finally{await h.close();}
 let f:BinaryFinding={format:'unknown',architecture:'unknown',bitness:null,endian:null,fileSize:s.size}; const magic=b.subarray(0,4).toString('hex');
 if(b.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46])) && b.length>=52){const cls=b[4],le=b[5]===1; const machine=u16(b,18,le); const arch:Record<number,string>={3:'x86',62:'x86_64',40:'ARM',183:'AArch64',243:'RISC-V'}; f={...f,format:'ELF',bitness:cls===2?64:cls===1?32:null,endian:le?'little':'big',architecture:arch[machine]??`machine-${machine}`,entryPoint:(cls===2?(le?b.readBigUInt64LE(24):b.readBigUInt64BE(24)):BigInt(u32(b,24,le))).toString(16)};}
 else if(b[0]===0x4d&&b[1]===0x5a&&b.length>=64){const pe=u32(b,0x3c);if(pe+24<=b.length&&b.toString('ascii',pe,pe+4)==='PE\0\0'){const machine=u16(b,pe+4),magicOpt=u16(b,pe+24);const arch:Record<number,string>={0x14c:'x86',0x8664:'x86_64',0x1c0:'ARM',0xaa64:'ARM64'};f={...f,format:'PE',architecture:arch[machine]??`machine-${machine}`,bitness:magicOpt===0x20b?64:magicOpt===0x10b?32:null,endian:'little'};}else f={...f,format:'DOS/PE-like',architecture:'unknown'};}
 else {const m=u32(b,0,false);const mach:Record<number,string>={0xfeedface:'Mach-O 32-bit',0xfeedfacf:'Mach-O 64-bit',0xcefaedfe:'Mach-O 32-bit (swapped)',0xcffaedfe:'Mach-O 64-bit (swapped)',0xcafebabe:'Mach-O universal'};if(mach[m])f={...f,format:mach[m],architecture:'see-load-commands',endian:'header-dependent',bitness:mach[m].includes('64')?64:32};}
 const ev=await fileEvidence(abs);return result<BinaryFinding>(abs,'binary_analysis',[f],{evidence:[ev],limitations:['Header-level inspection only. No disassembly, decompilation, control-flow recovery, import resolution, or complete section parsing is performed.','A recognized magic value does not prove the file is safe or executable.'],coverage:{examined:true,complete:false,notes:[`Read ${b.length} header bytes.`,...(f.format==='unknown'?['Unrecognized or truncated binary header.']:[])]},status:f.format==='unknown'?'partial':'completed'});
}
