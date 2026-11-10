import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {Op} from 'sequelize';
process.env.JWT_SECRET='fixture';
const originalNow=Date.now();
mock.timers.enable({apis:['Date'],now:originalNow});
const challenges=[], sent=[];
const user={id:7,email:'admin@example.test',active:true,setup_pending:false,async update(fields){this.password_hash=fields.password_hash}};
let tx=Promise.resolve();
const model={
 async create(row){challenges.push({...row,attempts:0,used_at:null,async update(fields){Object.assign(this,fields)}})},
 async findAll({where}){return challenges.filter(row=>matches(row,where))},
 async findOne({where}){return challenges.find(row=>matches(row,where))},
 async destroy({where}){for(let i=challenges.length-1;i>=0;i--)if(matches(challenges[i],where))challenges.splice(i,1)},
 async update(_, {where}){const row=await this.findOne({where});if(!row)return [0,[]];row.attempts++;return [1,[row]]}
};
function matches(row,where){return Object.entries(where).every(([key,value])=>{
 if(value&&typeof value==='object'&&!(value instanceof Date))return Reflect.ownKeys(value).every(op=>op===Op.gt?row[key]>value[op]:op===Op.lte?row[key]<=value[op]:op===Op.lt?row[key]<value[op]:op===Op.ne?row[key]!==value[op]:false);
 return row[key]===value;
})}
mock.module('./src/models/index.js',{namedExports:{User:{findOne:async({where})=>matches(user,where)?user:null},Challenge:model,
 sequelize:{transaction(fn){const p=tx.then(()=>fn({LOCK:{UPDATE:'UPDATE'}}));tx=p.catch(()=>{});return p;}}}});
mock.module('./src/services/email.service.js',{namedExports:{smtpConfigured:()=>true,sendMail:async(to,subject,code)=>sent.push({to,code})}});
mock.module('./src/services/emailTemplates.service.js',{namedExports:{securityEmail:(type,code)=>({subject:type,text:code})}});
mock.module('./src/services/shared.service.js',{namedExports:{audit:async()=>{}}});
const {requestPasswordReset,resetPassword}=await import('./src/services/passwordRecovery.service.js');
const results=await Promise.all(Array.from({length:8},()=>requestPasswordReset(' Admin@Example.test ')));
assert.equal(sent.length,1);
assert.equal(challenges.length,1);
assert.equal(new Set(results.map(x=>x.message)).size,1);
assert.equal((await requestPasswordReset('unknown@example.test')).message,results[0].message);
assert.equal(challenges.length,1);
await assert.rejects(resetPassword(results[1].challenge,sent[0].code,'valid-password-test'),/inválido/);
assert.equal((await resetPassword(results[0].challenge,sent[0].code,'valid-password-test')).ok,true);
await assert.rejects(resetPassword(results[0].challenge,sent[0].code,'valid-password-test'),/inválido/);
await requestPasswordReset(user.email);
assert.equal(sent.length,1);
mock.timers.tick(11*60*1000);
await requestPasswordReset(user.email);
mock.timers.tick(11*60*1000);
await requestPasswordReset(user.email);
mock.timers.tick(11*60*1000);
await requestPasswordReset(user.email);
assert.equal(sent.length,3);
mock.timers.tick(28*60*1000);
await requestPasswordReset(user.email);
assert.equal(sent.length,4);
console.log('Recovery: duplicate requests, generic response, valid code, one-time use, and hourly limit OK');
