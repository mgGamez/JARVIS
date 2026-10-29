import os from 'node:os';
import {statfs} from 'node:fs/promises';
export class Telemetry {
 constructor(){this.previous=null;}
 async sample(directory){const totals=os.cpus().reduce((a,c)=>({idle:a.idle+c.times.idle,total:a.total+Object.values(c.times).reduce((x,y)=>x+y,0)}),{idle:0,total:0});let cpuPercent=null;if(this.previous&&totals.total>this.previous.total)cpuPercent=Math.max(0,Math.min(100,100*(1-(totals.idle-this.previous.idle)/(totals.total-this.previous.total))));this.previous=totals;let disk=null;try{const f=await statfs(directory);disk={totalBytes:f.blocks*f.bsize,freeBytes:f.bavail*f.bsize};}catch{}return{hostname:os.hostname(),platform:os.platform(),logicalCPUs:os.cpus().length,cpuPercent,totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem(),processMemoryBytes:process.memoryUsage().rss,processUptimeSeconds:process.uptime(),disk,observedAt:Date.now(),scope:'Brain server; OS-reported values, not remote laptop telemetry'};}
}
