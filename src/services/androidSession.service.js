import {createHash,randomBytes} from 'node:crypto';
import AndroidSession from '../models/AndroidSession.js';
import {jwt,secret} from './shared.service.js';
const digest=id=>createHash('sha256').update(id).digest('hex');
export async function issueAndroidSession(user){
 const id=randomBytes(32).toString('base64url');
 const token=jwt.sign({sub:String(user.id),sv:user.session_version,kind:'android',sid:id},secret,{algorithm:'HS256'});
 await AndroidSession.create({digest:digest(id),user_id:user.id,created_at:new Date()});
 return token;
}
const where=(id,userId)=>({digest:digest(id),user_id:userId});
export async function hasAndroidSession(id,userId){
 return typeof id==='string'&&/^[\w-]{43}$/.test(id)&&!!(await AndroidSession.findOne({attributes:['digest'],where:where(id,userId)}));
}
export const revokeAndroidSession=(id,userId)=>AndroidSession.destroy({where:where(id,userId)});
